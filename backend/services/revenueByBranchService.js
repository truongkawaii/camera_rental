/**
 * Revenue By Branch Service
 *
 * Trách nhiệm:
 *   1. Xây dựng SQL query báo cáo doanh thu theo chi nhánh (branch-level)
 *   2. Xây dựng SQL query thống kê nhân viên theo chi nhánh (employee-level)
 *   3. Transform dữ liệu thô thành format frontend cần
 *
 * Flow dữ liệu:
 *   GET /revenue-by-branch?startDate=&endDate=
 *     → getRevenueByBranch({ startDate, endDate, user })
 *       → Promise.all([
 *           fetchBranchStats(pool, params),      // query 1: branch stats
 *           fetchEmployeeStats(pool, params)      // query 2: employee stats
 *         ])
 *       → mapEmployeeRowsToBranchMap(empRows, user) // group employees by branch_id
 *       → mapBranchRows(branchRows, empMap, user)   // merge cost fields + tính profit
 *       → return branches[]
 */

const { hasRole } = require('../middleware/auth');

// ── Constants ────────────────────────────────────────────────────

/** Danh sách role được phép xem báo cáo này */
const ALLOWED_ROLES = ['admin', 'manager', 'camera_manager', 'investor', 'saler'];

/** Role có quyền quản lý (xem được mọi thông tin) */
const MANAGER_ROLES = ['admin', 'manager', 'camera_manager'];

// ── Shared SQL Fragments ─────────────────────────────────────────

/**
 * CTE: Lấy danh sách user có role saler hoặc driver.
 * Dùng chung cho cả 2 query (branch stats & employee stats).
 */
const COST_USERS_CTE = `
  cost_users AS (
    SELECT
      u.id, u.full_name, u.username, u.base_salary, u.commission_rate,
      (COALESCE(BOOL_OR(role.name = 'saler'), false) OR COALESCE(legacy_role.name = 'saler', false)) as is_saler,
      (COALESCE(BOOL_OR(role.name = 'driver'), false) OR COALESCE(legacy_role.name = 'driver', false)) as is_driver
    FROM users u
    LEFT JOIN roles legacy_role ON legacy_role.id = u.role_id AND legacy_role.is_deleted = false
    LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_deleted = false
    LEFT JOIN roles role ON role.id = ur.role_id AND role.is_deleted = false
    WHERE u.is_deleted = false
    GROUP BY u.id, u.full_name, u.username, u.base_salary, u.commission_rate, legacy_role.name
    HAVING (
      COALESCE(BOOL_OR(role.name IN ('saler', 'driver')), false)
      OR legacy_role.name IN ('saler', 'driver')
    )
  )`;

// ── Helper Functions ─────────────────────────────────────────────

/**
 * Parse startDate/endDate từ query string thành các định dạng cần thiết.
 *
 * @param {string} [startDate] - YYYY-MM-DD
 * @param {string} [endDate]   - YYYY-MM-DD
 * @returns {{ periodStartISO: string, periodEndISO: string, employeePeriodStartDate: string, employeePeriodEndDate: string }}
 *   - periodStartISO/periodEndISO: ISO timestamp dùng trong Query 1 (branch stats)
 *   - employeePeriodStartDate/employeePeriodEndDate: YYYY-MM-DD dùng trong Query 2 (employee stats)
 */
function buildDateRange(startDate, endDate) {
  if (startDate && endDate) {
    const periodStartISO = new Date(`${startDate}T00:00:00+07:00`).toISOString();
    const periodEndISO   = new Date(`${endDate}T23:59:59.999+07:00`).toISOString();
    return { periodStartISO, periodEndISO, employeePeriodStartDate: startDate, employeePeriodEndDate: endDate };
  }

  // Default: 30 ngày gần nhất
  const periodEndISO   = new Date().toISOString();
  const periodStartISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    periodStartISO,
    periodEndISO,
    employeePeriodStartDate: periodStartISO.slice(0, 10),
    employeePeriodEndDate: periodEndISO.slice(0, 10),
  };
}

/**
 * Xác định các filter dựa trên role của user.
 *
 * Logic:
 *   - Saler (không phải manager): chỉ xem đơn của chính mình → salesUserId = user.id
 *   - Investor (không phải admin/manager): chỉ xem thiết bị mình sở hữu → ownerUserId = user.id
 *   - Admin/Manager: không filter → cả 2 = null
 *
 * @param {object} user - req.user từ middleware authenticate
 * @returns {{ salesUserId: number|null, ownerUserId: number|null, isAdmin: boolean, isManager: boolean, isSaler: boolean }}
 */
function buildUserFilters(user) {
  const isAdmin   = hasRole(user, 'admin');
  const isManager = MANAGER_ROLES.some(r => hasRole(user, r));
  const isInvestor = hasRole(user, 'investor');
  const isSaler   = hasRole(user, 'saler');

  const salesUserId = (isSaler && !isManager) ? user.id : null;
  const ownerUserId = (isInvestor && !isAdmin && !hasRole(user, 'camera_manager')) ? user.id : null;

  return { salesUserId, ownerUserId, isAdmin, isManager, isSaler, isInvestor };
}

// ── SQL Query Builders ───────────────────────────────────────────

/**
 * Query 1: Thống kê doanh thu & chi phí cấp chi nhánh.
 *
 * Các CTE (theo thứ tự):
 *   cost_users              – danh sách saler/driver (import từ COST_USERS_CTE)
 *   cost_user_branch_counts – số branch mỗi user được gán (để chia đều lương)
 *   ledger_sales_totals     – tổng hoa hồng sales từ rental_commission_ledger (không gồm driver)
 *   ledger_driver_totals_branch – tổng hoa hồng driver từ rental_commission_ledger
 *   maintenance_by_branch   – chi phí bảo trì thiết bị, nhóm theo branch
 *   branch_revenue_stats    – doanh thu / tổng đơn / đơn hoàn thành, nhóm theo branch
 *   employee_salaries       – tổng lương nhân viên (đã chia đều nếu user thuộc nhiều branch)
 *   order_commissions       – tổng hoa hồng sales + driver (luôn tính đủ cả 2, ưu tiên ledger)
 *   ads_costs_by_branch     – chi phí quảng cáo, nhóm theo branch
 *
 * Tham số (positional params):
 *   $1 = periodStartISO      (ISO timestamp cho filter rental)
 *   $2 = periodEndISO        (ISO timestamp cho filter rental)
 *   $3 = salesUserId | NULL  (filter saler)
 *   $4 = ownerUserId | NULL  (filter investor/owner)
 *   $5 = employeePeriodStartDate (YYYY-MM-DD cho ads_cost start)
 *   $6 = employeePeriodEndDate   (YYYY-MM-DD cho ads_cost end)
 *
 * @param {object} pool   - PostgreSQL pool
 * @param {object} params - { periodStartISO, periodEndISO, salesUserId, ownerUserId, employeePeriodStartDate, employeePeriodEndDate }
 * @returns {Promise<QueryResult>}
 */
function fetchBranchStats(pool, params) {
  const { periodStartISO, periodEndISO, salesUserId, ownerUserId, employeePeriodStartDate, employeePeriodEndDate } = params;

  return pool.query(`
    WITH ${COST_USERS_CTE},

    -- Đếm số branch mỗi cost user được gán vào (để chia đều base_salary)
    cost_user_branch_counts AS (
      SELECT ub.user_id, COUNT(*)::numeric as total_assigned_branches
      FROM user_branches ub
      JOIN cost_users u ON u.id = ub.user_id
      WHERE ub.is_deleted = false
      GROUP BY ub.user_id
    ),

    -- Pre-aggregate: tổng commission theo rental_id (tránh correlated subquery)
    -- Tách riêng sales & driver để luôn tính đủ driver cost, ngay cả khi ledger có sales commission
    ledger_sales_totals AS (
      SELECT rental_id, SUM(commission_amount)::numeric as total_commission
      FROM rental_commission_ledger
      WHERE is_deleted = false AND (source_role IS NULL OR source_role != 'driver')
      GROUP BY rental_id
    ),
    ledger_driver_totals_branch AS (
      SELECT rental_id, SUM(commission_amount)::numeric as driver_commission
      FROM rental_commission_ledger
      WHERE is_deleted = false AND source_role = 'driver'
      GROUP BY rental_id
    ),

    -- Pre-aggregate: chi phí bảo trì theo branch (tránh correlated subquery)
    maintenance_by_branch AS (
      SELECT
        e.branch_id,
        COALESCE(SUM(m.maintenance_cost), 0)::numeric as maintenance_cost
      FROM equipment_maintenance m
      JOIN equipment e ON m.equipment_id = e.id AND e.is_deleted = false
      WHERE m.is_deleted = false
        AND m.inserted_at >= $1
        AND m.inserted_at <= $2
        AND ($4::int IS NULL OR e.owner_id = $4)
      GROUP BY e.branch_id
    ),

    -- CTE chính: thống kê cơ bản theo branch
    branch_revenue_stats AS (
      SELECT
        b.id, b.name, b.is_hidden,
        -- Doanh thu: đơn hoàn thành trong kỳ (theo returned_at)
        COALESCE(SUM(r.total_price) FILTER (
          WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed'
        ), 0) as total_revenue,
        -- Giá trị đơn hàng: đơn tạo trong kỳ (không tính cancelled)
        COALESCE(SUM(r.total_price) FILTER (
          WHERE r.inserted_at >= $1 AND r.inserted_at <= $2 AND r.status != 'cancelled'
        ), 0) as total_order_value,
        -- Tổng số đơn tạo trong kỳ (không tính cancelled)
        COUNT(*) FILTER (WHERE r.inserted_at >= $1 AND r.inserted_at <= $2 AND r.status != 'cancelled') as total_orders,
        -- Số đơn bị hủy trong kỳ
        COUNT(*) FILTER (WHERE r.inserted_at >= $1 AND r.inserted_at <= $2 AND r.status = 'cancelled') as cancelled_orders,
        -- Số đơn hoàn thành trong kỳ (cả tạo trong kỳ & tạo trước kỳ)
        COUNT(*) FILTER (WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed') as completed_orders,
        -- Số đơn tạo trước kỳ nhưng hoàn thành trong kỳ
        COUNT(*) FILTER (WHERE r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed' AND r.inserted_at < $1) as orders_from_before
      FROM branches b
      LEFT JOIN rentals r ON b.id = r.branch_id
        AND r.is_deleted = false
        AND (
          (r.inserted_at >= $1 AND r.inserted_at <= $2)
          OR
          (r.returned_at >= $1 AND r.returned_at <= $2 AND r.status = 'completed')
        )
        AND ($3::int IS NULL OR r.user_id = $3)
        AND ($4::int IS NULL OR EXISTS (
          SELECT 1 FROM equipment e_owner
          WHERE e_owner.id = r.equipment_id AND e_owner.owner_id = $4 AND e_owner.is_deleted = false
        ))
      WHERE b.is_deleted = false
      GROUP BY b.id, b.name
    ),

    -- Tổng lương nhân viên theo branch (base_salary / số branch user được gán)
    employee_salaries AS (
      SELECT
        ub.branch_id,
        COALESCE(SUM(u.base_salary / GREATEST(ubc.total_assigned_branches, 1)), 0) as branch_salaries
      FROM cost_users u
      JOIN user_branches ub ON u.id = ub.user_id AND ub.is_deleted = false
      JOIN cost_user_branch_counts ubc ON ubc.user_id = u.id
      GROUP BY ub.branch_id
    ),

    -- Tổng hoa hồng theo branch (chỉ tính đơn completed)
    -- Luôn tính riêng sales commission & driver commission, rồi cộng lại
    -- để đảm bảo driver cost không bị bỏ sót khi ledger có sales commission
    order_commissions AS (
      SELECT
        r.branch_id,
        COALESCE(SUM(
          COALESCE(lst.total_commission, r.total_price * COALESCE(sales_commission.commission_rate, 0))
          +
          COALESCE(ldt.driver_commission, 0)
        ), 0) as total_commissions,
        COALESCE(SUM(
          COALESCE(ldt.driver_commission, 0)
        ), 0) as driver_commissions
      FROM rentals r
      LEFT JOIN ledger_sales_totals lst ON lst.rental_id = r.id
      LEFT JOIN ledger_driver_totals_branch ldt ON ldt.rental_id = r.id
      LEFT JOIN cost_users sales_commission  ON sales_commission.id  = r.user_id         AND sales_commission.is_saler  = true
      WHERE r.status = 'completed'
        AND r.is_deleted = false
        AND r.returned_at >= $1
        AND r.returned_at <= $2
        AND ($3::int IS NULL OR r.user_id = $3 OR r.handover_user_id = $3)
        AND ($4::int IS NULL OR EXISTS (
          SELECT 1 FROM equipment e_owner
          WHERE e_owner.id = r.equipment_id AND e_owner.owner_id = $4 AND e_owner.is_deleted = false
        ))
      GROUP BY r.branch_id
    ),

    -- Chi phí quảng cáo theo branch (overlap với khoảng thời gian query)
    -- Investor ($4): chỉ thấy ads của branch có thiết bị mình sở hữu
    ads_costs_by_branch AS (
      SELECT
        ac.branch_id,
        COALESCE(SUM(ac.amount), 0) as ads_cost
      FROM ads_costs ac
      WHERE ac.is_deleted = false
        AND COALESCE(ac.start_date, ac.date) <= $6::date
        AND COALESCE(ac.end_date, ac.date) >= $5::date
        AND ($4::int IS NULL OR EXISTS (
          SELECT 1 FROM equipment e_ads
          WHERE e_ads.branch_id = ac.branch_id AND e_ads.owner_id = $4 AND e_ads.is_deleted = false
        ))
      GROUP BY ac.branch_id
    )

    -- Ghép tất cả lại
    SELECT
      rev.*,
      COALESCE(mtn.maintenance_cost, 0) as maintenance_cost,
      COALESCE(sal.branch_salaries,  0) as branch_salaries,
      COALESCE(comm.total_commissions, 0) as total_commissions,
      COALESCE(comm.driver_commissions, 0) as driver_commissions,
      COALESCE(ads.ads_cost,          0) as ads_cost
    FROM branch_revenue_stats rev
    LEFT JOIN maintenance_by_branch mtn ON rev.id = mtn.branch_id
    LEFT JOIN employee_salaries    sal ON rev.id = sal.branch_id
    LEFT JOIN order_commissions    comm ON rev.id = comm.branch_id
    LEFT JOIN ads_costs_by_branch  ads  ON rev.id = ads.branch_id
    ORDER BY rev.total_revenue DESC
  `, [periodStartISO, periodEndISO, salesUserId, ownerUserId, employeePeriodStartDate, employeePeriodEndDate]);
}

/**
 * Query 2: Thống kê doanh thu & hoa hồng cấp nhân viên theo chi nhánh.
 *
 * Khác với Query 1: Query này chia nhỏ theo từng THÁNG (dùng month_overlaps)
 * và phân loại đơn hàng thành OLD (tạo trước kỳ, hoàn thành trong kỳ)
 * và NEW (tạo & hoàn thành cùng kỳ).
 *
 * Các CTE (theo thứ tự):
 *   months               – generate_series các tháng trong khoảng query
 *   month_overlaps       – tính overlap giữa tháng & khoảng query (cho partial month)
 *   cost_users           – danh sách saler/driver
 *   user_branch_mapping  – map user → branch + đếm tổng số branch user được gán
 *   ledger_totals_by_user – commission từ ledger, nhóm theo rental + user
 *   ledger_driver_cost   – commission của driver (source_role = 'driver')
 *   ledger_upline_cost   – commission upline (line_type = 'uplink_share')
 *   rental_tagged        – pre-tag mỗi rental với boolean flags phân loại kỳ
 *   monthly_revenue_by_user_branch – aggregate theo user + branch + month
 *   monthly_calculation_by_user_branch – tính lương pro-rata + merge payroll_snapshots
 *
 * Tham số (positional params):
 *   $1 = employeePeriodStartDate (YYYY-MM-DD)
 *   $2 = employeePeriodEndDate   (YYYY-MM-DD)
 *   $3 = ownerUserId | NULL      (filter investor/owner)
 *
 * @param {object} pool   - PostgreSQL pool
 * @param {object} params - { employeePeriodStartDate, employeePeriodEndDate, ownerUserId }
 * @returns {Promise<QueryResult>}
 */
function fetchEmployeeStats(pool, params) {
  const { employeePeriodStartDate, employeePeriodEndDate, ownerUserId } = params;

  return pool.query(`
    -- Tạo danh sách các tháng trong khoảng query
    WITH months AS (
      SELECT date_trunc('month', d)::date as month_start
      FROM generate_series(
        date_trunc('month', $1::date),
        date_trunc('month', $2::date),
        '1 month'::interval
      ) d
    ),

    -- Tính overlap giữa mỗi tháng và khoảng query (hỗ trợ partial month)
    month_overlaps AS (
      SELECT
        month_start,
        TO_CHAR(month_start, 'YYYY-MM') as month_key,
        GREATEST(month_start, $1::date) as overlap_start,
        LEAST((month_start + interval '1 month - 1 day')::date, $2::date) as overlap_end,
        EXTRACT(DAY FROM (month_start + interval '1 month - 1 day'))::numeric as days_in_month
      FROM months
    ),

    ${COST_USERS_CTE},

    -- Map user → branch + số branch được gán (để chia lương) — chỉ saler
    user_branch_mapping AS (
      SELECT
        u.id as user_id, ub.branch_id,
        u.is_saler, u.is_driver,
        COUNT(*) OVER(PARTITION BY u.id) as total_assigned_branches
      FROM cost_users u
      JOIN user_branches ub ON u.id = ub.user_id AND ub.is_deleted = false
      WHERE u.is_saler = true
    ),

    -- Commission ledger theo rental + user
    ledger_totals_by_user AS (
      SELECT rental_id, user_id, SUM(commission_amount)::numeric as total_commission
      FROM rental_commission_ledger WHERE is_deleted = false
      GROUP BY rental_id, user_id
    ),

    -- Commission của driver (từ ledger)
    ledger_driver_cost AS (
      SELECT rental_id, SUM(commission_amount)::numeric as driver_commission
      FROM rental_commission_ledger WHERE is_deleted = false AND source_role = 'driver'
      GROUP BY rental_id
    ),

    -- Commission upline (từ ledger)
    ledger_upline_cost AS (
      SELECT rental_id, SUM(commission_amount)::numeric as upline_commission
      FROM rental_commission_ledger WHERE is_deleted = false AND line_type = 'uplink_share'
      GROUP BY rental_id
    ),

    -- ★ CTE quan trọng: pre-tag mỗi rental với các boolean flags
    -- Mục đích: tránh lặp đi lặp lại CASE WHEN trong các aggregate sau
    rental_tagged AS (
      SELECT
        r.id, r.user_id, r.handover_user_id, r.branch_id,
        r.total_price, r.status, r.inserted_at, r.returned_at,
        mo.month_key, mo.overlap_start, mo.overlap_end,
        mo.days_in_month,
        (mo.overlap_end - mo.overlap_start + 1)::numeric as overlap_days,

        -- Flag: đơn được TẠO trong tháng này
        r.inserted_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
          AND r.inserted_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz
          AS is_in_period,

        -- Flag: đơn HOÀN THÀNH trong tháng này
        r.returned_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
          AND r.returned_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz
          AND r.status = 'completed'
          AS is_completed_in_period,

        -- Flag: đơn đang active (tạo trong kỳ, không cancel)
        r.inserted_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
          AND r.inserted_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz
          AND r.status != 'cancelled'
          AS is_active_in_period,

        -- Flag: đơn được tạo TRƯỚC tháng này → OLD order
        r.inserted_at < (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
          AS created_before_period,

        -- Flag: đơn vừa tạo vừa hoàn thành TRONG CÙNG tháng này → NEW order
        r.inserted_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
          AND r.inserted_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz
          AND r.returned_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
          AND r.returned_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz
          AND r.status = 'completed'
          AS is_new_completed

      FROM rentals r
      CROSS JOIN month_overlaps mo
      WHERE r.is_deleted = false
        AND (
          (r.inserted_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
           AND r.inserted_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz)
          OR
          (r.returned_at >= (mo.overlap_start::text || ' 00:00:00+07')::timestamptz
           AND r.returned_at <= (mo.overlap_end::text || ' 23:59:59+07')::timestamptz
           AND r.status = 'completed')
        )
        AND ($3::int IS NULL OR EXISTS (
          SELECT 1 FROM equipment e_owner
          WHERE e_owner.id = r.equipment_id AND e_owner.owner_id = $3 AND e_owner.is_deleted = false
        ))
    ),

    -- Aggregate: doanh thu & hoa hồng theo user + branch + month
    monthly_revenue_by_user_branch AS (
      SELECT
        ubm.user_id, ubm.branch_id, ubm.total_assigned_branches,
        mo.month_key, mo.overlap_start, mo.overlap_end,
        mo.days_in_month,
        (mo.overlap_end - mo.overlap_start + 1)::numeric as overlap_days,

        -- === Saler + Driver metrics (dùng chung cho hiển thị tổng) ===

        -- Tổng số đơn: saler tính đơn tạo trong kỳ, driver tính đơn hoàn thành
        COUNT(*) FILTER (WHERE
          (ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_in_period)
          OR
          (ubm.is_driver AND rt.handover_user_id = ubm.user_id AND rt.is_completed_in_period)
        )::int as total_orders,

        -- Tổng giá trị đơn: saler tính đơn active, driver tính đơn hoàn thành
        COALESCE(SUM(rt.total_price) FILTER (WHERE
          (ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_active_in_period)
          OR
          (ubm.is_driver AND rt.handover_user_id = ubm.user_id AND rt.is_completed_in_period)
        ), 0)::numeric as month_order_value,

        -- === Saler-only metrics ===

        -- Số đơn hoàn thành của saler trong kỳ
        COUNT(*) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period)::int as completed_orders,

        -- Doanh thu từ đơn hoàn thành của saler
        COALESCE(SUM(rt.total_price) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period), 0)::numeric as month_revenue,

        -- Hoa hồng: tất cả đơn hoàn thành (không phân biệt tạo khi nào)
        COALESCE(SUM(
          COALESCE(ltu.total_commission, rt.total_price * COALESCE(u.commission_rate, 0))
        ) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period), 0)::numeric as month_user_commission_amount,

        -- Số đơn saler tạo trong kỳ
        COUNT(*) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_in_period)::int as saler_orders,

        -- Giá trị đơn saler tạo trong kỳ (không cancel)
        COALESCE(SUM(rt.total_price) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_active_in_period), 0)::numeric as saler_order_value,

        -- Doanh thu saler: đơn NEW (tạo & hoàn thành cùng kỳ)
        COALESCE(SUM(rt.total_price) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_new_completed), 0)::numeric as saler_revenue,

        -- === OLD orders: tạo trước kỳ, hoàn thành trong kỳ ===

        COUNT(*) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period AND rt.created_before_period)::int as prior_month_completed_orders,
        COALESCE(SUM(rt.total_price) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period AND rt.created_before_period), 0)::numeric as prior_month_completed_value,

        -- OLD: chi phí driver commission
        COALESCE(SUM(COALESCE(ldc.driver_commission, 0)) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period AND rt.created_before_period), 0)::numeric as old_driver_commission_cost,
        -- OLD: chi phí upline commission
        COALESCE(SUM(COALESCE(luc.upline_commission, 0)) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period AND rt.created_before_period), 0)::numeric as old_upline_commission_cost,
        -- OLD: hoa hồng saler
        COALESCE(SUM(COALESCE(ltu.total_commission, rt.total_price * COALESCE(u.commission_rate, 0))) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_completed_in_period AND rt.created_before_period), 0)::numeric as old_saler_commission,

        -- === NEW orders: tạo & hoàn thành cùng kỳ ===

        -- NEW: hoa hồng saler
        COALESCE(SUM(COALESCE(ltu.total_commission, rt.total_price * COALESCE(u.commission_rate, 0))) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_new_completed), 0)::numeric as new_saler_commission,
        -- NEW: chi phí driver commission
        COALESCE(SUM(COALESCE(ldc.driver_commission, 0)) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_new_completed), 0)::numeric as new_driver_commission_cost,
        -- NEW: chi phí upline commission
        COALESCE(SUM(COALESCE(luc.upline_commission, 0)) FILTER (WHERE ubm.is_saler AND rt.user_id = ubm.user_id AND rt.is_new_completed), 0)::numeric as new_upline_commission_cost

      FROM user_branch_mapping ubm
      JOIN cost_users u ON u.id = ubm.user_id
      CROSS JOIN month_overlaps mo
      LEFT JOIN rental_tagged rt ON rt.branch_id = ubm.branch_id
        AND rt.month_key = mo.month_key
        AND (
          (ubm.is_saler  AND rt.user_id         = ubm.user_id)
          OR
          (ubm.is_driver AND rt.handover_user_id = ubm.user_id)
        )
      LEFT JOIN ledger_totals_by_user ltu ON ltu.rental_id = rt.id AND ltu.user_id = ubm.user_id
      LEFT JOIN ledger_driver_cost   ldc ON ldc.rental_id = rt.id
      LEFT JOIN ledger_upline_cost   luc ON luc.rental_id = rt.id
      GROUP BY ubm.user_id, ubm.branch_id, ubm.total_assigned_branches,
               mo.month_key, mo.overlap_start, mo.overlap_end,
               mo.days_in_month, (mo.overlap_end - mo.overlap_start + 1), u.commission_rate
    ),

    -- Tính lương pro-rata + merge payroll_snapshots (ưu tiên snapshot nếu có)
    monthly_calculation_by_user_branch AS (
      SELECT
        mr.*,
        u.full_name, u.username,
        -- Lương cơ bản (đã chia theo số branch user được gán)
        (COALESCE(ps.base_salary, u.base_salary)::numeric / mr.total_assigned_branches) as base_salary,
        -- Commission rate (ưu tiên payroll_snapshot)
        COALESCE(ps.commission_rate, u.commission_rate)::numeric as commission_rate,
        -- Lương pro-rata: (base_salary / days_in_month) * overlap_days
        (((COALESCE(ps.base_salary, u.base_salary)::numeric / mr.total_assigned_branches) / mr.days_in_month) * mr.overlap_days)::numeric as month_salary_cost,
        mr.month_user_commission_amount::numeric as month_commission_cost
      FROM monthly_revenue_by_user_branch mr
      JOIN cost_users u ON mr.user_id = u.id
      LEFT JOIN payroll_snapshots ps ON ps.user_id = u.id AND ps.month = mr.month_key AND ps.is_deleted = false
    )

    -- Tổng hợp cuối cùng: SUM tất cả các tháng → 1 row cho mỗi user+branch
    SELECT
      user_id         as id,
      branch_id,
      full_name,
      username,
      SUM(total_orders)::int                    as total_orders,
      SUM(month_order_value)::numeric           as total_order_value,
      SUM(completed_orders)::int                as completed_orders,
      SUM(month_revenue)::numeric               as total_revenue,
      SUM(saler_orders)::int                    as total_saler_orders,
      SUM(saler_order_value)::numeric           as total_saler_order_value,
      SUM(saler_revenue)::numeric               as total_saler_revenue,
      SUM(prior_month_completed_orders)::int    as total_completed_orders,
      SUM(prior_month_completed_value)::numeric as total_completed_order_value,
      SUM(old_driver_commission_cost)::numeric  as driver_commission_cost,
      SUM(old_upline_commission_cost)::numeric  as upline_commission_cost,
      SUM(old_saler_commission)::numeric        as commission_amount_old,
      SUM(new_saler_commission)::numeric        as commission_amount_new,
      SUM(new_driver_commission_cost)::numeric  as driver_commission_cost_new,
      SUM(new_upline_commission_cost)::numeric  as upline_commission_cost_new,
      (ARRAY_AGG(base_salary ORDER BY month_key DESC))[1]       as base_salary,
      (ARRAY_AGG(commission_rate ORDER BY month_key DESC))[1]   as commission_rate,
      SUM(month_salary_cost)::numeric            as total_base_salary_cost,
      SUM(month_commission_cost)::numeric        as total_commission_cost
    FROM monthly_calculation_by_user_branch
    GROUP BY user_id, branch_id, full_name, username
    ORDER BY total_revenue DESC;
  `, [employeePeriodStartDate, employeePeriodEndDate, ownerUserId]);
}

// ── Data Transform Functions ─────────────────────────────────────

/**
 * Transform kết quả Query 2 (employee stats) → Map<branch_id, employee[]>
 *
 * Mỗi employee row sẽ có profit được tính:
 *   profit = total_revenue - base_salary_cost - commission_amount
 *            - driver_commission_cost (OLD + NEW)
 *            - upline_commission_cost (OLD + NEW)
 *
 * @param {Array}  employeeRows - Kết quả từ fetchEmployeeStats
 * @param {object} userFilters  - Kết quả từ buildUserFilters()
 * @returns {Object.<number, Array>} Map branch_id → employee[]
 */
function mapEmployeeRowsToBranchMap(employeeRows, userFilters) {
  const { isAdmin, isManager, isSaler, ownerUserId } = userFilters;
  const branchMap = {};

  employeeRows.forEach(row => {
    // Saler chỉ được xem chính mình trong danh sách nhân viên
    if (!isAdmin && !isManager && isSaler && row.id !== userFilters._userId) {
      return;
    }

    const branchId = row.branch_id;
    if (!branchMap[branchId]) {
      branchMap[branchId] = [];
    }

    const totalRevenue      = parseFloat(row.total_revenue);
    const baseSalaryCost    = ownerUserId ? 0 : parseFloat(row.total_base_salary_cost);
    const commissionAmount  = parseFloat(row.total_commission_cost);
    const driverCost        = parseFloat(row.driver_commission_cost     || 0);
    const uplineCost        = parseFloat(row.upline_commission_cost     || 0);
    const driverCostNew     = parseFloat(row.driver_commission_cost_new || 0);
    const uplineCostNew     = parseFloat(row.upline_commission_cost_new || 0);
    const commissionOld     = parseFloat(row.commission_amount_old      || 0);
    const commissionNew     = parseFloat(row.commission_amount_new      || 0);

    // Profit = Doanh thu - Lương - Hoa hồng - Driver cost - Upline cost
    const profit = totalRevenue
      - baseSalaryCost
      - commissionAmount
      - (driverCost + driverCostNew)
      - (uplineCost + uplineCostNew);

    branchMap[branchId].push({
      id:                          row.id,
      full_name:                   row.full_name,
      username:                    row.username,
      total_orders:                parseInt(row.total_orders, 10),
      total_revenue:               totalRevenue,
      total_order_value:           parseFloat(row.total_order_value),
      total_saler_orders:          parseInt(row.total_saler_orders          || 0, 10),
      total_saler_order_value:     parseFloat(row.total_saler_order_value   || 0),
      total_saler_revenue:         parseFloat(row.total_saler_revenue       || 0),
      total_completed_orders:      parseInt(row.total_completed_orders      || 0, 10),
      total_completed_order_value: parseFloat(row.total_completed_order_value || 0),
      base_salary:                 parseFloat(row.base_salary),
      commission_rate:             parseFloat(row.commission_rate),
      base_salary_cost:            baseSalaryCost,
      commission_amount:           commissionAmount,
      commission_amount_old:       commissionOld,
      commission_amount_new:       commissionNew,
      driver_commission_cost:      driverCost,
      driver_commission_cost_new:  driverCostNew,
      upline_commission_cost:      uplineCost,
      upline_commission_cost_new:  uplineCostNew,
      profit,
    });
  });

  return branchMap;
}

/**
 * Transform kết quả Query 1 (branch stats) → array các branch object.
 *
 * Merge với employee map và tính profit theo role:
 *   - Admin:    profit = revenue - maintenance - salaries - commissions - ads
 *   - Investor: profit = revenue - maintenance - commissions (không thấy salary & ads)
 *   - Manager/Saler: ẩn tất cả cost fields
 *
 * @param {Array}  branchRows - Kết quả từ fetchBranchStats
 * @param {Object} employeeMap - mapBranchIdToEmployees từ mapEmployeeRowsToBranchMap
 * @param {object} userFilters - Kết quả từ buildUserFilters()
 * @param {Array}  userBranchIds - req.user.branch_ids || []
 * @returns {Array} Danh sách branch object đã transform
 */
function mapBranchRows(branchRows, employeeMap, userFilters, userBranchIds) {
  const { isAdmin, isInvestor, ownerUserId } = userFilters;

  // Filter branches theo role
  let filtered = branchRows;
  if (isInvestor && !isAdmin) {
    // Investor: chỉ hiện branch có dữ liệu
    filtered = branchRows.filter(row =>
      Number(row.total_orders     || 0) > 0 ||
      Number(row.total_order_value || 0) > 0 ||
      Number(row.total_revenue     || 0) > 0 ||
      Number(row.maintenance_cost  || 0) > 0 ||
      Number(row.ads_cost          || 0) > 0
    );
  } else if (!isAdmin) {
    // Manager/Saler: chỉ hiện branch được gán
    filtered = branchRows.filter(row => userBranchIds.includes(row.id));
  }

  return filtered.map(row => {
    const revenue          = parseFloat(row.total_revenue);
    const maintenanceCost  = parseFloat(row.maintenance_cost);
    const branchSalaries   = parseFloat(row.branch_salaries);
    const totalCommissions = parseFloat(row.total_commissions);
    const adsCost          = parseFloat(row.ads_cost || 0);
    const costs            = maintenanceCost + branchSalaries + totalCommissions + adsCost;

    const data = {
      ...row,
      total_revenue:    revenue,
      total_order_value: parseFloat(row.total_order_value),
      total_orders:      parseInt(row.total_orders, 10),
      cancelled_orders:  parseInt(row.cancelled_orders, 10),
      completed_orders:  parseInt(row.completed_orders, 10),
      orders_from_before: parseInt(row.orders_from_before, 10),
      employees:         employeeMap[row.id] || [],
    };

    if (isAdmin) {
      // Admin: xem toàn bộ chi phí
      data.maintenance_cost  = maintenanceCost;
      data.ads_cost          = adsCost;
      data.branch_salaries   = branchSalaries;
      data.total_commissions = totalCommissions;
      data.driver_commissions = parseFloat(row.driver_commissions || 0);
      data.profit            = revenue - costs;
      data.profit_percentage = revenue > 0 ? Math.round(((revenue - costs) / revenue) * 100) : 0;
      data.investors         = [];
    } else if (ownerUserId) {
      // Investor: thấy maintenance, commissions & ads
      const investorCosts = maintenanceCost + totalCommissions + adsCost;
      const investorProfit = revenue - investorCosts;
      data.maintenance_cost  = maintenanceCost;
      data.ads_cost          = adsCost;
      data.branch_salaries   = 0;
      data.total_commissions = totalCommissions;
      data.driver_commissions = parseFloat(row.driver_commissions || 0);
      data.profit            = investorProfit;
      data.profit_percentage = revenue > 0 ? Math.round((investorProfit / revenue) * 100) : 0;
      data.investors         = [];
    } else {
      // Manager/Saler: ẩn chi phí
      data.maintenance_cost  = 0;
      data.ads_cost          = 0;
      data.branch_salaries   = 0;
      data.total_commissions = 0;
      data.profit            = 0;
      data.profit_percentage = 0;
      data.investors         = [];
    }

    return data;
  });
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Hàm chính: Lấy báo cáo doanh thu theo chi nhánh.
 *
 * @param {object} pool  - PostgreSQL pool
 * @param {object} query - req.query { startDate?, endDate? }
 * @param {object} user  - req.user (từ middleware authenticate)
 * @returns {Promise<Array>} Danh sách branch objects
 *
 * @example
 *   const branches = await getRevenueByBranch(pool, req.query, req.user);
 *   res.json(branches);
 */
async function getRevenueByBranch(pool, query, user) {
  // 1. Parse date range
  const dateRange = buildDateRange(query.startDate, query.endDate);

  // 2. Xác định filter theo role
  const userFilters = buildUserFilters(user);
  userFilters._userId = user.id; // để dùng trong mapEmployeeRowsToBranchMap

  // 3. Kiểm tra quyền truy cập
  const hasAccess = ALLOWED_ROLES.some(r => hasRole(user, r));
  if (!hasAccess) {
    return [];
  }

  // 4. Chạy 2 queries song song
  const queryParams = {
    ...dateRange,
    salesUserId:  userFilters.salesUserId,
    ownerUserId:  userFilters.ownerUserId,
  };

  const [branchResult, employeeResult] = await Promise.all([
    fetchBranchStats(pool, queryParams),
    fetchEmployeeStats(pool, queryParams),
  ]);

  // 5. Transform dữ liệu
  const employeeMap = mapEmployeeRowsToBranchMap(employeeResult.rows, userFilters);
  const branches    = mapBranchRows(branchResult.rows, employeeMap, userFilters, user.branch_ids || []);

  return branches;
}

module.exports = { getRevenueByBranch };
