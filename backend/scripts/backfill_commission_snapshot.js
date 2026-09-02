const { pool } = require('../utils/db');
const { ensureCommissionSnapshotForCompletedRental } = require('../services/commissionService');

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE || 100);
const ACTOR_USER_ID = Number(process.env.BACKFILL_ACTOR_USER_ID || 1);
const FORCE_RECALC = String(process.env.BACKFILL_FORCE_RECALC || '').toLowerCase() === 'true';
const DRY_RUN = String(process.env.BACKFILL_DRY_RUN || '').toLowerCase() === 'true';
const START_ID = Number(process.env.BACKFILL_START_ID || 0);
const END_ID = Number(process.env.BACKFILL_END_ID || 0);

// New: migrate legacy users.commission_rate → commission_rule_sets + commission_rule_set_users
const BACKFILL_MIGRATE_RULE_SETS = String(process.env.BACKFILL_MIGRATE_RULE_SETS || 'true').toLowerCase() === 'true';

const hasValidRangeStart = Number.isInteger(START_ID) && START_ID > 0;
const hasValidRangeEnd = Number.isInteger(END_ID) && END_ID > 0;

// ---------------------------------------------------------------------------
// Phase 1: Migrate users.commission_rate → commission_rule_sets & commission_rule_set_users
// ---------------------------------------------------------------------------
const backfillCommissionRuleSetsFromUsers = async (client) => {
  console.log('\n=== Phase 1: Migrate users.commission_rate → commission_rule_sets + commission_rule_set_users ===');

  // Find users who have a legacy commission_rate > 0 but no per-role rule-set assignment yet
  const users = await client.query(`
    SELECT u.id, u.commission_rate
    FROM users u
    WHERE u.is_deleted = false
      AND u.commission_rate > 0
      AND NOT EXISTS (
        SELECT 1 FROM commission_rule_set_users rsu
        WHERE rsu.user_id = u.id
          AND rsu.is_deleted = false
          AND rsu.role_name = 'saler'
      )
      AND NOT EXISTS (
        SELECT 1 FROM commission_rule_set_users rsu
        WHERE rsu.user_id = u.id
          AND rsu.is_deleted = false
          AND rsu.role_name = 'driver'
      )
    ORDER BY u.id
  `);

  if (users.rows.length === 0) {
    console.log('No users need rule-set migration (all already assigned or rate = 0).');
    return { usersMigrated: 0, ruleSetsCreated: 0 };
  }

  console.log(`Found ${users.rows.length} user(s) with legacy commission_rate > 0 and no rule-set assignment.`);

  // Group user IDs by distinct commission_rate
  const rateToUserIds = new Map();
  for (const u of users.rows) {
    const rate = Number(u.commission_rate);
    if (!rateToUserIds.has(rate)) {
      rateToUserIds.set(rate, []);
    }
    rateToUserIds.get(rate).push(u.id);
  }

  let ruleSetsCreated = 0;
  let usersMigrated = 0;

  // Helper: find or create a rule set, return its id
  const findOrCreateRuleSet = async (name, ruleType, ratePercent) => {
    if (DRY_RUN) {
      const existing = await client.query(
        `SELECT id FROM commission_rule_sets
         WHERE name = $1 AND rule_type = $2 AND is_deleted = false
         LIMIT 1`,
        [name, ruleType]
      );
      if (existing.rows.length > 0) {
        console.log(`[DRY_RUN] Would reuse existing rule set "${name}" (id=${existing.rows[0].id})`);
        return existing.rows[0].id;
      }
      ruleSetsCreated += 1;
      console.log(`[DRY_RUN] Would create rule set "${name}" (${ruleType}, ${ratePercent}%)`);
      return null; // dry-run: no real id
    }

    let existing = await client.query(
      `SELECT id FROM commission_rule_sets
       WHERE name = $1 AND rule_type = $2 AND is_deleted = false
       LIMIT 1`,
      [name, ruleType]
    );

    if (existing.rows.length > 0) {
      console.log(`Reusing existing rule set "${name}" (id=${existing.rows[0].id})`);
      return existing.rows[0].id;
    }

    const inserted = await client.query(
      `INSERT INTO commission_rule_sets (name, rule_type, rate_percent, is_active, inserted_by, updated_by)
       VALUES ($1, $2, $3, true, $4, $4)
       RETURNING id`,
      [name, ruleType, ratePercent, ACTOR_USER_ID]
    );
    ruleSetsCreated += 1;
    console.log(`Created rule set "${name}" (id=${inserted.rows[0].id}, ${ruleType}, ${ratePercent}%)`);
    return inserted.rows[0].id;
  };

  // Helper: assign users to a rule set
  const assignUsersToRuleSet = async (ruleSetId, userIdsArr, roleName) => {
    for (const userId of userIdsArr) {
      if (DRY_RUN) {
        console.log(`[DRY_RUN] Would assign user_id=${userId} → rule_set_id=${ruleSetId} (${roleName})`);
        usersMigrated += 1;
      } else {
        try {
          await client.query(
            `INSERT INTO commission_rule_set_users (rule_set_id, user_id, role_name, inserted_by, updated_by)
             VALUES ($1, $2, $3, $4, $4)
             ON CONFLICT (user_id, role_name) DO NOTHING`,
            [ruleSetId, userId, roleName, ACTOR_USER_ID]
          );
          console.log(`Assigned user_id=${userId} → rule_set_id=${ruleSetId} (${roleName})`);
          usersMigrated += 1;
        } catch (err) {
          console.error(`Failed to assign user_id=${userId} role=${roleName}:`, err.message);
        }
      }
    }
  };

  // ── Saler: one rule set per distinct commission_rate ──
  for (const [rate, userIds] of rateToUserIds) {
    const ratePercent = Math.round(rate * 100); // e.g. 0.25 → 25
    const ruleSetName = `Hoa Hồng Saler - ${ratePercent}%`;
    const ruleSetId = await findOrCreateRuleSet(ruleSetName, 'saler', ratePercent);
    await assignUsersToRuleSet(ruleSetId, userIds, 'saler');
  }

  // ── Driver: ONE rule set at 5% for ALL users ──
  const allUserIds = users.rows.map(u => u.id);
  const driverRatePercent = 5;
  const driverRuleSetName = `Hoa Hồng Driver - ${driverRatePercent}%`;
  const driverRuleSetId = await findOrCreateRuleSet(driverRuleSetName, 'driver', driverRatePercent);
  await assignUsersToRuleSet(driverRuleSetId, allUserIds, 'driver');

  const uniqueUsers = new Set(users.rows.map(u => u.id)).size;
  console.log(`\nPhase 1 summary: ${ruleSetsCreated} rule set(s) created, ${uniqueUsers} user(s) migrated (${usersMigrated} total assignments).`);
  return { usersMigrated, ruleSetsCreated };
};

// ---------------------------------------------------------------------------
// Phase 2: Backfill rental_commission_ledger for completed rentals
// ---------------------------------------------------------------------------
const runBackfill = async () => {
  const client = await pool.connect();
  let lastId = hasValidRangeStart ? START_ID - 1 : 0;
  let scanned = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  try {
    console.log('Backfill configuration:');
    console.log(`- BATCH_SIZE: ${BATCH_SIZE}`);
    console.log(`- ACTOR_USER_ID: ${ACTOR_USER_ID}`);
    console.log(`- FORCE_RECALC: ${FORCE_RECALC}`);
    console.log(`- DRY_RUN: ${DRY_RUN}`);
    console.log(`- START_ID: ${hasValidRangeStart ? START_ID : 'none'}`);
    console.log(`- END_ID: ${hasValidRangeEnd ? END_ID : 'none'}`);
    console.log(`- BACKFILL_MIGRATE_RULE_SETS: ${BACKFILL_MIGRATE_RULE_SETS}`);

    // ── Phase 1: Migrate legacy commission_rate to rule sets ──
    if (BACKFILL_MIGRATE_RULE_SETS) {
      await backfillCommissionRuleSetsFromUsers(client);
    } else {
      console.log('\n=== Phase 1: SKIPPED (BACKFILL_MIGRATE_RULE_SETS=false) ===');
    }

    // ── Phase 2: Backfill rental_commission_ledger ──
    console.log('\n=== Phase 2: Backfill rental_commission_ledger for completed rentals ===');

    while (true) {
      const params = [lastId, BATCH_SIZE];
      let endClause = '';

      if (hasValidRangeEnd) {
        params.push(END_ID);
        endClause = ` AND id <= $${params.length}`;
      }

      const rentals = await client.query(
        `
          SELECT id
          FROM rentals
          WHERE is_deleted = false
            AND status = 'completed'
            AND id > $1
            ${endClause}
          ORDER BY id ASC
          LIMIT $2
        `,
        params
      );

      if (rentals.rows.length === 0) break;
      scanned += rentals.rows.length;

      for (const row of rentals.rows) {
        const rentalId = Number(row.id);
        lastId = rentalId;

        try {
          if (DRY_RUN) {
            const check = await client.query(
              `
                SELECT
                  EXISTS (
                    SELECT 1
                    FROM rental_commission_ledger l
                    WHERE l.rental_id = r.id
                      AND l.is_deleted = false
                  ) AS has_ledger
                FROM rentals r
                WHERE r.id = $1
              `,
              [rentalId]
            );

            const hasLedger = Boolean(check.rows[0]?.has_ledger);
            if (FORCE_RECALC || !hasLedger) {
              created += 1;
              console.log(`[DRY_RUN] would process rental ${rentalId}`);
            } else {
              skipped += 1;
            }
            continue;
          }

          await client.query('BEGIN');
          const result = await ensureCommissionSnapshotForCompletedRental(
            client,
            rentalId,
            ACTOR_USER_ID,
            { forceRecalc: FORCE_RECALC, simpleMode: true }
          );
          await client.query('COMMIT');

          if (result.created) {
            created += 1;
            console.log(`Processed rental ${rentalId}: ${result.reason}`);
          } else {
            skipped += 1;
          }
        } catch (error) {
          await client.query('ROLLBACK');
          failed += 1;
          console.error(`Failed rental ${rentalId}:`, error.message);
        }
      }

      console.log(`Progress - scanned: ${scanned}, created: ${created}, skipped: ${skipped}, failed: ${failed}`);
    }

    console.log('\n=== Backfill completed ===');
    console.log(`Phase 2 - Scanned: ${scanned}`);
    console.log(`Phase 2 - Created: ${created}`);
    console.log(`Phase 2 - Skipped: ${skipped}`);
    console.log(`Phase 2 - Failed: ${failed}`);
  } finally {
    client.release();
    await pool.end();
  }
};

runBackfill().catch(async (error) => {
  console.error('Backfill fatal error:', error);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
