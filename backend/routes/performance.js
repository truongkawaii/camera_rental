// routes/performance.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, hasRole } = require('../middleware/auth');

const router = express.Router();

// =============================================================================
// SQL Helpers
// =============================================================================

/**
 * Build a timestamptz range expression from a date column/param reference.
 *
 * Accepts either a numeric param index (e.g. 1 → `($1::date::text || ...)::timestamptz`)
 * or a column reference string (e.g. 'mo.overlap_start' → `(mo.overlap_start::text || ...)::timestamptz`).
 */
function tsStart(ref) {
  const src = typeof ref === 'number' ? `$${ref}::date` : ref;
  return `(${src}::text || ' 00:00:00+07')::timestamptz`;
}
function tsEnd(ref) {
  const src = typeof ref === 'number' ? `$${ref}::date` : ref;
  return `(${src}::text || ' 23:59:59+07')::timestamptz`;
}

/**
 * Standard WHERE clause fragment for filtering rentals by either
 * inserted_at (new orders) OR returned_at (completed orders) within [start,end].
 */
function rentalDateRange(startIdx, endIdx) {
  return `
    (
      (r.inserted_at >= ${tsStart(startIdx)} AND r.inserted_at <= ${tsEnd(endIdx)})
      OR
      (r.returned_at >= ${tsStart(startIdx)} AND r.returned_at <= ${tsEnd(endIdx)} AND r.status = 'completed')
    )`;
}

/**
 * Standard WHERE clause fragment for filtering completed rentals by returned_at.
 */
function completedDateRange(startIdx, endIdx, alias = 'r') {
  return `${alias}.returned_at >= ${tsStart(startIdx)} AND ${alias}.returned_at <= ${tsEnd(endIdx)} AND ${alias}.status = 'completed'`;
}

// =============================================================================
// Ledger CTEs (reusable across queries)
// =============================================================================

/**
 * Returns SQL for the pre-aggregated rental_commission_ledger CTEs used to
 * avoid repeated correlated subqueries in the main aggregation.
 *
 * CTEs produced:
 *   ledger_exists       – which rental_ids have ANY ledger entries
 *   ledger_by_user      – total commission per rental per user_id
 *   ledger_by_role      – total commission per rental per source_role
 *   ledger_upline_by_user – uplink_share received per rental per user_id (user is the upline)
 *   ledger_paid_upline  – uplink_share paid per rental per from_user_id (user is the downline)
 */
function ledgerCTEs() {
  return `
      ledger_exists AS (
        SELECT DISTINCT rental_id
        FROM rental_commission_ledger
        WHERE is_deleted = false
      ),
      ledger_by_user AS (
        SELECT rental_id, user_id, SUM(commission_amount)::numeric as commission_amount
        FROM rental_commission_ledger
        WHERE is_deleted = false
        GROUP BY rental_id, user_id
      ),
      ledger_by_role AS (
        SELECT rental_id, source_role, SUM(commission_amount)::numeric as commission_amount
        FROM rental_commission_ledger
        WHERE is_deleted = false
        GROUP BY rental_id, source_role
      ),
      -- Commission per rental per user per source_role (saler vs driver split)
      ledger_by_user_role AS (
        SELECT rental_id, user_id, source_role, SUM(commission_amount)::numeric as commission_amount
        FROM rental_commission_ledger
        WHERE is_deleted = false
          AND line_type = 'direct'
        GROUP BY rental_id, user_id, source_role
      ),
      -- Hoa hồng uplink user nhận được từ cấp dưới (user_id = người nhận – upline)
      ledger_upline_by_user AS (
        SELECT rental_id, user_id, SUM(commission_amount)::numeric as commission_amount
        FROM rental_commission_ledger
        WHERE is_deleted = false AND line_type = 'uplink_share'
        GROUP BY rental_id, user_id
      ),
      -- Hoa hồng uplink user phải trả cho cấp trên (from_user_id = người bị trích – downline)
      ledger_paid_upline AS (
        SELECT rental_id, from_user_id as user_id,
               SUM(commission_amount)::numeric as commission_amount
        FROM rental_commission_ledger
        WHERE is_deleted = false AND line_type = 'uplink_share'
          AND from_user_id IS NOT NULL
        GROUP BY rental_id, from_user_id
      )`;
}

// =============================================================================
// Query builders for each role case
// =============================================================================

/**
 * Driver-only: simple aggregation for the current driver's handover rentals.
 */
function buildDriverQuery(userId) {
  return {
    text: `
      SELECT
        u.id, u.full_name, u.username, u.branch_id, u.base_salary, u.commission_rate,
        COUNT(CASE WHEN r.inserted_at >= ${tsStart(1)} AND r.inserted_at <= ${tsEnd(2)} THEN 1 END)::int as total_orders,
        COALESCE(SUM(CASE WHEN r.inserted_at >= ${tsStart(1)} AND r.inserted_at <= ${tsEnd(2)} AND r.status != 'cancelled'
          THEN r.total_price ELSE 0 END), 0)::numeric as total_order_value,
        COUNT(CASE WHEN ${completedDateRange(1, 2)} THEN 1 END)::int as completed_orders,
        COALESCE(SUM(CASE WHEN ${completedDateRange(1, 2)} THEN r.total_price ELSE 0 END), 0)::numeric as total_revenue,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN EXISTS (SELECT 1 FROM rental_commission_ledger l0 WHERE l0.rental_id = r2.id AND l0.is_deleted = false)
              THEN COALESCE((SELECT SUM(l.commission_amount) FROM rental_commission_ledger l
                WHERE l.rental_id = r2.id AND l.user_id = u.id AND l.is_deleted = false), 0)
              ELSE r2.total_price * COALESCE(u.commission_rate, 0)
            END
          )
          FROM rentals r2
          WHERE r2.handover_user_id = u.id AND r2.is_deleted = false
            AND ${completedDateRange(1, 2, 'r2')}
        ), 0)::numeric as commission_amount
      FROM users u
      LEFT JOIN rentals r ON r.handover_user_id = u.id AND r.is_deleted = false AND ${rentalDateRange(1, 2)}
      WHERE u.id = $3 AND u.is_deleted = false
      GROUP BY u.id, u.full_name, u.username, u.branch_id, u.base_salary, u.commission_rate`,
    values: [/* startDate, endDate, userId – filled by caller */]
  };
}

/**
 * Investor-only: equipment owner view – revenue & commission costs via equipment ownership.
 */
function buildInvestorQuery(userId) {
  return {
    text: `
      SELECT
        u.id, u.full_name, u.username, u.branch_id, u.base_salary, u.commission_rate,
        COUNT(CASE WHEN r.inserted_at >= ${tsStart(1)} AND r.inserted_at <= ${tsEnd(2)} THEN 1 END)::int as total_orders,
        COALESCE(SUM(CASE WHEN r.inserted_at >= ${tsStart(1)} AND r.inserted_at <= ${tsEnd(2)} AND r.status != 'cancelled'
          THEN r.total_price ELSE 0 END), 0)::numeric as total_order_value,
        COUNT(CASE WHEN ${completedDateRange(1, 2)} THEN 1 END)::int as completed_orders,
        COALESCE(SUM(CASE WHEN ${completedDateRange(1, 2)} THEN r.total_price ELSE 0 END), 0)::numeric as total_revenue,
        -- Sales commission cost (paid to salers)
        COALESCE(SUM(CASE WHEN ${completedDateRange(1, 2)} THEN
          CASE
            WHEN EXISTS (SELECT 1 FROM rental_commission_ledger l0 WHERE l0.rental_id = r.id AND l0.is_deleted = false)
            THEN COALESCE((SELECT SUM(l.commission_amount) FROM rental_commission_ledger l
              WHERE l.rental_id = r.id AND l.source_role = 'saler' AND l.is_deleted = false), 0)
            ELSE r.total_price * COALESCE(sales_user.commission_rate, 0)
          END
        ELSE 0 END), 0)::numeric as sales_commission_cost,
        -- Driver commission cost (paid to drivers)
        COALESCE(SUM(CASE WHEN ${completedDateRange(1, 2)} THEN
          CASE
            WHEN EXISTS (SELECT 1 FROM rental_commission_ledger l0 WHERE l0.rental_id = r.id AND l0.is_deleted = false)
            THEN COALESCE((SELECT SUM(l.commission_amount) FROM rental_commission_ledger l
              WHERE l.rental_id = r.id AND l.source_role = 'driver' AND l.is_deleted = false), 0)
            ELSE r.total_price * COALESCE(driver_user.commission_rate, 0)
          END
        ELSE 0 END), 0)::numeric as driver_commission_cost
      FROM users u
      LEFT JOIN equipment e ON e.owner_id = u.id AND e.is_deleted = false
      LEFT JOIN rentals r ON r.equipment_id = e.id AND r.is_deleted = false AND ${rentalDateRange(1, 2)}
      LEFT JOIN users sales_user ON sales_user.id = r.user_id AND sales_user.is_deleted = false
      LEFT JOIN users driver_user ON driver_user.id = r.handover_user_id AND driver_user.is_deleted = false
      WHERE u.id = $3 AND u.is_deleted = false
      GROUP BY u.id, u.full_name, u.username, u.branch_id, u.base_salary, u.commission_rate`,
    values: [/* startDate, endDate, userId – filled by caller */]
  };
}

/**
 * Admin / Manager / Saler: full staff performance query with monthly breakdown.
 *
 * This query is broken into logical CTE stages:
 *   1. months / month_overlaps      – generate month grid for the date range
 *   2. staff_user_ids / staff_users  – identify saler & driver users (respects branch scope)
 *   3. ledger_*                     – pre-aggregate commission ledger (see ledgerCTEs)
 *   4. monthly_revenue              – CROSS JOIN users × months, LEFT JOIN rentals, aggregate
 *   5. monthly_calculation          – join payroll snapshots for salary/rate overrides
 *   6. Final SELECT                 – aggregate across months; build breakdown JSON
 */
function buildStaffQuery(startDate, endDate, branchScopeClause, hasBranchParam) {
  // $1 = startDate, $2 = endDate, $3 = branchIds (only if !isAdmin)
  const params = [startDate, endDate];
  if (hasBranchParam) params.push(null); // placeholder, filled by caller

  const text = `
    -- Stage 1: Generate month grid
    WITH months AS (
      SELECT date_trunc('month', d)::date as month_start
      FROM generate_series(
        date_trunc('month', $1::date),
        date_trunc('month', $2::date),
        '1 month'::interval
      ) d
    ),
    month_overlaps AS (
      SELECT
        month_start,
        TO_CHAR(month_start, 'YYYY-MM') as month_key,
        GREATEST(month_start, $1::date) as overlap_start,
        LEAST((month_start + interval '1 month - 1 day')::date, $2::date) as overlap_end,
        EXTRACT(DAY FROM (month_start + interval '1 month - 1 day'))::numeric as days_in_month
      FROM months
    ),

    -- Stage 2: Identify saler users only
    staff_user_ids AS (
      SELECT u.id,
        BOOL_OR(role.name = 'saler' OR legacy_role.name = 'saler') as is_saler
      FROM users u
      LEFT JOIN roles legacy_role ON legacy_role.id = u.role_id AND legacy_role.is_deleted = false
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_deleted = false
      LEFT JOIN roles role ON role.id = ur.role_id AND role.is_deleted = false
      WHERE u.is_deleted = false
        ${branchScopeClause}
      GROUP BY u.id
      HAVING (
        COALESCE(BOOL_OR(role.name = 'saler'), false)
        OR COALESCE(BOOL_OR(legacy_role.name = 'saler'), false)
      )
    ),
    staff_users AS (
      SELECT u.*, sui.is_saler
      FROM users u
      JOIN staff_user_ids sui ON sui.id = u.id
    ),

    -- Stage 3: Pre-aggregated commission ledger
    ${ledgerCTEs()},

    -- Stage 3b: Upline commission per user per month (độc lập, không phụ thuộc main rental join)
    monthly_upline_received AS (
      SELECT
        l.user_id,
        mo.month_key,
        COALESCE(SUM(l.commission_amount), 0)::numeric as amount
      FROM rental_commission_ledger l
      JOIN rentals ren ON ren.id = l.rental_id
      CROSS JOIN month_overlaps mo
      WHERE l.line_type = 'uplink_share'
        AND l.is_deleted = false
        AND ren.is_deleted = false
        AND ren.status = 'completed'
        AND ren.returned_at >= ${tsStart('mo.overlap_start')}
        AND ren.returned_at <= ${tsEnd('mo.overlap_end')}
      GROUP BY l.user_id, mo.month_key
    ),
    monthly_upline_paid AS (
      SELECT
        l.from_user_id as user_id,
        mo.month_key,
        COALESCE(SUM(l.commission_amount), 0)::numeric as amount
      FROM rental_commission_ledger l
      JOIN rentals ren ON ren.id = l.rental_id
      CROSS JOIN month_overlaps mo
      WHERE l.line_type = 'uplink_share'
        AND l.from_user_id IS NOT NULL
        AND l.is_deleted = false
        AND ren.is_deleted = false
        AND ren.status = 'completed'
        AND ren.returned_at >= ${tsStart('mo.overlap_start')}
        AND ren.returned_at <= ${tsEnd('mo.overlap_end')}
      GROUP BY l.from_user_id, mo.month_key
    ),

    -- Stage 4: Monthly aggregation per user
    monthly_revenue AS (
      SELECT
        u.id as user_id,
        mo.month_key, mo.overlap_start, mo.overlap_end, mo.days_in_month,
        (mo.overlap_end - mo.overlap_start + 1)::numeric as overlap_days,

        -- Order counts & value (based on inserted_at) – only saler orders
        COUNT(CASE WHEN r.inserted_at >= ${tsStart('mo.overlap_start')}
                AND r.inserted_at <= ${tsEnd('mo.overlap_end')} THEN 1 END) as total_orders,
        COALESCE(SUM(CASE WHEN r.inserted_at >= ${tsStart('mo.overlap_start')}
          AND r.inserted_at <= ${tsEnd('mo.overlap_end')} AND r.status != 'cancelled'
          THEN r.total_price ELSE 0 END), 0)::numeric as month_order_value,

        -- Completed order counts & revenue (based on returned_at)
        COUNT(CASE WHEN ${completedDateRange('mo.overlap_start', 'mo.overlap_end')}
          THEN 1 END) as completed_orders,
        COALESCE(SUM(CASE WHEN ${completedDateRange('mo.overlap_start', 'mo.overlap_end')}
          THEN r.total_price ELSE 0 END), 0)::numeric as month_revenue,

        -- Commission: user's own commission for these rentals (total, all source_roles)
        -- If ledger exists, use ledger; otherwise fall back to user.commission_rate
        COALESCE(SUM(CASE WHEN ${completedDateRange('mo.overlap_start', 'mo.overlap_end')} THEN
          CASE WHEN le.rental_id IS NOT NULL
            THEN COALESCE(lbu.commission_amount, 0)
            ELSE r.total_price * COALESCE(u.commission_rate, 0)
          END
        ELSE 0 END), 0)::numeric as month_user_commission_amount,

        -- Saler commission earned by this user (source_role = 'saler' from ledger)
        COALESCE(SUM(CASE WHEN ${completedDateRange('mo.overlap_start', 'mo.overlap_end')} THEN
          CASE WHEN le.rental_id IS NOT NULL
            THEN COALESCE(lbur_saler.commission_amount, 0)
            ELSE 0
          END
        ELSE 0 END), 0)::numeric as month_user_saler_commission,

        -- Driver commission earned by this user (source_role = 'driver' from ledger)
        COALESCE(SUM(CASE WHEN ${completedDateRange('mo.overlap_start', 'mo.overlap_end')} THEN
          CASE WHEN le.rental_id IS NOT NULL
            THEN COALESCE(lbur_driver.commission_amount, 0)
            ELSE 0
          END
        ELSE 0 END), 0)::numeric as month_user_driver_commission,

        -- Driver commission cost (only relevant for salers paying drivers on their orders)
        COALESCE(SUM(CASE WHEN ${completedDateRange('mo.overlap_start', 'mo.overlap_end')} THEN
          CASE WHEN le.rental_id IS NOT NULL
            THEN COALESCE(ldr.commission_amount, 0)
            ELSE r.total_price * COALESCE(driver.commission_rate, 0)
          END
        ELSE 0 END), 0)::numeric as month_driver_commission_cost
      FROM staff_users u
      CROSS JOIN month_overlaps mo
      LEFT JOIN rentals r ON r.user_id = u.id
        AND r.is_deleted = false
        AND (
          (r.inserted_at >= ${tsStart('mo.overlap_start')} AND r.inserted_at <= ${tsEnd('mo.overlap_end')})
          OR
          (${completedDateRange('mo.overlap_start', 'mo.overlap_end')})
        )
      LEFT JOIN users driver ON driver.id = r.handover_user_id AND driver.is_deleted = false
      LEFT JOIN ledger_exists le ON le.rental_id = r.id
      LEFT JOIN ledger_by_user lbu ON lbu.rental_id = r.id AND lbu.user_id = u.id
      LEFT JOIN ledger_by_user_role lbur_saler ON lbur_saler.rental_id = r.id AND lbur_saler.user_id = u.id AND lbur_saler.source_role = 'saler'
      LEFT JOIN ledger_by_user_role lbur_driver ON lbur_driver.rental_id = r.id AND lbur_driver.user_id = u.id AND lbur_driver.source_role = 'driver'
      LEFT JOIN ledger_by_role ldr ON ldr.rental_id = r.id AND ldr.source_role = 'driver'
      LEFT JOIN ledger_upline_by_user lup ON lup.rental_id = r.id AND lup.user_id = u.id
      LEFT JOIN ledger_paid_upline lpu ON lpu.rental_id = r.id AND lpu.user_id = u.id
      GROUP BY u.id, mo.month_key, mo.overlap_start, mo.overlap_end, mo.days_in_month
    ),

    -- Stage 5: Attach salary/commission-rate overrides + upline commission from separate CTEs
    monthly_calculation AS (
      SELECT
        mr.*,
        u.full_name, u.username, u.branch_id, u.is_saler, false as is_driver,
        COALESCE(ps.base_salary, u.base_salary)::numeric as base_salary,
        COALESCE(ps.commission_rate, u.commission_rate)::numeric as commission_rate,
        ((COALESCE(ps.base_salary, u.base_salary)::numeric / mr.days_in_month) * mr.overlap_days)::numeric as month_salary_cost,
        -- Ghi đè month_received_from_downline / month_paid_to_upline từ CTE riêng (độc lập main rental join)
        COALESCE(mur.amount, 0)::numeric as month_received_from_downline,
        COALESCE(mup.amount, 0)::numeric as month_paid_to_upline
      FROM monthly_revenue mr
      JOIN staff_users u ON mr.user_id = u.id
      LEFT JOIN payroll_snapshots ps ON ps.user_id = u.id AND ps.month = mr.month_key AND ps.is_deleted = false
      LEFT JOIN monthly_upline_received mur ON mur.user_id = mr.user_id AND mur.month_key = mr.month_key
      LEFT JOIN monthly_upline_paid mup ON mup.user_id = mr.user_id AND mup.month_key = mr.month_key
    )

    -- Stage 6: Aggregate across months & build breakdown JSON
    SELECT
      user_id as id,
      full_name, username, branch_id,
      BOOL_OR(is_saler) as is_saler,
      false as is_driver,
      SUM(total_orders)::int as total_orders,
      SUM(month_order_value)::numeric as total_order_value,
      SUM(completed_orders)::int as completed_orders,
      SUM(month_revenue)::numeric as total_revenue,
      (ARRAY_AGG(base_salary ORDER BY month_key DESC))[1] as base_salary,
      (ARRAY_AGG(commission_rate ORDER BY month_key DESC))[1] as commission_rate,
      SUM(month_salary_cost)::numeric as total_base_salary_cost,
      SUM(month_user_commission_amount)::numeric as total_commission_cost,
      SUM(month_user_saler_commission)::numeric as total_user_saler_commission,
      SUM(month_user_driver_commission)::numeric as total_user_driver_commission,
      SUM(month_driver_commission_cost)::numeric as total_driver_commission_cost,
      SUM(month_received_from_downline)::numeric as total_received_from_downline,
      SUM(month_paid_to_upline)::numeric as total_paid_to_upline,
      -- Monthly breakdown for frontend tooltip
      JSON_AGG(JSON_BUILD_OBJECT(
        'month', month_key,
        'base_salary', base_salary,
        'days_in_month', days_in_month,
        'overlap_days', overlap_days,
        'salary_cost', month_salary_cost,
        'revenue', month_revenue,
        'commission_rate', commission_rate,
        'commission_cost', month_user_commission_amount,
        'saler_commission', month_user_saler_commission,
        'driver_commission', month_user_driver_commission,
        'driver_commission_cost', month_driver_commission_cost,
        'received_from_downline', month_received_from_downline,
        'paid_to_upline', month_paid_to_upline
      ) ORDER BY month_key ASC) as breakdown
    FROM monthly_calculation
    GROUP BY user_id, full_name, username, branch_id
    ORDER BY total_order_value DESC`;

  return { text, params };
}

// =============================================================================
// Response Mappers
// =============================================================================

function mapDriverRow(row) {
  const totalRevenue = parseFloat(row.total_revenue);
  const commissionAmount = parseFloat(row.commission_amount || 0);
  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    branch_id: row.branch_id,
    is_saler: false,
    is_driver: true,
    total_orders: parseInt(row.total_orders, 10),
    total_revenue: totalRevenue,
    total_order_value: parseFloat(row.total_order_value),
    commission_rate: totalRevenue > 0 ? commissionAmount / totalRevenue : parseFloat(row.commission_rate),
    commission_amount: commissionAmount,
    base_salary: 0,
    base_salary_cost: 0,
    profit: 0,
    profit_percentage: 0,
    breakdown: []
  };
}

function mapInvestorRow(row) {
  const totalRevenue = parseFloat(row.total_revenue);
  const commissionRate = parseFloat(row.commission_rate);
  const salesCommissionCost = parseFloat(row.sales_commission_cost || 0);
  const driverCommissionCost = parseFloat(row.driver_commission_cost || 0);
  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    branch_id: row.branch_id,
    is_saler: false,
    is_driver: false,
    total_orders: parseInt(row.total_orders, 10),
    total_revenue: totalRevenue,
    total_order_value: parseFloat(row.total_order_value),
    commission_rate: commissionRate,
    commission_amount: totalRevenue * commissionRate,
    sales_commission_cost: salesCommissionCost,
    driver_commission_cost: driverCommissionCost,
    net_profit: totalRevenue * commissionRate - salesCommissionCost - driverCommissionCost,
    base_salary: 0,
    base_salary_cost: 0,
    profit: 0,
    profit_percentage: 0,
    breakdown: []
  };
}

/**
 * Compute the API response for a single staff performance row.
 *
 * Handles:
 *  - Driver-only masking (no revenue/profit shown)
 *  - Profit = revenue - (direct commission) - driver costs - salary
 *  - Authorization: admin sees everything; own-record sees financials; others see masked
 */
function mapStaffRow(row, currentUserId, isAdmin) {
  const totalRevenue = parseFloat(row.total_revenue);
  const commissionAmount = parseFloat(row.total_commission_cost);
  const userSalerCommission = parseFloat(row.total_user_saler_commission || 0);
  const userDriverCommission = parseFloat(row.total_user_driver_commission || 0);
  const isSaler = row.is_saler === true;
  const isDriver = row.is_driver === true;
  const isDriverOnly = isDriver && !isSaler;
  const isOwnRecord = row.id === currentUserId;

  // Driver costs on this user's own orders (saler paying drivers, from SQL)
  const orderDriverCost = parseFloat(row.total_driver_commission_cost || 0);
  const receivedFromDownline = parseFloat(row.total_received_from_downline || 0);
  const paidToUpline = parseFloat(row.total_paid_to_upline || 0);
  const baseSalaryCost = parseFloat(row.total_base_salary_cost);

  // Driver-only: hide revenue, order value, profit
  const effectiveRevenue = isDriverOnly ? 0 : totalRevenue;
  const effectiveOrderValue = isDriverOnly ? 0 : parseFloat(row.total_order_value);
  const profit = isDriverOnly
    ? 0
    : totalRevenue - (commissionAmount - receivedFromDownline) - orderDriverCost - baseSalaryCost;

  // Direct commission: for salers, exclude what was received from downline
  const directCommission = isSaler ? commissionAmount - receivedFromDownline : commissionAmount;
  const effectiveCommissionRate = effectiveRevenue > 0 ? directCommission / effectiveRevenue : 0;

  // Everyone gets this skeleton
  const data = {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    branch_id: row.branch_id,
    is_saler: isSaler,
    is_driver: isDriver,
    total_orders: parseInt(row.total_orders, 10),
    total_revenue: 0,
    total_order_value: 0,
    commission_rate: 0,
    commission_amount: 0,
    driver_commission_cost: 0,
    received_from_downline: 0,
    paid_to_upline: 0,
    base_salary: 0,
    base_salary_cost: 0,
    profit: 0,
    profit_percentage: 0,
    breakdown: []
  };

  // Show financials for admin OR own record
  if (isAdmin || isOwnRecord) {
    data.total_revenue = effectiveRevenue;
    data.total_order_value = effectiveOrderValue;
    // Display: saler commission (from ledger source_role='saler') → "Hoa hồng bán hàng"
    data.commission_amount = userSalerCommission;
    data.commission_rate = effectiveCommissionRate;
    // Display: driver commission (from ledger source_role='driver') → "Giao nhận:"
    data.driver_commission_cost = userDriverCommission;
    data.received_from_downline = receivedFromDownline;
    data.paid_to_upline = paidToUpline;
    data.upline_commission_cost = paidToUpline;

    // Admin-only: salary info, profit, monthly breakdown
    if (isAdmin) {
      data.base_salary = parseFloat(row.base_salary);
      data.base_salary_cost = baseSalaryCost;
      data.profit = profit;
      data.profit_percentage = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;
      data.breakdown = row.breakdown || [];
    }
  }

  return data;
}

// =============================================================================
// Route Handler
// =============================================================================

/**
 * GET /api/performance
 * Returns performance metrics aggregated by user, with detailed monthly breakdown for tooltips.
 *
 * Role-based routing:
 *   driver    → own handover stats only
 *   investor  → equipment-ownership revenue & commission costs
 *   admin     → full staff performance with salary, profit, monthly breakdown
 *   manager/saler → staff in their branches (financials masked except own record)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Vui lòng chọn khoảng ngày (startDate & endDate)' });
    }

    // ── Case 1: Driver-only ──────────────────────────────────────────────
    const isDriverOnly = hasRole(req.user, 'driver')
      && !hasRole(req.user, 'admin', 'camera_manager', 'investor', 'saler', 'manager');

    if (isDriverOnly) {
      const { text } = buildDriverQuery(req.user.id);
      const result = await pool.query(text, [startDate, endDate, req.user.id]);
      return res.json(result.rows.map(mapDriverRow));
    }

    // ── Case 2: Investor-only ────────────────────────────────────────────
    const isInvestorOnly = hasRole(req.user, 'investor')
      && !hasRole(req.user, 'admin', 'camera_manager');

    if (isInvestorOnly) {
      const { text } = buildInvestorQuery(req.user.id);
      const result = await pool.query(text, [startDate, endDate, req.user.id]);
      return res.json(result.rows.map(mapInvestorRow));
    }

    // ── Case 3: Admin / Manager / Saler ──────────────────────────────────
    const isAdmin = hasRole(req.user, 'admin');
    const branchIds = req.user.branch_ids || [];

    if (!isAdmin && branchIds.length === 0) {
      return res.json([]);
    }

    // Branch-scope filter for non-admin users
    const branchScopeClause = isAdmin ? '' : `
        AND EXISTS (
          SELECT 1 FROM user_branches ub
          WHERE ub.user_id = u.id AND ub.branch_id = ANY($3) AND ub.is_deleted = false
        )`;

    const { text, params } = buildStaffQuery(startDate, endDate, branchScopeClause, !isAdmin);
    if (!isAdmin) params[2] = branchIds;

    const result = await pool.query(text, params);
    const metrics = result.rows.map(row => mapStaffRow(row, req.user.id, isAdmin));

    res.json(metrics);
  } catch (error) {
    console.error('Failed to fetch performance metrics:', error);
    res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
});

module.exports = router;
