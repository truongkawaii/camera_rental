const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);
const dateOK = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const monthOK = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const moneyOK = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const idOK = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const short = (value, limit = 160) => String(value || '').trim().slice(0, limit);
const vietnamDate = value => value instanceof Date || (typeof value === 'string' && value.includes('T'))
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  : String(value).slice(0, 10);
const fail = (res, error) => res.status(400).json({ error });
const run = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

async function cashSummary(db, date) {
  const [sales, movements] = await Promise.all([
    db.query("SELECT COALESCE(SUM(cash_in_drawer),0)::float AS amount FROM pb_transactions WHERE sale_date=$1::date AND status='completed'", [date]),
    db.query("SELECT type, COALESCE(SUM(amount),0)::float AS amount FROM pb_cash_movements WHERE movement_date=$1::date AND voided_at IS NULL GROUP BY type", [date])
  ]);
  const amounts = Object.fromEntries(movements.rows.map(row => [row.type, Number(row.amount)]));
  const opening = amounts.opening || 0;
  const salesCash = Number(sales.rows[0]?.amount || 0);
  const otherMoves = (amounts.in || 0) - (amounts.out || 0);
  return { opening, salesCash, otherMoves, expected: opening + salesCash + otherMoves };
}

router.get('/cash', run(async (req, res) => {
  if (!dateOK(req.query.date)) return fail(res, 'Ngày không hợp lệ.');
  const [summary, moves, closes] = await Promise.all([
    cashSummary(pool, req.query.date),
    pool.query('SELECT m.*,m.movement_date::text AS movement_date,s.name AS staff_name FROM pb_cash_movements m LEFT JOIN pb_staff s ON s.id=m.staff_id WHERE m.movement_date=$1::date AND m.voided_at IS NULL ORDER BY m.created_at DESC,m.id DESC', [req.query.date]),
    pool.query('SELECT c.*,c.close_date::text AS close_date,s.name AS staff_name FROM pb_cash_closures c LEFT JOIN pb_staff s ON s.id=c.staff_id WHERE c.close_date=$1::date ORDER BY c.created_at DESC,c.id DESC', [req.query.date])
  ]);
  res.json({ summary, movements: moves.rows, closures: closes.rows });
}));

router.post('/cash/movements', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.movement_date) || !['opening', 'in', 'out', 'exchange'].includes(b.type) || !moneyOK(b.amount) || (b.type !== 'exchange' && Number(b.amount) === 0)) return fail(res, 'Ngày, loại hoặc số tiền không hợp lệ.');
  if (b.staff_id && !idOK(b.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const result = await pool.query('INSERT INTO pb_cash_movements(movement_date,type,amount,staff_id,note) VALUES($1,$2,$3,$4,$5) RETURNING *', [b.movement_date, b.type, Number(b.amount), b.staff_id || null, short(b.note, 1000) || null]);
  res.status(201).json(result.rows[0]);
}));

router.delete('/cash/movements/:id', run(async (req, res) => {
  if (!idOK(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const result = await pool.query('UPDATE pb_cash_movements SET voided_at=NOW() WHERE id=$1 AND voided_at IS NULL RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Giao dịch quỹ không tồn tại.' });
  res.json({ id: result.rows[0].id });
}));

router.post('/cash/closures', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.close_date) || !moneyOK(b.actual_amount)) return fail(res, 'Ngày hoặc số tiền kiểm đếm không hợp lệ.');
  if (b.staff_id && !idOK(b.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summary = await cashSummary(client, b.close_date);
    const actual = Number(b.actual_amount);
    const result = await client.query('INSERT INTO pb_cash_closures(close_date,expected_amount,actual_amount,difference_amount,staff_id,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [b.close_date, summary.expected, actual, actual - summary.expected, b.staff_id || null, short(b.note, 1000) || null]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

router.get('/customers', run(async (_req, res) => {
  const result = await pool.query(`SELECT customer_phone AS phone, (array_agg(customer_name ORDER BY happened_at DESC))[1] AS name,
    COUNT(*)::int AS orders, BOOL_OR(marketing_consent) AS marketing_consent,
    MAX(sale_date)::text AS last_order_date
    FROM pb_transactions WHERE status='completed' AND NULLIF(customer_phone,'') IS NOT NULL
    GROUP BY customer_phone ORDER BY last_order_date DESC LIMIT 2000`);
  res.json(result.rows);
}));

router.get('/expenses', run(async (req, res) => {
  if (!monthOK(req.query.month)) return fail(res, 'Tháng không hợp lệ.');
  const result = await pool.query("SELECT *,expense_date::text AS expense_date FROM pb_expenses WHERE to_char(expense_date,'YYYY-MM')=$1 AND voided_at IS NULL ORDER BY expense_date DESC,id DESC", [req.query.month]);
  res.json(result.rows);
}));

router.post('/expenses', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.expense_date) || !['other', 'ads', 'rent'].includes(b.category) || !moneyOK(b.amount) || Number(b.amount) <= 0 || !short(b.note, 1000) || !['cash', 'transfer'].includes(b.payment_method)) return fail(res, 'Thông tin khoản chi không hợp lệ.');
  const result = await pool.query('INSERT INTO pb_expenses(expense_date,category,amount,note,payment_method,recorded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [b.expense_date, b.category, Number(b.amount), short(b.note, 1000), b.payment_method, short(b.recorded_by) || null]);
  res.status(201).json(result.rows[0]);
}));

router.delete('/expenses/:id', run(async (req, res) => {
  if (!idOK(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const result = await pool.query('UPDATE pb_expenses SET voided_at=NOW() WHERE id=$1 AND voided_at IS NULL RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Khoản chi không tồn tại.' });
  res.json({ id: result.rows[0].id });
}));

router.get('/finance', run(async (req, res) => {
  if (!monthOK(req.query.month)) return fail(res, 'Tháng không hợp lệ.');
  const [sales, expenses] = await Promise.all([
    pool.query(`SELECT sale_date::text AS day, COUNT(*)::int AS orders, SUM(total_amount)::float AS revenue,
      SUM(cash_in_drawer)::float AS cash, SUM(transfer_received)::float AS transfer
      FROM pb_transactions WHERE status='completed' AND to_char(sale_date,'YYYY-MM')=$1
      GROUP BY sale_date ORDER BY sale_date DESC`, [req.query.month]),
    pool.query(`SELECT expense_date::text AS day,category,SUM(amount)::float AS amount FROM pb_expenses
      WHERE voided_at IS NULL AND to_char(expense_date,'YYYY-MM')=$1
      GROUP BY expense_date,category ORDER BY expense_date DESC`, [req.query.month])
  ]);
  const byDay = new Map();
  const dayKey = vietnamDate;
  for (const row of sales.rows) byDay.set(dayKey(row.day), { day: row.day, revenue: Number(row.revenue), cash: Number(row.cash), transfer: Number(row.transfer), orders: row.orders, other: 0, ads: 0, rent: 0 });
  for (const row of expenses.rows) {
    const key = dayKey(row.day);
    if (!byDay.has(key)) byDay.set(key, { day: row.day, revenue: 0, cash: 0, transfer: 0, orders: 0, other: 0, ads: 0, rent: 0 });
    byDay.get(key)[row.category] += Number(row.amount);
  }
  const daily = [...byDay.values()].map(row => ({ ...row, expense: row.other + row.ads + row.rent, profit: row.revenue - row.other - row.ads - row.rent })).sort((a, b) => dayKey(b.day).localeCompare(dayKey(a.day)));
  const totals = daily.reduce((sum, row) => { for (const key of ['revenue', 'cash', 'transfer', 'orders', 'other', 'ads', 'rent', 'expense', 'profit']) sum[key] += Number(row[key]); return sum; }, { revenue: 0, cash: 0, transfer: 0, orders: 0, other: 0, ads: 0, rent: 0, expense: 0, profit: 0 });
  totals.margin = totals.revenue > 0 ? totals.profit / totals.revenue * 100 : 0;
  res.json({ month: req.query.month, totals, daily });
}));

// Only these isolated Photobooth tables are included in a backup or restore.
// Parent tables precede dependent tables for foreign-key-safe imports.
const backupTables = [
  'pb_services', 'pb_gifts', 'pb_assets', 'pb_staff',
  'pb_shifts', 'pb_tasks', 'pb_incidents', 'pb_transactions',
  'pb_gift_movements', 'pb_cash_movements', 'pb_cash_closures', 'pb_expenses'
];
const backupDateColumns = {
  pb_transactions: ['sale_date'], pb_shifts: ['work_date'], pb_tasks: ['work_date'],
  pb_cash_movements: ['movement_date'], pb_cash_closures: ['close_date'], pb_expenses: ['expense_date']
};

router.get('/backup', run(async (_req, res) => {
  const data = {};
  for (const table of backupTables) data[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows.map(row => {
    const copy = { ...row };
    for (const column of backupDateColumns[table] || []) if (copy[column] != null) copy[column] = vietnamDate(copy[column]);
    return copy;
  });
  res.json({ type: 'snappro-photobooth-backup', version: 1, exported_at: new Date().toISOString(), data });
}));

router.post('/restore', run(async (req, res) => {
  const snapshot = req.body;
  if (snapshot?.type !== 'snappro-photobooth-backup' || snapshot.version !== 1 || !snapshot.data || typeof snapshot.data !== 'object') return fail(res, 'File sao lưu Photobooth không hợp lệ.');
  if (backupTables.some(table => !Array.isArray(snapshot.data[table]) || snapshot.data[table].length > 100000)) return fail(res, 'File sao lưu thiếu bảng hoặc có quá nhiều bản ghi.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const columns = {};
    for (const table of backupTables) {
      const result = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER'", [table]);
      columns[table] = new Set(result.rows.map(row => row.column_name));
      if (!columns[table].has('id')) throw new Error(`Bảng ${table} chưa sẵn sàng.`);
    }
    // No CASCADE: a new relation to a non-Photobooth table would make restore
    // fail safely instead of clearing anything outside this workspace.
    await client.query(`TRUNCATE ${backupTables.join(',')} RESTART IDENTITY`);
    for (const table of backupTables) {
      const seen = new Set();
      for (const row of snapshot.data[table]) {
        if (!row || typeof row !== 'object' || !idOK(row.id) || seen.has(row.id) || Object.keys(row).some(key => !columns[table].has(key))) throw new Error(`Bản ghi trong ${table} không hợp lệ.`);
        seen.add(row.id);
        const keys = Object.keys(row);
        await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map(key => (backupDateColumns[table] || []).includes(key) && row[key] != null ? vietnamDate(row[key]) : row[key]));
      }
      const max = snapshot.data[table].reduce((value, row) => Math.max(value, Number(row.id)), 0);
      const sequence = (await client.query("SELECT pg_get_serial_sequence($1,'id') AS sequence", [table])).rows[0].sequence;
      if (sequence) await client.query('SELECT setval($1::regclass,$2,$3)', [sequence, Math.max(1, max), max > 0]);
    }
    await client.query('COMMIT');
    res.json({ restored: Object.fromEntries(backupTables.map(table => [table, snapshot.data[table].length])) });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

module.exports = router;
