const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

const getActiveRuleSet = async (client, ruleType, effectiveAt = new Date()) => {
  if (!ruleType || !['saler', 'driver'].includes(ruleType)) {
    // Backward compat: if no ruleType, try both types
    const result = await client.query(
      `
        SELECT id, name, rule_type, rate_percent, effective_from, effective_to
        FROM commission_rule_sets
        WHERE is_deleted = false
          AND is_active = true
          AND (effective_from IS NULL OR effective_from <= $1)
          AND (effective_to IS NULL OR effective_to >= $1)
        ORDER BY rule_type ASC, effective_from DESC NULLS LAST, id DESC
      `,
      [effectiveAt]
    );

    if (result.rows.length === 0) return null;

    // Build a combined rates map from all active rule sets
    const rates = { saler: 0, driver: 0 };
    let firstRuleSet = null;

    for (const rs of result.rows) {
      if (!firstRuleSet) {
        firstRuleSet = { id: rs.id, name: rs.name, rule_type: rs.rule_type, rate_percent: toNumber(rs.rate_percent), effective_from: rs.effective_from, effective_to: rs.effective_to };
      }
      if (rs.rule_type === 'saler' || rs.rule_type === 'driver') {
        rates[rs.rule_type] = toNumber(rs.rate_percent);
      }
    }

    return {
      id: firstRuleSet?.id,
      name: firstRuleSet?.name,
      rule_type: firstRuleSet?.rule_type,
      effective_from: firstRuleSet?.effective_from,
      effective_to: firstRuleSet?.effective_to,
      rates
    };
  }

  // Look up active rule set for a specific rule_type
  const result = await client.query(
    `
      SELECT id, name, rule_type, rate_percent, effective_from, effective_to
      FROM commission_rule_sets
      WHERE is_deleted = false
        AND is_active = true
        AND rule_type = $1
        AND (effective_from IS NULL OR effective_from <= $2)
        AND (effective_to IS NULL OR effective_to >= $2)
      ORDER BY effective_from DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    [ruleType, effectiveAt]
  );

  if (result.rows.length === 0) return null;

  const ruleSet = result.rows[0];
  const rates = { saler: 0, driver: 0 };
  rates[ruleType] = toNumber(ruleSet.rate_percent);

  return {
    id: ruleSet.id,
    name: ruleSet.name,
    rule_type: ruleSet.rule_type,
    effective_from: ruleSet.effective_from,
    effective_to: ruleSet.effective_to,
    rates
  };
};

/**
 * Look up the rule set assigned to a specific user for a specific role.
 * Returns null if no per-role assignment exists — no default fallback.
 */
const getRuleSetForUserRole = async (client, userId, roleName, effectiveAt = new Date()) => {
  if (!userId || !roleName) {
    return null;
  }

  // Check if user has a per-role assignment to a specific rule set
  const assignmentResult = await client.query(
    `
      SELECT rs.id, rs.name, rs.rule_type, rs.rate_percent, rs.effective_from, rs.effective_to
      FROM commission_rule_set_users rsu
      JOIN commission_rule_sets rs ON rs.id = rsu.rule_set_id
        AND rs.is_deleted = false
        AND rs.is_active = true
        AND rs.rule_type = $2
        AND (rs.effective_from IS NULL OR rs.effective_from <= $3)
        AND (rs.effective_to IS NULL OR rs.effective_to >= $3)
      WHERE rsu.user_id = $1
        AND rsu.role_name = $2
        AND rsu.is_deleted = false
      LIMIT 1
    `,
    [userId, roleName, effectiveAt]
  );

  if (assignmentResult.rows.length > 0) {
    // User has a per-role assignment → use that rule set
    const assigned = assignmentResult.rows[0];
    return {
      id: assigned.id,
      name: assigned.name,
      effective_from: assigned.effective_from,
      effective_to: assigned.effective_to,
      rate: toNumber(assigned.rate_percent)
    };
  }

  // No per-role assignment → no commission (no default fallback)
  return null;
};

const getActiveHierarchyShares = async (client, childUserId, effectiveAt = new Date()) => {
  if (!childUserId) return [];

  const result = await client.query(
    `
      SELECT id, child_user_id, parent_user_id, share_rate_percent, effective_from, effective_to
      FROM collaborator_hierarchy
      WHERE is_deleted = false
        AND is_active = true
        AND child_user_id = $1
        AND (effective_from IS NULL OR effective_from <= $2)
        AND (effective_to IS NULL OR effective_to >= $2)
      ORDER BY id ASC
    `,
    [childUserId, effectiveAt]
  );

  return result.rows.map((row) => ({
    id: row.id,
    child_user_id: row.child_user_id,
    parent_user_id: row.parent_user_id,
    share_rate_percent: toNumber(row.share_rate_percent),
    effective_from: row.effective_from,
    effective_to: row.effective_to
  }));
};

const allocateDirectLine = async (client, line, effectiveAt) => {
  const directAmount = roundMoney(line.base_amount * (line.rate_percent / 100));
  if (directAmount <= 0) {
    return {
      directLine: null,
      uplinkLines: []
    };
  }

  const shares = await getActiveHierarchyShares(client, line.user_id, effectiveAt);
  let totalShared = 0;
  const uplinkLines = [];

  for (const share of shares) {
    const shareRate = Math.max(0, share.share_rate_percent);
    if (shareRate <= 0 || !share.parent_user_id) continue;

    const shareAmount = roundMoney(directAmount * (shareRate / 100));
    if (shareAmount <= 0) continue;

    totalShared += shareAmount;
    uplinkLines.push({
      rental_id: line.rental_id,
      user_id: share.parent_user_id,
      source_role: line.source_role,
      line_type: 'uplink_share',
      rate_percent: shareRate,
      base_amount: directAmount,
      commission_amount: shareAmount,
      from_user_id: line.user_id
    });
  }

  const childRetainedAmount = Math.max(0, roundMoney(directAmount - totalShared));
  return {
    directLine: {
      ...line,
      line_type: 'direct',
      commission_amount: childRetainedAmount
    },
    uplinkLines
  };
};

const calculateCommissionPreview = async (client, payload) => {
  const {
    rental_id = null,
    total_price,
    user_id,
    handover_user_id,
    effective_at = new Date()
  } = payload;

  const effectiveAt = new Date(effective_at);
  const baseAmount = Math.max(0, toNumber(total_price));
  const salerId = user_id ? Number(user_id) : null;
  const driverId = handover_user_id ? Number(handover_user_id) : null;

  // Look up rule set per user + role, so saler & driver can use different rule sets
  const salerRuleSet = await getRuleSetForUserRole(client, salerId, 'saler', effectiveAt);
  const driverRuleSet = await getRuleSetForUserRole(client, driverId, 'driver', effectiveAt);

  const salerRate = salerRuleSet ? toNumber(salerRuleSet.rate) : 0;
  const driverRate = driverRuleSet ? toNumber(driverRuleSet.rate) : 0;

  const directCandidates = [];
  if (salerId && salerRate > 0) {
    directCandidates.push({
      rental_id,
      user_id: salerId,
      source_role: 'saler',
      rate_percent: salerRate,
      base_amount: baseAmount
    });
  }

  if (driverId && driverRate > 0) {
    directCandidates.push({
      rental_id,
      user_id: driverId,
      source_role: 'driver',
      rate_percent: driverRate,
      base_amount: baseAmount
    });
  }

  const commissionLines = [];
  for (const candidate of directCandidates) {
    const allocation = await allocateDirectLine(client, candidate, effectiveAt);
    if (allocation.directLine && allocation.directLine.commission_amount > 0) {
      commissionLines.push(allocation.directLine);
    }
    for (const uplink of allocation.uplinkLines) {
      if (uplink.commission_amount > 0) {
        commissionLines.push(uplink);
      }
    }
  }

  // Fetch full_name for all users appearing in commission lines
  const userIdSet = new Set(commissionLines.map((l) => l.user_id));
  const userNames = {};
  if (userIdSet.size > 0) {
    const userResult = await client.query(
      `SELECT id, full_name FROM users WHERE id = ANY($1::int[]) AND is_deleted = false`,
      [[...userIdSet]]
    );
    for (const row of userResult.rows) {
      userNames[row.id] = row.full_name || `#${row.id}`;
    }
  }

  for (const line of commissionLines) {
    line.full_name = userNames[line.user_id] || `#${line.user_id}`;
  }

  const totalsByUser = {};
  for (const line of commissionLines) {
    const key = String(line.user_id);
    totalsByUser[key] = roundMoney((totalsByUser[key] || 0) + toNumber(line.commission_amount));
  }

  const totals = Object.entries(totalsByUser).map(([userId, amount]) => ({
    user_id: Number(userId),
    full_name: userNames[userId] || `#${userId}`,
    commission_amount: amount
  }));

  return {
    source: (salerRuleSet || driverRuleSet) ? 'rule_set' : 'legacy_user_commission_rate',
    rule_set: {
      saler: salerRuleSet
        ? {
            id: salerRuleSet.id,
            name: salerRuleSet.name,
            rate_percent: toNumber(salerRuleSet.rate),
            effective_from: salerRuleSet.effective_from,
            effective_to: salerRuleSet.effective_to
          }
        : null,
      driver: driverRuleSet
        ? {
            id: driverRuleSet.id,
            name: driverRuleSet.name,
            rate_percent: toNumber(driverRuleSet.rate),
            effective_from: driverRuleSet.effective_from,
            effective_to: driverRuleSet.effective_to
          }
        : null
    },
    participants: {
      saler_user_id: salerId,
      driver_user_id: driverId
    },
    base_amount: baseAmount,
    lines: commissionLines,
    totals,
    grand_total_commission: roundMoney(totals.reduce((sum, item) => sum + toNumber(item.commission_amount), 0))
  };
};

const replaceRentalLedger = async (client, rentalId, lines, userId) => {
  await client.query(
    `
      UPDATE rental_commission_ledger
      SET is_deleted = true,
          updated_at = NOW(),
          updated_by = $2
      WHERE rental_id = $1
        AND is_deleted = false
    `,
    [rentalId, userId]
  );

  for (const line of lines) {
    await client.query(
      `
        INSERT INTO rental_commission_ledger (
          rental_id, user_id, source_role, line_type,
          rate_percent, base_amount, commission_amount,
          from_user_id, inserted_by, updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      `,
      [
        rentalId,
        line.user_id,
        line.source_role,
        line.line_type,
        line.rate_percent,
        line.base_amount,
        line.commission_amount,
        line.from_user_id || null,
        userId
      ]
    );
  }
};

const ensureCommissionSnapshotForCompletedRental = async (client, rentalId, actedByUserId, options = {}) => {
  const { forceRecalc = false } = options;

  const rentalResult = await client.query(
    `
      SELECT id, status, total_price, user_id, handover_user_id
      FROM rentals
      WHERE id = $1
        AND is_deleted = false
      LIMIT 1
    `,
    [rentalId]
  );

  if (rentalResult.rows.length === 0) {
    throw new Error('Rental not found for commission snapshot');
  }

  const rental = rentalResult.rows[0];
  if (rental.status !== 'completed') {
    return { created: false, reason: 'rental_not_completed' };
  }

  const ledgerCheck = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM rental_commission_ledger
      WHERE rental_id = $1
        AND is_deleted = false
    `,
    [rentalId]
  );

  const hasLedger = Number(ledgerCheck.rows[0]?.count || 0) > 0;

  if (!forceRecalc && hasLedger) {
    return { created: false, reason: 'already_exists' };
  }

  const preview = await calculateCommissionPreview(client, {
    rental_id: rental.id,
    total_price: rental.total_price,
    user_id: rental.user_id,
    handover_user_id: rental.handover_user_id,
    effective_at: new Date()
  });

  await replaceRentalLedger(client, rental.id, preview.lines, actedByUserId);

  return {
    created: true,
    reason: forceRecalc ? 'recalculated' : 'created',
    preview
  };
};

module.exports = {
  calculateCommissionPreview,
  ensureCommissionSnapshotForCompletedRental,
  getActiveRuleSet,
  getRuleSetForUserRole,
  getActiveHierarchyShares
};
