import React, { useRef, useState, useEffect } from 'react';
import { Download, Plus, Printer, Trash2 } from 'lucide-react';
import { photoboothApi } from '../api/client';
import { Link } from 'react-router-dom';

const money = value => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const moneyInput = value => value === '' || value == null ? '' : /^\d+\.0+$/.test(String(value)) ? String(Number(value)) : String(value);
const day = value => value ? String(value).slice(0, 10) : '';
const category = { other: 'Phát sinh', ads: 'ADS', rent: 'Mặt bằng', salary: 'Lương nhân viên' };
const movement = { opening: 'Đầu ca/ngày', in: 'Thu thêm', out: 'Chi/rút', exchange: 'Đổi mệnh giá' };
export const sourceModes = { machine_self: 'Khách tự bỏ tiền vào máy PTB', machine_exchange: 'Khách CK, thu ngân đổi tiền vào máy', counter: 'In thêm / bán tại quầy', other_bank: 'Khác · Chuyển thẳng về STK' };
const errorText = error => error?.response?.data?.error || 'Không thể lưu dữ liệu. Vui lòng thử lại.';

export function downloadCsv(filename, rows) {
  const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BackupControls() {
  const input = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function exportBackup() {
    setError('');
    try {
      const data = (await photoboothApi.backup()).data;
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Insphoto_sao_luu_${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(errorText(err)); }
  }
  async function selectFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError(''); setPhrase('');
    try {
      const value = JSON.parse(await file.text());
      if (value.type !== 'snappro-photobooth-backup' || ![1, 2, 3, 4].includes(value.version) || !value.data || !Array.isArray(value.data.pb_transactions)) throw new Error('File sao lưu Photobooth không hợp lệ.');
      setSnapshot(value);
    } catch (err) { setError(err.message || 'Không đọc được file sao lưu.'); }
  }
  async function restoreBackup() {
    if (phrase !== 'KHOI PHUC') return;
    setBusy(true); setError('');
    try { await photoboothApi.restore(snapshot); window.location.reload(); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  }
  return <><div className="pb-backup-actions"><button onClick={exportBackup}><Download size={14} /> Xuất sao lưu JSON</button><button onClick={() => input.current?.click()}>Khôi phục dữ liệu</button><input ref={input} type="file" accept=".json,application/json" hidden onChange={selectFile} /></div>{error && <div className="pb-backup-error" role="alert">{error}</div>}
    {snapshot && <div className="pb-modal-backdrop"><div className="pb-modal pb-restore-modal" role="dialog" aria-modal="true" aria-label="Xác nhận khôi phục Photobooth"><h2>Khôi phục dữ liệu Photobooth</h2><p>File ngày {new Date(snapshot.exported_at || Date.now()).toLocaleString('vi-VN')} có {snapshot.data.pb_transactions.length} đơn hàng và {(snapshot.data.pb_expenses || []).length} khoản chi.</p><div className="pb-notice">Dữ liệu Photobooth hiện có sẽ được thay bằng bản sao lưu này. {snapshot.version === 1 && 'Bản sao lưu cũ không có lịch sử tiền máy PTB; phần này sẽ được làm trống. '}{snapshot.version < 4 && 'Bản sao lưu cũ chưa có đăng ký ca; các đăng ký hiện tại sẽ được làm trống và giờ ca trở về mặc định. '}Dữ liệu thuê camera không bị tác động. Nếu file lỗi, hệ thống giữ nguyên dữ liệu hiện tại.</div><label>Nhập <strong>KHOI PHUC</strong> để xác nhận<input value={phrase} onChange={e => setPhrase(e.target.value)} autoFocus /></label>{error && <div className="pb-error">{error}</div>}<div className="pb-form-actions"><button onClick={() => { setSnapshot(null); setError(''); }}>Hủy</button><button className="pb-primary" onClick={restoreBackup} disabled={busy || phrase !== 'KHOI PHUC'}>{busy ? 'Đang khôi phục...' : 'Khôi phục Photobooth'}</button></div></div></div>}
  </>;
}

function CellTable({ headers, rows }) {
  return <div className="pb-table-wrap"><table className="pb-table"><thead><tr>{headers.map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="pb-muted">Chưa có dữ liệu</td></tr>}</tbody></table></div>;
}

export function CashPanel({ date, data, staff, refresh, setError, readOnly = false }) {
  const [move, setMove] = useState({ type: 'opening', amount: '', staff_id: '', note: '' });
  const [close, setClose] = useState({ actual_amount: '', staff_id: '', note: '' });
  const [busy, setBusy] = useState(false);
  const s = data?.summary || {};
  async function submitMove(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await photoboothApi.createCashMovement({ ...move, movement_date: date }); setMove({ type: 'opening', amount: '', staff_id: '', note: '' }); await refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function submitClose(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await photoboothApi.closeCash({ ...close, close_date: date }); setClose({ actual_amount: '', staff_id: '', note: '' }); await refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm('Hủy bút toán quỹ này? Lịch sử vẫn được lưu.')) return;
    try { await photoboothApi.voidCashMovement(id); await refresh(); } catch (error) { setError(errorText(error)); }
  }
  return <>
    <div className="pb-notice">Tiền chuyển khoản không vào két. Đổi mệnh giá chỉ ghi lịch sử, không tăng hoặc giảm tổng tiền mặt. Thu/chi quỹ không tính là doanh thu bán hàng.</div>
    <div className="pb-stat-grid pb-finance-stats">{[['Tiền đầu ca/ngày', s.opening], ['Tiền mặt từ đơn (+/−)', s.salesCash], ['Thu/chi quỹ khác', s.otherMoves], ['Lấy từ máy PTB', s.machineCollected], ['Dự kiến trong két', s.expected]].map(([label, value]) => <div className="pb-stat" key={label}><small>{label}</small><strong>{money(value)}</strong></div>)}</div>
    <div className="pb-notice">Tiền quầy dự kiến = đầu ca + tiền mặt từ đơn (gồm khoản đổi tiền vào máy) + thu/chi quỹ + tiền lấy từ máy đưa về quầy.</div>
    <div className="pb-grid-two"><section className="pb-card"><h3>Ghi nhận thu / chi / đổi tiền</h3><form className="pb-inline-form" onSubmit={submitMove}><label>Loại giao dịch<select value={move.type} onChange={e => setMove({ ...move, type: e.target.value })}>{Object.entries(movement).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Số tiền (₫)<input type="number" min="0" step="1" required value={move.amount} onChange={e => setMove({ ...move, amount: e.target.value })} /></label><label>Nhân viên<select value={move.staff_id} onChange={e => setMove({ ...move, staff_id: e.target.value })}><option value="">Không chọn</option>{staff.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="pb-wide">Ghi chú<input value={move.note} onChange={e => setMove({ ...move, note: e.target.value })} placeholder="Ví dụ: đổi 500.000đ thành tiền lẻ" /></label><button className="pb-primary pb-wide" disabled={busy}><Plus size={15} /> Lưu giao dịch quỹ</button></form></section>
      <section className="pb-card"><h3>Chốt quỹ cuối ngày</h3><form className="pb-inline-form" onSubmit={submitClose}><label>Tiền đếm thực tế (₫)<input type="number" min="0" step="1" required value={close.actual_amount} onChange={e => setClose({ ...close, actual_amount: e.target.value })} /></label><label>Người chốt<select value={close.staff_id} onChange={e => setClose({ ...close, staff_id: e.target.value })}><option value="">Không chọn</option>{staff.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label className="pb-wide">Ghi chú chênh lệch<input value={close.note} onChange={e => setClose({ ...close, note: e.target.value })} /></label><div className="pb-wide pb-form-total">Dự kiến trong két <strong>{money(s.expected)}</strong></div><button className="pb-primary pb-wide" disabled={busy}>Lưu chốt quỹ</button></form></section></div>
    <div className="pb-grid-two"><section className="pb-card"><h3>Lịch sử giao dịch quỹ</h3><CellTable headers={['Loại', 'Số tiền', 'Nhân viên', 'Ghi chú', '']} rows={(data?.movements || []).map(item => [movement[item.type], money(item.amount), item.staff_name || '—', item.note || '—', <button className="pb-link-danger" onClick={() => remove(item.id)} aria-label="Hủy bút toán"><Trash2 size={15} /></button>])} /></section><section className="pb-card"><h3>Lịch sử chốt quỹ</h3><CellTable headers={['Thời điểm', 'Dự kiến', 'Thực tế', 'Chênh lệch']} rows={(data?.closures || []).map(item => [new Date(item.created_at).toLocaleString('vi-VN'), money(item.expected_amount), money(item.actual_amount), <strong className={Number(item.difference_amount) < 0 ? 'pb-alert-text' : ''}>{money(item.difference_amount)}</strong>])} /></section></div>
  </>;
}

export function PtbPanel({ date, from = date, to = date, data, staff, refresh, setError, readOnly = false }) {
  const [move, setMove] = useState({ type: 'opening', destination: 'counter', amount: '', staff_id: '', shift_label: '', note: '' });
  const [count, setCount] = useState({ actual_amount: '', staff_id: '', note: '' });
  const [busy, setBusy] = useState(false);
  const machine = data?.machine || {};
  const counter = data?.counter || {};
  const isRange = from !== to;
  const sources = data?.sources || {};
  const rows = Object.entries(sourceModes).map(([key, label]) => {
    const item = sources[key] || {};
    return [label, item.orders || 0, money(item.revenue), money(item.counter_change), money(key === 'counter' ? 0 : item.revenue), money(item.transfer)];
  });
  async function submitMove(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await photoboothApi.createMachineMovement({ ...move, movement_date: date }); setMove({ ...move, amount: '', note: '' }); await refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function submitCount(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await photoboothApi.countMachineCash({ ...count, count_date: date }); setCount({ ...count, actual_amount: '', note: '' }); await refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function removeMove(id) {
    if (!window.confirm('Hủy giao dịch tiền máy PTB này? Báo cáo sẽ tính lại và lịch sử vẫn được lưu.')) return;
    try { await photoboothApi.voidMachineMovement(id); await refresh(); }
    catch (error) { setError(errorText(error)); }
  }
  function exportReport() {
    downloadCsv(`Insphoto_doi_soat_PTB_${from}_${to}.csv`, [
      ['ĐỐI SOÁT MÁY PTB VÀ QUẦY', isRange ? `${from} đến ${to}` : date], ['Doanh thu PTB', Number(sources.machine_self?.revenue || 0) + Number(sources.machine_exchange?.revenue || 0)], ['Doanh thu bán hàng', Number(sources.counter?.revenue || 0) + Number(sources.other_bank?.revenue || 0)], ['Tổng doanh thu', data?.totals?.revenue || 0], ['Chuyển khoản từ đơn', data?.totals?.transfer || 0], [isRange ? 'Biến động tiền máy trong kỳ' : 'Dự kiến trong máy', isRange ? machine.netChange || 0 : machine.expected || 0], [isRange ? 'Biến động tiền quầy trong kỳ' : `Dự kiến tại quầy${counter.balanceShift ? ` · ${counter.balanceShift}` : ''}`, isRange ? counter.netChange || 0 : counter.balance ?? counter.expected ?? 0], [],
      ['Nguồn thu', 'Số đơn', 'Doanh thu', 'Biến động quầy', 'Tiền vào máy', 'Chuyển khoản'], ...Object.entries(sourceModes).map(([key, label]) => { const item = sources[key] || {}; return [label, item.orders || 0, item.revenue || 0, item.counter_change || 0, ['machine_self', 'machine_exchange'].includes(key) ? item.revenue || 0 : 0, item.transfer || 0]; }), [],
      ['Ngày', 'Loại giao dịch máy', 'Số tiền', 'Đích đến', 'Ca', 'Nhân viên', 'Ghi chú'], ...(data?.movements || []).map(item => [day(item.movement_date), item.type === 'opening' ? 'Đầu ngày' : 'Lấy tiền máy', item.amount, item.destination === 'counter' ? 'Quầy' : item.destination === 'bank' ? 'Ngân hàng' : '', item.shift_label, item.staff_name, item.note])
    ]);
  }
  return <>
    <div className="pb-notice">Doanh thu PTB và doanh thu bán thêm được ghi nhận một lần khi tạo đơn. Lấy tiền từ máy hoặc đổi tiền chỉ làm thay đổi nơi giữ tiền, không cộng doanh thu lần hai.</div>
    <div className="pb-actions pb-no-print"><button className="pb-secondary" onClick={exportReport}><Download size={15} /> Xuất đối soát CSV</button></div>
    <div className="pb-stat-grid">{[['Doanh thu PTB', Number(sources.machine_self?.revenue || 0) + Number(sources.machine_exchange?.revenue || 0)], ['Doanh thu bán hàng', Number(sources.counter?.revenue || 0) + Number(sources.other_bank?.revenue || 0)], ['Chuyển khoản từ đơn', data?.totals?.transfer], ['Tổng doanh thu', data?.totals?.revenue]].map(([label, value]) => <div className="pb-stat" key={label}><small>{label}</small><strong>{money(value)}</strong></div>)}</div>
    <div className="pb-grid-two"><section className="pb-card"><h3>{isRange ? 'Biến động tiền trong máy' : 'Tiền trong máy PTB'}</h3><div className="pb-reconcile-total">{money(isRange ? machine.netChange : machine.expected)}</div><p className="pb-muted">{isRange ? '' : `Đầu ngày ${money(machine.opening)} + `}khách nạp {money(machine.incoming)} − đã lấy {money(machine.collected)}</p><p className="pb-muted">Đã chuyển về quầy {money(machine.collectedToCounter)} · Nộp ngân hàng {money(machine.collectedToBank)}</p></section><section className="pb-card"><h3>{isRange ? 'Biến động tiền tại quầy' : counter.balanceShift ? `Tiền quầy ${counter.balanceShift}` : 'Tiền mặt tại quầy'}</h3><div className="pb-reconcile-total">{money(isRange ? counter.netChange : counter.balance ?? counter.expected)}</div><p className="pb-muted">{counter.balanceShift && !isRange ? 'Các ca khác và bản ghi chưa phân ca được theo dõi riêng. ' : isRange ? '' : `Đầu ngày ${money(counter.opening)} + `}{!counter.balanceShift || isRange ? `tiền từ đơn ${money(counter.salesCash)} + thu/chi ${money(counter.otherMoves)} + lấy từ máy ${money(counter.machineCollected)}` : ''}</p></section></div>
    {isRange && <div className="pb-notice">Khoảng {day(from)} đến {day(to)} hiển thị tổng giao dịch và biến động tiền trong kỳ. Số dư đầu ngày chỉ áp dụng khi chọn một ngày.</div>}
    {!isRange && !readOnly && <div className="pb-grid-two"><section className="pb-card"><h3>Tiền đầu ngày / lấy tiền máy</h3><form className="pb-inline-form" onSubmit={submitMove}><label>Loại giao dịch<select value={move.type} onChange={e => setMove({ ...move, type: e.target.value })}><option value="opening">Tiền đầu ngày trong máy</option><option value="collect">Lấy tiền ra khỏi máy</option></select></label><label>Số tiền (₫)<input type="number" min="1" step="1" required value={move.amount} onChange={e => setMove({ ...move, amount: e.target.value })} /></label>{move.type === 'collect' && <label>Tiền chuyển đến<select value={move.destination} onChange={e => setMove({ ...move, destination: e.target.value })}><option value="counter">Quỹ tiền mặt tại quầy</option><option value="bank">Ngân hàng</option></select></label>}{move.type === 'collect' && move.destination === 'counter' && <label>Ca nhận tiền<select required value={move.shift_label} onChange={e => setMove({ ...move, shift_label: e.target.value })}><option value="">Chọn ca</option>{['Ca sáng', 'Ca chiều', 'Ca tối', 'Ca khác', 'Khác'].map(label => <option key={label}>{label}</option>)}</select></label>}<label>Nhân viên<select value={move.staff_id} onChange={e => setMove({ ...move, staff_id: e.target.value })}><option value="">Không chọn</option>{staff.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="pb-wide">Ghi chú<input value={move.note} onChange={e => setMove({ ...move, note: e.target.value })} placeholder="Ví dụ: lấy tiền máy cuối ca" /></label><button className="pb-primary pb-wide" disabled={busy}><Plus size={15} /> Ghi nhận</button></form></section>
      <section className="pb-card"><h3>Kiểm đếm tiền trong máy</h3><form className="pb-inline-form" onSubmit={submitCount}><label>Tiền đếm thực tế (₫)<input type="number" min="0" step="1" required value={count.actual_amount} onChange={e => setCount({ ...count, actual_amount: e.target.value })} /></label><label>Người kiểm đếm<select value={count.staff_id} onChange={e => setCount({ ...count, staff_id: e.target.value })}><option value="">Không chọn</option>{staff.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="pb-wide">Ghi chú chênh lệch<input value={count.note} onChange={e => setCount({ ...count, note: e.target.value })} /></label><div className="pb-wide pb-form-total">Dự kiến trong máy <strong>{money(machine.expected)}</strong></div><button className="pb-primary pb-wide" disabled={busy}>Lưu kiểm đếm</button></form></section></div>}
    <section className="pb-card"><h3>Doanh thu và dòng tiền theo nguồn</h3><CellTable headers={['Nguồn thu', 'Số đơn', 'Doanh thu', 'Quầy +/−', 'Máy +', 'Chuyển khoản']} rows={rows} /></section>
    <div className="pb-grid-two"><section className="pb-card"><h3>Lịch sử tiền máy</h3><CellTable headers={['Ngày', 'Loại', 'Số tiền', 'Đích đến', 'Ca nhận', 'Nhân viên', 'Ghi chú', '']} rows={(data?.movements || []).map(item => [day(item.movement_date), item.type === 'opening' ? 'Đầu ngày' : 'Lấy tiền máy', money(item.amount), item.destination === 'counter' ? 'Quầy' : item.destination === 'bank' ? 'Ngân hàng' : '—', item.shift_label || '—', item.staff_name || '—', item.note || '—', readOnly ? '—' : <button className="pb-link-danger pb-no-print" onClick={() => removeMove(item.id)} aria-label="Hủy giao dịch tiền máy"><Trash2 size={15} /></button>])} /></section><section className="pb-card"><h3>Lịch sử kiểm đếm</h3><CellTable headers={['Ngày', 'Thời điểm', 'Dự kiến', 'Thực tế', 'Chênh lệch']} rows={(data?.counts || []).map(item => [day(item.count_date), new Date(item.created_at).toLocaleString('vi-VN'), money(item.expected_amount), money(item.actual_amount), <strong className={Number(item.difference_amount) < 0 ? 'pb-alert-text' : ''}>{money(item.difference_amount)}</strong>])} /></section></div>
  </>;
}

export function CustomersPanel({ customers }) {
  const consented = customers.filter(item => item.marketing_consent);
  return <><div className="pb-notice">Chỉ xuất số điện thoại để marketing khi khách đã đồng ý lúc tạo đơn. Danh sách này lấy từ đơn Photobooth, không dùng dữ liệu khách thuê camera.</div><div className="pb-actions"><button className="pb-primary" onClick={() => downloadCsv('Insphoto_khach_dong_y_MKT.csv', [['Tên khách', 'Số điện thoại'], ...consented.map(item => [item.name, item.phone])])}><Download size={15} /> Xuất {consented.length} khách đồng ý MKT</button></div><section className="pb-card"><CellTable headers={['Khách hàng', 'Số điện thoại', 'Số đơn', 'Đơn gần nhất', 'Nhận MKT']} rows={customers.map(item => [item.name || 'Khách lẻ', item.phone, item.orders, day(item.last_order_date), item.marketing_consent ? 'Đã đồng ý' : 'Chưa đồng ý'])} /></section></>;
}

export function OrderForm({ form, setForm, services, staff, gifts, busy, onSave, onCancel, resetLabel = 'Hủy' }) {
  const sourceMode = form.source_mode || 'counter';
  const selected = services.find(item => String(item.id) === String(form.service_id));
  const subtotal = Number(form.unit_price || 0) * Number(form.quantity || 0);
  const total = Math.max(0, subtotal - Number(form.discount_amount || 0));
  const cash = Number(form.cash_received || 0);
  const transfer = Number(form.transfer_received || 0);
  const change = sourceMode === 'counter' ? Math.max(0, cash + transfer - total) : 0;
  const missing = sourceMode === 'counter' ? Math.max(0, total - cash - transfer) : 0;
  const cashInDrawer = sourceMode === 'machine_exchange' ? -total : ['machine_self', 'other_bank'].includes(sourceMode) ? 0 : cash - change;
  const invalidTransfer = sourceMode === 'counter' && transfer > total;
  const activeGifts = gifts.filter(item => item.active);
  const selectedGift = activeGifts.find(item => String(item.id) === String(form.gift_id));
  const giftInvalid = Boolean(form.gift_id) && (!selectedGift || Number(form.gift_quantity) < 1 || !Number.isInteger(Number(form.gift_quantity)) || Number(form.gift_quantity) > Number(selectedGift.quantity));
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <form className="pb-inline-form pb-order-form" onSubmit={onSave}>
    <div className="pb-wide pb-notice"><strong>Chọn nguồn thu trước khi lưu.</strong> Tiền khách đưa vào máy PTB được theo dõi riêng với tiền tại quầy. Nguồn “Khác” ghi nhận khách chuyển thẳng về STK. Mỗi đơn chỉ ghi doanh thu một lần.</div>
    <label>Ngày đơn hàng *<input type="date" required value={form.sale_date || ''} onChange={e => update('sale_date', e.target.value)} /></label>
    <label>Khách hàng<input value={form.customer_name || ''} onChange={e => update('customer_name', e.target.value)} placeholder="Khách lẻ" /></label>
    <label>Số điện thoại<input type="tel" value={form.customer_phone || ''} onChange={e => update('customer_phone', e.target.value)} placeholder="09xxxxxxxx" /></label>
    <label className="pb-wide">Nguồn thu / quy trình thanh toán<select value={sourceMode} onChange={e => setForm(current => ({ ...current, source_mode: e.target.value, cash_received: 0, transfer_received: 0 }))}>{Object.entries(sourceModes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Dịch vụ / nội dung bán hàng *<select required={sourceMode !== 'other_bank'} value={form.service_id || ''} onChange={e => { const item = services.find(x => String(x.id) === e.target.value); setForm(current => ({ ...current, service_id: e.target.value, unit_price: moneyInput(item?.price) })); }}><option value="">{sourceMode === 'other_bank' ? 'Tự nhập nội dung bán hàng' : 'Chọn dịch vụ'}</option>{services.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    {sourceMode === 'other_bank' && !form.service_id && <label className="pb-wide">Nội dung bán hàng *<input required maxLength={160} value={form.service_name || ''} onChange={e => update('service_name', e.target.value)} placeholder="Ví dụ: dịch vụ xử lý bằng máy, bán sản phẩm khác…" /></label>}
    {sourceMode === 'other_bank' && <div className="pb-wide pb-notice">Nhập doanh thu bán hàng đã được khách chuyển thẳng về STK. Hệ thống ghi nhận toàn bộ thành tiền là chuyển khoản, tiền mặt tại quầy và trong máy không thay đổi. Có thể chọn dịch vụ có sẵn hoặc tự nhập nội dung.</div>}
    <label>Số lượng *<input type="number" min="1" step="1" required value={form.quantity} onChange={e => update('quantity', e.target.value)} /></label>
    <label>Đơn giá (₫) *<input type="number" min="0" step="1" required value={moneyInput(form.unit_price)} onChange={e => update('unit_price', e.target.value)} placeholder={selected ? moneyInput(selected.price) : ''} /></label>
    <label>Giảm giá (₫)<input type="number" min="0" step="1" value={form.discount_amount} onChange={e => update('discount_amount', e.target.value)} /></label>
    {sourceMode === 'counter' && <><label>Tiền mặt khách đưa (₫)<input type="number" min="0" step="1" value={form.cash_received} onChange={e => update('cash_received', e.target.value)} /></label><label>Khách chuyển khoản (₫)<input type="number" min="0" step="1" value={form.transfer_received} onChange={e => update('transfer_received', e.target.value)} /></label></>}
    <label>Nhân viên phụ trách *<select required value={form.staff_id || ''} onChange={e => update('staff_id', e.target.value)}><option value="">Chọn nhân viên</option>{staff.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Ca làm<select value={form.shift_label || ''} onChange={e => update('shift_label', e.target.value)}><option>Ca sáng</option><option>Ca chiều</option><option>Ca tối</option><option value="Ca khác">Ca khác</option></select></label>
    <label>Số khách<input type="number" min="0" step="1" value={form.customer_count} onChange={e => update('customer_count', e.target.value)} /></label>
    <label>Quà tặng<select value={form.gift_id || ''} onChange={e => setForm(current => ({ ...current, gift_id: e.target.value, gift_quantity: e.target.value ? 1 : 0 }))}><option value="">Không tặng</option>{activeGifts.map(item => <option value={item.id} key={item.id} disabled={Number(item.quantity) <= 0}>{item.name} · {Number(item.quantity) > 0 ? `còn ${item.quantity}` : 'Hết hàng — cần nhập kho'}</option>)}</select></label>
    <label>Số quà<input type="number" min={form.gift_id ? 1 : 0} max={selectedGift ? Number(selectedGift.quantity) : 0} step="1" required={Boolean(form.gift_id)} disabled={!form.gift_id} value={form.gift_id ? form.gift_quantity : 0} onChange={e => update('gift_quantity', e.target.value)} /></label>
    {(!activeGifts.length || activeGifts.some(item => Number(item.quantity) <= 0)) && <div className="pb-wide pb-notice">{!activeGifts.length ? 'Chưa có quà tặng đang sử dụng.' : activeGifts.every(item => Number(item.quantity) <= 0) ? 'Các quà tặng hiện đều hết hàng (tồn kho bằng 0), nên chưa thể chọn để tặng khách.' : 'Quà hết hàng vẫn hiển thị trong danh sách và chưa thể chọn.'} <Link to="/photobooth/gifts" className="pb-gift-stock-link">Mở kho quà tặng</Link> → chọn <strong>Nhập / xuất</strong> để nhập số lượng thực tế.</div>}
    {giftInvalid && <div className="pb-wide pb-error" role="alert">Quà không còn khả dụng hoặc số lượng tặng vượt tồn kho. Vui lòng kiểm tra lại.</div>}
    <label>Nguồn khách<select value={form.customer_source || ''} onChange={e => update('customer_source', e.target.value)}><option value="walk_in">Khách vãng lai</option><option value="social">Mạng xã hội</option><option value="referral">Giới thiệu</option><option value="other">Khác</option></select></label>
    <label className="pb-wide">Ghi chú đơn hàng<input maxLength={1000} value={form.note || ''} onChange={e => update('note', e.target.value)} placeholder="Ví dụ: xử lý bằng máy, nội dung chuyển khoản / mã giao dịch…" /></label>
    <label className="pb-check pb-wide"><input type="checkbox" checked={Boolean(form.marketing_consent)} onChange={e => update('marketing_consent', e.target.checked)} /> Khách đồng ý nhận thông tin ưu đãi / marketing</label>
    <div className="pb-wide pb-order-calc"><strong>Doanh thu ghi nhận một lần: {money(total)}</strong>{sourceMode === 'counter' ? <><span>Tiền thối khách: {money(change)} · Còn thiếu: {money(missing)}</span><span>Tiền mặt thực vào quầy: {money(cashInDrawer)}</span></> : sourceMode === 'machine_self' ? <span>Khách tự bỏ {money(total)} vào máy · Quầy: {money(0)} · Máy: +{money(total)}</span> : sourceMode === 'other_bank' ? <span>Doanh thu bán hàng: +{money(total)} · Chuyển thẳng về STK: +{money(total)} · Quầy: {money(0)} · Tiền trong máy: {money(0)}</span> : <span>Khách chuyển khoản {money(total)}; thu ngân đưa tiền mặt vào máy · Quầy: {money(cashInDrawer)} · Máy: +{money(total)} · Ngân hàng: +{money(total)}</span>}{invalidTransfer && <span className="pb-alert-text">Tiền chuyển khoản không được vượt thành tiền.</span>}</div>
    <div className="pb-form-actions pb-wide"><button type="button" onClick={onCancel}>{resetLabel}</button><button className="pb-primary" disabled={busy || giftInvalid || total <= 0 || missing > 0 || invalidTransfer || Number(form.discount_amount) > subtotal}>{busy ? 'Đang lưu...' : 'Lưu đơn hàng'}</button></div>
  </form>;
}

export function ReportsPanel({ from, to, setFrom, setTo, report, orders }) {
  const daily = report?.daily || [];
  const revenue = daily.reduce((sum, item) => sum + Number(item.revenue), 0);
  const count = daily.reduce((sum, item) => sum + Number(item.transactions), 0);
  const cash = daily.reduce((sum, item) => sum + Number(item.cash), 0);
  const transfer = daily.reduce((sum, item) => sum + Number(item.transfer), 0);
  function exportOrders() {
    downloadCsv(`Insphoto_don_hang_${from}_${to}.csv`, [['Ngày', 'Nguồn thu', 'Khách hàng', 'SĐT', 'Dịch vụ', 'SL', 'Đơn giá', 'Giảm giá', 'Doanh thu', 'Quầy +/−', 'Máy +', 'Chuyển khoản', 'Nhân viên', 'Đồng ý MKT', 'Trạng thái'], ...orders.map(item => [day(item.sale_date), sourceModes[item.source_mode] || sourceModes.counter, item.customer_name, item.customer_phone, item.service_name, item.quantity, item.unit_price, item.discount_amount, item.total_amount, item.cash_in_drawer, item.source_mode === 'machine_self' || item.source_mode === 'machine_exchange' ? item.total_amount : 0, item.transfer_received, item.staff_name, item.marketing_consent ? 'Có' : 'Không', item.status === 'voided' ? 'Đã hủy' : 'Hoàn tất'])]);
  }
  return <><div className="pb-report-filter pb-no-print"><label>Từ ngày <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Đến ngày <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label><button className="pb-secondary" onClick={exportOrders}><Download size={15} /> Xuất đơn CSV</button><button className="pb-secondary" onClick={() => window.print()}><Printer size={15} /> In báo cáo</button></div>
    <div className="pb-stat-grid">{[['Doanh thu', revenue], ['Số đơn', count], ['Biến động tiền quầy', cash], ['Chuyển khoản', transfer]].map(([label, value], i) => <div className="pb-stat" key={label}><small>{label}</small><strong>{i === 1 ? value : money(value)}</strong></div>)}</div>
    <section className="pb-card"><h3>Doanh thu theo ngày</h3><CellTable headers={['Ngày', 'Số đơn', 'Doanh thu', 'Quầy +/−', 'Chuyển khoản']} rows={daily.map(item => [day(item.day), item.transactions, money(item.revenue), money(item.cash), money(item.transfer)])} /></section>
    <section className="pb-card"><h3>Doanh thu theo nguồn thu</h3><CellTable headers={['Nguồn thu', 'Số đơn', 'Doanh thu', 'Quầy +/−', 'Chuyển khoản']} rows={(report?.sources || []).map(item => [sourceModes[item.source_mode] || sourceModes.counter, item.transactions, money(item.revenue), money(item.counter_change), money(item.transfer)])} /></section>
    <div className="pb-grid-two"><section className="pb-card"><h3>Doanh thu theo dịch vụ</h3><CellTable headers={['Dịch vụ', 'Số lượng', 'Doanh thu']} rows={(report?.services || []).map(item => [item.service_name, item.quantity, money(item.revenue)])} /></section><section className="pb-card"><h3>Loại thanh toán</h3><CellTable headers={['Phương thức', 'Số đơn', 'Doanh thu']} rows={(report?.payments || []).map(item => [({ cash: 'Tiền mặt', transfer: 'Chuyển khoản', mixed: 'Tiền mặt + CK', card: 'Thẻ' })[item.payment_method] || item.payment_method, item.transactions, money(item.revenue)])} /></section></div>
  </>;
}

export function FinancePanel({ month, data, expenses, staff, refresh, setError, readOnly = false }) {
  const [form, setForm] = useState({ expense_date: `${month}-01`, category: 'other', staff_id: '', amount: '', note: '', payment_method: 'transfer', recorded_by: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(current => ({ ...current, expense_date: `${month}-01` })); }, [month]);
  const t = data?.totals || {};
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await photoboothApi.createExpense(form); setForm({ ...form, amount: '', note: '' }); await refresh(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm('Hủy khoản chi này? Báo cáo sẽ tính lại và lịch sử vẫn được lưu.')) return;
    try { await photoboothApi.voidExpense(id); await refresh(); } catch (error) { setError(errorText(error)); }
  }
  function exportFinance() {
    downloadCsv(`Insphoto_bao_cao_tai_chinh_${month}.csv`, [
      ['BÁO CÁO TÀI CHÍNH PHOTOBOOTH', month], ['Hạng mục', 'Số tiền'], ['Doanh thu', t.revenue], ['Chi phí phát sinh', t.other], ['Chi phí ADS', t.ads], ['Chi phí mặt bằng', t.rent], ['Lương nhân viên', t.salary], ['Tổng chi phí', t.expense], ['Lợi nhuận tạm tính', t.profit], [],
      ['Ngày', 'Doanh thu', 'Phát sinh', 'ADS', 'Mặt bằng', 'Lương nhân viên', 'Lợi nhuận'], ...(data?.daily || []).map(item => [day(item.day), item.revenue, item.other, item.ads, item.rent, item.salary, item.profit]), [],
      ['Ngày chi', 'Loại chi', 'Nhân viên', 'Nội dung', 'Thanh toán', 'Người ghi', 'Số tiền'], ...expenses.map(item => [day(item.expense_date), category[item.category], item.staff_name, item.note, item.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản', item.recorded_by, item.amount])
    ]);
  }
  return <><div className="pb-actions pb-no-print"><button className="pb-secondary" onClick={exportFinance}><Download size={15} /> Xuất CSV</button><button className="pb-secondary" onClick={() => window.print()}><Printer size={15} /> In báo cáo</button></div>
    <div className="pb-stat-grid pb-finance-stats">{[['Doanh thu', t.revenue], ['Lương nhân viên', t.salary], ['Tổng chi phí', t.expense], ['Lợi nhuận tạm tính', t.profit], ['Biên lợi nhuận', `${Number(t.margin || 0).toFixed(1)}%`]].map(([label, value], i) => <div className="pb-stat" key={label}><small>{label}</small><strong className={i === 3 && Number(t.profit) < 0 ? 'pb-alert-text' : ''}>{i === 4 ? value : money(value)}</strong></div>)}</div>
    <div className="pb-grid-two"><section className="pb-card"><h3>Thêm khoản chi</h3><form className="pb-inline-form" onSubmit={submit}><label>Ngày chi<input type="date" required value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></label><label>Loại chi phí<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, staff_id: '' })}>{Object.entries(category).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{form.category === 'salary' && <label>Nhân viên Photobooth<select required value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}><option value="">Chọn nhân viên</option>{staff.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' · Nghỉ việc'}</option>)}</select></label>}<label>Số tiền (₫)<input type="number" min="1" step="1" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label><label className="pb-wide">Nội dung chi<input required value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder={form.category === 'salary' ? `Ví dụ: Lương tháng ${month}` : 'Ví dụ: quảng cáo Facebook, thuê mặt bằng'} /></label><label>Thanh toán<select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}><option value="transfer">Chuyển khoản</option><option value="cash">Tiền mặt</option></select></label><label>Người ghi nhận<input value={form.recorded_by} onChange={e => setForm({ ...form, recorded_by: e.target.value })} /></label><button className="pb-primary pb-wide pb-no-print" disabled={busy}><Plus size={15} /> Lưu khoản chi</button></form><div className="pb-notice">Lương và các khoản chi làm giảm lợi nhuận theo ngày chi. Nếu chi tiền mặt tại quầy, hãy ghi thêm bút toán chi quỹ để đối soát két; bút toán quỹ không làm giảm lợi nhuận lần hai.</div></section>
      <section className="pb-card"><h3>Phân tích chi phí</h3>{Object.entries(category).map(([key, label]) => <div className="pb-expense-bar" key={key}><div><strong>{label}</strong><span>{money(t[key])}</span></div><div className="pb-bar"><i style={{ width: `${t.expense ? Number(t[key] || 0) / t.expense * 100 : 0}%` }} /></div></div>)}<div className="pb-formula">{money(t.revenue)} − {money(t.other)} − {money(t.ads)} − {money(t.rent)} − {money(t.salary)} = <strong>{money(t.profit)}</strong></div></section></div>
    <section className="pb-card"><h3>Báo cáo tài chính theo ngày</h3><CellTable headers={['Ngày', 'Doanh thu', 'Phát sinh', 'ADS', 'Mặt bằng', 'Lương nhân viên', 'Lợi nhuận']} rows={(data?.daily || []).map(item => [day(item.day), money(item.revenue), money(item.other), money(item.ads), money(item.rent), money(item.salary), <strong>{money(item.profit)}</strong>])} /></section>
    <section className="pb-card"><h3>Danh sách khoản chi</h3><CellTable headers={['Ngày', 'Loại chi phí', 'Nhân viên', 'Nội dung', 'Thanh toán', 'Người ghi', 'Số tiền', '']} rows={expenses.map(item => [day(item.expense_date), category[item.category], item.staff_name || '—', item.note, item.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản', item.recorded_by || '—', money(item.amount), <button className="pb-link-danger pb-no-print" onClick={() => remove(item.id)} aria-label="Hủy khoản chi"><Trash2 size={15} /></button>])} /></section>
  </>;
}
