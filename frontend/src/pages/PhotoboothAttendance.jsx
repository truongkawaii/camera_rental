import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Download, Save } from 'lucide-react';
import { photoboothApi } from '../api/client';
import { downloadCsv } from './PhotoboothOperations';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const statuses = { present: 'Đủ công', half_day: 'Nửa công', leave: 'Nghỉ phép', absent: 'Vắng mặt' };
const units = { present: 1, half_day: 0.5, leave: 0, absent: 0 };
const newForm = month => ({ staff_id: '', work_date: today().startsWith(month) ? today() : `${month}-01`, status: 'present', check_in: '', check_out: '', note: '' });

export default function AttendancePanel({ readOnly }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(() => newForm(today().slice(0, 7)));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true); setError('');
    try {
      const [attendance, people] = await Promise.all([photoboothApi.attendance(month), photoboothApi.list('staff')]);
      setRows(attendance.data); setStaff(people.data);
    } catch (err) { setError(err?.response?.data?.error || 'Không tải được chấm công.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); setForm(newForm(month)); }, [month]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await photoboothApi.saveAttendance(form);
      setForm(newForm(month));
      await refresh();
    } catch (err) { setError(err?.response?.data?.error || 'Không lưu được chấm công.'); }
    finally { setBusy(false); }
  }

  const summary = staff.map(person => {
    const entries = rows.filter(row => row.staff_id === person.id);
    return { ...person, days: entries.length, units: entries.reduce((sum, row) => sum + units[row.status], 0), leave: entries.filter(row => row.status === 'leave').length, absent: entries.filter(row => row.status === 'absent').length };
  });
  function exportCsv() {
    downloadCsv(`Insphoto_cham_cong_${month}.csv`, [
      ['CHẤM CÔNG PHOTOBOOTH', month],
      ['Nhân viên', 'Ngày', 'Trạng thái', 'Công', 'Giờ vào', 'Giờ ra', 'Ghi chú', 'Người ghi'],
      ...rows.map(row => [row.staff_name, row.work_date, statuses[row.status], units[row.status], row.check_in, row.check_out, row.note, row.recorded_by])
    ]);
  }

  return <div className="pb-attendance">
    <div className="pb-actions pb-no-print"><label className="pb-date"><CalendarDays size={16} /><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label><button className="pb-secondary" onClick={exportCsv}><Download size={15} /> Xuất bảng công CSV</button></div>
    <div className="pb-notice">Mỗi nhân viên có một bản chấm công cho mỗi ngày. Chọn bản ghi trong bảng để sửa; lưu lại sẽ cập nhật ngày đó. Công được tính theo trạng thái, tách riêng khỏi lương và doanh thu Photobooth.</div>
    {error && <div className="pb-error" role="alert">{error}</div>}
    {loading ? <div className="pb-loading">Đang tải chấm công...</div> : <>
      <div className="pb-stat-grid">{[['Nhân viên', summary.length], ['Tổng công', summary.reduce((sum, row) => sum + row.units, 0)], ['Ngày nghỉ phép', summary.reduce((sum, row) => sum + row.leave, 0)], ['Ngày vắng', summary.reduce((sum, row) => sum + row.absent, 0)]].map(([label, value]) => <div className="pb-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <div className="pb-grid-two">
        {!readOnly && <section className="pb-card"><h3>Ghi nhận công</h3><form className="pb-inline-form" onSubmit={save}>
          <label>Nhân viên *<select required value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}><option value="">Chọn nhân viên</option>{staff.filter(item => item.active || String(item.id) === String(form.staff_id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Ngày làm *<input type="date" required min={`${month}-01`} max={`${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()}`} value={form.work_date} onChange={e => setForm({ ...form, work_date: e.target.value })} /></label>
          <label>Trạng thái<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value, ...(['leave', 'absent'].includes(e.target.value) ? { check_in: '', check_out: '' } : {}) })}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {!['leave', 'absent'].includes(form.status) && <><label>Giờ vào<input type="time" value={form.check_in || ''} onChange={e => setForm({ ...form, check_in: e.target.value })} /></label>
          <label>Giờ ra<input type="time" value={form.check_out || ''} onChange={e => setForm({ ...form, check_out: e.target.value })} /></label></>}
          <label className="pb-wide">Ghi chú<input value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Ví dụ: đổi ca, về sớm" /></label>
          <button className="pb-primary pb-wide" disabled={busy}><Save size={15} /> {busy ? 'Đang lưu...' : 'Lưu chấm công'}</button>
        </form></section>}
        <section className="pb-card"><h3>Tổng hợp theo nhân viên</h3><div className="pb-table-wrap"><table className="pb-table"><thead><tr><th>Nhân viên</th><th>Ngày ghi nhận</th><th>Tổng công</th><th>Nghỉ phép</th><th>Vắng</th></tr></thead><tbody>{summary.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.days}</td><td><strong>{row.units}</strong></td><td>{row.leave}</td><td>{row.absent}</td></tr>)}</tbody></table></div></section>
      </div>
      <section className="pb-card pb-table-card"><div className="pb-card-head"><div><h3>Nhật ký chấm công</h3><p>{rows.length} bản ghi trong tháng {month}</p></div></div><div className="pb-table-wrap"><table className="pb-table"><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Trạng thái</th><th>Công</th><th>Giờ vào</th><th>Giờ ra</th><th>Ghi chú</th>{!readOnly && <th>Thao tác</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{new Date(`${row.work_date}T00:00:00`).toLocaleDateString('vi-VN')}</td><td>{row.staff_name}</td><td>{statuses[row.status]}</td><td>{units[row.status]}</td><td>{row.check_in || '—'}</td><td>{row.check_out || '—'}</td><td>{row.note || '—'}</td>{!readOnly && <td><button className="pb-secondary" onClick={() => { setForm({ staff_id: row.staff_id, work_date: row.work_date, status: row.status, check_in: row.check_in || '', check_out: row.check_out || '', note: row.note || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Sửa</button></td>}</tr>)}{!rows.length && <tr><td colSpan={readOnly ? 7 : 8} className="pb-muted">Chưa có bản chấm công trong tháng này.</td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}
