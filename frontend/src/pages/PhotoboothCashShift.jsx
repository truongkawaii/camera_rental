import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { photoboothApi } from '../api/client';

const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const movementLabels = { opening: 'Tiền đầu ca', in: 'Thu thêm', out: 'Chi / rút', exchange: 'Đổi mệnh giá' };
const errorText = error => error?.response?.data?.error || 'Không thể lưu dữ liệu. Vui lòng thử lại.';

export default function CashShiftPanel({ date, data, staff, refresh, setError, readOnly }) {
  const [move, setMove] = useState({ type: 'opening', amount: '', staff_id: '', note: '' });
  const [close, setClose] = useState({ actual_amount: '', staff_id: '', note: '' });
  const [busy, setBusy] = useState(false);
  const summary = data?.summary || {};
  const movements = data?.movements || [];
  const closures = data?.closures || [];
  const hasOpening = movements.some(item => item.type === 'opening');

  async function submitMove(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await photoboothApi.createCashMovement({ ...move, movement_date: date, shift_label: null });
      setMove({ type: 'opening', amount: '', staff_id: '', note: '' });
      await refresh();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function submitClose(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await photoboothApi.closeCash({ ...close, close_date: date, shift_label: null });
      setClose({ actual_amount: '', staff_id: '', note: '' });
      await refresh();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm('Hủy bút toán quỹ này?')) return;
    try { await photoboothApi.voidCashMovement(id); await refresh(); }
    catch (error) { setError(errorText(error)); }
  }

  return <div className="pb-cash-shifts">
    <div className="pb-notice">Quỹ được tính chung cả ngày: nhập tiền đầu ca một lần, cộng tiền từ đơn, thu/chi và tiền lấy từ máy trong ngày, rồi chốt quỹ cuối ngày.</div>
    <div className="pb-stat-grid">{[['Tiền đầu ca / đầu ngày', summary.opening], ['Tiền đơn cả ngày (+/−)', summary.salesCash], ['Thu/chi và lấy từ máy', Number(summary.otherMoves || 0) + Number(summary.machineCollected || 0)], ['Dự kiến cuối ngày', summary.expected]].map(([label, value]) => <div className="pb-stat" key={label}><small>{label}</small><strong>{money(value)}</strong></div>)}</div>
    {!hasOpening && <div className="pb-notice">Chưa có tiền đầu ca. Hãy nhập tiền đầu ca trước khi chốt quỹ cuối ngày.</div>}
    {!readOnly && <div className="pb-grid-two">
      <section className="pb-card"><h3>Ghi nhận thu / chi / đổi tiền</h3><form className="pb-inline-form" onSubmit={submitMove}>
        <label>Loại giao dịch<select value={move.type} onChange={e => setMove({ ...move, type: e.target.value })}>{Object.entries(movementLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Số tiền (₫)<input type="number" min="0" step="1" required value={move.amount} onChange={e => setMove({ ...move, amount: e.target.value })} /></label>
        <label>Nhân viên<select value={move.staff_id} onChange={e => setMove({ ...move, staff_id: e.target.value })}><option value="">Không chọn</option>{staff.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="pb-wide">Ghi chú<input value={move.note} onChange={e => setMove({ ...move, note: e.target.value })} placeholder="Ví dụ: tiền có trong két lúc bắt đầu ngày" /></label>
        <button className="pb-primary pb-wide" disabled={busy || (move.type === 'opening' && hasOpening)}><Plus size={15} /> Lưu giao dịch</button>
      </form></section>
      <section className="pb-card"><h3>Chốt quỹ cuối ngày</h3><form className="pb-inline-form" onSubmit={submitClose}>
        <label>Tiền đếm thực tế (₫)<input type="number" min="0" step="1" required value={close.actual_amount} onChange={e => setClose({ ...close, actual_amount: e.target.value })} /></label>
        <label>Người chốt<select value={close.staff_id} onChange={e => setClose({ ...close, staff_id: e.target.value })}><option value="">Không chọn</option>{staff.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="pb-wide">Ghi chú chênh lệch<input value={close.note} onChange={e => setClose({ ...close, note: e.target.value })} /></label>
        <div className="pb-wide pb-form-total">Dự kiến cuối ngày <strong>{money(summary.expected)}</strong></div>
        <button className="pb-primary pb-wide" disabled={busy || !hasOpening}>Lưu chốt quỹ</button>
      </form></section>
    </div>}
    <div className="pb-grid-two"><section className="pb-card"><h3>Lịch sử giao dịch quỹ toàn ngày</h3><div className="pb-table-wrap"><table className="pb-table"><thead><tr><th>Ca</th><th>Loại</th><th>Số tiền</th><th>Nhân viên</th><th>Ghi chú</th>{!readOnly && <th>Thao tác</th>}</tr></thead><tbody>{movements.map(item => <tr key={item.id}><td>{item.shift_label || 'Cả ngày'}</td><td>{movementLabels[item.type]}</td><td>{money(item.amount)}</td><td>{item.staff_name || '—'}</td><td>{item.note || '—'}</td>{!readOnly && <td>{!closures.some(entry => entry.shift_label && entry.shift_label === item.shift_label) && <button className="pb-link-danger" onClick={() => remove(item.id)} aria-label="Hủy bút toán"><Trash2 size={15} /></button>}</td>}</tr>)}{!movements.length && <tr><td colSpan={readOnly ? 5 : 6} className="pb-muted">Chưa có giao dịch quỹ.</td></tr>}</tbody></table></div></section>
      <section className="pb-card"><h3>Lịch sử chốt quỹ</h3><div className="pb-table-wrap"><table className="pb-table"><thead><tr><th>Ca</th><th>Dự kiến</th><th>Thực tế</th><th>Chênh lệch</th><th>Người chốt</th></tr></thead><tbody>{closures.map(item => <tr key={item.id}><td>{item.shift_label || 'Cả ngày'}</td><td>{money(item.expected_amount)}</td><td>{money(item.actual_amount)}</td><td><strong className={Number(item.difference_amount) < 0 ? 'pb-alert-text' : ''}>{money(item.difference_amount)}</strong></td><td>{item.staff_name || '—'}</td></tr>)}{!closures.length && <tr><td colSpan="5" className="pb-muted">Chưa có lần chốt quỹ.</td></tr>}</tbody></table></div></section></div>
  </div>;
}
