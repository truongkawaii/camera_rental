const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePhotoboothAccess } = require('../middleware/photoboothAccess');
const { defaultSlots, validWeek, addDays, today, validateSlots, selectionSnapshot } = require('../utils/photoboothSchedule');
const router = express.Router();
router.use(authenticate, requirePhotoboothAccess);
const run = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const idOK = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const revisionOK = value => Number.isSafeInteger(value) && value >= 0;
const fail = (res, error, status = 400) => res.status(status).json({ error });
async function config(db, lock = false) {
  const result = await db.query(`SELECT * FROM pb_shift_settings WHERE id=1${lock ? ' FOR SHARE' : ''}`);
  return result.rows[0] || { id: 1, slots: defaultSlots, revision: 1 };
}
router.get('/shift-registration', run(async (req, res) => {
  const week = req.query.week;
  if (!validWeek(week)) return fail(res, 'Vui lòng chọn tuần bắt đầu từ thứ Hai.');
  const [settings, registrations, shifts, staff] = await Promise.all([
    config(pool),
    pool.query(`SELECT r.*,r.week_start::text AS week_start,s.name AS staff_name FROM pb_shift_registrations r JOIN pb_staff s ON s.id=r.staff_id WHERE week_start=$1 ORDER BY s.name`, [week]),
    pool.query(`SELECT sh.*,sh.work_date::text AS work_date,s.name AS staff_name FROM pb_shifts sh JOIN pb_staff s ON s.id=sh.staff_id WHERE work_date BETWEEN $1::date AND $2::date AND status<>'cancelled' ORDER BY sh.work_date,sh.start_time,s.name`, [week, addDays(week, 6)]),
    pool.query('SELECT id,name,active FROM pb_staff ORDER BY name')
  ]);
  res.json({ settings, registrations: registrations.rows, shifts: shifts.rows, staff: staff.rows });
}));
router.put('/shift-settings', requireAdmin, run(async (req, res) => {
  if (!validateSlots(req.body?.slots) || !revisionOK(req.body?.revision)) return fail(res, 'Giờ ca phải hợp lệ, không trùng nhau và kết thúc trong ngày.');
  const result = await pool.query(`UPDATE pb_shift_settings SET slots=$1,revision=revision+1 WHERE id=1 AND revision=$2 RETURNING *`, [JSON.stringify(req.body.slots), req.body.revision]);
  if (!result.rowCount) return fail(res, 'Giờ ca vừa được thay đổi. Hãy tải lại trang.', 409);
  res.json(result.rows[0]);
}));
router.put('/shift-registration', run(async (req, res) => {
  const b = req.body || {};
  if (!validWeek(b.week) || !idOK(b.staff_id) || !revisionOK(b.revision) || !revisionOK(b.settings_revision) || typeof b.note !== 'string' || b.note.length > 1000) return fail(res, 'Thông tin đăng ký không hợp lệ.');
  if (addDays(b.week, 6) < today()) return fail(res, 'Tuần này đã kết thúc, không thể sửa đăng ký.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const staff = await client.query('SELECT id FROM pb_staff WHERE id=$1 AND active=true FOR UPDATE', [b.staff_id]);
    if (!staff.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Nhân viên đã ngừng làm việc hoặc không tồn tại.'); }
    const settings = await config(client, true);
    if (settings.revision !== b.settings_revision) { await client.query('ROLLBACK'); return fail(res, 'Giờ ca đã thay đổi. Hãy tải lại trước khi gửi.', 409); }
    let selections;
    try { selections = selectionSnapshot(b.week, b.selections, settings.slots); }
    catch (error) { await client.query('ROLLBACK'); return fail(res, error.message); }
    const current = (await client.query('SELECT * FROM pb_shift_registrations WHERE staff_id=$1 AND week_start=$2 FOR UPDATE', [b.staff_id, b.week])).rows[0];
    if ((current?.revision || 0) !== b.revision) { await client.query('ROLLBACK'); return fail(res, 'Đăng ký vừa được cập nhật. Hãy tải lại để tránh ghi đè.', 409); }
    if (current?.status === 'approved') { await client.query('ROLLBACK'); return fail(res, 'Lịch đã được duyệt. Liên hệ quản lý để điều chỉnh lịch chính thức.'); }
    const result = await client.query(`INSERT INTO pb_shift_registrations(staff_id,week_start,selections,note,status,submitted_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(staff_id,week_start) DO UPDATE SET selections=EXCLUDED.selections,note=EXCLUDED.note,status=EXCLUDED.status,revision=pb_shift_registrations.revision+1,updated_at=NOW(),review_note=NULL,reviewed_by=NULL,reviewed_at=NULL,submitted_by=EXCLUDED.submitted_by RETURNING *`,
    [b.staff_id, b.week, JSON.stringify(selections), b.note.trim(), selections.length ? 'pending' : 'withdrawn', String(req.user.id)]);
    await client.query('COMMIT'); res.json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));
router.post('/shift-registration/:id/review', requireAdmin, run(async (req, res) => {
  const b = req.body || {};
  if (!idOK(req.params.id) || !['approved', 'rejected'].includes(b.status) || !revisionOK(b.revision) || typeof b.note !== 'string' || b.note.length > 1000 || (b.status === 'rejected' && !b.note.trim())) return fail(res, 'Chọn kết quả duyệt; nhập lý do nếu yêu cầu sửa.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(179293,1)');
    // Lock staff before registration, matching the submission lock order.
    const identity = (await client.query('SELECT staff_id FROM pb_shift_registrations WHERE id=$1', [req.params.id])).rows[0];
    if (!identity) { await client.query('ROLLBACK'); return fail(res, 'Không tìm thấy đăng ký.', 404); }
    const staff = (await client.query('SELECT active FROM pb_staff WHERE id=$1 FOR UPDATE', [identity.staff_id])).rows[0];
    const registration = (await client.query('SELECT *,week_start::text AS week_start FROM pb_shift_registrations WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (registration.status !== 'pending' || registration.revision !== b.revision) { await client.query('ROLLBACK'); return fail(res, 'Đăng ký đã thay đổi hoặc đã được xử lý. Hãy tải lại.', 409); }
    if (b.status === 'approved') {
      if (!staff?.active || addDays(registration.week_start, 6) < today()) { await client.query('ROLLBACK'); return fail(res, 'Nhân viên đã ngừng làm việc hoặc tuần đã kết thúc.'); }
      for (const slot of registration.selections) {
        const conflict = await client.query(`SELECT id FROM pb_shifts WHERE staff_id=$1 AND work_date=$2 AND status<>'cancelled' AND start_time<$4::time AND end_time>$3::time LIMIT 1`, [registration.staff_id, slot.date, slot.start, slot.end]);
        if (conflict.rowCount) { await client.query('ROLLBACK'); return fail(res, `Trùng lịch nhân viên ngày ${slot.date}, ${slot.label} (${slot.start}–${slot.end}). Hãy chỉnh lịch chính thức hoặc yêu cầu sửa đăng ký.`, 409); }
        await client.query(`INSERT INTO pb_shifts(staff_id,work_date,label,start_time,end_time,status,note) VALUES($1,$2,$3,$4,$5,'scheduled',$6)`, [registration.staff_id, slot.date, slot.label, slot.start, slot.end, registration.note || null]);
      }
    }
    const result = await client.query(`UPDATE pb_shift_registrations SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=NOW(),updated_at=NOW(),revision=revision+1 WHERE id=$1 RETURNING *`, [registration.id, b.status, b.note.trim(), String(req.user.id)]);
    await client.query('COMMIT'); res.json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

// Official schedules may only be changed by managers. Serialize these writes
// with approvals so an overlap cannot slip in between checking and inserting.
async function writeShift(req, res) {
  const b = req.body || {};
  const updating = Boolean(req.params.id);
  if (updating && !idOK(req.params.id)) return fail(res, 'ID không hợp lệ.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(179293,1)');
    const current = updating ? (await client.query('SELECT *,work_date::text AS work_date FROM pb_shifts WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0] : {};
    if (!current) { await client.query('ROLLBACK'); return fail(res, 'Không tìm thấy ca làm.', 404); }
    const fields = ['staff_id','work_date','label','start_time','end_time','status','note'];
    const row = { ...current, ...Object.fromEntries(fields.filter(key => b[key] !== undefined).map(key => [key, b[key]])) };
    row.start_time = String(row.start_time || '').slice(0,5);
    row.end_time = String(row.end_time || '').slice(0,5);
    row.status ||= 'scheduled';
    const date = row.work_date;
    const timeOK = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!idOK(row.staff_id) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date || !timeOK(row.start_time) || !timeOK(row.end_time) || row.start_time >= row.end_time || !['scheduled','working','done','cancelled'].includes(row.status) || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 40 || (row.note != null && (typeof row.note !== 'string' || row.note.length > 1000))) {
      await client.query('ROLLBACK'); return fail(res, 'Thông tin ca không hợp lệ. Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.');
    }
    const staff = (await client.query('SELECT active FROM pb_staff WHERE id=$1 FOR UPDATE', [row.staff_id])).rows[0];
    if (!staff || (!staff.active && row.status !== 'cancelled')) { await client.query('ROLLBACK'); return fail(res, 'Nhân viên không còn làm việc.'); }
    if (row.status !== 'cancelled') {
      const conflict = await client.query(`SELECT id FROM pb_shifts WHERE staff_id=$1 AND work_date=$2 AND status<>'cancelled' AND start_time<$4::time AND end_time>$3::time AND id<>$5 LIMIT 1`, [row.staff_id,date,row.start_time,row.end_time,updating ? req.params.id : 0]);
      if (conflict.rowCount) { await client.query('ROLLBACK'); return fail(res, 'Nhân viên đã có ca trùng giờ trong ngày này.', 409); }
    }
    const values = fields.map(key => row[key] ?? null);
    const result = updating
      ? await client.query(`UPDATE pb_shifts SET ${fields.map((key,index) => `${key}=$${index+1}`).join(',')} WHERE id=$8 RETURNING *`, [...values,req.params.id])
      : await client.query(`INSERT INTO pb_shifts(${fields.join(',')}) VALUES(${fields.map((_,index) => `$${index+1}`).join(',')}) RETURNING *`, values);
    await client.query('COMMIT'); res.status(updating ? 200 : 201).json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
router.post('/shifts', requireAdmin, run(writeShift));
router.patch('/shifts/:id', requireAdmin, run(writeShift));

module.exports = router;
