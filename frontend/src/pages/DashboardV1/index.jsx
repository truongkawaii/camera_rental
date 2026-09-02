import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardToday, getRentals, getRentalCounts, updateRental, uploadRentalImages, getEquipment, getCustomers, getBranches, getUsers, updateCustomer } from '../../api/client';
import LazyImage from '../../components/LazyImage';
import { useAuth } from '../../context/AuthContext';
import {
  Search, ChevronDown, Edit2,
  ChevronRight, AlertTriangle, Package, ArrowDownToLine, ArrowUpFromLine,
  Camera, TrendingUp, TrendingDown, ChevronLeft, DollarSign, FileText,
  MapPin, Calendar, Home, ArrowUpDown
} from 'lucide-react';
import RentalModal from '../Rentals/components/RentalModal';
import { useToast, ToastContainer } from '../../components/Toast';
import { formatDateTimeForInput, getAllImages, getFirstImage } from '../../utils/formatters';
import DateRangePicker, { getVNToday } from '../../components/DateRangePicker';

/* ─── helpers ──────────────────────────────────────────────────── */
const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const fmtDate = (dateStr) => {
  if (!dateStr) return '--/--';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const fmtTime = (dateStr) => {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const fmtDateTime = (dateStr) => {
  if (!dateStr) return '--:-- - --/--';
  const d = new Date(dateStr);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${time} - ${date}`;
};

const SORT_OPTIONS = [
  { field: 'code', label: 'Mã đơn', defaultDir: 'asc' },
  { field: 'created', label: 'Ngày tạo', defaultDir: 'desc' },
  { field: 'customer', label: 'Khách hàng', defaultDir: 'asc' },
  { field: 'equipment', label: 'Thiết bị', defaultDir: 'asc' },
  { field: 'pickup', label: 'Thời gian nhận', defaultDir: 'asc' },
  { field: 'branch', label: 'Nơi nhận máy', defaultDir: 'asc' },
  { field: 'price', label: 'Tổng tiền', defaultDir: 'desc' },
  { field: 'status', label: 'Trạng thái', defaultDir: 'asc' },
];

const getSortOption = (field) => SORT_OPTIONS.find(option => option.field === field);
const getSortField = (sortKey) => sortKey.split('_')[0];
const getSortDir = (sortKey) => sortKey.endsWith('_asc') ? 'asc' : 'desc';
const buildSortKey = (field, dir) => `${field}_${dir}`;

const MobileSortControl = ({ sortKey, setSortKey }) => {
  const [open, setOpen] = useState(false);
  const field = getSortField(sortKey);
  const dir = getSortDir(sortKey);
  const activeOption = getSortOption(field) || SORT_OPTIONS[0];

  const selectField = (nextField) => {
    const option = getSortOption(nextField);
    setSortKey(buildSortKey(nextField, option?.defaultDir || 'asc'));
    setOpen(false);
  };

  return (
    <div className="relative md:hidden px-4 py-3 border-b border-slate-100 bg-white">
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Sắp xếp:</span>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className={`min-w-0 flex-1 h-[35px] px-3 flex items-center justify-between gap-2 rounded-xl border text-[12.5px] font-semibold transition-all ${
            open ? 'bg-white border-orange-200 text-orange-500 ring-2 ring-orange-100' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <span className="truncate">{activeOption.label}</span>
          <ChevronDown size={14} className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setSortKey(buildSortKey(field, dir === 'asc' ? 'desc' : 'asc'))}
          className="h-[35px] w-[35px] flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-orange-500 hover:border-orange-200 hover:bg-white transition-all"
          title="Đảo chiều sắp xếp"
        >
          <span className="text-[17px] leading-none">{dir === 'asc' ? '↑' : '↓'}</span>
        </button>
      </div>

      {open && (
        <div className="absolute left-[88px] right-16 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
          {SORT_OPTIONS.map(option => (
            <button
              key={option.field}
              type="button"
              onClick={() => selectField(option.field)}
              className={`w-full px-4 py-2.5 text-left text-[12.5px] font-semibold transition-colors ${
                field === option.field ? 'bg-orange-50 text-orange-500' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const getOverdueLabel = (dateStr) => {
  if (!dateStr) return '';
  const end = new Date(dateStr);
  const now = new Date();
  const diffMs = now - end;
  
  if (diffMs <= 0) return 'Sắp trễ';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) return `Trễ ${diffMins} phút`;
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `Trễ ${diffHours} giờ`;
  
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return `Trễ ${diffDays} ngày`;
};

const todayLabel = () => {
  const d = new Date();
  const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  return `${weekdays[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const STATUS_MAP = {
  pending: { label: 'Chờ giao', cls: 'bg-amber-50 text-orange-600' },
  active: { label: 'Đang thuê', cls: 'bg-blue-50 text-blue-600' },
  completed: { label: 'Hoàn thành', cls: 'bg-green-50 text-green-700' },
  cancelled: { label: 'Đã hủy', cls: 'bg-rose-50 text-red-600' },
};

const EMPTY_FORM = {
  customer_id: '', equipment_id: '',
  start_date: '', start_period: 'sáng',
  end_date: '', end_period: 'chiều',
  status: 'pending', notes: '', deposit_amount: 0, accessories: [],
  pickup_time: '', return_time: '',
  discount_amount: 0, discount_type: 'fixed', code: '', pickup_branch_id: '', return_branch_id: '', branch_id: '',
  paid_amount: 0, deposit_type: 'money', user_id: '', handover_user_id: '',
  applied_day_price: null, used_discount_day_price: false, discount_day_price: null, discount_day_threshold_snapshot: null
};
const EMPTY_CUSTOMER = { name: '', phone: '', email: '', address: '' };
const isNewImagePreview = (image) => typeof image === 'string' && image.startsWith('data:image/');
const getNewImageIndex = (previews, index) => previews.slice(0, index + 1).filter(isNewImagePreview).length - 1;
const toEditableCustomer = (customer = {}) => ({
  id: customer.customer_id || customer.id || '',
  name: customer.customer_name || customer.name || '',
  phone: customer.customer_phone || customer.phone || '',
  email: customer.customer_email || customer.email || ''
});

/* ─── StatCard ─────────────────────────────────────────────────── */
const StatCard = ({ icon: Icon, iconBg, label, value, trend, trendAbs, trendLabel, isLive, onClick, isClickable = false, showMoreLink = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left bg-white p-3.5 md:p-4 rounded-3xl border border-slate-100 shadow-sm transition-all duration-300 group ${
      isClickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'
    }`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="p-2.5 rounded-2xl transition-transform group-hover:scale-110 duration-300" style={{ backgroundColor: iconBg }}>
        <Icon size={20} className="text-slate-700" />
      </div>
      {isLive && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-lg border border-green-100">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Live</span>
        </div>
      )}
    </div>
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">{label}</p>
      <h3 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">{value}</h3>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 md:flex-nowrap md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 md:flex-nowrap">
          {trend !== null && trend !== undefined && (
            <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-[10px] font-bold ${trend >= 0 ? 'text-green-600 bg-green-50' : 'text-rose-600 bg-rose-50'}`}>
              {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {trendAbs}%
            </div>
          )}
          <span className="text-[9px] font-semibold leading-tight text-slate-400 md:min-w-0 md:truncate md:text-[10px] md:whitespace-nowrap">{trendLabel}</span>
        </div>
        {showMoreLink && (
          <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-[10px] font-bold text-orange-500 transition-colors group-hover:text-orange-600">
            xem thêm
            <ChevronRight size={11} />
          </span>
        )}
      </div>
    </div>
  </button>
);
/* ─── ActionRow ────────────────────────────────────────────────── */
const ActionRow = ({ rental, type = 'pickup', onClick }) => {
  let dateStr = rental.pickup_time || rental.start_date;
  if (type === 'return') {
    dateStr = rental.return_time || rental.end_date;
  }
  const time = fmtDateTime(dateStr);
  const isTest = rental.customer_name?.toLowerCase().includes('test') || rental.notes?.toLowerCase().includes('test');
  
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer group"
    >
      <span className="text-[13px] font-semibold text-slate-700 min-w-[80px] flex-shrink-0 group-hover:text-orange-500 transition-colors whitespace-nowrap">{time}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13.5px] font-semibold text-slate-800 truncate group-hover:text-orange-600 transition-colors">{rental.customer_name}</p>
          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">({rental.code || `#OD${String(rental.order_number || rental.id).padStart(7, '0')}`})</span>
          {isTest && (
            <span className="text-[9px] font-semibold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-tighter">TEST</span>
          )}
        </div>
        <p className="text-[11.5px] text-slate-400 truncate mt-0.5">{rental.equipment_name}</p>
        <div className="flex flex-col gap-0.5 mt-1">
          <div className="flex items-center gap-1 text-[10.5px] text-indigo-500 font-semibold">
            <Home size={10} className="text-indigo-400 flex-shrink-0" />
            <span className="truncate" title="Máy thuộc">Máy: {rental.original_branch_name || 'Hệ thống'}</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-orange-500 font-semibold">
            <MapPin size={10} className="text-orange-400 flex-shrink-0" />
            <span className="truncate" title="Nơi nhận">Nhận: {rental.pickup_branch_name || '—'}</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-emerald-600 font-semibold">
            <MapPin size={10} className="text-emerald-500 flex-shrink-0" />
            <span className="truncate" title="Nơi trả">Trả: {rental.return_branch_name || rental.pickup_branch_name || '—'}</span>
          </div>
        </div>
      </div>
      <ChevronRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
    </div>
  );
};

/* ─── OverdueRow ───────────────────────────────────────────────── */
const OverdueRow = ({ rental, onClick, overdueType = 'return' }) => {
  // overdueType: 'pickup' = trễ giao (pending past pickup_time), 'return' = trễ trả (active past return_time)
  const isLatePickup = overdueType === 'pickup';
  const dateStr = isLatePickup
    ? (rental.pickup_time || rental.start_date)
    : (rental.return_time || rental.end_date);
  const time = fmtDateTime(dateStr);
  const label = getOverdueLabel(dateStr);
  
  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-red-50 last:border-0 hover:bg-red-50/40 transition-colors cursor-pointer group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isLatePickup && (
            <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded uppercase tracking-tight flex-shrink-0">
              Giao
            </span>
          )}
          <p className="text-[13.5px] font-semibold text-slate-800 truncate group-hover:text-red-600 transition-colors">{rental.customer_name}</p>
          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">({rental.code || `#OD${String(rental.order_number || rental.id).padStart(7, '0')}`})</span>
        </div>
        <p className="text-[11.5px] text-slate-400 truncate mt-0.5">{rental.equipment_name}</p>
        <div className="flex flex-col gap-0.5 mt-1">
          <div className="flex items-center gap-1 text-[10.5px] text-indigo-500 font-semibold">
            <Home size={10} className="text-indigo-400 flex-shrink-0" />
            <span className="truncate" title="Máy thuộc">Máy: {rental.original_branch_name || 'Hệ thống'}</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-orange-500 font-semibold">
            <MapPin size={10} className="text-orange-400 flex-shrink-0" />
            <span className="truncate" title="Nơi nhận">Nhận: {rental.pickup_branch_name || '—'}</span>
          </div>
          <div className="flex items-center gap-1 text-[10.5px] text-emerald-600 font-semibold">
            <MapPin size={10} className="text-emerald-500 flex-shrink-0" />
            <span className="truncate" title="Nơi trả">Trả: {rental.return_branch_name || rental.pickup_branch_name || '—'}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] text-slate-400 whitespace-nowrap">{time}</span>
        <span className={`text-[11px] font-semibold whitespace-nowrap flex-shrink-0 uppercase tracking-tight ${isLatePickup ? 'text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded' : 'text-red-500'}`}>
          {isLatePickup ? 'Trễ giao' : label}
        </span>
      </div>
      <ChevronRight size={14} className="text-red-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
    </div>
  );
};

/* ─── RentalMobileCard ─────────────────────────────────────────── */
const RentalMobileCard = ({ r, navigate, onEdit }) => {
  const status = STATUS_MAP[r.status] || { label: r.status, cls: '' };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-3.5 last:mb-0">
      <div className="flex items-center justify-between mb-3.5">
        <div className="min-w-0">
          <span className="text-[11.5px] font-semibold text-slate-400 block truncate">
            Mã đơn: {r.code || `#OD${String(r.order_number || r.id).padStart(7, '0')}`}
          </span>
          <span className="text-[10.5px] font-semibold text-slate-400 block mt-0.5">
            Tạo: {fmtDate(r.inserted_at)}
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-tight ${status.cls}`}>
          {status.label}
        </span>
      </div>
      
      <div className="flex gap-3.5 mb-4">
        <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-50">
          <LazyImage
            entity="equipment"
            id={r.equipment_id}
            src={getFirstImage(r.equipment_images)}
            alt={r.equipment_name}
            className="w-full h-full object-cover"
            fallback={Camera}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold text-slate-900 truncate leading-none mb-1">{r.customer_name}</p>
          {r.customer_phone && <p className="text-[12px] text-slate-400 truncate mb-1">{r.customer_phone}</p>}
          <p className="text-[12px] text-slate-500 truncate">{r.equipment_name}</p>
          <div className="mt-1">
            <span className="text-[11px] text-slate-400 truncate uppercase tracking-tighter block mb-0.5">{r.equipment_code}</span>
            <div className="flex items-center gap-1 text-[11px] text-indigo-500 font-semibold">
              <Home size={10} className="text-indigo-400 flex-shrink-0" />
              <span className="truncate">{r.original_branch_name || 'Hệ thống'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-dashed border-slate-100 pt-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Calendar size={13} className="text-slate-300" />
            <span className="text-[11.5px] font-medium">T.gian nhận</span>
          </div>
          <span className="text-[12.5px] font-semibold text-slate-800">
            {fmtDate(r.pickup_time)} <span className="font-medium text-slate-400 ml-1">{fmtTime(r.pickup_time)}</span>
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <MapPin size={13} className="text-slate-300" />
            <span className="text-[11.5px] font-medium">Nơi nhận</span>
          </div>
          <span className="text-[12px] font-semibold text-slate-600">{r.pickup_branch_name || '—'}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-400">
            <MapPin size={13} className="text-slate-300" />
            <span className="text-[11.5px] font-medium">Nơi trả</span>
          </div>
          <span className="text-[12px] font-semibold text-emerald-600">{r.return_branch_name || r.pickup_branch_name || '—'}</span>
        </div>

        <div className="flex items-center justify-between mt-1 pt-1">
          <span className="text-[11.5px] text-slate-400 font-medium">Tổng tiền</span>
          <span className="text-[16px] font-semibold text-slate-900">{fmtVND(r.total_price)}</span>
        </div>
      </div>
      
      <button 
        onClick={() => onEdit(r)}
        className="w-full mt-4 py-2.5 bg-slate-50 rounded-xl text-[12.5px] font-semibold text-slate-400 hover:bg-orange-50 hover:text-orange-500 transition-all border border-transparent hover:border-orange-100 flex items-center justify-center gap-2"
      >
        Xem chi tiết
        <Edit2 size={14} />
      </button>
    </div>
  );
};

/* ─── ActionPanel ──────────────────────────────────────────────── */
const PANEL_COLOR = {
  blue: { header: 'text-blue-600', badge: 'bg-blue-50 text-blue-600', border: 'border-t-blue-500', footer: 'text-blue-600' },
  green: { header: 'text-green-600', badge: 'bg-green-50 text-green-600', border: 'border-t-green-500', footer: 'text-green-600' },
  red: { header: 'text-red-600', badge: 'bg-red-50 text-red-600', border: 'border-t-red-500', footer: 'text-red-600' },
};

const ActionPanel = ({ color, icon: Icon, title, count, items, renderItem, onViewAll }) => {
  const c = PANEL_COLOR[color] || PANEL_COLOR.blue;
  const [isOpen, setIsOpen] = useState(window.innerWidth >= 768);

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden transition-all duration-300 ${!isOpen ? 'max-h-[52px]' : 'max-h-[500px]'}`}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between px-4 py-3.5 border-b border-slate-50 bg-opacity-[0.03] cursor-pointer select-none ${color === 'blue' ? 'bg-blue-500' : color === 'green' ? 'bg-emerald-500' : 'bg-red-500'}`}
      >
        <div className={`flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wider ${c.header}`}>
          <Icon size={16} />
          <span className="whitespace-normal leading-tight">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold w-6 h-6 rounded-full flex items-center justify-center ${c.badge}`}>
            {count}
          </span>
          <ChevronDown size={16} className={`transition-transform duration-300 ${c.header} ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      <div className={`flex-1 flex flex-col transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 invisible'}`}>
        <div className="flex-1 overflow-y-auto max-h-72 custom-scrollbar">
          {items.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-slate-400 italic font-medium">Không có dữ liệu</div>
          ) : (
            items.map((item) => renderItem(item))
          )}
        </div>
        <button
          onClick={onViewAll}
          className={`flex items-center justify-center gap-1 py-3 text-[12.5px] font-semibold border-t border-slate-50 w-full hover:bg-slate-50 transition-all cursor-pointer ${c.footer}`}
        >
          Xem tất cả <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

/* ─── Main ─────────────────────────────────────────────────────── */
const DashboardV1 = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [today, setToday] = useState(null);
  const [showMobileStats, setShowMobileStats] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState({ pending: 0, active: 0, completed: 0, all: 0 });
  const [tableLoading, setTableLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // Date range filter — default to today
  const todayISO = getVNToday();
  const [dateRange, setDateRange] = useState({ start: todayISO, end: todayISO });

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [equipment, setEquipment] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState(EMPTY_CUSTOMER);
  const [editCustomerData, setEditCustomerData] = useState(null);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagesDirty, setImagesDirty] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  const { toast, toasts, removeToast } = useToast();
  const { isAdmin, isCameraManager, isInvestor, isSaler, isDriver } = useAuth();
  const canManageRentals = isCameraManager || isInvestor;

  const loadCounts = useCallback(async () => {
    try {
      const res = await getRentalCounts();
      setCounts(res.data);
    } catch (e) {
      console.error('Counts load error:', e);
    }
  }, []);

  const loadModalData = useCallback(async () => {
    setModalLoading(true);
    try {
      const [equipRes, custRes, branchRes, usersRes] = await Promise.all([
        getEquipment(1, 200),
        getCustomers(1, 200),
        getBranches(),
        (isAdmin || canManageRentals || isSaler || isDriver) && !usersLoaded ? getUsers(isAdmin ? 'admin' : null) : Promise.resolve(null)
      ]);
      setEquipment(equipRes.data.data);
      setCustomers(custRes.data.data);
      setBranches(branchRes.data);
      if (usersRes) {
        setUsers(usersRes.data.data || usersRes.data || []);
        setUsersLoaded(true);
      }
    } catch (e) {
      console.error('Modal data load error:', e);
    } finally {
      setModalLoading(false);
    }
  }, [isAdmin, canManageRentals, isSaler, isDriver, usersLoaded]);

  const loadRentals = useCallback(async (p = 1, st = activeTab, q = search, sk = sortKey) => {
    setTableLoading(true);
    try {
      const res = await getRentals(p, 5, st, q, '', '', '', sk);
      setRentals(res.data?.data || []);
      setTotalPages(res.data?.pagination?.totalPages || 1);
      setTotalCount(res.data?.pagination?.total || 0);
    } catch (e) {
      console.error('Rentals load error:', e);
    } finally {
      setTableLoading(false);
    }
  }, [activeTab, search, sortKey]);

  const loadDashboard = useCallback(async (start, end) => {
    setStatsLoading(true);
    try {
      const res = await getDashboardToday(start, end);
      setToday(res.data);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        getDashboardToday(dateRange.start, dateRange.end),
        getRentalCounts(),
        getRentals(1, 5, activeTab, search, '', '', '', sortKey)
      ]);
      if (results[0].status === 'fulfilled') setToday(results[0].value.data);
      if (results[1].status === 'fulfilled') setCounts(results[1].value.data);
      if (results[2].status === 'fulfilled') {
        const res = results[2].value.data;
        setRentals(res?.data || []);
        setTotalPages(res?.pagination?.totalPages || 1);
        setTotalCount(res?.pagination?.total || 0);
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, sortKey]); // eslint-disable-line

  useEffect(() => { loadInitial(); }, []); // eslint-disable-line

  // Reload dashboard stats when date range changes
  useEffect(() => {
    if (!loading && dateRange.start && dateRange.end) {
      loadDashboard(dateRange.start, dateRange.end);
    }
  }, [dateRange]); // eslint-disable-line

  const skipNextPageFetch = useRef(false);

  // Re-fetch rentals when tab or search changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(prev => {
        if (prev !== 1) skipNextPageFetch.current = true;
        return 1;
      });
      loadRentals(1, activeTab, search, sortKey);
      loadCounts();
    }, 400);
    return () => clearTimeout(timer);
  }, [activeTab, search, sortKey, loadRentals, loadCounts]);

  // Fetch specific page
  const initialPageMount = useRef(true);
  useEffect(() => {
    if (initialPageMount.current) {
      initialPageMount.current = false;
      return;
    }
    if (skipNextPageFetch.current) {
      skipNextPageFetch.current = false;
      return;
    }
    loadRentals(page, activeTab, search, sortKey);
  }, [page]); // eslint-disable-line

  useEffect(() => {
    if (!editingItem?.customer_id || editCustomerData?.name || customers.length === 0) return;

    const customer = customers.find((c) => String(c.id) === String(editingItem.customer_id));
    if (customer) {
      setEditCustomerData(toEditableCustomer(customer));
    }
  }, [customers, editingItem, editCustomerData]);

  // Ensure editing item's customer and branches are always in the dropdown options,
  // even if not loaded due to pagination or soft-deleted.
  const augmentedCustomers = React.useMemo(() => {
    if (!editingItem?.customer_id) return customers;
    const exists = customers.some(c => String(c.id) === String(editingItem.customer_id));
    if (exists) return customers;
    const synthetic = {
      id: editingItem.customer_id,
      name: editingItem.customer_name || `Khách #${editingItem.customer_id}`,
      phone: editingItem.customer_phone || '',
      email: editingItem.customer_email || '',
      total_rentals: 0,
      is_blacklisted: false,
    };
    return [synthetic, ...customers];
  }, [customers, editingItem]);

  const augmentedBranches = React.useMemo(() => {
    if (!editingItem) return branches;
    const result = [...branches];
    const addIfMissing = (id, name) => {
      if (id && !result.some(b => String(b.id) === String(id))) {
        result.push({ id, name: name || `Chi nhánh #${id}` });
      }
    };
    addIfMissing(editingItem.pickup_branch_id, editingItem.pickup_branch_name);
    addIfMissing(editingItem.return_branch_id, editingItem.return_branch_name);
    addIfMissing(editingItem.branch_id, editingItem.original_branch_name);
    return result;
  }, [branches, editingItem]);

  const openEditModal = async (item) => {
    setEditingItem(item);
    setImagePreviews(getAllImages(item.images));
    setSelectedImageFiles([]);
    setImagesDirty(false);
    const customer = customers.find((c) => String(c.id) === String(item.customer_id));
    setEditCustomerData(toEditableCustomer(customer || item));
    setFormData({
      customer_id: item.customer_id,
      equipment_id: item.equipment_id,
      start_date: item.start_date?.split('T')[0] || '',
      start_period: item.start_period || 'sáng',
      end_date: item.end_date?.split('T')[0] || '',
      end_period: item.end_period || 'chiều',
      status: item.status,
      notes: item.notes || '',
      deposit_amount: item.deposit_amount || 0,
      accessories: Array.isArray(item.accessories) ? item.accessories : [],
      pickup_time: formatDateTimeForInput(item.pickup_time),
      return_time: formatDateTimeForInput(item.return_time),
      discount_amount: item.discount_amount || 0,
      discount_type: item.discount_type || 'fixed',
      applied_day_price: item.applied_day_price ?? null,
      used_discount_day_price: Boolean(item.used_discount_day_price),
      discount_day_price: item.discount_day_price ?? null,
      discount_day_threshold_snapshot: item.discount_day_threshold_snapshot ?? null,
      code: item.code || '',
      pickup_branch_id: item.pickup_branch_id || '',
      return_branch_id: item.return_branch_id || item.pickup_branch_id || '',
      branch_id: item.branch_id || '',
      custom_total: item.total_price != null ? Number(item.total_price) : null,
      paid_amount: item.paid_amount || 0,
      deposit_type: item.deposit_type || 'money',
      user_id: item.user_id || '',
      handover_user_id: item.handover_user_id || ''
    });

    setShowModal(true);
    loadModalData();
  };

  const resetModal = () => {
    setFormData(EMPTY_FORM);
    setNewCustomerData(EMPTY_CUSTOMER);
    setIsCreatingCustomer(false);
    setEditCustomerData(null);
    setImagePreviews([]);
    setSelectedImageFiles([]);
    setShowModal(false);
    setStep(1);
    setImagesDirty(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (formData.deposit_type === 'item' && imagePreviews.length === 0) {
      toast.error("Vui lòng tải lên ảnh minh chứng cọc vật dụng");
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        const currentFormData = { ...formData };

        if (editCustomerData && String(editCustomerData.id) === String(currentFormData.customer_id)) {
          const original = customers.find((c) => String(c.id) === String(editCustomerData.id)) || toEditableCustomer(editingItem);
          const editedCustomer = {
            name: (editCustomerData.name || '').trim(),
            phone: (editCustomerData.phone || '').trim(),
            email: (editCustomerData.email || '').trim()
          };

          if (!editedCustomer.name) {
            toast.error("Vui lòng nhập tên khách hàng");
            setSaving(false);
            return;
          }

          const changed =
            (original?.name ?? '') !== editedCustomer.name ||
            (original?.phone ?? '') !== editedCustomer.phone ||
            (original?.email ?? '') !== editedCustomer.email;

          if (changed) {
            await updateCustomer(editCustomerData.id, editedCustomer);
          }
        }

        await updateRental(editingItem.id, currentFormData);
        if (imagesDirty) {
          await uploadRentalImages(editingItem.id, imagePreviews, selectedImageFiles.map((file) => file.name));
        }
        toast.success('Cập nhật thành công');
      }
      resetModal();
      loadRentals(page, activeTab, search);
      loadCounts();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Lưu đơn thất bại');
    } finally {
      setSaving(false);
    }
  };

  const calculateTotalDays = () => {
    if (!formData.start_date || !formData.end_date) return { fullDays: 0, sessions: 0 };
    const d1Str = formData.start_date.split('T')[0];
    const d2Str = formData.end_date.split('T')[0];
    const d1 = new Date(d1Str + 'T00:00:00Z');
    const d2 = new Date(d2Str + 'T00:00:00Z');
    const daysDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    const pIdx = { 'sáng': 0, 'chiều': 1, 'tối': 2 };
    const p1 = pIdx[formData.start_period] ?? 0;
    const p2 = pIdx[formData.end_period] ?? 1;

    // Same day: ≥2 sessions = 1 day
    if (daysDiff === 0) {
      const sessionCount = Math.max(1, p2 - p1 + 1);
      if (sessionCount >= 2) return { fullDays: 1, sessions: 0 };
      return { fullDays: 0, sessions: sessionCount };
    }

    // Multi-day: count per calendar day
    let fullDays = 0;
    let sessions = 0;

    if (daysDiff > 1) fullDays += (daysDiff - 1);

    const startDaySessions = 3 - p1;
    if (startDaySessions >= 2) fullDays += 1;
    else sessions += startDaySessions;

    const endDaySessions = p2 + 1;
    if (endDaySessions >= 2) fullDays += 1;
    else sessions += endDaySessions;

    return { fullDays, sessions };
  };

  const renderTotalTime = ({ fullDays, sessions } = {}) => {
    const parts = [];
    if (fullDays > 0) parts.push(`${fullDays} ngày`);
    if (sessions > 0) parts.push(`${sessions} buổi`);
    return parts.length > 0 ? parts.join(', ') : '0 buổi';
  };

  const todayStr = new Date().toLocaleDateString('en-CA');


  const tabDefs = [
    { id: 'pending', label: 'Chờ giao', count: counts.pending },
    { id: 'active', label: 'Đang thuê', count: counts.active },
    { id: 'completed', label: 'Hoàn thành', count: counts.completed },
    { id: 'all', label: 'Tất cả', count: counts.all },
  ];

  const toggleSort = (field) => {
    const currentField = getSortField(sortKey);
    const currentDir = getSortDir(sortKey);
    const option = getSortOption(field);

    if (currentField === field) {
      setSortKey(buildSortKey(field, currentDir === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(buildSortKey(field, option?.defaultDir || 'asc'));
  };

  const SortHeader = ({ field, children, className = '', align = 'left' }) => {
    const active = getSortField(sortKey) === field;
    const dir = getSortDir(sortKey);
    const alignClass = align === 'right' ? 'justify-end text-right' : 'justify-start text-left';

    return (
      <th className={`px-5 py-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className={`flex w-full items-center gap-1.5 hover:text-orange-500 transition-colors ${alignClass}`}
          title="Sắp xếp"
        >
          <span>{children}</span>
          {active ? (
            <span className="text-[11px] leading-none text-orange-500">{dir === 'asc' ? '↑' : '↓'}</span>
          ) : (
            <ArrowUpDown size={12} className="flex-shrink-0 text-slate-300" />
          )}
        </button>
      </th>
    );
  };

  // Removed client-side filtering logic

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Đang tải dữ liệu...</p>
      </div>
    );
  }

  const s = today?.stats || {};
  const displayName = user?.full_name || user?.username || 'Admin';

  const isSingleDay = dateRange.start === dateRange.end;
  const isTodayActive = isSingleDay && dateRange.start === todayISO;
  const trendLabel = isSingleDay ? 'so với hôm qua' : 'so với kỳ trước';

  // Driver chỉ thấy đơn được phân công cho mình
  const driverFilter = (items) => isDriver && user?.id
    ? (items || []).filter(r => String(r.handover_user_id) === String(user.id))
    : (items || []);
  const driverPickups = driverFilter(today?.pickups);
  const driverReturns = driverFilter(today?.returns);
  const driverLatePickups = driverFilter(today?.latePickups);
  // overdueReturns: các đơn active quá hạn trả (trễ trả)
  const driverOverdueReturns = driverFilter(today?.overdue);
  // Gộp trễ giao + trễ trả vào panel TRỄ HẠN: trễ giao lên trước
  const driverOverdue = [
    ...driverLatePickups.map(r => ({ ...r, _overdueType: 'pickup' })),
    ...driverOverdueReturns.map(r => ({ ...r, _overdueType: 'return' }))
  ];

  const actionCount = isDriver
    ? driverPickups.length + driverReturns.length + driverOverdue.length
    : (today?.pickups?.length ?? 0) + (today?.returns?.length ?? 0) + (today?.overdue?.length ?? 0) + (today?.latePickups?.length ?? 0);

  const statCards = [
    { icon: TrendingUp, iconBg: 'rgba(249,115,22,0.10)', label: 'Doanh số', value: fmtVND(s.total_value_today), trend: s.total_value_today === 0 && s.total_value_trend === 0 ? null : s.total_value_trend, trendAbs: Math.abs(s.total_value_trend ?? 0), trendLabel },
    { icon: DollarSign, iconBg: 'rgba(34,197,94,0.10)', label: 'Doanh thu', value: fmtVND(s.revenue_today), trend: s.revenue_today === 0 && s.revenue_trend === 0 ? null : s.revenue_trend, trendAbs: Math.abs(s.revenue_trend ?? 0), trendLabel },
    { icon: FileText, iconBg: 'rgba(59,130,246,0.10)', label: 'Đơn mới', value: s.orders_today ?? 0, trend: s.orders_today === 0 && s.orders_trend === 0 ? null : s.orders_trend, trendAbs: Math.abs(s.orders_trend ?? 0), trendLabel },
    { icon: ArrowUpFromLine, iconBg: 'rgba(34,197,94,0.10)', label: 'Khách trả', value: s.returns_today ?? 0, trend: s.returns_today === 0 && s.returns_trend === 0 ? null : s.returns_trend, trendAbs: Math.abs(s.returns_trend ?? 0), trendLabel },
    { icon: Camera, iconBg: 'rgba(168,85,247,0.10)', label: 'Đang thuê', value: s.active_rentals ?? 0, trend: s.active_rentals_trend, trendAbs: Math.abs(s.active_rentals_trend ?? 0), trendLabel, isLive: isTodayActive },
    { icon: Package, iconBg: 'rgba(249,115,22,0.10)', label: 'Thiết bị trống', value: s.available_equipment ?? 0, trend: s.available_equipment_trend, trendAbs: Math.abs(s.available_equipment_trend ?? 0), trendLabel, isLive: isTodayActive },
  ];
  const linkedStatCards = statCards.map((card) => {
    if (card.label === 'Đang thuê') {
      return {
        ...card,
        isClickable: true,
        showMoreLink: true,
        onClick: () => navigate(`/equipment?availabilityStatus=active&asOf=${dateRange.end}`)
      };
    }

    if (card.label === 'Thiết bị trống') {
      return {
        ...card,
        isClickable: true,
        showMoreLink: true,
        onClick: () => navigate(`/equipment?availabilityStatus=available&asOf=${dateRange.end}`)
      };
    }

    return card;
  });

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-4 md:p-7 pb-10 bg-slate-50/50 min-h-full">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3 relative z-10">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-semibold text-slate-900 flex items-center gap-2 leading-tight tracking-tight">
            Xin chào, {displayName}
            <span className="inline-block animate-[wave_1.8s_ease-in-out_infinite] origin-[70%_80%]">👋</span>
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5 md:mt-1 font-semibold uppercase tracking-[0.1em]">
            {isTodayActive ? todayLabel() : `${fmtDate(dateRange.start)} – ${fmtDate(dateRange.end)}`}
          </p>
        </div>

        {/* Right side: Date picker + Search */}
        <div className="hidden md:flex items-center gap-3 flex-wrap md:flex-nowrap">
          <DateRangePicker
            startDate={dateRange.start}
            endDate={dateRange.end}
            onChange={({ start, end }) => setDateRange({ start, end })}
          />
          <div className="relative hidden md:block">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className="h-[35px] bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-[13.5px] w-52 outline-none text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100/50 transition-all font-medium shadow-sm"
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Mobile: DateRangePicker + Search */}
      <div className="flex flex-col gap-2.5 md:hidden relative z-10">
        <DateRangePicker
          startDate={dateRange.start}
          endDate={dateRange.end}
          onChange={({ start, end }) => setDateRange({ start, end })}
          className="w-full"
        />
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            className="h-[35px] bg-white border border-slate-200 rounded-2xl pl-10 pr-4 text-[14px] w-full outline-none text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100/50 transition-all font-medium shadow-sm"
            type="text"
            placeholder="Tìm kiếm nhanh..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!isDriver && (
        <button
          type="button"
          onClick={() => setShowMobileStats(value => !value)}
          className="group flex w-full items-center justify-between rounded-2xl border border-orange-200 bg-white py-2.5 pl-4 pr-1.5 text-left shadow-sm shadow-orange-100/50 transition-all hover:border-orange-300 hover:bg-orange-50/40"
        >
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition-colors group-hover:bg-orange-100">
              <TrendingUp size={16} />
            </span>
            <span className="flex flex-col">
              <span className="text-[13px] font-bold text-slate-700">{showMobileStats ? 'Ẩn thống kê' : 'Xem thống kê'}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{linkedStatCards.length} chỉ số tổng quan</span>
            </span>
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500 transition-colors group-hover:bg-white group-hover:text-orange-500">
            <ChevronDown size={12} className={`transition-transform duration-200 ${showMobileStats ? 'rotate-180' : ''}`} />
          </span>
        </button>
        )}
      </div>

      {/* ── Stat Cards & Action Panels ────────────────────────── */}
      <div className={`-mt-1.5 transition-all duration-300 md:mt-0 ${statsLoading ? 'opacity-40 scale-[0.99]' : 'opacity-100'}`}>
        {!isDriver && (
        <div className={`relative md:mb-6 md:min-h-[120px] ${showMobileStats ? 'block mb-4' : 'hidden md:block'}`}>
          <div className={`${showMobileStats ? 'mt-2 grid' : 'hidden'} grid-cols-2 gap-3 md:mt-0 md:grid md:grid-cols-3 md:gap-4`}>
            {linkedStatCards.map((sc, i) => <StatCard key={i} {...sc} />)}
          </div>
        </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowMobileActions(value => !value)}
            className={`group flex w-full items-center justify-between rounded-2xl border border-orange-200 bg-white py-2.5 pl-4 pr-1.5 text-left shadow-sm shadow-orange-100/50 transition-all hover:border-orange-300 hover:bg-orange-50/40 md:hidden ${showMobileActions ? 'mb-3' : 'mb-0'}`}
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-500 transition-colors group-hover:bg-orange-100">
                <Calendar size={16} />
              </span>
              <span className="flex flex-col">
                <span className="text-[13px] font-bold text-slate-700">{showMobileActions ? 'Ẩn cần xử lý' : 'Xem cần xử lý'}</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{actionCount} việc tổng quan</span>
              </span>
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-500 transition-colors group-hover:bg-white group-hover:text-orange-500">
              <ChevronDown size={12} className={`transition-transform duration-200 ${showMobileActions ? 'rotate-180' : ''}`} />
            </span>
          </button>
          <h2 className="hidden text-[12px] font-semibold text-slate-400 mb-3 md:mb-4 uppercase tracking-[0.15em] md:flex items-center gap-2.5">
            <div className="w-1.5 h-4 bg-orange-500 rounded-full" />
            {isTodayActive ? 'Hôm nay cần xử lý' : 'Cần xử lý trong kỳ'}
          </h2>
          <div className={`${showMobileActions ? 'grid' : 'hidden'} grid-cols-1 md:grid md:grid-cols-2 xl:grid-cols-3 gap-4`}>
            <ActionPanel color="blue" icon={ArrowUpFromLine} title={isTodayActive ? "GIAO MÁY HÔM NAY" : "GIAO MÁY TRONG KỲ"} count={driverPickups.length} items={driverPickups} renderItem={(r) => <ActionRow key={r.id} rental={r} type="pickup" onClick={() => openEditModal(r)} />} onViewAll={() => navigate(`/rentals?view=pickups_today${dateRange.start && dateRange.end ? `&startDate=${dateRange.start}&endDate=${dateRange.end}` : ''}`)} />
            <ActionPanel color="green" icon={ArrowDownToLine} title={isTodayActive ? "TRẢ MÁY HÔM NAY" : "TRẢ MÁY TRONG KỲ"} count={driverReturns.length} items={driverReturns} renderItem={(r) => <ActionRow key={r.id} rental={r} type="return" onClick={() => openEditModal(r)} />} onViewAll={() => navigate(`/rentals?view=returns_today${dateRange.start && dateRange.end ? `&startDate=${dateRange.start}&endDate=${dateRange.end}` : ''}`)} />
            <ActionPanel color="red" icon={AlertTriangle} title="TRỄ HẠN" count={driverOverdue.length} items={driverOverdue} renderItem={(r) => <OverdueRow key={`${r._overdueType}-${r.id}`} rental={r} onClick={() => openEditModal(r)} overdueType={r._overdueType || 'return'} />} onViewAll={() => navigate('/rentals?view=overdue')} />
          </div>
        </div>
      </div>

      {statsLoading && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-[3px] border-orange-500 border-t-orange-200 rounded-full animate-spin" />
            <div className="flex flex-col items-center gap-1">
              <p className="text-[14px] font-semibold text-slate-900">Đang tải dữ liệu</p>
              <p className="text-[11px] text-slate-400 font-medium">Vui lòng chờ...</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Orders Table / Mobile Cards ────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">

        {/* Tabs - Fixed to fit mobile */}
        <div className="border-b border-slate-100 bg-slate-50/30">
          <div className="flex items-center w-full">
            {tabDefs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 md:gap-1.5 py-4 text-[11.5px] md:text-[13px] font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer
                  ${activeTab === tab.id
                    ? 'text-orange-500 border-orange-500 bg-orange-50/30'
                    : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-100/50'
                  }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`min-w-[16px] h-4 md:min-w-[20px] md:h-5 px-1 md:px-1.5 flex items-center justify-center text-[9px] md:text-[10px] font-bold rounded-full transition-colors
                    ${activeTab === tab.id ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <MobileSortControl sortKey={sortKey} setSortKey={setSortKey} />

        {/* Content View */}
        <div className="flex-1">
          {tableLoading ? (
            <div className="py-20 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-[13px] text-slate-400 font-semibold">Đang cập nhật danh sách...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <SortHeader field="code" className="whitespace-nowrap">Mã đơn</SortHeader>
                      <SortHeader field="created" className="whitespace-nowrap">Ngày tạo</SortHeader>
                      <SortHeader field="customer">Khách hàng</SortHeader>
                      <SortHeader field="equipment">Thiết bị</SortHeader>
                      <SortHeader field="pickup" className="whitespace-nowrap">Thời gian nhận</SortHeader>
                      <SortHeader field="branch">Nơi nhận máy</SortHeader>
                      <SortHeader field="price" className="whitespace-nowrap">Tổng tiền</SortHeader>
                      <SortHeader field="status">Trạng thái</SortHeader>
                      <th className="px-5 py-4 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rentals.map(r => {
                      const status = STATUS_MAP[r.status] || { label: r.status, cls: '' };
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60 transition-colors group">
                          <td className="px-5 py-4 text-[11.5px] font-semibold text-slate-400 whitespace-nowrap">
                            {r.code || `#OD${String(r.order_number || r.id).padStart(7, '0')}`}
                          </td>
                          <td className="px-5 py-4 text-[12.5px] font-semibold text-slate-600 whitespace-nowrap">
                            {fmtDate(r.inserted_at)}
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-900 text-[14px]">{r.customer_name}</p>
                            <p className="text-[11.5px] text-slate-400 mt-0.5">{r.customer_phone || '—'}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-50">
                                <LazyImage
                                  entity="equipment"
                                  id={r.equipment_id}
                                  src={getFirstImage(r.equipment_images)}
                                  alt={r.equipment_name}
                                  className="w-full h-full object-cover"
                                  fallback={Camera}
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 text-[13.5px] truncate">{r.equipment_name}</p>
                                <div className="mt-1">
                                  <span className="text-[11px] text-slate-400 truncate uppercase tracking-tighter block mb-0.5">{r.equipment_code}</span>
                                  <div className="flex items-center gap-1 text-[11px] text-indigo-500 font-semibold">
                                    <Home size={10} className="text-indigo-400 flex-shrink-0" />
                                    <span className="truncate">{r.original_branch_name || 'Hệ thống'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <p className="font-semibold text-slate-800 text-[13.5px]">{fmtDate(r.pickup_time)}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 font-semibold uppercase tracking-tight">{fmtTime(r.pickup_time)}</p>
                          </td>
                          <td className="px-5 py-4 text-[13px] font-semibold text-slate-600">
                            <div>Nhận: {r.pickup_branch_name || '—'}</div>
                            <div className="text-[13px] text-emerald-600 mt-1">Trả: {r.return_branch_name || r.pickup_branch_name || '—'}</div>
                          </td>
                          <td className="px-5 py-4 text-[15px] font-semibold text-slate-900 whitespace-nowrap">{fmtVND(r.total_price)}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10.5px] font-semibold whitespace-nowrap uppercase tracking-tight ${status.cls}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditModal(r)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50 transition-all shadow-sm cursor-pointer">
                                <Edit2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden p-4 space-y-4">
                {rentals.map(r => (
                  <RentalMobileCard key={r.id} r={r} navigate={navigate} onEdit={openEditModal} />
                ))}
              </div>

              {rentals.length === 0 && (
                <div className="py-20 text-center text-slate-400 text-[14px] font-medium italic">
                  Không có đơn thuê nào
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 md:px-5 py-4 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50/30">
            <p className="text-[12.5px] text-slate-500 font-semibold order-2 md:order-1">
              Hiển thị <span className="text-slate-900">{rentals.length}</span> / <span className="text-slate-900">{totalCount}</span> đơn
            </p>
            <div className="flex items-center gap-2 order-1 md:order-2">
              <button
                disabled={page === 1 || tableLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="w-10 h-10 rounded-2xl border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-orange-500 hover:border-orange-200 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="px-4 py-2 bg-white border border-slate-200 rounded-2xl text-[13px] font-semibold text-slate-700 min-w-[70px] text-center shadow-sm">
                {page} <span className="text-slate-300 font-medium mx-1">/</span> {totalPages}
              </div>
              <button
                disabled={page === totalPages || tableLoading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="w-10 h-10 rounded-2xl border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-orange-500 hover:border-orange-200 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-sm cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <RentalModal
        showModal={showModal}
        onClose={resetModal}
        step={step}
        setStep={setStep}
        editingItem={editingItem}
        saving={saving}
        loading={modalLoading}
        formData={formData}
        setFormData={setFormData}
        editCustomerData={editCustomerData}
        setEditCustomerData={setEditCustomerData}
        isCreatingCustomer={isCreatingCustomer}
        setIsCreatingCustomer={setIsCreatingCustomer}
        newCustomerData={newCustomerData}
        setNewCustomerData={setNewCustomerData}
        customers={augmentedCustomers}
        equipment={equipment}
        branches={augmentedBranches}
        users={users}
        handleSubmit={handleSubmit}
        imagePreviews={imagePreviews}
        handleImageSelect={(e) => {
          const files = Array.from(e.target.files || []);
          setSelectedImageFiles(prev => [...prev, ...files]);
          if (files.length > 0) setImagesDirty(true);
          files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => setImagePreviews(prev => [...prev, e.target.result]);
            reader.readAsDataURL(file);
          });
        }}
        removeImage={(index) => {
          if (isNewImagePreview(imagePreviews[index])) {
            const fileIndex = getNewImageIndex(imagePreviews, index);
            setSelectedImageFiles(prev => prev.filter((_, i) => i !== fileIndex));
          }
          setImagePreviews(prev => prev.filter((_, i) => i !== index));
          setImagesDirty(true);
        }}
        calculateTotalDays={calculateTotalDays}
        renderTotalTime={renderTotalTime}
        isAdmin={isAdmin}
        isCameraManager={canManageRentals}
        isSaler={isSaler}
        isDriver={isDriver}
        isFetchingImages={false}
        toast={toast}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default DashboardV1;
