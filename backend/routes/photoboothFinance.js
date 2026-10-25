const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePhotoboothAccess, requirePhotoboothReports } = require('../middleware/photoboothAccess');

const router = express.Router();
router.use(authenticate, requirePhotoboothAccess);
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
const shiftOK = value => ['Ca sáng', 'Ca chiều', 'Ca tối', 'Ca khác', 'Khác'].includes(value);

async function cashSummary(db, date, shift = '') {
  const values = shift ? [date, shift] : [date];
  const saleShift = shift ? ' AND shift_label=$2' : '';
  const movementShift = shift ? ' AND shift_label=$2' : '';
  const sales = await db.query(`SELECT COALESCE(SUM(cash_in_drawer),0)::float AS amount FROM pb_transactions WHERE sale_date=$1::date AND status='completed'${saleShift}`, values);
  const movements = await db.query(`SELECT type, COALESCE(SUM(amount),0)::float AS amount FROM pb_cash_movements WHERE movement_date=$1::date AND voided_at IS NULL${movementShift} GROUP BY type`, values);
  const machine = await db.query(`SELECT COALESCE(SUM(amount),0)::float AS amount FROM pb_machine_movements WHERE movement_date=$1::date AND type='collect' AND destination='counter' AND voided_at IS NULL${movementShift}`, values);
  const amounts = Object.fromEntries(movements.rows.map(row => [row.type, Number(row.amount)]));
  // Handover openings from later shifts are the same cash, not new inflows.
  const firstOpening = !shift ? await db.query(`SELECT amount FROM pb_cash_movements
    WHERE movement_date=$1::date AND type='opening' AND voided_at IS NULL
    ORDER BY CASE shift_label WHEN 'Ca sáng' THEN 1 WHEN 'Ca chiều' THEN 2 WHEN 'Ca tối' THEN 3 ELSE 0 END,created_at,id LIMIT 1`, [date]) : null;
  const opening = shift ? amounts.opening || 0 : Number(firstOpening.rows[0]?.amount || 0);
  const salesCash = Number(sales.rows[0]?.amount || 0);
  const otherMoves = (amounts.in || 0) - (amounts.out || 0);
  const machineCollected = Number(machine.rows[0]?.amount || 0);
  const expected = opening + salesCash + otherMoves + machineCollected;
  if (shift) return { opening, salesCash, otherMoves, machineCollected, expected, balance: expected, balanceShift: shift };
  return { opening, salesCash, otherMoves, machineCollected, expected, balance: expected, balanceShift: null };
}

async function machineSummary(db, date) {
  const [sales, movements] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(total_amount),0)::float AS incoming FROM pb_transactions
      WHERE sale_date=$1::date AND status='completed' AND source_mode IN ('machine_self','machine_exchange')`, [date]),
    db.query(`SELECT type,destination,COALESCE(SUM(amount),0)::float AS amount FROM pb_machine_movements
      WHERE movement_date=$1::date AND voided_at IS NULL GROUP BY type,destination`, [date])
  ]);
  const opening = Number(movements.rows.find(row => row.type === 'opening')?.amount || 0);
  const incoming = Number(sales.rows[0]?.incoming || 0);
  const collectedToCounter = Number(movements.rows.find(row => row.type === 'collect' && row.destination === 'counter')?.amount || 0);
  const collectedToBank = Number(movements.rows.find(row => row.type === 'collect' && row.destination === 'bank')?.amount || 0);
  const collected = collectedToCounter + collectedToBank;
  return { opening, incoming, collected, collectedToCounter, collectedToBank, expected: opening + incoming - collected };
}

router.get('/cash', run(async (req, res) => {
  if (!dateOK(req.query.date)) return fail(res, 'Ngày không hợp lệ.');
  const shift = req.query.shift || '';
  if (shift && !shiftOK(shift)) return fail(res, 'Ca không hợp lệ.');
  const [summary, dailySummary, moves, closes, unassigned] = await Promise.all([
    cashSummary(pool, req.query.date, shift),
    shift ? cashSummary(pool, req.query.date) : null,
    pool.query(`SELECT m.*,m.movement_date::text AS movement_date,s.name AS staff_name FROM pb_cash_movements m LEFT JOIN pb_staff s ON s.id=m.staff_id WHERE m.movement_date=$1::date AND m.voided_at IS NULL${shift ? ' AND m.shift_label=$2' : ''} ORDER BY m.created_at DESC,m.id DESC`, shift ? [req.query.date, shift] : [req.query.date]),
    pool.query(`SELECT c.*,c.close_date::text AS close_date,s.name AS staff_name FROM pb_cash_closures c LEFT JOIN pb_staff s ON s.id=c.staff_id WHERE c.close_date=$1::date${shift ? ' AND c.shift_label=$2' : ''} ORDER BY c.created_at DESC,c.id DESC`, shift ? [req.query.date, shift] : [req.query.date]),
    pool.query(`SELECT
      (SELECT COUNT(*)::int FROM pb_transactions WHERE sale_date=$1::date AND status='completed' AND shift_label IS NULL) AS orders,
      (SELECT COUNT(*)::int FROM pb_cash_movements WHERE movement_date=$1::date AND voided_at IS NULL AND shift_label IS NULL) AS movements,
      (SELECT COUNT(*)::int FROM pb_machine_movements WHERE movement_date=$1::date AND type='collect' AND destination='counter' AND voided_at IS NULL AND shift_label IS NULL) AS machine`, [req.query.date])
  ]);
  res.json({ summary, dailySummary: dailySummary || summary, unassigned: unassigned.rows[0], movements: moves.rows, closures: closes.rows });
}));

router.post('/cash/movements', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.movement_date) || !['opening', 'in', 'out', 'exchange'].includes(b.type) || !moneyOK(b.amount) || (b.type !== 'exchange' && Number(b.amount) === 0)) return fail(res, 'Ngày, loại hoặc số tiền không hợp lệ.');
  if (b.staff_id && !idOK(b.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const shift = b.shift_label || null;
  if (shift && !shiftOK(shift)) return fail(res, 'Ca không hợp lệ.');
  if (shift) {
    const closed = await pool.query('SELECT 1 FROM pb_cash_closures WHERE close_date=$1 AND shift_label=$2', [b.movement_date, shift]);
    if (closed.rowCount) return fail(res, 'Ca này đã chốt quỹ.');
  }
  try {
    const result = await pool.query('INSERT INTO pb_cash_movements(movement_date,type,amount,staff_id,note,shift_label) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [b.movement_date, b.type, Number(b.amount), b.staff_id || null, short(b.note, 1000) || null, shift]);
    res.status(201).json(result.rows[0]);
  } catch (error) { if (error.code === '23505') return fail(res, 'Ca này đã có tiền đầu ca.'); throw error; }
}));

router.delete('/cash/movements/:id', run(async (req, res) => {
  if (!idOK(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const current = await pool.query('SELECT movement_date,shift_label FROM pb_cash_movements WHERE id=$1 AND voided_at IS NULL', [req.params.id]);
  if (current.rows[0]?.shift_label) {
    const closed = await pool.query('SELECT 1 FROM pb_cash_closures WHERE close_date=$1 AND shift_label=$2', [current.rows[0].movement_date, current.rows[0].shift_label]);
    if (closed.rowCount) return fail(res, 'Ca đã chốt quỹ, không thể hủy bút toán.');
  }
  const result = await pool.query('UPDATE pb_cash_movements SET voided_at=NOW() WHERE id=$1 AND voided_at IS NULL RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Giao dịch quỹ không tồn tại.' });
  res.json({ id: result.rows[0].id });
}));

router.post('/cash/closures', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.close_date) || !moneyOK(b.actual_amount)) return fail(res, 'Ngày hoặc số tiền kiểm đếm không hợp lệ.');
  if (b.staff_id && !idOK(b.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const shift = b.shift_label || null;
  if (shift && !shiftOK(shift)) return fail(res, 'Ca không hợp lệ.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (shift) {
      const opening = await client.query("SELECT 1 FROM pb_cash_movements WHERE movement_date=$1 AND shift_label=$2 AND type='opening' AND voided_at IS NULL", [b.close_date, shift]);
      if (!opening.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Vui lòng nhập tiền đầu ca trước khi chốt quỹ.'); }
      const existing = await client.query('SELECT 1 FROM pb_cash_closures WHERE close_date=$1 AND shift_label=$2', [b.close_date, shift]);
      if (existing.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Ca này đã được chốt.'); }
    }
    const summary = await cashSummary(client, b.close_date, shift);
    const actual = Number(b.actual_amount);
    const result = await client.query('INSERT INTO pb_cash_closures(close_date,expected_amount,actual_amount,difference_amount,staff_id,note,shift_label) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [b.close_date, summary.expected, actual, actual - summary.expected, b.staff_id || null, short(b.note, 1000) || null, shift]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') return fail(res, 'Ca này đã được chốt.'); throw error; } finally { client.release(); }
}));

router.get('/ptb', run(async (req, res) => {
  if (!dateOK(req.query.date)) return fail(res, 'Ngày không hợp lệ.');
  const date = req.query.date;
  const [sales, machine, counter, movements, counts] = await Promise.all([
    pool.query(`SELECT source_mode,COUNT(*)::int AS orders,COALESCE(SUM(total_amount),0)::float AS revenue,
      COALESCE(SUM(cash_in_drawer),0)::float AS counter_change,COALESCE(SUM(transfer_received),0)::float AS transfer
      FROM pb_transactions WHERE sale_date=$1::date AND status='completed' GROUP BY source_mode`, [date]),
    machineSummary(pool, date), cashSummary(pool, date),
    pool.query(`SELECT m.*,m.movement_date::text AS movement_date,s.name AS staff_name FROM pb_machine_movements m
      LEFT JOIN pb_staff s ON s.id=m.staff_id WHERE m.movement_date=$1::date AND m.voided_at IS NULL ORDER BY m.created_at DESC,m.id DESC`, [date]),
    pool.query(`SELECT c.*,c.count_date::text AS count_date,s.name AS staff_name FROM pb_machine_counts c
      LEFT JOIN pb_staff s ON s.id=c.staff_id WHERE c.count_date=$1::date ORDER BY c.created_at DESC,c.id DESC`, [date])
  ]);
  const sources = Object.fromEntries(sales.rows.map(row => [row.source_mode, row]));
  const totals = sales.rows.reduce((sum, row) => ({ revenue: sum.revenue + Number(row.revenue), orders: sum.orders + row.orders, transfer: sum.transfer + Number(row.transfer) }), { revenue: 0, orders: 0, transfer: 0 });
  res.json({ date, sources, totals, machine, counter, movements: movements.rows, counts: counts.rows });
}));

router.get('/ptb/range', run(async (req, res) => {
  const { from, to } = req.query;
  if (!dateOK(from) || !dateOK(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) return fail(res, 'Khoảng ngày không hợp lệ hoặc quá 366 ngày.');
  const [sales, movements, counts, cashMoves] = await Promise.all([
    pool.query(`SELECT source_mode,COUNT(*)::int AS orders,COALESCE(SUM(total_amount),0)::float AS revenue,
      COALESCE(SUM(cash_in_drawer),0)::float AS counter_change,COALESCE(SUM(transfer_received),0)::float AS transfer
      FROM pb_transactions WHERE sale_date BETWEEN $1::date AND $2::date AND status='completed' GROUP BY source_mode`, [from, to]),
    pool.query(`SELECT m.*,m.movement_date::text AS movement_date,s.name AS staff_name FROM pb_machine_movements m
      LEFT JOIN pb_staff s ON s.id=m.staff_id WHERE m.movement_date BETWEEN $1::date AND $2::date AND m.voided_at IS NULL ORDER BY m.movement_date DESC,m.created_at DESC,m.id DESC`, [from, to]),
    pool.query(`SELECT c.*,c.count_date::text AS count_date,s.name AS staff_name FROM pb_machine_counts c
      LEFT JOIN pb_staff s ON s.id=c.staff_id WHERE c.count_date BETWEEN $1::date AND $2::date ORDER BY c.count_date DESC,c.created_at DESC,c.id DESC`, [from, to]),
    pool.query(`SELECT type,COALESCE(SUM(amount),0)::float AS amount FROM pb_cash_movements
      WHERE movement_date BETWEEN $1::date AND $2::date AND voided_at IS NULL GROUP BY type`, [from, to])
  ]);
  const sources = Object.fromEntries(sales.rows.map(row => [row.source_mode, row]));
  const totals = sales.rows.reduce((sum, row) => ({ revenue: sum.revenue + Number(row.revenue), orders: sum.orders + row.orders, transfer: sum.transfer + Number(row.transfer) }), { revenue: 0, orders: 0, transfer: 0 });
  const collectedToCounter = movements.rows.filter(row => row.type === 'collect' && row.destination === 'counter').reduce((sum, row) => sum + Number(row.amount), 0);
  const collectedToBank = movements.rows.filter(row => row.type === 'collect' && row.destination === 'bank').reduce((sum, row) => sum + Number(row.amount), 0);
  const incoming = Number(sources.machine_self?.revenue || 0) + Number(sources.machine_exchange?.revenue || 0);
  const cashAmounts = Object.fromEntries(cashMoves.rows.map(row => [row.type, Number(row.amount)]));
  res.json({ from, to, range: true, sources, totals,
    machine: { incoming, collectedToCounter, collectedToBank, collected: collectedToCounter + collectedToBank, netChange: incoming - collectedToCounter - collectedToBank },
    counter: { salesCash: sales.rows.reduce((sum, row) => sum + Number(row.counter_change), 0), otherMoves: (cashAmounts.in || 0) - (cashAmounts.out || 0), machineCollected: collectedToCounter,
      netChange: sales.rows.reduce((sum, row) => sum + Number(row.counter_change), 0) + (cashAmounts.in || 0) - (cashAmounts.out || 0) + collectedToCounter },
    movements: movements.rows, counts: counts.rows });
}));

router.post('/ptb/movements', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.movement_date) || !['opening', 'collect'].includes(b.type) || !moneyOK(b.amount) || Number(b.amount) <= 0 || (b.type === 'collect' && !['counter', 'bank'].includes(b.destination))) return fail(res, 'Thông tin giao dịch máy PTB không hợp lệ.');
  if (b.staff_id && !idOK(b.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const shift = b.shift_label || null;
  if (shift && !shiftOK(shift)) return fail(res, 'Ca không hợp lệ.');
  if (b.type === 'collect' && b.destination === 'counter' && shift) {
    const closed = await pool.query('SELECT 1 FROM pb_cash_closures WHERE close_date=$1 AND shift_label=$2', [b.movement_date, shift]);
    if (closed.rowCount) return fail(res, 'Ca này đã chốt quỹ.');
  }
  if (b.type === 'opening') {
    const existing = await pool.query("SELECT 1 FROM pb_machine_movements WHERE movement_date=$1::date AND type='opening' AND voided_at IS NULL", [b.movement_date]);
    if (existing.rowCount) return fail(res, 'Ngày này đã có tiền đầu ngày trong máy.');
  }
  try {
    const result = await pool.query(`INSERT INTO pb_machine_movements(movement_date,type,destination,amount,staff_id,note,shift_label)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [b.movement_date, b.type, b.type === 'collect' ? b.destination : null, Number(b.amount), b.staff_id || null, short(b.note, 1000) || null, shift]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return fail(res, 'Ngày này đã có tiền đầu ngày trong máy.');
    if (error.code === '23503') return fail(res, 'Nhân viên không tồn tại.');
    throw error;
  }
}));

router.delete('/ptb/movements/:id', run(async (req, res) => {
  if (!idOK(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const current = await pool.query('SELECT movement_date,shift_label,destination FROM pb_machine_movements WHERE id=$1 AND voided_at IS NULL', [req.params.id]);
  if (current.rows[0]?.destination === 'counter' && current.rows[0].shift_label) {
    const closed = await pool.query('SELECT 1 FROM pb_cash_closures WHERE close_date=$1 AND shift_label=$2', [current.rows[0].movement_date, current.rows[0].shift_label]);
    if (closed.rowCount) return fail(res, 'Ca đã chốt quỹ, không thể hủy giao dịch tiền máy.');
  }
  const result = await pool.query('UPDATE pb_machine_movements SET voided_at=NOW() WHERE id=$1 AND voided_at IS NULL RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Giao dịch máy PTB không tồn tại.' });
  res.json({ id: result.rows[0].id });
}));

router.post('/ptb/counts', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.count_date) || !moneyOK(b.actual_amount)) return fail(res, 'Ngày hoặc tiền kiểm đếm không hợp lệ.');
  if (b.staff_id && !idOK(b.staff_id)) return fail(res, 'Nhân viên không hợp lệ.');
  const expected = (await machineSummary(pool, b.count_date)).expected;
  const actual = Number(b.actual_amount);
  try {
    const result = await pool.query(`INSERT INTO pb_machine_counts(count_date,expected_amount,actual_amount,difference_amount,staff_id,note)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [b.count_date, expected, actual, actual - expected, b.staff_id || null, short(b.note, 1000) || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) { if (error.code === '23503') return fail(res, 'Nhân viên không tồn tại.'); throw error; }
}));

router.get('/customers', run(async (_req, res) => {
  const result = await pool.query(`SELECT customer_phone AS phone, (array_agg(customer_name ORDER BY happened_at DESC))[1] AS name,
    COUNT(*)::int AS orders, BOOL_OR(marketing_consent) AS marketing_consent,
    MAX(sale_date)::text AS last_order_date
    FROM pb_transactions WHERE status='completed' AND NULLIF(customer_phone,'') IS NOT NULL
    GROUP BY customer_phone ORDER BY last_order_date DESC LIMIT 2000`);
  res.json(result.rows);
}));

router.get('/attendance', run(async (req, res) => {
  if (!monthOK(req.query.month)) return fail(res, 'Tháng không hợp lệ.');
  const result = await pool.query(`SELECT a.*, a.work_date::text AS work_date,
    to_char(a.check_in,'HH24:MI') AS check_in, to_char(a.check_out,'HH24:MI') AS check_out,
    s.name AS staff_name FROM pb_attendance a JOIN pb_staff s ON s.id=a.staff_id
    WHERE a.work_date >= ($1 || '-01')::date AND a.work_date < (($1 || '-01')::date + interval '1 month')
    ORDER BY a.work_date DESC,s.name`, [req.query.month]);
  res.json(result.rows);
}));

router.post('/attendance', run(async (req, res) => {
  const b = req.body || {};
  if (!idOK(b.staff_id) || !dateOK(b.work_date) || !['present', 'half_day', 'leave', 'absent'].includes(b.status)) return fail(res, 'Thông tin chấm công không hợp lệ.');
  const timeOK = value => value == null || value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!timeOK(b.check_in) || !timeOK(b.check_out) || (b.check_in && b.check_out && b.check_out <= b.check_in)) return fail(res, 'Giờ ra phải sau giờ vào.');
  if (['leave', 'absent'].includes(b.status) && (b.check_in || b.check_out)) return fail(res, 'Ngày nghỉ hoặc vắng không có giờ vào/ra.');
  const result = await pool.query(`INSERT INTO pb_attendance(staff_id,work_date,status,check_in,check_out,note,recorded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(staff_id,work_date) DO UPDATE SET status=EXCLUDED.status,check_in=EXCLUDED.check_in,
      check_out=EXCLUDED.check_out,note=EXCLUDED.note,recorded_by=EXCLUDED.recorded_by,updated_at=NOW()
    RETURNING *,work_date::text AS work_date`, [b.staff_id, b.work_date, b.status, b.check_in || null, b.check_out || null, short(b.note, 1000) || null, short(req.user.username)]);
  res.json(result.rows[0]);
}));

router.get('/expenses', requirePhotoboothReports, run(async (req, res) => {
  if (!monthOK(req.query.month)) return fail(res, 'Tháng không hợp lệ.');
  const result = await pool.query("SELECT e.*,e.expense_date::text AS expense_date,s.name AS staff_name FROM pb_expenses e LEFT JOIN pb_staff s ON s.id=e.staff_id WHERE to_char(e.expense_date,'YYYY-MM')=$1 AND e.voided_at IS NULL ORDER BY e.expense_date DESC,e.id DESC", [req.query.month]);
  res.json(result.rows);
}));

router.post('/expenses', run(async (req, res) => {
  const b = req.body || {};
  if (!dateOK(b.expense_date) || !['other', 'ads', 'rent', 'salary'].includes(b.category) || !moneyOK(b.amount) || Number(b.amount) <= 0 || !short(b.note, 1000) || !['cash', 'transfer'].includes(b.payment_method)) return fail(res, 'Thông tin khoản chi không hợp lệ.');
  if (b.category === 'salary') {
    if (!idOK(b.staff_id)) return fail(res, 'Vui lòng chọn nhân viên Photobooth.');
    const staff = await pool.query('SELECT id FROM pb_staff WHERE id=$1', [b.staff_id]);
    if (!staff.rowCount) return fail(res, 'Nhân viên Photobooth không tồn tại.');
  }
  const result = await pool.query('INSERT INTO pb_expenses(expense_date,category,staff_id,amount,note,payment_method,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [b.expense_date, b.category, b.category === 'salary' ? b.staff_id : null, Number(b.amount), short(b.note, 1000), b.payment_method, short(b.recorded_by) || null]);
  res.status(201).json(result.rows[0]);
}));

router.delete('/expenses/:id', run(async (req, res) => {
  if (!idOK(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const result = await pool.query('UPDATE pb_expenses SET voided_at=NOW() WHERE id=$1 AND voided_at IS NULL RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Khoản chi không tồn tại.' });
  res.json({ id: result.rows[0].id });
}));

router.get('/finance', requirePhotoboothReports, run(async (req, res) => {
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
  for (const row of sales.rows) byDay.set(dayKey(row.day), { day: row.day, revenue: Number(row.revenue), cash: Number(row.cash), transfer: Number(row.transfer), orders: row.orders, other: 0, ads: 0, rent: 0, salary: 0 });
  for (const row of expenses.rows) {
    const key = dayKey(row.day);
    if (!byDay.has(key)) byDay.set(key, { day: row.day, revenue: 0, cash: 0, transfer: 0, orders: 0, other: 0, ads: 0, rent: 0, salary: 0 });
    byDay.get(key)[row.category] += Number(row.amount);
  }
  const daily = [...byDay.values()].map(row => ({ ...row, expense: row.other + row.ads + row.rent + row.salary, profit: row.revenue - row.other - row.ads - row.rent - row.salary })).sort((a, b) => dayKey(b.day).localeCompare(dayKey(a.day)));
  const totals = daily.reduce((sum, row) => { for (const key of ['revenue', 'cash', 'transfer', 'orders', 'other', 'ads', 'rent', 'salary', 'expense', 'profit']) sum[key] += Number(row[key]); return sum; }, { revenue: 0, cash: 0, transfer: 0, orders: 0, other: 0, ads: 0, rent: 0, salary: 0, expense: 0, profit: 0 });
  totals.margin = totals.revenue > 0 ? totals.profit / totals.revenue * 100 : 0;
  res.json({ month: req.query.month, totals, daily });
}));

// Only these isolated Photobooth tables are included in a backup or restore.
// Parent tables precede dependent tables for foreign-key-safe imports.
const backupTables = [
  'pb_services', 'pb_gifts', 'pb_assets', 'pb_staff',
  'pb_shift_settings', 'pb_shift_registrations', 'pb_shifts', 'pb_tasks', 'pb_incidents', 'pb_transactions',
  'pb_gift_movements', 'pb_cash_movements', 'pb_cash_closures', 'pb_machine_movements', 'pb_machine_counts', 'pb_expenses', 'pb_attendance'
];
const backupDateColumns = {
  pb_shift_registrations: ['week_start'], pb_transactions: ['sale_date'], pb_shifts: ['work_date'], pb_tasks: ['work_date'],
  pb_cash_movements: ['movement_date'], pb_cash_closures: ['close_date'],
  pb_machine_movements: ['movement_date'], pb_machine_counts: ['count_date'], pb_expenses: ['expense_date'], pb_attendance: ['work_date']
};

router.get('/backup', requireAdmin, run(async (_req, res) => {
  const data = {};
  for (const table of backupTables) data[table] = (await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows.map(row => {
    const copy = { ...row };
    for (const column of backupDateColumns[table] || []) if (copy[column] != null) copy[column] = vietnamDate(copy[column]);
    return copy;
  });
  res.json({ type: 'snappro-photobooth-backup', version: 4, exported_at: new Date().toISOString(), data });
}));

router.post('/restore', requireAdmin, run(async (req, res) => {
  const snapshot = req.body;
  if (snapshot?.type !== 'snappro-photobooth-backup' || ![1, 2, 3, 4].includes(snapshot.version) || !snapshot.data || typeof snapshot.data !== 'object') return fail(res, 'File sao lưu Photobooth không hợp lệ.');
  const data = { ...snapshot.data };
  if (snapshot.version === 1) for (const table of ['pb_machine_movements', 'pb_machine_counts']) data[table] = [];
  if (snapshot.version < 3) data.pb_attendance = [];
  if (snapshot.version < 4) {
    data.pb_shift_settings = [{ id: 1, slots: require('../utils/photoboothSchedule').defaultSlots, revision: 1 }];
    data.pb_shift_registrations = [];
  }
  if (backupTables.some(table => !Array.isArray(data[table]) || data[table].length > 100000)) return fail(res, 'File sao lưu thiếu bảng hoặc có quá nhiều bản ghi.');
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
      for (const row of data[table]) {
        if (!row || typeof row !== 'object' || !idOK(row.id) || seen.has(row.id) || Object.keys(row).some(key => !columns[table].has(key))) throw Object.assign(new Error(`Bản ghi trong ${table} không hợp lệ.`), { status: 400 });
        seen.add(row.id);
        const keys = Object.keys(row);
        await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map(key => (table === 'pb_shift_settings' && key === 'slots') || (table === 'pb_shift_registrations' && key === 'selections') ? JSON.stringify(row[key]) : (backupDateColumns[table] || []).includes(key) && row[key] != null ? vietnamDate(row[key]) : row[key]));
      }
      const max = data[table].reduce((value, row) => Math.max(value, Number(row.id)), 0);
      const sequence = (await client.query("SELECT pg_get_serial_sequence($1,'id') AS sequence", [table])).rows[0].sequence;
      if (sequence) await client.query('SELECT setval($1::regclass,$2,$3)', [sequence, Math.max(1, max), max > 0]);
    }
    await client.query('COMMIT');
    res.json({ restored: Object.fromEntries(backupTables.map(table => [table, data[table].length])) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.status === 400) return res.status(400).json({ error: error.message });
    throw error;
  } finally { client.release(); }
}));

module.exports = router;
