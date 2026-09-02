// routes/reports.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin, requireAdminOrManager, hasRole } = require('../middleware/auth');
const { getRevenueByBranch } = require('../services/revenueByBranchService');

const router = express.Router();

// -- Shared SQL helpers -------------------------------------------
// Investor users CTE (pre-filter once, reuse everywhere)
const INVESTOR_USERS_CTE = `
  investor_users AS (
    SELECT u.id, u.full_name, u.username, u.commission_rate
    FROM users u
    WHERE u.is_deleted = false
      AND (
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles role ON role.id = ur.role_id
          WHERE ur.user_id = u.id AND ur.is_deleted = false AND role.name = 'investor'
        )
        OR u.role_id IN (SELECT id FROM roles WHERE name = 'investor')
      )
  )`;

const parseMonthRange = (month, startMonth, endMonth) => {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = new Date(`${month}-01T00:00:00+07:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return {
      startISO: start.toISOString(),
      endISO: end.toISOString()
    };
  }

  if (startMonth && endMonth && /^\d{4}-\d{2}$/.test(startMonth) && /^\d{4}-\d{2}$/.test(endMonth)) {
    const start = new Date(`${startMonth}-01T00:00:00+07:00`);
    const end = new Date(`${endMonth}-01T00:00:00+07:00`);
    end.setMonth(end.getMonth() + 1);
    return {
      startISO: start.toISOString(),
      endISO: end.toISOString()
    };
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString()
  };
};

router.get('/commission-reconciliation', authenticate, requireAdmin, async (req, res) => {
  try {
    const { month, startMonth, endMonth } = req.query;
    const { startISO, endISO } = parseMonthRange(month, startMonth, endMonth);

    const result = await pool.query(
      `
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', $1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
            date_trunc('month', ($2::timestamptz - interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
            interval '1 month'
          )::date AS month_start
        ),
        rental_base AS (
          SELECT
            r.id,
            date_trunc('month', r.returned_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS month_start,
            r.total_price,
            r.user_id,
            r.handover_user_id
          FROM rentals r
          WHERE r.is_deleted = false
            AND r.status = 'completed'
            AND r.returned_at >= $1::timestamptz
            AND r.returned_at < $2::timestamptz
        ),
        legacy AS (
          SELECT
            rb.month_start,
            SUM(
              rb.total_price * COALESCE(su.commission_rate, 0)
              + rb.total_price * COALESCE(du.commission_rate, 0)
            )::numeric AS legacy_commission
          FROM rental_base rb
          LEFT JOIN users su ON su.id = rb.user_id AND su.is_deleted = false
          LEFT JOIN users du ON du.id = rb.handover_user_id AND du.is_deleted = false
          GROUP BY rb.month_start
        ),
        ledger AS (
          SELECT
            rb.month_start,
            SUM(COALESCE(l.sum_amount, 0))::numeric AS ledger_commission,
            COUNT(*) FILTER (WHERE COALESCE(l.has_ledger, false))::int AS rentals_with_ledger,
            COUNT(*)::int AS completed_rentals
          FROM rental_base rb
          LEFT JOIN LATERAL (
            SELECT
              SUM(l2.commission_amount)::numeric AS sum_amount,
              true AS has_ledger
            FROM rental_commission_ledger l2
            WHERE l2.rental_id = rb.id
              AND l2.is_deleted = false
          ) l ON true
          GROUP BY rb.month_start
        )
        SELECT
          to_char(m.month_start, 'YYYY-MM') AS month,
          COALESCE(legacy.legacy_commission, 0)::numeric AS legacy_commission,
          COALESCE(ledger.ledger_commission, 0)::numeric AS ledger_commission,
          (COALESCE(ledger.ledger_commission, 0) - COALESCE(legacy.legacy_commission, 0))::numeric AS diff_commission,
          COALESCE(ledger.completed_rentals, 0)::int AS completed_rentals,
          COALESCE(ledger.rentals_with_ledger, 0)::int AS rentals_with_ledger,
          CASE
            WHEN COALESCE(ledger.completed_rentals, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(ledger.rentals_with_ledger, 0)::numeric / ledger.completed_rentals::numeric) * 100, 2)
          END AS ledger_coverage_percent
        FROM months m
        LEFT JOIN legacy ON legacy.month_start = m.month_start
        LEFT JOIN ledger ON ledger.month_start = m.month_start
        ORDER BY m.month_start ASC
      `,
      [startISO, endISO]
    );

    return res.json({
      period: {
        start: startISO,
        end: endISO
      },
      rows: result.rows
    });
  } catch (error) {
    console.error('Commission reconciliation report error:', error);
    return res.status(500).json({ error: 'Failed to fetch commission reconciliation report' });
  }
});

// Revenue by branch
// Query params: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  (default: last 30 days)
// Business logic & SQL moved to: services/revenueByBranchService.js
router.get('/revenue-by-branch', authenticate, async (req, res) => {
  try {
    const branches = await getRevenueByBranch(pool, req.query, req.user);
    res.json(branches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch branch revenue report' });
  }
});

// Investor revenue report (separate from revenue-by-branch for performance)
// Query params: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/investor-revenue', authenticate, async (req, res) => {
  try {
    if (hasRole(req.user, 'driver') && !hasRole(req.user, 'admin', 'camera_manager', 'investor')) {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập báo cáo nhà đầu tư.' });
    }
    const { startDate, endDate } = req.query;

    let periodStartISO, periodEndISO, employeePeriodStartDate, employeePeriodEndDate;
    if (startDate && endDate) {
      periodStartISO = new Date(`${startDate}T00:00:00+07:00`).toISOString();
      periodEndISO   = new Date(`${endDate}T23:59:59.999+07:00`).toISOString();
      employeePeriodStartDate = startDate;
      employeePeriodEndDate = endDate;
    } else {
      periodEndISO   = new Date().toISOString();
      periodStartISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      employeePeriodStartDate = periodStartISO.slice(0, 10);
      employeePeriodEndDate = periodEndISO.slice(0, 10);
    }

    const result = await pool.query(`
      WITH ${INVESTOR_USERS_CTE},
      ledger_totals AS (
        SELECT
          rental_id,
          SUM(commission_amount) FILTER (WHERE source_role = 'saler')::numeric as saler_commission,
          SUM(commission_amount) FILTER (WHERE source_role = 'driver')::numeric as driver_commission,
          SUM(commission_amount)::numeric as total_commission
        FROM rental_commission_ledger
        WHERE is_deleted = false
        GROUP BY rental_id
      ),
      investor_rental_stats AS (
        SELECT
          COALESCE(owner.id, 0) as investor_id,
          COALESCE(owner.full_name, 'Chưa có nhà đầu tư') as investor_name,
          COALESCE(owner.username, '') as investor_username,
          COALESCE(owner.commission_rate, 0) as investor_commission_rate,
          COUNT(*) FILTER (WHERE r.inserted_at >= $1 AND r.inserted_at <= $2)::int as total_orders,
          COALESCE(SUM(r.total_price) FILTER (WHERE r.inserted_at >= $1 AND r.inserted_at <= $2 AND r.status != 'cancelled'), 0)::numeric as total_order_value,
          COUNT(*) FILTER (WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed')::int as completed_orders,
          COALESCE(SUM(r.total_price) FILTER (WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed'), 0)::numeric as total_revenue,
          COALESCE(SUM(
            COALESCE(lt.saler_commission, r.total_price * COALESCE(staff.commission_rate, 0))
          ) FILTER (WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed'), 0)::numeric as commission_amount,
          COALESCE(SUM(
            COALESCE(lt.driver_commission, 0)
          ) FILTER (WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed'), 0)::numeric as driver_commission_amount
        FROM rentals r
        JOIN equipment e ON e.id = r.equipment_id AND e.is_deleted = false
        LEFT JOIN investor_users owner ON owner.id = e.owner_id
        LEFT JOIN users staff ON staff.id = r.user_id AND staff.is_deleted = false
        LEFT JOIN ledger_totals lt ON lt.rental_id = r.id
        WHERE r.is_deleted = false
          AND (
            (r.inserted_at >= $1 AND r.inserted_at <= $2)
            OR
            (r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed')
          )
        GROUP BY owner.id, owner.full_name, owner.username, owner.commission_rate
      ),
      investor_maintenance_stats AS (
        SELECT
          COALESCE(owner.id, 0) as investor_id,
          COALESCE(owner.full_name, 'Chưa có nhà đầu tư') as investor_name,
          COALESCE(owner.username, '') as investor_username,
          COALESCE(owner.commission_rate, 0) as investor_commission_rate,
          COALESCE(SUM(m.maintenance_cost), 0)::numeric as maintenance_cost
        FROM equipment_maintenance m
        JOIN equipment e ON e.id = m.equipment_id AND e.is_deleted = false
        LEFT JOIN investor_users owner ON owner.id = e.owner_id
        WHERE m.is_deleted = false
          AND m.inserted_at >= $1
          AND m.inserted_at <= $2
        GROUP BY owner.id, owner.full_name, owner.username, owner.commission_rate
      ),
      investor_order_details AS (
        SELECT
          COALESCE(owner.id, 0) as investor_id,
          json_agg(
            json_build_object(
              'id', r.id,
              'code', COALESCE(r.code, 'OD' || LPAD(COALESCE(r.order_number, r.id)::text, 7, '0')),
              'status', r.status,
              'customer_name', c.name,
              'equipment_name', e.name,
              'employee_id', u.id,
              'employee_name', u.full_name,
              'employee_username', u.username,
              'manager_id', manager.id,
              'manager_name', manager.full_name,
              'manager_username', manager.username,
              'inserted_at', r.inserted_at,
              'returned_at', r.returned_at,
              'total_order_value', CASE WHEN r.inserted_at >= $1 AND r.inserted_at <= $2 AND r.status != 'cancelled' THEN r.total_price ELSE 0 END,
              'total_revenue', CASE WHEN r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed' THEN r.total_price ELSE 0 END,
              'commission_rate', COALESCE(u.commission_rate, 0),
              'commission_amount', CASE WHEN r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed' THEN
                COALESCE(lt2.saler_commission, r.total_price * COALESCE(u.commission_rate, 0))
              ELSE 0 END,
              'driver_commission_amount', CASE WHEN r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed' THEN
                COALESCE(lt2.driver_commission, 0)
              ELSE 0 END,
              'branch_id', r.branch_id,
              'branch_name', COALESCE(b.name, 'Chưa có cơ sở')
            )
            ORDER BY COALESCE(r.returned_at, r.inserted_at) DESC, r.id DESC
          ) as orders
        FROM rentals r
        JOIN equipment e ON e.id = r.equipment_id AND e.is_deleted = false
        LEFT JOIN investor_users owner ON owner.id = e.owner_id
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN branches b ON b.id = r.branch_id
        LEFT JOIN users u ON u.id = r.user_id
        LEFT JOIN users manager ON manager.id = r.manager_id
        LEFT JOIN ledger_totals lt2 ON lt2.rental_id = r.id
        WHERE r.is_deleted = false
          AND (
            (r.inserted_at >= $1 AND r.inserted_at <= $2)
            OR
            (r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed')
          )
        GROUP BY owner.id
      ),
      investor_ads_costs AS (
        SELECT
          owner.id as investor_id,
          owner.full_name as investor_name,
          owner.username as investor_username,
          owner.commission_rate as investor_commission_rate,
          SUM(branch_ads.total_amount)::numeric as ads_cost
        FROM (
          SELECT DISTINCT e2.branch_id, e2.owner_id
          FROM equipment e2
          WHERE e2.is_deleted = false AND e2.branch_id IS NOT NULL AND e2.owner_id IS NOT NULL
        ) e
        JOIN investor_users owner ON owner.id = e.owner_id
        JOIN (
          SELECT ac.branch_id, SUM(ac.amount) as total_amount
          FROM ads_costs ac
          WHERE ac.is_deleted = false
            AND COALESCE(ac.start_date, ac.date) <= $4::date
            AND COALESCE(ac.end_date, ac.date) >= $3::date
          GROUP BY ac.branch_id
        ) branch_ads ON branch_ads.branch_id = e.branch_id
        GROUP BY owner.id, owner.full_name, owner.username, owner.commission_rate
      )
      SELECT
        COALESCE(r.investor_id, m.investor_id, ads.investor_id) as investor_id,
        COALESCE(r.investor_name, m.investor_name, ads.investor_name) as investor_name,
        COALESCE(r.investor_username, m.investor_username, ads.investor_username) as investor_username,
        COALESCE(r.investor_commission_rate, m.investor_commission_rate, ads.investor_commission_rate, 0)::numeric as investor_commission_rate,
        COALESCE(r.total_orders, 0)::int as total_orders,
        COALESCE(r.total_order_value, 0)::numeric as total_order_value,
        COALESCE(r.completed_orders, 0)::int as completed_orders,
        COALESCE(r.total_revenue, 0)::numeric as total_revenue,
        COALESCE(r.commission_amount, 0)::numeric as commission_amount,
        COALESCE(r.driver_commission_amount, 0)::numeric as driver_commission_amount,
        COALESCE(m.maintenance_cost, 0)::numeric as maintenance_cost,
        COALESCE(ads.ads_cost, 0)::numeric as ads_cost,
        COALESCE(d.orders, '[]'::json) as orders
      FROM investor_rental_stats r
      FULL OUTER JOIN investor_maintenance_stats m
        ON r.investor_id = m.investor_id
      FULL OUTER JOIN investor_ads_costs ads
        ON ads.investor_id = COALESCE(r.investor_id, m.investor_id)
      LEFT JOIN investor_order_details d
        ON d.investor_id = COALESCE(r.investor_id, m.investor_id, ads.investor_id)
      WHERE
        COALESCE(r.total_orders, 0) > 0
        OR COALESCE(r.total_order_value, 0) > 0
        OR COALESCE(r.total_revenue, 0) > 0
        OR COALESCE(m.maintenance_cost, 0) > 0
        OR COALESCE(ads.ads_cost, 0) > 0
      ORDER BY CASE WHEN COALESCE(r.investor_id, m.investor_id, ads.investor_id, 0) = 0 THEN 1 ELSE 0 END, total_revenue DESC, investor_name ASC
    `, [periodStartISO, periodEndISO, employeePeriodStartDate, employeePeriodEndDate]);

    // Process rows into the same format frontend expects
    const rows = result.rows.map(row => {
      const total_revenue = parseFloat(row.total_revenue || 0);
      const commission_amount = parseFloat(row.commission_amount || 0);
      const driver_commission_amount = parseFloat(row.driver_commission_amount || 0);
      const maintenance_cost = parseFloat(row.maintenance_cost || 0);
      const ads_cost = parseFloat(row.ads_cost || 0);
      const net_amount = total_revenue - maintenance_cost - commission_amount - driver_commission_amount - ads_cost;

      return {
        id: row.investor_id,
        full_name: row.investor_name,
        username: row.investor_username,
        commission_rate: total_revenue > 0 ? commission_amount / total_revenue : 0,
        owner_commission_rate: parseFloat(row.investor_commission_rate || 0),
        commission_amount,
        driver_commission_amount,
        total_orders: parseInt(row.total_orders || 0, 10),
        total_order_value: parseFloat(row.total_order_value || 0),
        completed_orders: parseInt(row.completed_orders || 0, 10),
        total_revenue,
        maintenance_cost,
        ads_cost,
        net_amount,
        orders: (row.orders || []).map(order => ({
          ...order,
          branch_name: order.branch_name || 'Chưa có cơ sở',
          total_order_value: parseFloat(order.total_order_value || 0),
          total_revenue: parseFloat(order.total_revenue || 0),
          commission_rate: parseFloat(order.commission_rate || 0),
          commission_amount: parseFloat(order.commission_amount || 0),
          driver_commission_amount: parseFloat(order.driver_commission_amount || 0)
        }))
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Investor revenue report error:', error);
    res.status(500).json({ error: 'Failed to fetch investor revenue report' });
  }
});

module.exports = router;
