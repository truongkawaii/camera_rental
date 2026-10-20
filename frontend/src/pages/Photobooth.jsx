import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, CheckCircle2, ClipboardList, CreditCard, Gift, LayoutDashboard, Package, Plus, Settings2, ShoppingBag, Sparkles, TrendingUp, Users, Wrench, X } from 'lucide-react';
import { photoboothApi } from '../api/client';
import './Photobooth.css';

const vnDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const dayLabel = (date) => date ? new Date(`${String(date).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
const categoryLabels = { shoot: 'Chụp ảnh', print: 'In ảnh', other: 'Khác' };
const paymentLabels = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ' };
const sourceLabels = { walk_in: 'Khách vãng lai', social: 'Mạng xã hội', referral: 'Giới thiệu', other: 'Khác' };
const statusLabels = { active: 'Đang hoạt động', maintenance: 'Bảo trì', offline: 'Ngừng hoạt động', scheduled: 'Đã xếp ca', working: 'Đang làm', done: 'Hoàn tất', open: 'Mới báo', in_progress: 'Đang xử lý', resolved: 'Đã xử lý' };
const tabs = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'transactions', label: 'Thu tiền khách', icon: CreditCard },
  { key: 'services', label: 'Bảng giá', icon: ShoppingBag },
  { key: 'gifts', label: 'Gấu bông · Quà tặng', icon: Gift },
  { key: 'assets', label: 'Thiết bị · Phụ kiện', icon: Camera },
  { key: 'incidents', label: 'Sự cố · Bảo trì', icon: Wrench },
  { key: 'staff', label: 'Nhân viên', icon: Users },
  { key: 'shifts', label: 'Ca làm việc', icon: CalendarDays },
  { key: 'tasks', label: 'Việc cần làm', icon: ClipboardList },
  { key: 'reports', label: 'Báo cáo doanh thu', icon: TrendingUp }
];
const configs = {
  services: { title: 'dịch vụ', columns: [['name', 'Dịch vụ'], ['category', 'Loại'], ['price', 'Đơn giá'], ['active', 'Trạng thái']], fields: [['name', 'Tên dịch vụ', 'text', true], ['category', 'Loại dịch vụ', 'select', true, categoryLabels], ['price', 'Đơn giá (₫)', 'number', true], ['active', 'Đang bán', 'checkbox']], defaults: { category: 'shoot', price: '', active: true } },
  gifts: { title: 'quà tặng', columns: [['name', 'Quà tặng'], ['sku', 'Mã'], ['quantity', 'Tồn kho'], ['low_stock_threshold', 'Báo sắp hết'], ['active', 'Trạng thái']], fields: [['name', 'Tên quà tặng', 'text', true], ['sku', 'Mã / SKU', 'text'], ['low_stock_threshold', 'Ngưỡng báo sắp hết', 'number'], ['active', 'Đang sử dụng', 'checkbox']], defaults: { low_stock_threshold: 5, active: true } },
  assets: { title: 'thiết bị', columns: [['name', 'Thiết bị'], ['code', 'Mã'], ['kind', 'Phân loại'], ['status', 'Trạng thái'], ['note', 'Ghi chú']], fields: [['name', 'Tên thiết bị', 'text', true], ['code', 'Mã thiết bị', 'text'], ['kind', 'Phân loại', 'text'], ['status', 'Trạng thái', 'select', true, { active: 'Đang hoạt động', maintenance: 'Bảo trì', offline: 'Ngừng hoạt động' }], ['note', 'Ghi chú', 'text']], defaults: { kind: 'Thiết bị', status: 'active' } },
  incidents: { title: 'sự cố', columns: [['reported_at', 'Báo lúc'], ['asset_name', 'Thiết bị'], ['title', 'Sự cố'], ['status', 'Trạng thái'], ['cost', 'Chi phí'], ['resolution', 'Kết quả']], fields: [['asset_id', 'Thiết bị', 'asset', true], ['title', 'Tên sự cố', 'text', true], ['description', 'Mô tả', 'text'], ['status', 'Trạng thái', 'select', true, { open: 'Mới báo', in_progress: 'Đang xử lý', resolved: 'Đã xử lý' }], ['cost', 'Chi phí (₫)', 'number'], ['resolution', 'Kết quả xử lý', 'text']], defaults: { status: 'open', cost: 0 } },
  staff: { title: 'nhân viên', columns: [['name', 'Nhân viên'], ['role', 'Vai trò'], ['phone', 'Số điện thoại'], ['active', 'Trạng thái']], fields: [['name', 'Họ tên', 'text', true], ['role', 'Vai trò', 'text'], ['phone', 'Số điện thoại', 'text'], ['active', 'Đang làm việc', 'checkbox']], defaults: { role: 'Nhân viên', active: true } },
  shifts: { title: 'ca làm', columns: [['work_date', 'Ngày'], ['staff_name', 'Nhân viên'], ['start_time', 'Bắt đầu'], ['end_time', 'Kết thúc'], ['status', 'Trạng thái']], fields: [['work_date', 'Ngày làm', 'date', true], ['staff_id', 'Nhân viên', 'staff', true], ['start_time', 'Giờ bắt đầu', 'time', true], ['end_time', 'Giờ kết thúc', 'time', true], ['status', 'Trạng thái', 'select', true, { scheduled: 'Đã xếp ca', working: 'Đang làm', done: 'Hoàn tất' }], ['note', 'Ghi chú', 'text']], defaults: { work_date: vnDate(), start_time: '09:00', end_time: '17:00', status: 'scheduled' } },
  tasks: { title: 'công việc', columns: [['work_date', 'Ngày'], ['title', 'Công việc'], ['staff_name', 'Phụ trách'], ['done', 'Trạng thái']], fields: [['work_date', 'Ngày', 'date', true], ['title', 'Nội dung công việc', 'text', true], ['staff_id', 'Người phụ trách', 'staff'], ['done', 'Đã hoàn thành', 'checkbox']], defaults: { work_date: vnDate(), done: false } }
};

const errorText = (error) => error?.response?.data?.error || 'Không thể tải hoặc lưu dữ liệu. Vui lòng thử lại.';

function Modal({ title, onClose, children }) {
  return <div className="pb-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="pb-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pb-modal-header"><div><p className="pb-eyebrow">PHOTOBOOTH WORKSPACE</p><h2>{title}</h2></div><button className="pb-icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
      {children}
    </div>
  </div>;
}

function Field({ field, value, onChange, staff = [], assets = [] }) {
  const [key, label, type, required, options] = field;
  if (type === 'checkbox') return <label className="pb-check"><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(key, event.target.checked)} /><span>{label}</span></label>;
  return <label className="pb-field"><span>{label}{required && ' *'}</span>
    {type === 'select' || type === 'staff' || type === 'asset' ? <select required={required} value={value ?? ''} onChange={event => onChange(key, event.target.value)}>
      <option value="">{required ? 'Chọn một mục' : 'Không chọn'}</option>
      {type === 'staff' ? staff.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>) : type === 'asset' ? assets.map(item => <option key={item.id} value={item.id}>{item.name}{item.code ? ` · ${item.code}` : ''}</option>) : Object.entries(options).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select> : <input required={required} type={type} min={type === 'number' && key !== 'delta' ? 0 : undefined} step={type === 'number' ? 1 : undefined} value={value ?? ''} onChange={event => onChange(key, event.target.value)} />}
  </label>;
}

function Empty({ title = 'Chưa có dữ liệu', detail = 'Thêm bản ghi đầu tiên để bắt đầu quản lý Photobooth.' }) {
  return <div className="pb-empty"><Sparkles size={26} /><strong>{title}</strong><span>{detail}</span></div>;
}

export default function Photobooth() {
  const location = useLocation();
  const tab = tabs.find(item => location.pathname === `/photobooth/${item.key}`)?.key || 'overview';
  const [date, setDate] = useState(vnDate());
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [assets, setAssets] = useState([]);
  const [services, setServices] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [report, setReport] = useState(null);
  const [reportFrom, setReportFrom] = useState(() => `${vnDate().slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(vnDate());
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (tab === 'overview') setData((await photoboothApi.overview(date)).data);
      else if (tab === 'reports') setReport((await photoboothApi.reports(reportFrom, reportTo)).data);
      else if (tab === 'transactions') {
        const [tx, svc, people, inventory] = await Promise.all([photoboothApi.transactions(date), photoboothApi.list('services'), photoboothApi.list('staff'), photoboothApi.list('gifts')]);
        setRows(tx.data); setServices(svc.data); setStaff(people.data); setGifts(inventory.data);
      } else {
        const requests = [photoboothApi.list(tab)];
        if (tab === 'shifts' || tab === 'tasks') requests.push(photoboothApi.list('staff'));
        if (tab === 'incidents') requests.push(photoboothApi.list('assets'));
        const results = await Promise.all(requests);
        setRows(results[0].data);
        if (results[1] && tab === 'incidents') setAssets(results[1].data);
        else if (results[1]) setStaff(results[1].data);
      }
    } catch (err) { setError(errorText(err)); } finally { setLoading(false); }
  }, [tab, date, reportFrom, reportTo]);
  useEffect(() => { refresh(); }, [refresh]);

  function openCreate() {
    setForm(tab === 'transactions' ? { service_id: '', quantity: 1, payment_method: 'cash', customer_count: 1, customer_source: 'walk_in', gift_id: '', gift_quantity: 0, staff_id: '' } : { ...configs[tab]?.defaults });
    setModal({ mode: 'create' });
  }
  function openEdit(row) { setForm({ ...row, work_date: row.work_date?.slice(0, 10), start_time: row.start_time?.slice(0, 5), end_time: row.end_time?.slice(0, 5) }); setModal({ mode: 'edit', id: row.id }); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (tab === 'transactions') await photoboothApi.createTransaction(form);
      else if (modal.mode === 'edit') await photoboothApi.update(tab, modal.id, form);
      else await photoboothApi.create(tab, form);
      setModal(null); await refresh();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function adjustGift(row) {
    const delta = Number(form.delta);
    if (!Number.isInteger(delta) || delta === 0) { setError('Nhập số nguyên khác 0 để điều chỉnh tồn kho.'); return; }
    setBusy(true); setError('');
    try { await photoboothApi.adjustGift(row.id, { delta, reason: form.reason }); setModal(null); await refresh(); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function toggleTask(row) {
    try { await photoboothApi.update('tasks', row.id, { done: !row.done }); await refresh(); }
    catch (err) { setError(errorText(err)); }
  }

  const dailyTotal = useMemo(() => (report?.daily || []).reduce((sum, item) => sum + Number(item.revenue), 0), [report]);
  const activeTitle = tabs.find(item => item.key === tab)?.label;
  return <div className="pb-page">
    <div className="pb-topline"><Link to="/" className="pb-back"><ArrowLeft size={15} /> Hệ thống SnapPro</Link><span>Không gian quản lý riêng</span></div>
    <div className="pb-hero"><div className="pb-brand-mark"><Camera size={27} /></div><div><p className="pb-eyebrow">PHOTOBOOTH WORKSPACE</p><h1>Photobooth</h1><p>Vận hành cửa hàng, doanh thu và trải nghiệm khách hàng trong một nơi.</p></div><div className="pb-hero-decor"><Sparkles size={46} /></div></div>
    <nav className="pb-tabs" aria-label="Quản lý Photobooth">{tabs.map(item => { const Icon = item.icon; return <Link key={item.key} to={item.key === 'overview' ? '/photobooth' : `/photobooth/${item.key}`} className={`pb-tab ${tab === item.key ? 'active' : ''}`}><Icon size={17} /><span>{item.label}</span></Link>; })}</nav>
    <div className="pb-content">
      <div className="pb-section-head"><div><p className="pb-eyebrow">{tab === 'overview' ? 'DỮ LIỆU THỰC TẾ' : 'QUẢN LÝ PHOTOBOOTH'}</p><h2>{tab === 'overview' ? 'Tổng quan vận hành' : activeTitle}</h2><p>{tab === 'overview' ? 'Theo dõi hoạt động cửa hàng theo ngày.' : tab === 'reports' ? 'Doanh thu được tổng hợp từ giao dịch Photobooth.' : 'Dữ liệu ở đây chỉ thuộc khu Photobooth.'}</p></div><div className="pb-actions">
        {['overview', 'transactions'].includes(tab) && <label className="pb-date"><CalendarDays size={16} /><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>}
        {!['overview', 'reports'].includes(tab) && <button className="pb-primary" onClick={openCreate}><Plus size={17} /> {tab === 'transactions' ? 'Thu tiền khách' : 'Thêm mới'}</button>}
      </div></div>
      {error && <div className="pb-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Đóng thông báo"><X size={15} /></button></div>}
      {loading ? <div className="pb-loading">Đang tải dữ liệu Photobooth...</div> : tab === 'overview' ? <>
        <div className="pb-stat-grid">
          {[['Doanh thu', money(data?.metrics?.revenue), CreditCard, 'pink'], ['Lượt khách', data?.metrics?.customers || 0, Users, 'purple'], ['Lượt chụp', data?.metrics?.shoots || 0, Camera, 'blue'], ['Quà đã tặng', data?.metrics?.gifts || 0, Gift, 'orange']].map(([label, value, Icon, tone]) => <div className="pb-stat" key={label}><span className={`pb-stat-icon ${tone}`}><Icon size={21} /></span><small>{label}</small><strong>{value}</strong><span className="pb-stat-note">Ngày {dayLabel(date)}</span></div>)}
        </div>
        <div className="pb-grid-two"><section className="pb-card"><div className="pb-card-head"><div><h3>Doanh thu 7 ngày</h3><p>Giao dịch đã ghi nhận</p></div><TrendingUp size={18} /></div><div className="pb-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={(data?.trend || []).map(item => ({ ...item, label: dayLabel(item.day) }))}><defs><linearGradient id="pbArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eb70a6" stopOpacity={0.28}/><stop offset="100%" stopColor="#eb70a6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#f4e9ee" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#9e8793', fontSize: 11 }} /><Tooltip formatter={value => money(value)} /><Area type="monotone" dataKey="revenue" stroke="#e85496" strokeWidth={3} fill="url(#pbArea)" /></AreaChart></ResponsiveContainer></div></section>
          <section className="pb-card"><div className="pb-card-head"><div><h3>Cơ cấu dịch vụ</h3><p>Doanh thu trong ngày</p></div><ShoppingBag size={18} /></div>{data?.mix?.length ? <div className="pb-mix"><div className="pb-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.mix} dataKey="revenue" innerRadius={55} outerRadius={78} paddingAngle={3}>{data.mix.map((_, i) => <Cell key={i} fill={['#e95c9b', '#8f77e8', '#f4b86e'][i % 3]} />)}</Pie><Tooltip formatter={value => money(value)} /></PieChart></ResponsiveContainer></div><div className="pb-mix-list">{data.mix.map((item, i) => <div key={item.category}><i style={{ background: ['#e95c9b', '#8f77e8', '#f4b86e'][i % 3] }} /><span>{categoryLabels[item.category] || item.category}</span><strong>{money(item.revenue)}</strong></div>)}</div></div> : <Empty title="Chưa có giao dịch" detail="Cơ cấu dịch vụ sẽ hiện khi cửa hàng ghi nhận giao dịch." />}</section></div>
        <div className="pb-grid-two"><section className="pb-card"><div className="pb-card-head"><div><h3>Giao dịch gần đây</h3><p>{data?.metrics?.transactions || 0} giao dịch trong ngày</p></div><Link to="/photobooth/transactions">Xem tất cả <ArrowRight size={14} /></Link></div>{data?.recent?.length ? <div className="pb-list">{data.recent.map(item => <div className="pb-list-row" key={item.id}><div className="pb-avatar"><Camera size={17} /></div><div><strong>{item.service_name}</strong><span>{new Date(item.happened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })} · {paymentLabels[item.payment_method]}</span></div><b>{money(item.total_amount)}</b></div>)}</div> : <Empty title="Chưa có giao dịch hôm nay" detail="Ghi nhận giao dịch đầu tiên tại mục Thu tiền khách." />}</section>
          <section className="pb-card"><div className="pb-card-head"><div><h3>Ca làm hôm nay</h3><p>Phân công nhân viên</p></div><Link to="/photobooth/shifts">Xem ca <ArrowRight size={14} /></Link></div>{data?.shifts?.length ? <div className="pb-list">{data.shifts.map(item => <div className="pb-list-row" key={item.id}><div className="pb-avatar purple"><Users size={17} /></div><div><strong>{item.staff_name}</strong><span>{item.start_time?.slice(0, 5)} – {item.end_time?.slice(0, 5)}</span></div><em className="pb-pill">{statusLabels[item.status]}</em></div>)}</div> : <Empty title="Chưa xếp ca" detail="Thêm nhân viên rồi tạo ca làm để theo dõi lịch trực." />}</section></div>
        <div className="pb-grid-three"><section className="pb-card"><div className="pb-card-head"><h3>Bảng giá</h3><Link to="/photobooth/services">Quản lý <ArrowRight size={14} /></Link></div>{data?.services?.length ? data.services.slice(0, 5).map(item => <div className="pb-mini-row" key={item.id}><span>{item.name}</span><b>{money(item.price)}</b></div>) : <Empty title="Chưa có dịch vụ" detail="Thiết lập giá trước khi thu tiền khách." />}</section><section className="pb-card"><div className="pb-card-head"><h3>Quà tặng</h3><Link to="/photobooth/gifts">Kho quà <ArrowRight size={14} /></Link></div>{data?.gifts?.length ? data.gifts.slice(0, 5).map(item => <div className="pb-mini-row" key={item.id}><span>{item.name}</span><b className={item.quantity <= item.low_stock_threshold ? 'pb-alert-text' : ''}>{item.quantity} còn</b></div>) : <Empty title="Kho quà trống" detail="Thêm quà tặng để theo dõi số lượng." />}</section><section className="pb-card"><div className="pb-card-head"><h3>Thiết bị</h3><Link to="/photobooth/assets">Quản lý <ArrowRight size={14} /></Link></div>{data?.assets?.length ? data.assets.slice(0, 5).map(item => <div className="pb-mini-row" key={item.id}><span>{item.name}</span><b className={item.status !== 'active' ? 'pb-alert-text' : ''}>{statusLabels[item.status]}</b></div>) : <Empty title="Chưa có thiết bị" detail="Theo dõi máy chụp, máy in và phụ kiện." />}</section></div>
        <div className="pb-grid-two"><section className="pb-card"><div className="pb-card-head"><div><h3>Việc cần làm</h3><p>Danh sách ngày {dayLabel(date)}</p></div><Link to="/photobooth/tasks">Quản lý <ArrowRight size={14} /></Link></div>{data?.tasks?.length ? <div className="pb-task-grid">{data.tasks.map(item => <div className="pb-task" key={item.id}><CheckCircle2 size={17} className={item.done ? 'pb-done' : ''} /><span className={item.done ? 'pb-strike' : ''}>{item.title}</span><small>{item.staff_name || 'Chưa giao'}</small></div>)}</div> : <Empty title="Không có việc cần làm" detail="Tạo công việc để chuẩn bị và bàn giao ca." />}</section><section className="pb-card"><div className="pb-card-head"><div><h3>Sự cố cần xử lý</h3><p>Thiết bị đang chờ theo dõi</p></div><Link to="/photobooth/incidents">Xem tất cả <ArrowRight size={14} /></Link></div>{data?.incidents?.length ? data.incidents.map(item => <div className="pb-mini-row" key={item.id}><span>{item.asset_name} · {item.title}</span><b className="pb-alert-text">{statusLabels[item.status]}</b></div>) : <Empty title="Không có sự cố mở" detail="Các phiếu bảo trì mới sẽ hiển thị tại đây." />}</section></div>
      </> : tab === 'reports' ? <><div className="pb-report-filter"><label>Từ ngày <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} /></label><label>Đến ngày <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} /></label></div><div className="pb-stat-grid pb-report-stats"><div className="pb-stat"><small>Tổng doanh thu</small><strong>{money(dailyTotal)}</strong></div><div className="pb-stat"><small>Giao dịch</small><strong>{(report?.daily || []).reduce((sum, item) => sum + Number(item.transactions), 0)}</strong></div><div className="pb-stat"><small>Lượt khách</small><strong>{(report?.daily || []).reduce((sum, item) => sum + Number(item.customers), 0)}</strong></div></div><div className="pb-grid-two"><section className="pb-card"><h3>Doanh thu theo ngày</h3><DataTable rows={report?.daily || []} columns={[["day", "Ngày"], ["transactions", "Giao dịch"], ["customers", "Lượt khách"], ["revenue", "Doanh thu"]]} /></section><section className="pb-card"><h3>Doanh thu theo dịch vụ</h3><DataTable rows={report?.services || []} columns={[["service_name", "Dịch vụ"], ["quantity", "Số lượng"], ["revenue", "Doanh thu"]]} /></section></div><section className="pb-card"><h3>Phương thức thanh toán</h3><DataTable rows={report?.payments || []} columns={[["payment_method", "Phương thức"], ["transactions", "Giao dịch"], ["revenue", "Doanh thu"]]} /></section></> : <section className="pb-card pb-table-card"><div className="pb-card-head"><div><h3>{tab === 'transactions' ? 'Giao dịch' : activeTitle}</h3><p>{rows.length} bản ghi {tab === 'transactions' ? `ngày ${dayLabel(date)}` : ''}</p></div></div>{tab === 'transactions' ? <DataTable rows={rows} columns={[["happened_at", "Thời gian"], ["service_name", "Dịch vụ"], ["quantity", "SL"], ["unit_price", "Đơn giá"], ["total_amount", "Thành tiền"], ["payment_method", "Thanh toán"], ["staff_name", "Nhân viên"], ["gift_name", "Quà tặng"]]} /> : <DataTable rows={rows} columns={configs[tab]?.columns || []} action={row => <div className="pb-row-actions">{tab === 'tasks' && <button onClick={() => toggleTask(row)}>{row.done ? 'Mở lại' : 'Hoàn tất'}</button>}{tab === 'gifts' && <button onClick={() => { setForm({ delta: '', reason: '' }); setModal({ mode: 'adjust', row }); }}>Nhập / xuất</button>}<button onClick={() => openEdit(row)}>Sửa</button></div>} />}</section>}
    </div>
    {modal && <Modal title={modal.mode === 'adjust' ? `Điều chỉnh tồn · ${modal.row.name}` : tab === 'transactions' ? 'Ghi nhận giao dịch' : `${modal.mode === 'edit' ? 'Sửa' : 'Thêm'} ${configs[tab]?.title || ''}`} onClose={() => { setModal(null); setError(''); }}>
      {error && <div className="pb-error" role="alert">{error}</div>}
      {modal.mode === 'adjust' ? <form className="pb-form" onSubmit={event => { event.preventDefault(); adjustGift(modal.row); }}><p>Hiện có <strong>{modal.row.quantity}</strong> phần. Nhập số dương để thêm, số âm để xuất.</p><Field field={['delta', 'Thay đổi số lượng', 'number', true]} value={form.delta} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['reason', 'Lý do', 'text']} value={form.reason} onChange={(key, value) => setForm({ ...form, [key]: value })} /><button className="pb-primary" disabled={busy}>Lưu tồn kho</button></form> : <form className="pb-form" onSubmit={save}>{tab === 'transactions' ? <><Field field={['service_id', 'Dịch vụ', 'select', true, Object.fromEntries(services.filter(item => item.active).map(item => [item.id, `${item.name} · ${money(item.price)}`]))]} value={form.service_id} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['quantity', 'Số lượng', 'number', true]} value={form.quantity} onChange={(key, value) => setForm({ ...form, [key]: value })} /><div className="pb-form-total">Thành tiền <strong>{money((services.find(item => String(item.id) === String(form.service_id))?.price || 0) * Number(form.quantity || 0))}</strong></div><Field field={['payment_method', 'Thanh toán', 'select', true, paymentLabels]} value={form.payment_method} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['customer_count', 'Số khách', 'number', true]} value={form.customer_count} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['customer_source', 'Nguồn khách', 'select', false, sourceLabels]} value={form.customer_source} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['staff_id', 'Nhân viên', 'staff']} staff={staff} value={form.staff_id} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['gift_id', 'Quà tặng', 'select', false, Object.fromEntries(gifts.filter(item => item.active && item.quantity > 0).map(item => [item.id, `${item.name} · còn ${item.quantity}`]))]} value={form.gift_id} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['gift_quantity', 'Số quà tặng', 'number']} value={form.gift_quantity} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['note', 'Ghi chú', 'text']} value={form.note} onChange={(key, value) => setForm({ ...form, [key]: value })} /></> : configs[tab]?.fields.map(field => <Field key={field[0]} field={field} staff={staff} assets={assets} value={form[field[0]]} onChange={(key, value) => setForm({ ...form, [key]: value })} />)}<div className="pb-form-actions"><button type="button" onClick={() => setModal(null)}>Hủy</button><button className="pb-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div></form>}
    </Modal>}
  </div>;
}

function DataTable({ rows, columns, action }) {
  if (!rows.length) return <Empty />;
  return <div className="pb-table-wrap"><table className="pb-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}{action && <th>Thao tác</th>}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id ?? i}>{columns.map(([key]) => <td key={key}>{formatCell(key, row[key], row)}</td>)}{action && <td>{action(row)}</td>}</tr>)}</tbody></table></div>;
}
function formatCell(key, value, row) {
  if (value == null || value === '') return <span className="pb-muted">—</span>;
  if (['price', 'unit_price', 'total_amount', 'revenue', 'cost'].includes(key)) return <strong>{money(value)}</strong>;
  if (['work_date', 'day'].includes(key)) return dayLabel(value);
  if (key === 'happened_at' || key === 'reported_at') return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  if (key === 'payment_method') return paymentLabels[value] || value;
  if (key === 'category') return categoryLabels[value] || value;
  if (key === 'active') return <span className={`pb-status ${value ? 'ok' : 'off'}`}>{value ? 'Đang dùng' : 'Ngừng'}</span>;
  if (key === 'done') return <span className={`pb-status ${value ? 'ok' : 'warning'}`}>{value ? 'Hoàn tất' : 'Cần làm'}</span>;
  if (key === 'status') return <span className={`pb-status ${value === 'active' || value === 'done' ? 'ok' : value === 'maintenance' ? 'warning' : 'off'}`}>{statusLabels[value] || value}</span>;
  if (key === 'quantity' && row.low_stock_threshold != null && value <= row.low_stock_threshold) return <strong className="pb-alert-text">{value} · Sắp hết</strong>;
  if (key === 'start_time' || key === 'end_time') return String(value).slice(0, 5);
  if (key === 'gift_name' && row.gift_quantity) return `${value} × ${row.gift_quantity}`;
  return String(value);
}
