import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Moon, Plus, Save, Settings2, Sun, Sunrise, Users, X } from 'lucide-react';
import { photoboothApi } from '../api/client';
import { downloadCsv } from './PhotoboothOperations';
import './PhotoboothSchedule.css';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monday = date => plus(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const dayLabel = date => new Date(`${date}T00:00:00Z`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const keyOf = item => `${item.date}:${item.slot}`;
const statusLabels = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Cần sửa', withdrawn: 'Đã rút' };
const shiftStatuses = { scheduled: 'Đã xếp ca', working: 'Đang làm', done: 'Hoàn tất', cancelled: 'Đã hủy' };
const icons = [Sunrise, Sun, Moon];
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const totalHours = rows => rows.reduce((sum, row) => sum + (minutes(row.end) - minutes(row.start)) / 60, 0);
const errorText = err => err?.response?.data?.error || 'Không thể lưu hoặc tải lịch. Vui lòng thử lại.';
const formKey = (selections, note) => JSON.stringify([selections.map(keyOf).sort(), note]);

export default function SchedulePanel({ isAdmin, readOnly }) {
  const [week, setWeek] = useState(() => monday(today()));
  const [data, setData] = useState(null);
  const [staffId, setStaffId] = useState('');
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');
  const [original, setOriginal] = useState(formKey([], ''));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState(readOnly ? 'schedule' : 'register');
  const [settings, setSettings] = useState(null);
  const [review, setReview] = useState(null);
  const [edit, setEdit] = useState(null);
  const request = useRef(0);
  const dialogRef = useRef(null);
  const dialogOpen = Boolean(settings || review || edit);
  const registration = data?.registrations.find(row => String(row.staff_id) === staffId);
  const person = data?.staff.find(row => String(row.id) === staffId);
  const past = plus(week, 6) < today();
  const locked = readOnly || past || registration?.status === 'approved' || !person?.active;
  const dirty = original !== formKey(selected, note);
  const days = Array.from({ length: 7 }, (_, index) => plus(week, index));
  const slots = data?.settings.slots || [];
  const selections = selected.map(item => ({ ...slots.find(slot => slot.key === item.slot), ...item }));
  const hoursChanged = Boolean(registration?.selections.some(item => { const slot = slots.find(s => s.key === item.slot); return slot && (slot.start !== item.start || slot.end !== item.end); }));
  const displaySelections = !dirty && registration ? registration.selections : selections;
  const pending = data?.registrations.filter(row => row.status === 'pending') || [];
  const shifts = data?.shifts || [];

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError('');
    try { const response = await photoboothApi.schedule(week); if (id === request.current) setData(response.data); }
    catch (err) { if (id === request.current) setError(errorText(err)); }
    finally { if (id === request.current) setLoading(false); }
  }, [week]);
  useEffect(() => { load(); return () => { request.current++; }; }, [load]);
  useEffect(() => {
    const rows = registration?.selections || [];
    setSelected(rows.map(({ date, slot }) => ({ date, slot })));
    setNote(registration?.note || '');
    setOriginal(formKey(rows, registration?.note || ''));
  }, [registration, staffId, week]);
  useEffect(() => {
    const handler = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
    focusable()[0]?.focus();
    const handler = event => {
      if (event.key === 'Escape' && !busy) { setSettings(null); setReview(null); setEdit(null); }
      if (event.key === 'Tab') {
        const items = focusable();
        if (!items.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [dialogOpen, busy]);
  const discard = () => !dirty || window.confirm('Lựa chọn chưa được gửi. Bỏ các thay đổi này?');
  function changeView(next) {
    if (next === view || !discard()) return;
    const rows = registration?.selections || [];
    setSelected(rows.map(({ date, slot }) => ({ date, slot })));
    setNote(registration?.note || '');
    setOriginal(formKey(rows, registration?.note || ''));
    setView(next);
  }
  function changeWeek(value) { if (value && discard()) { setWeek(monday(value)); setSuccess(''); setReview(null); setEdit(null); setData(null); } }
  function toggle(date, slot) {
    const key = `${date}:${slot}`;
    setSelected(current => current.some(item => keyOf(item) === key) ? current.filter(item => keyOf(item) !== key) : [...current, { date, slot }]);
    setSuccess('');
  }
  function quick(mode) {
    const next = days.flatMap((date, index) => slots.filter(() => mode === 'all' || (mode === 'weekdays' && index < 5)).map(slot => ({ date, slot: slot.key })));
    setSelected(mode === 'clear' ? [] : next); setSuccess('');
  }
  async function submit(withdraw = false) {
    if (withdraw && !window.confirm('Rút toàn bộ đăng ký chưa được duyệt của tuần này?')) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await photoboothApi.saveRegistration({ week, staff_id: Number(staffId), selections: withdraw ? [] : selected, note, revision: registration?.revision || 0, settings_revision: data.settings.revision });
      await load(); setSuccess(withdraw ? 'Đã rút đăng ký tuần này.' : 'Đã gửi đăng ký. Lịch sẽ chính thức sau khi quản lý duyệt.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function reviewSave(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await photoboothApi.reviewRegistration(review.id, { status: review.result, revision: review.revision, note: review.reason.trim() });
      setReview(null); await load(); setSuccess(review.result === 'approved' ? 'Đã duyệt và tạo các ca trong lịch chính thức.' : 'Đã gửi yêu cầu sửa kèm lý do.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function settingsSave(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await photoboothApi.saveShiftSettings(settings); setSettings(null); await load(); setSuccess('Đã cập nhật giờ ca. Các đăng ký đã gửi và lịch đã duyệt giữ nguyên giờ cũ.'); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function saveShift(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { ...edit, staff_id: Number(edit.staff_id) }; delete payload.id;
      if (edit.id) await photoboothApi.update('shifts', edit.id, payload); else await photoboothApi.create('shifts', payload);
      setEdit(null); await load(); setSuccess('Đã cập nhật lịch chính thức.');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  function exportCsv() {
    downloadCsv(`Insphoto_lich_ca_${week}.csv`, [['Ngày', 'Nhân viên', 'Ca', 'Bắt đầu', 'Kết thúc', 'Trạng thái', 'Ghi chú'], ...shifts.map(row => [row.work_date, row.staff_name, row.label, row.start_time.slice(0, 5), row.end_time.slice(0, 5), shiftStatuses[row.status], row.note])]);
  }

  return <div className="ps-workspace" aria-busy={busy || loading}>
    <section className="ps-intro"><div><span className="ps-kicker">CÙNG NHAU SẮP XẾP MỘT TUẦN THẬT TỐT</span><h3>Lịch của bạn, nhịp của Insphoto <span>♡</span></h3><p>Chọn ca bạn có thể làm. Quản lý duyệt, cả đội cùng sẵn sàng.</p></div><div className="ps-intro-icon"><CalendarDays size={34} /></div></section>
    <div className="ps-toolbar"><div className="ps-view-switch" role="group" aria-label="Chế độ lịch">{!readOnly && <button className={view === 'register' ? 'active' : ''} onClick={() => changeView('register')}>Đăng ký ca</button>}<button className={view === 'schedule' ? 'active' : ''} onClick={() => changeView('schedule')}>Lịch chính thức</button>{isAdmin && <button className={view === 'review' ? 'active' : ''} onClick={() => changeView('review')}>Duyệt đăng ký <span>{pending.length}</span></button>}</div><div className="ps-week-nav"><button aria-label="Tuần trước" disabled={busy} onClick={() => changeWeek(plus(week, -7))}><ChevronLeft size={18} /></button><label><span>Tuần bắt đầu</span><input type="date" aria-label="Chọn tuần" value={week} disabled={busy} onChange={e => changeWeek(e.target.value)} /></label><button aria-label="Tuần sau" disabled={busy} onClick={() => changeWeek(plus(week, 7))}><ChevronRight size={18} /></button><button className="ps-this-week" disabled={busy} onClick={() => changeWeek(today())}>Tuần này</button></div></div>
    {error && <div className="pb-error" role="alert">{error}<button onClick={load}>Tải lại dữ liệu</button></div>}
    {success && <div className="ps-success" role="status"><CheckCircle2 size={18} />{success}</div>}
    {loading ? <div className="pb-loading">Đang tải lịch tuần…</div> : !data ? <div className="ps-empty">Chưa tải được lịch. Vui lòng thử lại.</div> : <>
      <div className="ps-metrics"><div><CalendarDays size={19} /><span>Tuần đang xem<strong>{dayLabel(week)} — {dayLabel(plus(week, 6))}</strong></span></div><div><Users size={19} /><span>Đã gửi đăng ký<strong>{data.registrations.filter(row => row.status !== 'withdrawn').length} nhân viên</strong></span></div><div><Clock3 size={19} /><span>Lịch chính thức<strong>{shifts.length} ca làm</strong></span></div><div><CheckCircle2 size={19} /><span>Đang chờ duyệt<strong>{pending.length} đăng ký</strong></span></div></div>
      {view === 'register' && <div className="ps-register-layout"><section className="ps-calendar-card">
        <div className="ps-card-heading"><div><span className="ps-step">01 · THÔNG TIN ĐĂNG KÝ</span><h3>Tuần này, bạn làm ca nào?</h3></div><span className="ps-badge neutral">{past ? 'Tuần đã kết thúc' : 'Đăng ký theo tuần'}</span></div>
        <div className="ps-person-row"><label>Nhân viên đăng ký<select aria-label="Nhân viên đăng ký" value={staffId} disabled={busy} onChange={e => { if (discard()) { setStaffId(e.target.value); setSuccess(''); } }}><option value="">Chọn tên của bạn</option>{data.staff.filter(row => row.active || data.registrations.some(r => r.staff_id === row.id)).map(row => <option key={row.id} value={row.id}>{row.name}{!row.active ? ' · Đã nghỉ' : ''}</option>)}</select></label>{registration && <span className={`ps-badge ${registration.status}`}>{statusLabels[registration.status]}</span>}</div>
        {!staffId && <div className="ps-soft-note">Chọn tên của bạn để bắt đầu. Mỗi nhân viên có một bản đăng ký cho mỗi tuần.</div>}
        {hoursChanged && <div className="ps-soft-note">Giờ ca hiện tại đã thay đổi so với lần gửi trước. Bản đã lưu giữ nguyên giờ cũ; khi cập nhật đăng ký sẽ áp dụng giờ mới ghi ở đầu mỗi hàng.</div>}
        {registration?.review_note && <div className="ps-soft-note"><strong>Phản hồi quản lý:</strong> {registration.review_note}</div>}
        {registration?.status === 'approved' && <div className="ps-soft-note">Lịch đã được duyệt. Xem ca đang có hiệu lực tại <button className="ps-text-button" onClick={() => changeView('schedule')}>Lịch chính thức</button>; liên hệ quản lý nếu cần đổi ca.</div>}
        <div className="ps-grid-top"><span className="ps-step">02 · TÍCH CHỌN CA CÓ THỂ LÀM</span>{isAdmin && <button className="ps-text-button" disabled={busy || dirty} title={dirty ? 'Gửi hoặc bỏ thay đổi trước khi chỉnh giờ ca' : ''} onClick={() => setSettings({ ...data.settings, slots: data.settings.slots.map(s => ({ ...s })) })}><Settings2 size={14} /> Tùy chỉnh giờ ca</button>}</div>
        <p className="ps-mobile-hint">Vuốt ngang để xem đủ 7 ngày trong tuần →</p>
        <div className="ps-grid-scroll"><div className="ps-shift-grid" role="group" aria-label="Lưới đăng ký ca trong tuần"><div className="ps-grid-corner">CA LÀM</div>{days.map((date, index) => <div className={`ps-day ${date === today() ? 'today' : ''}`} key={date}><span>{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][index]}</span><strong>{dayLabel(date)}</strong>{date === today() && <small>Hôm nay</small>}</div>)}
          {slots.map((slot, index) => { const Icon = icons[index]; return <React.Fragment key={slot.key}><div className="ps-slot-label"><Icon size={18} /><strong>{slot.label}</strong><small>{slot.start}–{slot.end}</small></div>{days.map(date => {
            const active = selected.some(item => keyOf(item) === `${date}:${slot.key}`);
            const savedSlot = registration?.selections.find(item => keyOf(item) === `${date}:${slot.key}`);
            return <button key={date} type="button" aria-label={`${slot.label}, ${dayLabel(date)}`} aria-pressed={active} disabled={locked || busy} className={`ps-slot ${active ? 'selected' : ''} ${registration?.status === 'approved' ? 'approved' : ''}`} onClick={() => toggle(date, slot.key)}>{active ? <><Check size={21} /><span>{savedSlot && !dirty ? `${savedSlot.start}–${savedSlot.end}` : 'Đã chọn'}</span></> : <><Plus size={17} /><span>Chọn ca</span></>}</button>;
          })}</React.Fragment>; })}
        </div></div>
        {!locked && <div className="ps-quick"><span>Chọn nhanh</span><button disabled={busy} onClick={() => quick('weekdays')}>T2–T6</button><button disabled={busy} onClick={() => quick('all')}>Cả tuần</button><button disabled={busy || !selected.length} onClick={() => quick('clear')}>Bỏ chọn tất cả</button></div>}
        <div className="ps-legend"><span><i className="selected" /> Đã chọn</span><span><i /> Có thể đăng ký</span><span><i className="approved" /> Lịch đã duyệt được khóa</span></div>
        <label className="ps-note-label">Ghi chú cho quản lý <span>Không bắt buộc</span><textarea maxLength={1000} rows={3} disabled={locked || busy} value={note} onChange={e => setNote(e.target.value)} placeholder="Ví dụ: Thứ 4 em có thể đến sớm 30 phút, cuối tuần ưu tiên ca tối…" /></label>
      </section><aside className="ps-summary"><span className="ps-step">TRƯỚC KHI GỬI</span><h3>Tuần làm việc của bạn</h3><div className="ps-selection-total"><strong>{selected.length}</strong><span>ca đã chọn<small>Khoảng {totalHours(displaySelections).toLocaleString('vi-VN')} giờ / tuần</small></span></div>
        <div className="ps-selected-days">{days.map((date, index) => { const items = selected.filter(item => item.date === date); return <div key={date}><span>{['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][index]} <small>{dayLabel(date)}</small></span><strong>{items.length ? `${items.length} ca` : '—'}</strong></div>; })}</div>
        {totalHours(displaySelections) > 48 && <p className="ps-hours-hint">Bạn đã chọn hơn 48 giờ trong tuần. Kiểm tra lại khả năng làm việc trước khi gửi.</p>}
        <div className="ps-summary-tip"><CheckCircle2 size={18} /><p>Đăng ký thể hiện ca bạn có thể làm. Chỉ lịch đã duyệt mới là lịch làm chính thức.</p></div>
        {registration && <p className="ps-saved-at">Lần gửi gần nhất: {new Date(registration.updated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>}
        <button className="ps-submit" disabled={locked || busy || !selected.length || (!dirty && !hoursChanged && registration?.status === 'pending')} onClick={() => submit()}><Save size={17} />{busy ? 'Đang xử lý…' : registration && registration.status !== 'withdrawn' ? 'Cập nhật đăng ký' : 'Gửi đăng ký'}</button>
        {dirty && <span className="ps-unsaved">Có thay đổi chưa gửi</span>}
        {registration?.status === 'pending' && !past && !readOnly && <button className="ps-withdraw" disabled={busy} onClick={() => submit(true)}>Rút đăng ký tuần này</button>}
        {past && <p className="ps-saved-at">Tuần đã kết thúc. Chọn tuần hiện tại hoặc tuần tiếp theo để đăng ký.</p>}
      </aside></div>}
      {view === 'review' && isAdmin && <section className="ps-calendar-card"><div className="ps-card-heading"><div><span className="ps-step">ĐĂNG KÝ CỦA CẢ ĐỘI</span><h3>Duyệt lịch tuần</h3><p>Duyệt từng nhân viên; hệ thống tạo toàn bộ ca và kiểm tra trùng giờ trước khi lưu.</p></div><span className="ps-badge pending">{pending.length} chờ duyệt</span></div><div className="ps-review-list">{data.registrations.filter(row => row.status !== 'withdrawn').map(row => <article key={row.id} className="ps-review-item"><div className="ps-review-head"><div className="ps-person-avatar">{row.staff_name.slice(0, 1)}</div><div><h4>{row.staff_name}</h4><p>{row.selections.length} ca · {totalHours(row.selections).toLocaleString('vi-VN')} giờ</p></div><span className={`ps-badge ${row.status}`}>{statusLabels[row.status]}</span></div><div className="ps-review-slots">{row.selections.map(slot => <span key={keyOf(slot)}>{dayLabel(slot.date)} · {slot.label}<small>{slot.start}–{slot.end}</small></span>)}</div>{row.note && <p className="ps-review-note">Ghi chú: {row.note}</p>}{row.review_note && <p className="ps-review-note">Phản hồi: {row.review_note}</p>}{row.status === 'pending' && !past && <div className="ps-review-actions"><button disabled={busy} className="pb-secondary" onClick={() => setReview({ ...row, result: 'rejected', reason: '' })}>Yêu cầu sửa</button><button disabled={busy} className="pb-primary" onClick={() => setReview({ ...row, result: 'approved', reason: '' })}><Check size={15} /> Duyệt {row.selections.length} ca</button></div>}</article>)}{!data.registrations.some(row => row.status !== 'withdrawn') && <div className="ps-empty"><Users size={30} /><h4>Chưa có đăng ký trong tuần</h4><p>Đăng ký của nhân viên sẽ xuất hiện tại đây sau khi gửi.</p></div>}</div></section>}
      {view === 'schedule' && <section className="ps-calendar-card"><div className="ps-card-heading"><div><span className="ps-step">LỊCH LÀM ĐÃ XÁC NHẬN</span><h3>Cả đội tuần này</h3><p>Ca đã duyệt và ca được quản lý xếp trực tiếp.</p></div><div className="pb-actions"><button className="pb-secondary" onClick={exportCsv}><Download size={15} /> Xuất CSV</button>{isAdmin && <button className="pb-primary" onClick={() => setEdit({ staff_id: '', work_date: week, label: slots[0].label, start_time: slots[0].start, end_time: slots[0].end, status: 'scheduled', note: '' })}><Plus size={15} /> Xếp ca</button>}</div></div><div className="ps-team-week">{days.map((date, index) => <div className={`ps-team-day ${date === today() ? 'today' : ''}`} key={date}><header><strong>{['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'][index]}</strong><span>{dayLabel(date)}</span></header>{shifts.filter(row => row.work_date === date).map(row => <div className="ps-team-shift" key={row.id}><strong>{row.staff_name}</strong><span>{row.label || 'Ca làm'}</span><small>{row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}</small><em>{shiftStatuses[row.status]}</em>{row.note && <p>{row.note}</p>}{isAdmin && <button className="ps-text-button" onClick={() => setEdit({ id: row.id, staff_id: row.staff_id, work_date: row.work_date, label: row.label || '', start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5), status: row.status, note: row.note || '' })}>Điều chỉnh</button>}</div>)}{!shifts.some(row => row.work_date === date) && <p className="ps-no-shift">Chưa xếp ca</p>}</div>)}</div></section>}
    </>}
    {(settings || review || edit) && <div className="pb-modal-backdrop"><section ref={dialogRef} className="pb-modal ps-dialog" role="dialog" aria-modal="true" aria-label={settings ? 'Tùy chỉnh giờ ca' : review ? 'Xác nhận duyệt đăng ký' : 'Điều chỉnh lịch chính thức'}><div className="ps-dialog-head"><h3>{settings ? 'Tùy chỉnh giờ ca' : review ? review.result === 'approved' ? 'Duyệt đăng ký' : 'Yêu cầu sửa đăng ký' : 'Điều chỉnh lịch chính thức'}</h3><button disabled={busy} aria-label="Đóng" onClick={() => { setSettings(null); setReview(null); setEdit(null); }}><X size={20} /></button></div>{error && <div className="pb-error" role="alert">{error}</div>}
      {settings && <form onSubmit={settingsSave}><p className="ps-dialog-help">Áp dụng cho đăng ký mới hoặc được gửi lại. Đăng ký đã gửi và lịch chính thức giữ nguyên giờ đã lưu.</p>{settings.slots.map((slot, index) => <div className="ps-time-row" key={slot.key}><strong>{slot.label}</strong><label>Bắt đầu<input aria-label={`${slot.label} bắt đầu`} required type="time" value={slot.start} onChange={e => setSettings({ ...settings, slots: settings.slots.map((s, i) => i === index ? { ...s, start: e.target.value } : s) })} /></label><label>Kết thúc<input aria-label={`${slot.label} kết thúc`} required type="time" value={slot.end} onChange={e => setSettings({ ...settings, slots: settings.slots.map((s, i) => i === index ? { ...s, end: e.target.value } : s) })} /></label></div>)}<button className="ps-submit" disabled={busy}>Lưu giờ ca</button></form>}
      {review && <form onSubmit={reviewSave}><p className="ps-dialog-help">{review.staff_name} · {review.selections.length} ca · {totalHours(review.selections).toLocaleString('vi-VN')} giờ. {review.result === 'approved' ? 'Các ca sẽ được đưa vào lịch chính thức.' : 'Nhân viên có thể sửa lựa chọn rồi gửi lại.'}</p><label>Phản hồi {review.result === 'rejected' ? '(bắt buộc)' : '(không bắt buộc)'}<textarea rows={3} maxLength={1000} required={review.result === 'rejected'} value={review.reason} onChange={e => setReview({ ...review, reason: e.target.value })} /></label><button className="ps-submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button></form>}
      {edit && <form onSubmit={saveShift}><div className="pb-inline-form"><label>Nhân viên<select required value={edit.staff_id} onChange={e => setEdit({ ...edit, staff_id: e.target.value })}><option value="">Chọn nhân viên</option>{data.staff.filter(row => row.active || row.id === Number(edit.staff_id)).map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label><label>Ngày làm<input required type="date" value={edit.work_date} onChange={e => setEdit({ ...edit, work_date: e.target.value })} /></label><label>Tên ca<input required maxLength={40} value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} /></label><label>Trạng thái<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}>{Object.entries(shiftStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Bắt đầu<input required type="time" value={edit.start_time} onChange={e => setEdit({ ...edit, start_time: e.target.value })} /></label><label>Kết thúc<input required type="time" value={edit.end_time} onChange={e => setEdit({ ...edit, end_time: e.target.value })} /></label><label className="pb-wide">Ghi chú<textarea maxLength={1000} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} /></label></div><button className="ps-submit" disabled={busy}>Lưu lịch chính thức</button></form>}
    </section></div>}
  </div>;
}
