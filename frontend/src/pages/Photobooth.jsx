import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, ArrowRight, CalendarDays, Camera, CreditCard, Gift, LayoutDashboard, Plus, ShoppingBag, Sparkles, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { photoboothApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BackupControls, CustomersPanel, FinancePanel, OrderForm, PtbPanel, ReportsPanel, sourceModes } from './PhotoboothOperations';
import AttendancePanel from './PhotoboothAttendance';
import SchedulePanel from './PhotoboothSchedule';
import CashShiftPanel from './PhotoboothCashShift';
import './Photobooth.css';

const vnDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const newOrder = date => ({ sale_date: date, customer_name: '', customer_phone: '', source_mode: 'machine_self', service_id: '', quantity: 1, unit_price: '', discount_amount: 0, cash_received: 0, transfer_received: 0, marketing_consent: false, shift_label: 'Ca sáng', customer_count: 1, customer_source: 'walk_in', gift_id: '', gift_quantity: 0, staff_id: '' });
const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const dayLabel = (date) => date ? new Date(`${String(date).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
const categoryLabels = { shoot: 'Chụp ảnh', print: 'In ảnh', other: 'Khác' };
const paymentLabels = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', mixed: 'Tiền mặt + CK' };
const statusLabels = { active: 'Đang hoạt động', maintenance: 'Bảo trì', offline: 'Ngừng hoạt động', scheduled: 'Đã xếp ca', working: 'Đang làm', done: 'Hoàn tất', cancelled: 'Đã hủy', open: 'Mới báo', in_progress: 'Đang xử lý', resolved: 'Đã xử lý' };
const tabs = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'transactions', label: 'Thu tiền khách', icon: CreditCard },
  { key: 'cash', label: 'Tiền tại quầy', icon: Wallet },
  { key: 'ptb', label: 'Đối soát máy PTB', icon: Camera },
  { key: 'customers', label: 'Khách hàng · MKT', icon: Users },
  { key: 'services', label: 'Bảng giá', icon: ShoppingBag },
  { key: 'gifts', label: 'Gấu bông · Quà tặng', icon: Gift },
  { key: 'staff', label: 'Nhân viên', icon: Users },
  { key: 'attendance', label: 'Chấm công', icon: CalendarDays },
  { key: 'shifts', label: 'Ca làm việc', icon: CalendarDays },
  { key: 'reports', label: 'Báo cáo doanh thu', icon: TrendingUp },
  { key: 'finance', label: 'Báo cáo tài chính', icon: TrendingUp }
];
const configs = {
  services: { title: 'dịch vụ', columns: [['name', 'Dịch vụ'], ['category', 'Loại'], ['price', 'Đơn giá'], ['active', 'Trạng thái']], fields: [['name', 'Tên dịch vụ', 'text', true], ['category', 'Loại dịch vụ', 'select', true, categoryLabels], ['price', 'Đơn giá (₫)', 'number', true], ['active', 'Đang bán', 'checkbox']], defaults: { category: 'shoot', price: '', active: true } },
  gifts: { title: 'quà tặng', columns: [['name', 'Quà tặng'], ['sku', 'Mã'], ['quantity', 'Tồn kho'], ['low_stock_threshold', 'Báo sắp hết'], ['active', 'Trạng thái']], fields: [['name', 'Tên quà tặng', 'text', true], ['sku', 'Mã / SKU', 'text'], ['low_stock_threshold', 'Ngưỡng báo sắp hết', 'number'], ['active', 'Đang sử dụng', 'checkbox']], defaults: { low_stock_threshold: 5, active: true } },
  staff: { title: 'nhân viên', columns: [['name', 'Nhân viên'], ['role', 'Vai trò'], ['phone', 'Số điện thoại'], ['active', 'Trạng thái']], fields: [['name', 'Họ tên', 'text', true], ['role', 'Vai trò', 'text'], ['phone', 'Số điện thoại', 'text'], ['active', 'Đang làm việc', 'checkbox']], defaults: { role: 'Nhân viên', active: true } },
  shifts: { title: 'ca làm', columns: [['work_date', 'Ngày'], ['staff_name', 'Nhân viên'], ['label', 'Ca'], ['start_time', 'Bắt đầu'], ['end_time', 'Kết thúc'], ['status', 'Trạng thái']], fields: [['work_date', 'Ngày làm', 'date', true], ['staff_id', 'Nhân viên', 'staff', true], ['label', 'Tên ca', 'select', true, { 'Ca sáng': 'Ca sáng', 'Ca chiều': 'Ca chiều', 'Ca tối': 'Ca tối', 'Ca khác': 'Ca khác' }], ['start_time', 'Giờ bắt đầu', 'time', true], ['end_time', 'Giờ kết thúc', 'time', true], ['status', 'Trạng thái', 'select', true, { scheduled: 'Đã xếp ca', working: 'Đang làm', done: 'Hoàn tất', cancelled: 'Đã hủy' }], ['note', 'Ghi chú', 'text']], defaults: { work_date: vnDate(), label: 'Ca sáng', start_time: '09:00', end_time: '17:00', status: 'scheduled' } }
};

const errorText = (error) => error?.response?.data?.error || 'Không thể tải hoặc lưu dữ liệu. Vui lòng thử lại.';

function Modal({ title, onClose, children, wide = false }) {
  return <div className="pb-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`pb-modal ${wide ? 'pb-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="pb-modal-header"><div><p className="pb-eyebrow">PHOTOBOOTH WORKSPACE</p><h2>{title}</h2></div><button className="pb-icon-button" onClick={onClose} aria-label="Đóng"><X size={19} /></button></div>
      {children}
    </div>
  </div>;
}

function Field({ field, value, onChange, staff = [] }) {
  const [key, label, type, required, options] = field;
  if (type === 'checkbox') return <label className="pb-check"><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(key, event.target.checked)} /><span>{label}</span></label>;
  return <label className="pb-field"><span>{label}{required && ' *'}</span>
    {type === 'select' || type === 'staff' ? <select required={required} value={value ?? ''} onChange={event => onChange(key, event.target.value)}>
      <option value="">{required ? 'Chọn một mục' : 'Không chọn'}</option>
      {type === 'staff' ? staff.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>) : Object.entries(options).map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select> : <input required={required} type={type} min={type === 'number' && key !== 'delta' ? 0 : undefined} step={type === 'number' ? 1 : undefined} value={value ?? ''} onChange={event => onChange(key, event.target.value)} />}
  </label>;
}

function Empty({ title = 'Chưa có dữ liệu', detail = 'Thêm bản ghi đầu tiên để bắt đầu quản lý Photobooth.' }) {
  return <div className="pb-empty"><Sparkles size={26} /><strong>{title}</strong><span>{detail}</span></div>;
}

export default function Photobooth() {
  const { isAdmin, isInvestor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const canViewReports = isAdmin || isInvestor;
  const visibleTabs = canViewReports ? tabs : tabs.filter(item => !['reports', 'finance'].includes(item.key));
  const requestedTab = tabs.find(item => location.pathname === `/photobooth/${item.key}`)?.key;
  const tab = visibleTabs.find(item => item.key === requestedTab)?.key || 'overview';
  const [date, setDate] = useState(vnDate());
  const [data, setData] = useState(null);
  const [overviewCash, setOverviewCash] = useState(null);
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [report, setReport] = useState(null);
  const [reportOrders, setReportOrders] = useState([]);
  const [cashData, setCashData] = useState(null);
  const [ptbData, setPtbData] = useState(null);
  const [ptbFrom, setPtbFrom] = useState(vnDate());
  const [ptbTo, setPtbTo] = useState(vnDate());
  const [customers, setCustomers] = useState([]);
  const [finance, setFinance] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [month, setMonth] = useState(() => vnDate().slice(0, 7));
  const [reportFrom, setReportFrom] = useState(() => `${vnDate().slice(0, 7)}-01`);
  const [reportTo, setReportTo] = useState(vnDate());
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(() => newOrder(vnDate()));
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { if (requestedTab && requestedTab !== tab) navigate('/photobooth', { replace: true }); }, [requestedTab, tab, navigate]);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (tab === 'overview') {
        const [overview, cash] = await Promise.all([photoboothApi.overview(date), photoboothApi.cash(date)]);
        setData(overview.data); setOverviewCash(cash.data.summary);
      }
      else if (tab === 'reports') {
        const [summary, orders] = await Promise.all([photoboothApi.reports(reportFrom, reportTo), photoboothApi.transactionsRange(reportFrom, reportTo)]);
        setReport(summary.data); setReportOrders(orders.data);
      }
      else if (tab === 'cash') {
        const [cash, people] = await Promise.all([photoboothApi.cash(date), photoboothApi.list('staff')]);
        setCashData(cash.data); setStaff(people.data);
      } else if (tab === 'ptb') {
        if (ptbFrom > ptbTo) { setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.'); setLoading(false); return; }
        const [reconcile, people] = await Promise.all([ptbFrom === ptbTo ? photoboothApi.ptb(ptbFrom) : photoboothApi.ptbRange(ptbFrom, ptbTo), photoboothApi.list('staff')]);
        setPtbData(reconcile.data); setStaff(people.data);
      } else if (tab === 'customers') setCustomers((await photoboothApi.customers()).data);
      else if (tab === 'finance') {
        const [summary, items, people] = await Promise.all([photoboothApi.finance(month), photoboothApi.expenses(month), photoboothApi.list('staff')]);
        setFinance(summary.data); setExpenses(items.data); setStaff(people.data);
      }
      else if (tab === 'shifts') { /* SchedulePanel manages its weekly data. */ }
      else if (tab === 'attendance') { /* AttendancePanel manages its monthly data. */ }
      else if (tab === 'transactions') {
        const [tx, svc, people, inventory] = await Promise.all([photoboothApi.transactions(date), photoboothApi.list('services'), photoboothApi.list('staff'), photoboothApi.list('gifts')]);
        setRows(tx.data); setServices(svc.data); setStaff(people.data); setGifts(inventory.data);
      } else {
        const requests = [photoboothApi.list(tab)];
        if (tab === 'shifts') requests.push(photoboothApi.list('staff'));
        const results = await Promise.all(requests);
        setRows(results[0].data);
        if (results[1]) setStaff(results[1].data);
      }
    } catch (err) { setError(errorText(err)); } finally { setLoading(false); }
  }, [tab, date, ptbFrom, ptbTo, reportFrom, reportTo, month]);
  useEffect(() => { refresh(); }, [refresh]);

  function openCreate() {
    setForm({ ...configs[tab]?.defaults });
    setModal({ mode: 'create' });
  }
  function openEdit(row) { setForm({ ...row, work_date: row.work_date?.slice(0, 10), start_time: row.start_time?.slice(0, 5), end_time: row.end_time?.slice(0, 5) }); setModal({ mode: 'edit', id: row.id }); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (tab === 'transactions') { await photoboothApi.createTransaction(form); setForm(newOrder(date)); }
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
  async function voidOrder(row) {
    const reason = window.prompt(`Lý do hủy đơn #${row.id}:`);
    if (!reason?.trim()) return;
    try { await photoboothApi.voidTransaction(row.id, reason.trim()); await refresh(); }
    catch (err) { setError(errorText(err)); }
  }

  const activeTitle = tabs.find(item => item.key === tab)?.label;
  return <div className={`pb-page${isInvestor ? ' pb-readonly' : ''}`}>
    <div className="pb-topline"><Link to="/" className="pb-back"><ArrowLeft size={15} /> Hệ thống SnapPro</Link>{isAdmin && <BackupControls />}</div>
    <div className="pb-hero"><div className="pb-brand-mark"><Camera size={27} /></div><div><p className="pb-eyebrow">PHOTOBOOTH & PRINT STUDIO · 75 PHỐ XỐM, HÀ ĐÔNG</p><h1>Insphoto ♡</h1><p>Vận hành cửa hàng, doanh thu và trải nghiệm khách hàng trong một nơi.</p></div><div className="pb-hero-decor"><Sparkles size={46} /></div></div>
    <nav className="pb-tabs" aria-label="Quản lý Photobooth">{visibleTabs.map(item => { const Icon = item.icon; return <Link key={item.key} to={item.key === 'overview' ? '/photobooth' : `/photobooth/${item.key}`} className={`pb-tab ${tab === item.key ? 'active' : ''}`}><Icon size={17} /><span>{item.label}</span></Link>; })}</nav>
    <div className="pb-content">
      <div className="pb-section-head"><div><p className="pb-eyebrow">{tab === 'overview' ? 'DỮ LIỆU THỰC TẾ' : 'QUẢN LÝ PHOTOBOOTH'}</p><h2>{tab === 'overview' ? 'Tổng quan vận hành' : activeTitle}</h2><p>{tab === 'overview' ? 'Theo dõi hoạt động cửa hàng theo ngày.' : tab === 'reports' ? 'Doanh thu được tổng hợp từ giao dịch Photobooth.' : 'Dữ liệu ở đây chỉ thuộc khu Photobooth.'}</p></div><div className="pb-actions">
        {['overview', 'transactions', 'cash'].includes(tab) && <label className="pb-date"><CalendarDays size={16} /><input type="date" value={date} onChange={event => { setDate(event.target.value); if (tab === 'transactions') setForm(current => ({ ...current, sale_date: event.target.value })); }} /></label>}
        {tab === 'ptb' && <><label className="pb-date">Từ ngày <input type="date" value={ptbFrom} max={ptbTo} onChange={event => setPtbFrom(event.target.value)} /></label><label className="pb-date">Đến ngày <input type="date" value={ptbTo} min={ptbFrom} onChange={event => setPtbTo(event.target.value)} /></label></>}
        {tab === 'finance' && <label className="pb-date"><CalendarDays size={16} /><input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>}
        {!isInvestor && !['overview', 'transactions', 'reports', 'finance', 'cash', 'ptb', 'customers', 'attendance', 'shifts'].includes(tab) && <button className="pb-primary" onClick={openCreate}><Plus size={17} /> Thêm mới</button>}
      </div></div>
      {error && <div className="pb-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Đóng thông báo"><X size={15} /></button></div>}
      {loading ? <div className="pb-loading">Đang tải dữ liệu Photobooth...</div> : tab === 'overview' ? <>
        <div className="pb-stat-grid">
          {[['Doanh thu ngày', money(data?.metrics?.revenue), CreditCard, 'pink'], ['Số đơn', data?.metrics?.transactions || 0, ShoppingBag, 'purple'], ['Lượt chụp', data?.metrics?.shoots || 0, Camera, 'blue'], [overviewCash?.balanceShift ? `Tiền quầy ${overviewCash.balanceShift} (dự kiến)` : 'Tiền mặt tại quầy (dự kiến)', money(overviewCash?.balance ?? overviewCash?.expected), Wallet, 'orange']].map(([label, value, Icon, tone]) => <div className="pb-stat" key={label}><span className={`pb-stat-icon ${tone}`}><Icon size={21} /></span><small>{label}</small><strong>{value}</strong><span className="pb-stat-note">Ngày {dayLabel(date)}</span></div>)}
        </div>
        <div className="pb-grid-two"><section className="pb-card"><div className="pb-card-head"><div><h3>Doanh thu 7 ngày</h3><p>Giao dịch đã ghi nhận</p></div><TrendingUp size={18} /></div><div className="pb-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={(data?.trend || []).map(item => ({ ...item, label: dayLabel(item.day) }))}><defs><linearGradient id="pbArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#eb70a6" stopOpacity={0.28}/><stop offset="100%" stopColor="#eb70a6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#f4e9ee" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#9e8793', fontSize: 11 }} /><Tooltip formatter={value => money(value)} /><Area type="monotone" dataKey="revenue" stroke="#e85496" strokeWidth={3} fill="url(#pbArea)" /></AreaChart></ResponsiveContainer></div></section>
          <section className="pb-card"><div className="pb-card-head"><div><h3>Cơ cấu dịch vụ</h3><p>Doanh thu trong ngày</p></div><ShoppingBag size={18} /></div>{data?.mix?.length ? <div className="pb-mix"><div className="pb-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.mix} dataKey="revenue" innerRadius={55} outerRadius={78} paddingAngle={3}>{data.mix.map((_, i) => <Cell key={i} fill={['#e95c9b', '#8f77e8', '#f4b86e'][i % 3]} />)}</Pie><Tooltip formatter={value => money(value)} /></PieChart></ResponsiveContainer></div><div className="pb-mix-list">{data.mix.map((item, i) => <div key={item.category}><i style={{ background: ['#e95c9b', '#8f77e8', '#f4b86e'][i % 3] }} /><span>{categoryLabels[item.category] || item.category}</span><strong>{money(item.revenue)}</strong></div>)}</div></div> : <Empty title="Chưa có giao dịch" detail="Cơ cấu dịch vụ sẽ hiện khi cửa hàng ghi nhận giao dịch." />}</section></div>
        <div className="pb-grid-two"><section className="pb-card"><div className="pb-card-head"><div><h3>Giao dịch gần đây</h3><p>{data?.metrics?.transactions || 0} giao dịch trong ngày</p></div><Link to="/photobooth/transactions">Xem tất cả <ArrowRight size={14} /></Link></div>{data?.recent?.length ? <div className="pb-list">{data.recent.map(item => <div className="pb-list-row" key={item.id}><div className="pb-avatar"><Camera size={17} /></div><div><strong>{item.service_name}</strong><span>{new Date(item.happened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })} · {sourceModes[item.source_mode] || paymentLabels[item.payment_method]}</span></div><b>{money(item.total_amount)}</b></div>)}</div> : <Empty title="Chưa có giao dịch hôm nay" detail="Ghi nhận giao dịch đầu tiên tại mục Thu tiền khách." />}</section>
          <section className="pb-card"><div className="pb-card-head"><div><h3>Ca làm hôm nay</h3><p>Phân công nhân viên</p></div><Link to="/photobooth/shifts">Xem ca <ArrowRight size={14} /></Link></div>{data?.shifts?.length ? <div className="pb-list">{data.shifts.map(item => <div className="pb-list-row" key={item.id}><div className="pb-avatar purple"><Users size={17} /></div><div><strong>{item.staff_name}</strong><span>{item.start_time?.slice(0, 5)} – {item.end_time?.slice(0, 5)}</span></div><em className="pb-pill">{statusLabels[item.status]}</em></div>)}</div> : <Empty title="Chưa xếp ca" detail="Thêm nhân viên rồi tạo ca làm để theo dõi lịch trực." />}</section></div>
        <div className="pb-grid-two"><section className="pb-card"><div className="pb-card-head"><h3>Bảng giá</h3><Link to="/photobooth/services">Quản lý <ArrowRight size={14} /></Link></div>{data?.services?.length ? data.services.slice(0, 5).map(item => <div className="pb-mini-row" key={item.id}><span>{item.name}</span><b>{money(item.price)}</b></div>) : <Empty title="Chưa có dịch vụ" detail="Thiết lập giá trước khi thu tiền khách." />}</section><section className="pb-card"><div className="pb-card-head"><h3>Quà tặng</h3><Link to="/photobooth/gifts">Kho quà <ArrowRight size={14} /></Link></div>{data?.gifts?.length ? data.gifts.slice(0, 5).map(item => <div className="pb-mini-row" key={item.id}><span>{item.name}</span><b className={item.quantity <= item.low_stock_threshold ? 'pb-alert-text' : ''}>{item.quantity} còn</b></div>) : <Empty title="Kho quà trống" detail="Thêm quà tặng để theo dõi số lượng." />}</section></div>
      </> : tab === 'attendance' ? <AttendancePanel readOnly={isInvestor} />
        : tab === 'shifts' ? <SchedulePanel isAdmin={isAdmin} readOnly={isInvestor} />
        : tab === 'cash' ? <CashShiftPanel date={date} data={cashData} staff={staff} refresh={refresh} setError={setError} readOnly={isInvestor} />
        : tab === 'ptb' ? <PtbPanel date={ptbTo} from={ptbFrom} to={ptbTo} data={ptbData} staff={staff} refresh={refresh} setError={setError} readOnly={isInvestor} />
        : tab === 'customers' ? <CustomersPanel customers={customers} />
        : tab === 'finance' ? <FinancePanel month={month} data={finance} expenses={expenses} staff={staff} refresh={refresh} setError={setError} readOnly={isInvestor} />
        : tab === 'reports' ? <ReportsPanel from={reportFrom} to={reportTo} setFrom={setReportFrom} setTo={setReportTo} report={report} orders={reportOrders} />
        : tab === 'transactions' ? <TransactionsPanel date={date} rows={rows} form={form} setForm={setForm} services={services} staff={staff} gifts={gifts} busy={busy} onSave={save} onVoid={voidOrder} readOnly={isInvestor} canVoid={isAdmin} />
        : <section className="pb-card pb-table-card"><div className="pb-card-head"><div><h3>{activeTitle}</h3><p>{rows.length} bản ghi</p></div></div><DataTable rows={rows} columns={configs[tab]?.columns || []} action={isInvestor ? undefined : row => <div className="pb-row-actions">{tab === 'gifts' && <button onClick={() => { setForm({ delta: '', reason: '' }); setModal({ mode: 'adjust', row }); }}>Nhập / xuất</button>}<button onClick={() => openEdit(row)}>Sửa</button></div>} /></section>}
    </div>
    {modal && !isInvestor && <Modal title={modal.mode === 'adjust' ? `Điều chỉnh tồn · ${modal.row.name}` : `${modal.mode === 'edit' ? 'Sửa' : 'Thêm'} ${configs[tab]?.title || ''}`} onClose={() => { setModal(null); setError(''); }}>
      {error && <div className="pb-error" role="alert">{error}</div>}
      {modal.mode === 'adjust' ? <form className="pb-form" onSubmit={event => { event.preventDefault(); adjustGift(modal.row); }}><p>Hiện có <strong>{modal.row.quantity}</strong> phần. Nhập số dương để thêm, số âm để xuất.</p><Field field={['delta', 'Thay đổi số lượng', 'number', true]} value={form.delta} onChange={(key, value) => setForm({ ...form, [key]: value })} /><Field field={['reason', 'Lý do', 'text']} value={form.reason} onChange={(key, value) => setForm({ ...form, [key]: value })} /><button className="pb-primary" disabled={busy}>Lưu tồn kho</button></form>
        : <form className="pb-form" onSubmit={save}>{configs[tab]?.fields.map(field => <Field key={field[0]} field={field} staff={staff} value={form[field[0]]} onChange={(key, value) => setForm({ ...form, [key]: value })} />)}<div className="pb-form-actions"><button type="button" onClick={() => setModal(null)}>Hủy</button><button className="pb-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div></form>}
    </Modal>}
  </div>;
}

function TransactionsPanel({ date, rows, form, setForm, services, staff, gifts, busy, onSave, onVoid, readOnly, canVoid }) {
  const displayRows = rows.map(row => ({
    ...row,
    source_label: sourceModes[row.source_mode] || sourceModes.counter,
    machine_in: ['machine_self', 'machine_exchange'].includes(row.source_mode) ? row.total_amount : 0
  }));
  return <div className="pb-grid-two pb-order-layout">
    {!readOnly && <section className="pb-card"><h3>Thu tiền khách · Tạo đơn theo nguồn tiền</h3><OrderForm form={form} setForm={setForm} services={services} staff={staff} gifts={gifts} busy={busy} onSave={onSave} onCancel={() => setForm(newOrder(date))} resetLabel="Nhập lại" /></section>}
    <section className="pb-card pb-table-card"><div className="pb-card-head"><div><h3>Danh sách đơn hàng</h3><p>{rows.length} đơn ngày {dayLabel(date)}</p></div></div><DataTable rows={displayRows} columns={[["source_label", "Nguồn thu"], ["customer_name", "Khách hàng"], ["service_name", "Dịch vụ"], ["total_amount", "Doanh thu"], ["cash_in_drawer", "Quầy +/−"], ["machine_in", "Máy +"], ["transfer_received", "Chuyển khoản"], ["staff_name", "Nhân viên"], ["status", "Trạng thái"]]} action={readOnly || !canVoid ? undefined : row => row.status === 'completed' && <button className="pb-link-danger" onClick={() => onVoid(row)}>Hủy đơn</button>} /></section>
  </div>;
}

function DataTable({ rows, columns, action }) {
  if (!rows.length) return <Empty />;
  return <div className="pb-table-wrap"><table className="pb-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}{action && <th>Thao tác</th>}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id ?? i}>{columns.map(([key]) => <td key={key}>{formatCell(key, row[key], row)}</td>)}{action && <td>{action(row)}</td>}</tr>)}</tbody></table></div>;
}
function formatCell(key, value, row) {
  if (value == null || value === '') return <span className="pb-muted">—</span>;
  if (['price', 'unit_price', 'total_amount', 'revenue', 'cost', 'cash_in_drawer', 'machine_in', 'transfer_received'].includes(key)) return <strong>{money(value)}</strong>;
  if (['work_date', 'day', 'sale_date'].includes(key)) return dayLabel(value);
  if (key === 'happened_at' || key === 'reported_at') return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  if (key === 'payment_method') return paymentLabels[value] || value;
  if (key === 'category') return categoryLabels[value] || value;
  if (key === 'active') return <span className={`pb-status ${value ? 'ok' : 'off'}`}>{value ? 'Đang dùng' : 'Ngừng'}</span>;
  if (key === 'done') return <span className={`pb-status ${value ? 'ok' : 'warning'}`}>{value ? 'Hoàn tất' : 'Cần làm'}</span>;
  if (key === 'status') return <span className={`pb-status ${value === 'active' || value === 'done' || value === 'completed' ? 'ok' : value === 'maintenance' ? 'warning' : 'off'}`}>{value === 'completed' ? 'Hoàn tất' : value === 'voided' ? 'Đã hủy' : statusLabels[value] || value}</span>;
  if (key === 'quantity' && row.low_stock_threshold != null && value <= row.low_stock_threshold) return <strong className="pb-alert-text">{value} · Sắp hết</strong>;
  if (key === 'start_time' || key === 'end_time') return String(value).slice(0, 5);
  if (key === 'gift_name' && row.gift_quantity) return `${value} × ${row.gift_quantity}`;
  return String(value);
}
