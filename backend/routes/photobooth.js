const express = require('express');
const { pool } = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { requirePhotoboothAccess } = require('../middleware/photoboothAccess');

const router = express.Router();
router.use(authenticate, requirePhotoboothAccess);

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const nonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
const wholeMoney = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const clean = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const fail = (res, message) => res.status(400).json({ error: message });
const run = (handler) => async (req, res, next) => {
  try { await handler(req, res); } catch (error) { next(error); }
};

const resources = {
  services: { table: 'pb_services', columns: ['name', 'category', 'price', 'active'], order: 'name' },
  gifts: { table: 'pb_gifts', columns: ['name', 'sku', 'low_stock_threshold', 'active'], order: 'name' },
  assets: { table: 'pb_assets', columns: ['name', 'code', 'kind', 'status', 'note'], order: 'name' },
  incidents: { table: 'pb_incidents', columns: ['asset_id', 'title', 'description', 'status', 'cost', 'resolution'], order: 'reported_at DESC' },
  staff: { table: 'pb_staff', columns: ['name', 'role', 'phone', 'active'], order: 'name' },
  shifts: { table: 'pb_shifts', columns: ['work_date', 'label', 'start_time', 'end_time', 'staff_id', 'status', 'note'], order: 'work_date DESC, start_time' },
  tasks: { table: 'pb_tasks', columns: ['work_date', 'title', 'staff_id', 'done'], order: 'work_date DESC, id DESC' }
};

function validate(resource, body, updating = false) {
  if (!updating || 'name' in body) {
    if (['services', 'gifts', 'assets', 'staff'].includes(resource) && !clean(body.name)) return 'Vui lòng nhập tên.';
  }
  if (resource === 'services') {
    if ((!updating || 'category' in body) && !['shoot', 'print', 'other'].includes(body.category)) return 'Loại dịch vụ không hợp lệ.';
    if ((!updating || 'price' in body) && !nonNegative(body.price)) return 'Giá không hợp lệ.';
  }
  if (resource === 'gifts' && 'low_stock_threshold' in body && (!Number.isInteger(Number(body.low_stock_threshold)) || Number(body.low_stock_threshold) < 0)) return 'Ngưỡng tồn kho không hợp lệ.';
  if (resource === 'assets' && 'status' in body && !['active', 'maintenance', 'offline'].includes(body.status)) return 'Trạng thái không hợp lệ.';
  if (resource === 'incidents') {
    if ((!updating || 'asset_id' in body) && !positiveId(body.asset_id)) return 'Vui lòng chọn thiết bị.';
    if ((!updating || 'title' in body) && !clean(body.title, 240)) return 'Vui lòng nhập sự cố.';
    if ('status' in body && !['open', 'in_progress', 'resolved'].includes(body.status)) return 'Trạng thái không hợp lệ.';
    if ('cost' in body && !nonNegative(body.cost)) return 'Chi phí không hợp lệ.';
  }
  if (resource === 'shifts') {
    if ((!updating || 'work_date' in body) && !validDate(body.work_date)) return 'Ngày làm việc không hợp lệ.';
    if ((!updating || 'staff_id' in body) && !positiveId(body.staff_id)) return 'Vui lòng chọn nhân viên.';
    for (const field of ['start_time', 'end_time']) if ((!updating || field in body) && !/^\d{2}:\d{2}$/.test(body[field] || '')) return 'Giờ ca làm không hợp lệ.';
    if ('status' in body && !['scheduled', 'working', 'done', 'cancelled'].includes(body.status)) return 'Trạng thái ca không hợp lệ.';
  }
  if (resource === 'tasks') {
    if ((!updating || 'work_date' in body) && !validDate(body.work_date)) return 'Ngày công việc không hợp lệ.';
    if ((!updating || 'title' in body) && !clean(body.title, 240)) return 'Vui lòng nhập công việc.';
    if (body.staff_id != null && body.staff_id !== '' && !positiveId(body.staff_id)) return 'Nhân viên không hợp lệ.';
  }
  if ('active' in body && typeof body.active !== 'boolean') return 'Trạng thái không hợp lệ.';
  if ('done' in body && typeof body.done !== 'boolean') return 'Trạng thái không hợp lệ.';
  return null;
}

router.get('/overview', run(async (req, res) => {
  const date = validDate(req.query.date) ? req.query.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const day = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::float AS revenue, COALESCE(SUM(customer_count),0)::int AS customers,
      COALESCE(SUM(CASE WHEN category='shoot' THEN quantity ELSE 0 END),0)::int AS shoots,
      COALESCE(SUM(gift_quantity),0)::int AS gifts, COALESCE(SUM(cash_in_drawer),0)::float AS cash_sales, COUNT(*)::int AS transactions
    FROM pb_transactions WHERE sale_date = $1::date AND status='completed'`, [date]);
  const [recent, shifts, services, gifts, trend, mix, channels] = await Promise.all([
    pool.query(`SELECT t.*,t.sale_date::text AS sale_date, s.name AS staff_name, g.name AS gift_name FROM pb_transactions t LEFT JOIN pb_staff s ON s.id=t.staff_id LEFT JOIN pb_gifts g ON g.id=t.gift_id WHERE t.sale_date=$1::date AND t.status='completed' ORDER BY t.happened_at DESC, t.id DESC LIMIT 12`, [date]),
    pool.query(`SELECT sh.*,sh.work_date::text AS work_date, st.name AS staff_name FROM pb_shifts sh JOIN pb_staff st ON st.id=sh.staff_id WHERE sh.work_date=$1::date AND sh.status<>'cancelled' ORDER BY sh.start_time`, [date]),
    pool.query('SELECT * FROM pb_services WHERE active=true ORDER BY name'),
    pool.query('SELECT * FROM pb_gifts WHERE active=true ORDER BY name'),
    pool.query(`SELECT d::date::text AS day, COALESCE(SUM(t.total_amount),0)::float AS revenue FROM generate_series($1::date - interval '6 days',$1::date,interval '1 day') d LEFT JOIN pb_transactions t ON t.sale_date=d::date AND t.status='completed' GROUP BY d ORDER BY d`, [date]),
    pool.query(`SELECT category, COALESCE(SUM(total_amount),0)::float AS revenue FROM pb_transactions WHERE sale_date=$1::date AND status='completed' GROUP BY category ORDER BY revenue DESC`, [date]),
    pool.query(`SELECT customer_source, COUNT(*)::int AS count FROM pb_transactions WHERE sale_date=$1::date AND status='completed' AND customer_source IS NOT NULL GROUP BY customer_source`, [date])
  ]);
  res.json({ date, metrics: day.rows[0], recent: recent.rows, shifts: shifts.rows, services: services.rows, gifts: gifts.rows, trend: trend.rows, mix: mix.rows, channels: channels.rows });
}));

router.get('/reports', run(async (req, res) => {
  const { from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) return fail(res, 'Khoảng ngày không hợp lệ.');
  const [daily, services, payments, sources] = await Promise.all([
    pool.query(`SELECT sale_date::text AS day, COUNT(*)::int AS transactions, COALESCE(SUM(customer_count),0)::int AS customers, SUM(total_amount)::float AS revenue, SUM(cash_in_drawer)::float AS cash, SUM(transfer_received)::float AS transfer FROM pb_transactions WHERE sale_date BETWEEN $1::date AND $2::date AND status='completed' GROUP BY sale_date ORDER BY sale_date`, [from, to]),
    pool.query(`SELECT service_name, category, COALESCE(SUM(quantity),0)::int AS quantity, SUM(total_amount)::float AS revenue FROM pb_transactions WHERE sale_date BETWEEN $1::date AND $2::date AND status='completed' GROUP BY service_name,category ORDER BY revenue DESC`, [from, to]),
    pool.query(`SELECT payment_method, COUNT(*)::int AS transactions, SUM(total_amount)::float AS revenue FROM pb_transactions WHERE sale_date BETWEEN $1::date AND $2::date AND status='completed' GROUP BY payment_method`, [from, to]),
    pool.query(`SELECT source_mode,COUNT(*)::int AS transactions,SUM(total_amount)::float AS revenue,
      SUM(cash_in_drawer)::float AS counter_change,SUM(transfer_received)::float AS transfer
      FROM pb_transactions WHERE sale_date BETWEEN $1::date AND $2::date AND status='completed' GROUP BY source_mode`, [from, to])
  ]);
  res.json({ daily: daily.rows, services: services.rows, payments: payments.rows, sources: sources.rows });
}));

router.get('/transactions', run(async (req, res) => {
  const { date, from, to } = req.query;
  if (date && !validDate(date)) return fail(res, 'Ngày không hợp lệ.');
  if ((from || to) && (!validDate(from) || !validDate(to) || from > to)) return fail(res, 'Khoảng ngày không hợp lệ.');
  const where = date ? 'WHERE t.sale_date=$1::date' : from ? 'WHERE t.sale_date BETWEEN $1::date AND $2::date' : '';
  const values = date ? [date] : from ? [from, to] : [];
  const result = await pool.query(`SELECT t.*,t.sale_date::text AS sale_date, s.name AS staff_name, g.name AS gift_name FROM pb_transactions t LEFT JOIN pb_staff s ON s.id=t.staff_id LEFT JOIN pb_gifts g ON g.id=t.gift_id ${where} ORDER BY t.sale_date DESC,t.happened_at DESC,t.id DESC LIMIT 5000`, values);
  res.json(result.rows);
}));

router.post('/transactions', run(async (req, res) => {
  const body = req.body || {};
  if (!positiveId(body.service_id) || !Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0) return fail(res, 'Dịch vụ hoặc số lượng không hợp lệ.');
  const saleDate = body.sale_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!validDate(saleDate)) return fail(res, 'Ngày đơn hàng không hợp lệ.');
  if (body.customer_count != null && (!Number.isInteger(Number(body.customer_count)) || Number(body.customer_count) < 0)) return fail(res, 'Số khách không hợp lệ.');
  if (body.customer_source && !['walk_in', 'social', 'referral', 'other'].includes(body.customer_source)) return fail(res, 'Nguồn khách không hợp lệ.');
  const sourceMode = body.source_mode || 'counter';
  if (!['counter', 'machine_self', 'machine_exchange'].includes(sourceMode)) return fail(res, 'Nguồn thu không hợp lệ.');
  if (body.staff_id && !positiveId(body.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  if (body.marketing_consent != null && typeof body.marketing_consent !== 'boolean') return fail(res, 'Đồng ý marketing không hợp lệ.');
  if (body.customer_phone && !/^[0-9+().\s-]{8,30}$/.test(body.customer_phone)) return fail(res, 'Số điện thoại không hợp lệ.');
  const giftQuantity = Number(body.gift_quantity || 0);
  if (!Number.isInteger(giftQuantity) || giftQuantity < 0 || (giftQuantity > 0 && !positiveId(body.gift_id))) return fail(res, 'Số quà không hợp lệ.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const service = (await client.query('SELECT * FROM pb_services WHERE id=$1 AND active=true', [body.service_id])).rows[0];
    if (!service) { await client.query('ROLLBACK'); return fail(res, 'Dịch vụ không tồn tại hoặc đã ngừng bán.'); }
    const unitPrice = body.unit_price == null ? Number(service.price) : Number(body.unit_price);
    const discount = Number(body.discount_amount ?? 0);
    const subtotal = unitPrice * Number(body.quantity);
    if (!wholeMoney(unitPrice) || !wholeMoney(discount) || !Number.isSafeInteger(subtotal) || discount > subtotal) { await client.query('ROLLBACK'); return fail(res, 'Đơn giá hoặc giảm giá không hợp lệ.'); }
    const total = subtotal - discount;
    if (sourceMode !== 'counter' && total <= 0) { await client.query('ROLLBACK'); return fail(res, 'Đơn PTB phải có doanh thu lớn hơn 0.'); }
    // Legacy callers may still send a single payment_method. New orders use
    // explicit cash and transfer amounts so drawer reconciliation is exact.
    const cash = body.cash_received == null && body.transfer_received == null && body.payment_method === 'cash' ? total : Number(body.cash_received ?? 0);
    const transfer = body.cash_received == null && body.transfer_received == null && body.payment_method === 'transfer' ? total : Number(body.transfer_received ?? 0);
    const legacyCard = body.cash_received == null && body.transfer_received == null && body.payment_method === 'card';
    if (sourceMode === 'counter' && (!wholeMoney(cash) || !wholeMoney(transfer) || transfer > total || (!legacyCard && cash + transfer < total))) { await client.query('ROLLBACK'); return fail(res, 'Khách chưa thanh toán đủ hoặc số tiền nhập không hợp lệ.'); }
    if (sourceMode !== 'counter' && (body.cash_received != null && Number(body.cash_received) !== 0 || body.transfer_received != null && Number(body.transfer_received) !== 0)) { await client.query('ROLLBACK'); return fail(res, 'Đơn PTB được tính tiền theo nguồn thu đã chọn.'); }
    const change = sourceMode === 'counter' && !legacyCard ? cash + transfer - total : 0;
    const cashInDrawer = sourceMode === 'machine_exchange' ? -total : sourceMode === 'machine_self' ? 0 : cash - change;
    const recordedCash = sourceMode === 'counter' ? cash : 0;
    const recordedTransfer = sourceMode === 'machine_exchange' ? total : sourceMode === 'counter' ? transfer : 0;
    const paymentMethod = sourceMode === 'machine_self' ? 'cash' : sourceMode === 'machine_exchange' ? 'transfer' : legacyCard ? 'card' : cashInDrawer > 0 && transfer > 0 ? 'mixed' : transfer > 0 ? 'transfer' : 'cash';
    if (sourceMode !== 'counter' && !body.staff_id) { await client.query('ROLLBACK'); return fail(res, 'Vui lòng chọn nhân viên phụ trách đơn PTB.'); }
    if (body.staff_id && !(await client.query('SELECT 1 FROM pb_staff WHERE id=$1 AND active=true', [body.staff_id])).rowCount) { await client.query('ROLLBACK'); return fail(res, 'Nhân viên không hợp lệ.'); }
    if (giftQuantity > 0) {
      const updated = await client.query('UPDATE pb_gifts SET quantity=quantity-$1 WHERE id=$2 AND active=true AND quantity >= $1 RETURNING id', [giftQuantity, body.gift_id]);
      if (!updated.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Quà tặng không đủ tồn kho.'); }
    }
    const result = await client.query(`INSERT INTO pb_transactions(service_id,service_name,category,quantity,unit_price,total_amount,payment_method,staff_id,customer_source,customer_count,gift_id,gift_quantity,note,sale_date,customer_name,customer_phone,discount_amount,cash_received,transfer_received,cash_in_drawer,change_amount,shift_label,marketing_consent,source_mode)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
      [service.id, service.name, service.category, Number(body.quantity), unitPrice, total, paymentMethod, body.staff_id || null, body.customer_source || null, Number(body.customer_count ?? 1), giftQuantity ? body.gift_id : null, giftQuantity, clean(body.note, 1000) || null, saleDate, clean(body.customer_name) || 'Khách lẻ', clean(body.customer_phone, 30) || null, discount, recordedCash, recordedTransfer, cashInDrawer, change, clean(body.shift_label, 40) || null, Boolean(body.marketing_consent), sourceMode]);
    if (giftQuantity) await client.query('INSERT INTO pb_gift_movements(gift_id,delta,reason,transaction_id) VALUES($1,$2,$3,$4)', [body.gift_id, -giftQuantity, 'Tặng khách', result.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

router.post('/transactions/:id/void', run(async (req, res) => {
  if (!positiveId(req.params.id) || !clean(req.body?.reason, 500)) return fail(res, 'Vui lòng nhập lý do hủy đơn.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query("UPDATE pb_transactions SET status='voided',void_reason=$2,voided_at=NOW() WHERE id=$1 AND status='completed' RETURNING *", [req.params.id, clean(req.body.reason, 500)]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Không tìm thấy đơn đang hoạt động.' }); }
    const sale = result.rows[0];
    if (sale.gift_id && sale.gift_quantity > 0) {
      await client.query('UPDATE pb_gifts SET quantity=quantity+$1 WHERE id=$2', [sale.gift_quantity, sale.gift_id]);
      await client.query('INSERT INTO pb_gift_movements(gift_id,delta,reason,transaction_id) VALUES($1,$2,$3,$4)', [sale.gift_id, sale.gift_quantity, 'Hoàn quà do hủy đơn', sale.id]);
    }
    await client.query('COMMIT');
    res.json(sale);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

router.get('/:resource', run(async (req, res) => {
  const config = resources[req.params.resource];
  if (!config) return res.status(404).json({ error: 'Không tìm thấy danh mục.' });
  const staffJoin = ['shifts', 'tasks'].includes(req.params.resource);
  const assetJoin = req.params.resource === 'incidents';
  const join = staffJoin ? ' LEFT JOIN pb_staff staff ON staff.id=base.staff_id' : assetJoin ? ' LEFT JOIN pb_assets asset ON asset.id=base.asset_id' : '';
  const dateColumn = ['shifts', 'tasks'].includes(req.params.resource) ? ',base.work_date::text AS work_date' : '';
  const select = staffJoin ? `base.*${dateColumn}, staff.name AS staff_name` : assetJoin ? 'base.*, asset.name AS asset_name' : 'base.*';
  const result = await pool.query(`SELECT ${select} FROM ${config.table} base${join} ORDER BY ${config.order.split(',').map(part => `base.${part.trim()}`).join(', ')} LIMIT 500`);
  res.json(result.rows);
}));

router.post('/:resource', run(async (req, res) => {
  const config = resources[req.params.resource];
  if (!config) return res.status(404).json({ error: 'Không tìm thấy danh mục.' });
  const body = req.body || {};
  const error = validate(req.params.resource, body);
  if (error) return fail(res, error);
  const columns = config.columns.filter(column => body[column] !== undefined && !(column === 'staff_id' && body[column] === ''));
  if (req.params.resource === 'shifts' && body.start_time >= body.end_time) return fail(res, 'Giờ kết thúc phải sau giờ bắt đầu.');
  const values = columns.map(column => body[column] === '' ? null : body[column]);
  const result = await pool.query(`INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, values);
  res.status(201).json(result.rows[0]);
}));

router.patch('/:resource/:id', run(async (req, res) => {
  const config = resources[req.params.resource];
  if (!config) return res.status(404).json({ error: 'Không tìm thấy danh mục.' });
  if (!positiveId(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const body = req.body || {};
  const error = validate(req.params.resource, body, true);
  if (error) return fail(res, error);
  const columns = config.columns.filter(column => body[column] !== undefined);
  if (!columns.length) return fail(res, 'Không có dữ liệu cần cập nhật.');
  const values = columns.map(column => body[column] === '' ? null : body[column]);
  const result = await pool.query(`UPDATE ${config.table} SET ${columns.map((column, i) => `${column}=$${i + 1}`).join(',')} WHERE id=$${columns.length + 1} RETURNING *`, [...values, req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Bản ghi không tồn tại.' });
  res.json(result.rows[0]);
}));

router.post('/gifts/:id/adjust', run(async (req, res) => {
  if (!positiveId(req.params.id) || !Number.isInteger(Number(req.body?.delta)) || Number(req.body.delta) === 0) return fail(res, 'Số lượng điều chỉnh không hợp lệ.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE pb_gifts SET quantity=quantity+$1 WHERE id=$2 AND quantity+$1>=0 RETURNING *', [Number(req.body.delta), req.params.id]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Không tìm thấy quà hoặc số tồn không đủ.'); }
    await client.query('INSERT INTO pb_gift_movements(gift_id,delta,reason) VALUES($1,$2,$3)', [req.params.id, Number(req.body.delta), clean(req.body.reason, 80) || 'Điều chỉnh tồn']);
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

module.exports = router;
