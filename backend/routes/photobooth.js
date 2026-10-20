const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const nonNegative = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
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
  shifts: { table: 'pb_shifts', columns: ['work_date', 'start_time', 'end_time', 'staff_id', 'status', 'note'], order: 'work_date DESC, start_time' },
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
    if ('status' in body && !['scheduled', 'working', 'done'].includes(body.status)) return 'Trạng thái ca không hợp lệ.';
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
      COALESCE(SUM(gift_quantity),0)::int AS gifts, COUNT(*)::int AS transactions
    FROM pb_transactions WHERE (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date`, [date]);
  const [recent, shifts, tasks, services, gifts, assets, incidents, trend, mix, channels] = await Promise.all([
    pool.query(`SELECT t.*, s.name AS staff_name, g.name AS gift_name FROM pb_transactions t LEFT JOIN pb_staff s ON s.id=t.staff_id LEFT JOIN pb_gifts g ON g.id=t.gift_id WHERE (t.happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$1::date ORDER BY t.happened_at DESC, t.id DESC LIMIT 12`, [date]),
    pool.query(`SELECT sh.*, st.name AS staff_name FROM pb_shifts sh JOIN pb_staff st ON st.id=sh.staff_id WHERE sh.work_date=$1::date ORDER BY sh.start_time`, [date]),
    pool.query(`SELECT t.*, s.name AS staff_name FROM pb_tasks t LEFT JOIN pb_staff s ON s.id=t.staff_id WHERE t.work_date=$1::date ORDER BY t.done, t.id`, [date]),
    pool.query('SELECT * FROM pb_services WHERE active=true ORDER BY name'),
    pool.query('SELECT * FROM pb_gifts WHERE active=true ORDER BY name'),
    pool.query('SELECT * FROM pb_assets ORDER BY name'),
    pool.query(`SELECT i.*, a.name AS asset_name FROM pb_incidents i JOIN pb_assets a ON a.id=i.asset_id WHERE i.status<>'resolved' ORDER BY i.reported_at DESC LIMIT 5`),
    pool.query(`SELECT d::date AS day, COALESCE(SUM(t.total_amount),0)::float AS revenue FROM generate_series($1::date - interval '6 days',$1::date,interval '1 day') d LEFT JOIN pb_transactions t ON (t.happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=d::date GROUP BY d ORDER BY d`, [date]),
    pool.query(`SELECT category, COALESCE(SUM(total_amount),0)::float AS revenue FROM pb_transactions WHERE (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$1::date GROUP BY category ORDER BY revenue DESC`, [date]),
    pool.query(`SELECT customer_source, COUNT(*)::int AS count FROM pb_transactions WHERE (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$1::date AND customer_source IS NOT NULL GROUP BY customer_source`, [date])
  ]);
  res.json({ date, metrics: day.rows[0], recent: recent.rows, shifts: shifts.rows, tasks: tasks.rows, services: services.rows, gifts: gifts.rows, assets: assets.rows, incidents: incidents.rows, trend: trend.rows, mix: mix.rows, channels: channels.rows });
}));

router.get('/reports', run(async (req, res) => {
  const { from, to } = req.query;
  if (!validDate(from) || !validDate(to) || from > to) return fail(res, 'Khoảng ngày không hợp lệ.');
  const [daily, services, payments] = await Promise.all([
    pool.query(`SELECT (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, COUNT(*)::int AS transactions, COALESCE(SUM(customer_count),0)::int AS customers, SUM(total_amount)::float AS revenue FROM pb_transactions WHERE (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`, [from, to]),
    pool.query(`SELECT service_name, category, COALESCE(SUM(quantity),0)::int AS quantity, SUM(total_amount)::float AS revenue FROM pb_transactions WHERE (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date GROUP BY service_name,category ORDER BY revenue DESC`, [from, to]),
    pool.query(`SELECT payment_method, COUNT(*)::int AS transactions, SUM(total_amount)::float AS revenue FROM pb_transactions WHERE (happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date GROUP BY payment_method`, [from, to])
  ]);
  res.json({ daily: daily.rows, services: services.rows, payments: payments.rows });
}));

router.get('/transactions', run(async (req, res) => {
  const date = req.query.date;
  if (date && !validDate(date)) return fail(res, 'Ngày không hợp lệ.');
  const result = await pool.query(`SELECT t.*, s.name AS staff_name, g.name AS gift_name FROM pb_transactions t LEFT JOIN pb_staff s ON s.id=t.staff_id LEFT JOIN pb_gifts g ON g.id=t.gift_id ${date ? "WHERE (t.happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$1::date" : ''} ORDER BY t.happened_at DESC,t.id DESC LIMIT 200`, date ? [date] : []);
  res.json(result.rows);
}));

router.post('/transactions', run(async (req, res) => {
  const body = req.body || {};
  if (!positiveId(body.service_id) || !Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0 || !['cash', 'transfer', 'card'].includes(body.payment_method)) return fail(res, 'Dịch vụ, số lượng hoặc thanh toán không hợp lệ.');
  if (body.customer_count != null && (!Number.isInteger(Number(body.customer_count)) || Number(body.customer_count) < 0)) return fail(res, 'Số khách không hợp lệ.');
  if (body.customer_source && !['walk_in', 'social', 'referral', 'other'].includes(body.customer_source)) return fail(res, 'Nguồn khách không hợp lệ.');
  if (body.staff_id && !positiveId(body.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const giftQuantity = Number(body.gift_quantity || 0);
  if (!Number.isInteger(giftQuantity) || giftQuantity < 0 || (giftQuantity > 0 && !positiveId(body.gift_id))) return fail(res, 'Số quà không hợp lệ.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const service = (await client.query('SELECT * FROM pb_services WHERE id=$1 AND active=true', [body.service_id])).rows[0];
    if (!service) { await client.query('ROLLBACK'); return fail(res, 'Dịch vụ không tồn tại hoặc đã ngừng bán.'); }
    if (body.staff_id && !(await client.query('SELECT 1 FROM pb_staff WHERE id=$1 AND active=true', [body.staff_id])).rowCount) { await client.query('ROLLBACK'); return fail(res, 'Nhân viên không hợp lệ.'); }
    if (giftQuantity > 0) {
      const updated = await client.query('UPDATE pb_gifts SET quantity=quantity-$1 WHERE id=$2 AND active=true AND quantity >= $1 RETURNING id', [giftQuantity, body.gift_id]);
      if (!updated.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Quà tặng không đủ tồn kho.'); }
    }
    const result = await client.query(`INSERT INTO pb_transactions(service_id,service_name,category,quantity,unit_price,total_amount,payment_method,staff_id,customer_source,customer_count,gift_id,gift_quantity,note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [service.id, service.name, service.category, Number(body.quantity), service.price, Number(service.price) * Number(body.quantity), body.payment_method, body.staff_id || null, body.customer_source || null, Number(body.customer_count ?? 1), giftQuantity ? body.gift_id : null, giftQuantity, clean(body.note, 1000) || null]);
    if (giftQuantity) await client.query('INSERT INTO pb_gift_movements(gift_id,delta,reason,transaction_id) VALUES($1,$2,$3,$4)', [body.gift_id, -giftQuantity, 'Tặng khách', result.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

router.get('/:resource', run(async (req, res) => {
  const config = resources[req.params.resource];
  if (!config) return res.status(404).json({ error: 'Không tìm thấy danh mục.' });
  const staffJoin = ['shifts', 'tasks'].includes(req.params.resource);
  const assetJoin = req.params.resource === 'incidents';
  const join = staffJoin ? ' LEFT JOIN pb_staff staff ON staff.id=base.staff_id' : assetJoin ? ' LEFT JOIN pb_assets asset ON asset.id=base.asset_id' : '';
  const select = staffJoin ? 'base.*, staff.name AS staff_name' : assetJoin ? 'base.*, asset.name AS asset_name' : 'base.*';
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
