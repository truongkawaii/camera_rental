// services/salesTierService.js
//
// CHÍNH SÁCH THI ĐUA DOANH SỐ (áp dụng từ tháng 2026-10)
// ─────────────────────────────────────────────────────────────────────
// Hoa hồng của Sale được tự động tính theo DOANH SỐ THÁNG của chính sale đó:
//   - Doanh số = tổng total_price các đơn do sale tạo (rentals.user_id = sale),
//     trạng thái 'completed', tính theo tháng của returned_at (giờ VN).
//     Chỉ tính phần tạo ra dưới vai trò sale (không gồm giao nhận, không gồm
//     hoa hồng cấp trên).
//   - Doanh số tháng đạt mốc nào thì TOÀN BỘ doanh thu tháng đó của sale
//     được tính theo % của mốc đó (không lũy tiến).
//   - Admin có thể ghi đè % hoa hồng và/hoặc tiền thưởng của từng sale CHO MỘT
//     THÁNG cụ thể (bảng sale_monthly_commission_overrides). Sang tháng mới hệ
//     thống tự tính lại theo doanh số.
//   - Tiền thưởng được tính vào chi phí phát sinh và trừ vào số tiền sale cần
//     chuyển cho admin.

const TIER_START_MONTH = '2026-10';

const MILLION = 1000000;

// min: doanh số tối thiểu (>=), max: doanh số tối đa (<)
const SALE_TIERS = [
  { key: 'under_5', min: 0, max: 5 * MILLION, rate_percent: 5, bonus_amount: 0, label: 'Dưới 5 triệu' },
  { key: '5_10', min: 5 * MILLION, max: 10 * MILLION, rate_percent: 5, bonus_amount: 300000, label: 'Từ 5 triệu – dưới 10 triệu' },
  { key: '10_20', min: 10 * MILLION, max: 20 * MILLION, rate_percent: 10, bonus_amount: 1000000, label: 'Từ 10 triệu – dưới 20 triệu' },
  { key: '20_30', min: 20 * MILLION, max: 30 * MILLION, rate_percent: 10, bonus_amount: 1500000, label: 'Từ 20 triệu – dưới 30 triệu' },
  { key: '30_40', min: 30 * MILLION, max: 40 * MILLION, rate_percent: 15, bonus_amount: 2000000, label: 'Từ 30 triệu – dưới 40 triệu' },
  // Từ 40 triệu: chính sách đặc biệt -> giữ 15%, thưởng do admin tự nhập
  { key: '40_plus', min: 40 * MILLION, max: Infinity, rate_percent: 15, bonus_amount: 0, label: 'Từ 40 triệu trở lên (chính sách đặc biệt)' }
];

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isValidMonth = (month) => typeof month === 'string' && /^\d{4}-\d{2}$/.test(month);

// 'YYYY-MM' theo giờ Việt Nam của một thời điểm bất kỳ
const getVNMonth = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  return `${year}-${month}`;
};

// Khoảng [start, end) của tháng theo giờ VN, dùng cho các truy vấn returned_at
const getMonthRange = (month) => {
  const [year, mon] = month.split('-').map(Number);
  const nextMonth = mon === 12 ? 1 : mon + 1;
  const nextYear = mon === 12 ? year + 1 : year;
  return {
    start: `${year}-${String(mon).padStart(2, '0')}-01 00:00:00+07`,
    end: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00+07`
  };
};

// Ngày đầu / cuối tháng dạng 'YYYY-MM-DD' (dùng cho chi phí phát sinh)
const getMonthDateBounds = (month) => {
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    startDate: `${year}-${String(mon).padStart(2, '0')}-01`,
    endDate: `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  };
};

const isTierMonth = (month) => isValidMonth(month) && month >= TIER_START_MONTH;

const getTierForRevenue = (revenue) => {
  const value = Math.max(0, toNumber(revenue));
  return SALE_TIERS.find((tier) => value >= tier.min && value < tier.max) || SALE_TIERS[0];
};

const isMonthLocked = async (client, month) => {
  const result = await client.query(
    'SELECT 1 FROM payroll_snapshots WHERE month = $1 AND is_deleted = false LIMIT 1',
    [month]
  );
  return result.rows.length > 0;
};

const isTieredSaler = async (client, userId) => {
  if (!userId) return false;
  const result = await client.query(
    `
      SELECT 1
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.is_deleted = false
      JOIN roles r ON r.id = ur.role_id AND r.is_deleted = false
      WHERE u.id = $1 AND u.is_deleted = false AND r.name = 'saler'
      LIMIT 1
    `,
    [userId]
  );
  return result.rows.length > 0;
};

const getMonthOverride = async (client, userId, month) => {
  const result = await client.query(
    `
      SELECT id, user_id, month, rate_percent, bonus_amount, notes, updated_at
      FROM sale_monthly_commission_overrides
      WHERE user_id = $1 AND month = $2 AND is_deleted = false
      LIMIT 1
    `,
    [userId, month]
  );
  return result.rows[0] || null;
};

// Doanh số tháng của một sale (đơn completed do sale tạo)
const getSalerMonthRevenue = async (client, userId, month, { excludeRentalId = null } = {}) => {
  const { start, end } = getMonthRange(month);
  const result = await client.query(
    `
      SELECT COALESCE(SUM(ren.total_price), 0)::numeric AS revenue
      FROM rentals ren
      WHERE ren.user_id = $1
        AND ren.status = 'completed'
        AND ren.is_deleted = false
        AND ren.returned_at >= $2::timestamptz
        AND ren.returned_at < $3::timestamptz
        AND ($4::int IS NULL OR ren.id <> $4::int)
    `,
    [userId, start, end, excludeRentalId]
  );
  return toNumber(result.rows[0]?.revenue);
};

const buildResolution = ({ month, revenue, override }) => {
  const tier = getTierForRevenue(revenue);
  const hasRateOverride = override && override.rate_percent !== null && override.rate_percent !== undefined;
  const hasBonusOverride = override && override.bonus_amount !== null && override.bonus_amount !== undefined;
  return {
    applicable: true,
    month,
    revenue,
    tier_key: tier.key,
    tier_label: tier.label,
    tier_rate_percent: tier.rate_percent,
    tier_bonus_amount: tier.bonus_amount,
    rate_percent: hasRateOverride ? toNumber(override.rate_percent) : tier.rate_percent,
    rate_source: hasRateOverride ? 'override' : 'tier',
    bonus_amount: hasBonusOverride ? toNumber(override.bonus_amount) : tier.bonus_amount,
    bonus_source: hasBonusOverride ? 'override' : 'tier',
    override_rate_percent: hasRateOverride ? toNumber(override.rate_percent) : null,
    override_bonus_amount: hasBonusOverride ? toNumber(override.bonus_amount) : null
  };
};

/**
 * Xác định % hoa hồng + tiền thưởng của 1 sale trong 1 tháng.
 * Trả về { applicable: false } nếu tháng chưa áp dụng chính sách hoặc user không phải sale.
 * extraRevenue / excludeRentalId dùng khi cần tính "nếu có thêm đơn này" (preview) hoặc
 * khi đơn đang xét nằm trong doanh số (tránh cộng 2 lần).
 */
const resolveSalerMonthCommission = async (client, userId, month, { excludeRentalId = null, extraRevenue = 0 } = {}) => {
  if (!userId || !isTierMonth(month)) return { applicable: false };
  if (!(await isTieredSaler(client, userId))) return { applicable: false };

  const baseRevenue = await getSalerMonthRevenue(client, userId, month, { excludeRentalId });
  const revenue = baseRevenue + Math.max(0, toNumber(extraRevenue));
  const override = await getMonthOverride(client, userId, month);
  return buildResolution({ month, revenue, override });
};

/**
 * Tổng hợp theo tháng cho TẤT CẢ sale (dùng cho bảng lương, chi phí phát sinh,
 * trang chuyển tiền). Với tháng đã chốt lương, tiền thưởng lấy từ snapshot.
 * Trả về Map<userId, summary>.
 */
const getMonthSalerSummaries = async (client, month) => {
  const summaries = new Map();
  if (!isTierMonth(month)) return summaries;

  const { start, end } = getMonthRange(month);

  const salersResult = await client.query(
    `
      SELECT DISTINCT u.id, u.username, u.full_name, u.branch_id, b.name AS branch_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.is_deleted = false
      JOIN roles r ON r.id = ur.role_id AND r.is_deleted = false AND r.name = 'saler'
      LEFT JOIN branches b ON b.id = u.branch_id AND b.is_deleted = false
      WHERE u.is_deleted = false
    `
  );
  if (salersResult.rows.length === 0) return summaries;

  const revenueResult = await client.query(
    `
      SELECT ren.user_id, COALESCE(SUM(ren.total_price), 0)::numeric AS revenue
      FROM rentals ren
      WHERE ren.user_id = ANY($1::int[])
        AND ren.status = 'completed'
        AND ren.is_deleted = false
        AND ren.returned_at >= $2::timestamptz
        AND ren.returned_at < $3::timestamptz
      GROUP BY ren.user_id
    `,
    [salersResult.rows.map((row) => row.id), start, end]
  );
  const revenueByUser = new Map(revenueResult.rows.map((row) => [row.user_id, toNumber(row.revenue)]));

  const overrideResult = await client.query(
    `
      SELECT o.user_id, o.rate_percent, o.bonus_amount, o.branch_id, ob.name AS branch_name
      FROM sale_monthly_commission_overrides o
      LEFT JOIN branches ob ON ob.id = o.branch_id AND ob.is_deleted = false
      WHERE o.month = $1 AND o.is_deleted = false
    `,
    [month]
  );
  const overrideByUser = new Map(overrideResult.rows.map((row) => [row.user_id, row]));

  const locked = await isMonthLocked(client, month);
  let snapshotByUser = new Map();
  if (locked) {
    const snapshotResult = await client.query(
      `
        SELECT user_id, commission_rate, bonus_amount
        FROM payroll_snapshots
        WHERE month = $1 AND is_deleted = false
      `,
      [month]
    );
    snapshotByUser = new Map(snapshotResult.rows.map((row) => [row.user_id, row]));
  }

  for (const user of salersResult.rows) {
    const resolution = buildResolution({
      month,
      revenue: revenueByUser.get(user.id) || 0,
      override: overrideByUser.get(user.id) || null
    });

    // Tháng đã chốt: tiền thưởng bất biến theo snapshot
    const snapshot = snapshotByUser.get(user.id);
    if (snapshot) {
      resolution.bonus_amount = toNumber(snapshot.bonus_amount);
      resolution.rate_percent = Math.round(toNumber(snapshot.commission_rate) * 10000) / 100;
    }

    const branchOverride = overrideByUser.get(user.id);
    const hasBranchOverride = !!(branchOverride && branchOverride.branch_id && branchOverride.branch_name);
    summaries.set(user.id, {
      ...resolution,
      user_id: user.id,
      username: user.username,
      full_name: user.full_name,
      branch_id: hasBranchOverride ? branchOverride.branch_id : user.branch_id,
      branch_name: hasBranchOverride ? branchOverride.branch_name : user.branch_name,
      user_branch_id: user.branch_id,
      override_branch_id: hasBranchOverride ? branchOverride.branch_id : null,
      is_locked: locked
    });
  }

  return summaries;
};

/**
 * Các dòng "Thưởng doanh số" tự động (coi như chi phí phát sinh) cho khoảng ngày [start, end].
 * Dùng chung cho trang Chi phí phát sinh, báo cáo nhà đầu tư...
 */
const getBonusMiscRows = async (client, start, end) => {
  const rows = [];
  const startMonth = String(start).slice(0, 7);
  const endMonth = String(end).slice(0, 7);
  let [cy, cm] = (startMonth < TIER_START_MONTH ? TIER_START_MONTH : startMonth).split('-').map(Number);
  while (`${cy}-${String(cm).padStart(2, '0')}` <= endMonth) {
    const monthKey = `${cy}-${String(cm).padStart(2, '0')}`;
    const bounds = getMonthDateBounds(monthKey);
    const summaries = await getMonthSalerSummaries(client, monthKey);
    for (const s of summaries.values()) {
      if (!(Number(s.bonus_amount) > 0)) continue;
      rows.push({
        id: `auto-bonus-${s.user_id}-${monthKey}`,
        user_id: s.user_id,
        month: monthKey,
        date: bounds.startDate,
        start_date: bounds.startDate,
        end_date: bounds.endDate,
        branch_id: s.branch_id,
        branch_name: s.branch_name,
        amount: Number(s.bonus_amount),
        category: 'Thưởng doanh số',
        notes: `Thưởng doanh số tháng ${monthKey} - ${s.full_name || s.username} (${s.tier_label})`,
        created_by_name: 'Hệ thống',
        is_auto: true,
        is_locked: s.is_locked,
        override_rate_percent: s.override_rate_percent,
        override_bonus_amount: s.override_bonus_amount,
        user_branch_id: s.user_branch_id
      });
    }
    cm += 1;
    if (cm > 12) { cm = 1; cy += 1; }
  }
  return rows;
};

module.exports = {
  getBonusMiscRows,
  TIER_START_MONTH,
  SALE_TIERS,
  isValidMonth,
  isTierMonth,
  getVNMonth,
  getMonthRange,
  getMonthDateBounds,
  getTierForRevenue,
  isMonthLocked,
  isTieredSaler,
  getMonthOverride,
  getSalerMonthRevenue,
  resolveSalerMonthCommission,
  getMonthSalerSummaries
};
