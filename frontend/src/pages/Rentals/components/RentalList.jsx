import React, { useState } from 'react';
import {
  Package, Store, Edit2, Trash2, ImageIcon, Clock,
  Search, SlidersHorizontal, X, ChevronDown, User, Home,
  ArrowUpDown, CalendarDays,
} from 'lucide-react';
import { formatPrice, formatPeriodDate, formatTime, formatVN, getFirstImage } from '../../../utils/formatters';
import LazyImage from '../../../components/LazyImage';
import ModernDatePicker from '../../../components/ModernDatePicker';
import CustomSelect from '../../../components/CustomSelect';


/* ── Status config ────────────────────────────────────────────── */
const STATUS_CONFIG = {
  pending: { label: 'Chờ giao', dot: 'bg-amber-400', badge: 'bg-amber-50 text-orange-600 border-amber-200' },
  active: { label: 'Đang thuê', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600 border-blue-200' },
  completed: { label: 'Hoàn thành', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Đã hủy', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-600 border-rose-200' },
};

const AVATAR_COLORS = ['bg-orange-400', 'bg-violet-500', 'bg-cyan-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-400'];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
};

/* ── StatusBadge ──────────────────────────────────────────────── */
const StatusBadge = ({ status, compact = false }) => {
  const cfg = STATUS_CONFIG[status] || { label: status, dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-500 border-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold uppercase whitespace-nowrap ${compact ? 'gap-1 px-1.5 py-1 text-[9px] tracking-normal max-w-full' : 'gap-1.5 px-2.5 py-1 text-[10.5px] tracking-wide'} ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
      <span className="truncate">{cfg.label}</span>
    </span>
  );
};

/* ── Filter Bar ───────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { field: 'code', label: 'Mã đơn', defaultDir: 'asc' },
  { field: 'created', label: 'Ngày tạo', defaultDir: 'desc' },
  { field: 'customer', label: 'Khách hàng', defaultDir: 'asc' },
  { field: 'equipment', label: 'Thiết bị', defaultDir: 'asc' },
  { field: 'branch', label: 'Nơi nhận máy', defaultDir: 'asc' },
  { field: 'start', label: 'Bắt đầu', defaultDir: 'asc' },
  { field: 'end', label: 'Kết thúc', defaultDir: 'asc' },
  { field: 'price', label: 'Chi phí', defaultDir: 'desc' },
  { field: 'status', label: 'Trạng thái', defaultDir: 'asc' },
];

const getSortOption = (field) => SORT_OPTIONS.find(option => option.field === field);
const getSortField = (sortKey) => sortKey.split('_')[0];
const getSortDir = (sortKey) => sortKey.endsWith('_asc') ? 'asc' : 'desc';
const buildSortKey = (field, dir) => `${field}_${dir}`;

const DateFilterInput = ({ label, value, onChange }) => (
  <div className="relative w-full sm:w-[176px] sm:shrink-0">
    <ModernDatePicker
      value={value}
      onChange={onChange}
      placeholder={label}
      className="w-full"
    />
    {value && (
      <button
        type="button"
        className="absolute right-[13.5px] top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        onClick={() => onChange('')}
        title={`Xóa ${label.toLowerCase()}`}
      >
        <X size={13} />
      </button>
    )}
  </div>
);

/*
        title={`Xóa ${placeholder.toLowerCase()}`}
*/
const SELECT_ACCENTS = {
  owner: {
    icon: 'border-orange-100 bg-orange-50 text-orange-500',
    activeButton: '!border-orange-200 !bg-orange-50/70 !text-orange-700 hover:!border-orange-300 hover:!bg-orange-50 focus-within:!ring-2 focus-within:!ring-orange-100',
    idleButton: '!border-slate-200 !bg-slate-50 text-slate-700 hover:!border-orange-200 hover:!bg-orange-50/30 focus-within:!ring-2 focus-within:!ring-orange-100',
  },
  branch: {
    icon: 'border-sky-100 bg-sky-50 text-sky-600',
    activeButton: '!border-sky-200 !bg-sky-50/70 !text-sky-700 hover:!border-sky-300 hover:!bg-sky-50 focus-within:!ring-2 focus-within:!ring-sky-100',
    idleButton: '!border-slate-200 !bg-slate-50 text-slate-700 hover:!border-sky-200 hover:!bg-sky-50/40 focus-within:!ring-2 focus-within:!ring-sky-100',
  },
};

const SelectFilterInput = ({ icon: Icon, value, onChange, placeholder, options = [], accent = 'owner', renderOption }) => {
  const isActive = Boolean(value);
  const styles = SELECT_ACCENTS[accent] || SELECT_ACCENTS.owner;

  return (
    <div className="relative w-full sm:w-[212px] sm:shrink-0">
      {Icon && (
        <span className={`absolute left-2.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg border shadow-sm pointer-events-none ${
          isActive ? styles.icon : 'border-slate-200 bg-white text-slate-400'
        }`}>
          <Icon size={13} />
        </span>
      )}
      <CustomSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        labelField="label"
        valueField="value"
        className="h-[35px]"
        showSearch={options.length > 6}
        autoFocusSearch={false}
        renderOption={renderOption}
        buttonClassName={`!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-semibold [&>span]:leading-[1.25] [&>span]:text-left ${
          isActive ? styles.activeButton : styles.idleButton
        } ${Icon ? '!pl-10' : '!pl-3'} !pr-3`}
      />
    </div>
  );
};

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
    <div className="relative w-full xl:hidden">
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
        <div className="absolute left-[74px] right-12 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
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

const FilterBar = ({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  view,
  setView,
  startDate,
  endDate,
  sortKey,
  setSortKey,
  pickupDateFilter,
  setPickupDateFilter,
  returnDateFilter,
  setReturnDateFilter,
  ownerFilter,
  setOwnerFilter,
  pickupBranchFilter,
  setPickupBranchFilter,
  returnBranchFilter,
  setReturnBranchFilter,
  creatorFilter,
  setCreatorFilter,
  createdDateFilter,
  setCreatedDateFilter,
  owners = [],
  creators = [],
  branches = [],
  isSaler = false,
}) => {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    dates: false,
    people: false,
    locations: false,
    statusSort: false,
  });

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const dateActiveCount = [pickupDateFilter, returnDateFilter, createdDateFilter].filter(Boolean).length;
  const peopleActiveCount = (isSaler ? [creatorFilter] : [ownerFilter, creatorFilter]).filter(Boolean).length;
  const locationActiveCount = [pickupBranchFilter, returnBranchFilter].filter(Boolean).length;
  const statusSortActiveCount = statusFilter !== 'all' ? 1 : 0;

  const options = [
    { value: 'all', label: 'Tất cả trạng thái' },
    ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label, dot: v.dot })),
  ];
  const ownerOptions = owners.map((item) => ({
    value: String(item.id),
    label: item.full_name || item.username || `User #${item.id}`,
    subtitle: item.username && item.full_name ? item.username : `ID ${item.id}`,
    initials: getInitials(item.full_name || item.username),
  }));
  const creatorOptions = creators.map((item) => ({
    value: String(item.id),
    label: item.full_name || item.username || `User #${item.id}`,
    subtitle: item.username && item.full_name ? item.username : `ID ${item.id}`,
    initials: getInitials(item.full_name || item.username),
  }));
  const branchOptions = branches.map((item) => ({
    value: String(item.id),
    label: item.name,
    subtitle: item.address || item.code || `ID ${item.id}`,
    code: item.code,
  }));

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const getViewLabel = () => {
    if (view === 'pickups_today') {
      return startDate && endDate ? `Giao máy trong kỳ (${fmtDate(startDate)} - ${fmtDate(endDate)})` : 'Giao máy hôm nay';
    }
    if (view === 'returns_today') {
      return startDate && endDate ? `Trả máy trong kỳ (${fmtDate(startDate)} - ${fmtDate(endDate)})` : 'Trả máy hôm nay';
    }
    if (view === 'overdue') return 'Đơn trễ hạn';
    return '';
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 flex-wrap">
      {view && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-100 rounded-xl text-[12px] font-bold text-orange-600 animate-in fade-in slide-in-from-left-2 duration-300">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span>Đang xem: {getViewLabel()}</span>
          <button 
            onClick={() => setView('')}
            className="ml-1 p-0.5 hover:bg-orange-100 rounded-md transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative w-full sm:flex-1 sm:min-w-[320px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          className="h-[35px] w-full pl-9 pr-8 border border-slate-200 rounded-xl text-[13px] bg-slate-50 text-slate-800 placeholder:text-slate-400 outline-none focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100 transition-all font-[inherit]"
          placeholder="Tìm tên khách, thiết bị, mã..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="absolute right-[13.5px] top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            onClick={() => setSearch('')}
          >
            <X size={13} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMobileFiltersOpen(value => !value)}
        className={`flex h-[35px] w-full items-center justify-between rounded-xl border px-3.5 text-[12px] font-semibold transition-all sm:hidden ${
          mobileFiltersOpen || [pickupDateFilter, returnDateFilter, createdDateFilter, ownerFilter, creatorFilter, pickupBranchFilter, returnBranchFilter, statusFilter !== 'all' ? statusFilter : ''].filter(Boolean).length > 0
            ? 'border-orange-200 bg-orange-50 text-orange-600'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={13} className="flex-shrink-0" />
          <span>{(() => {
            const count = [pickupDateFilter, returnDateFilter, createdDateFilter, ownerFilter, creatorFilter, pickupBranchFilter, returnBranchFilter, statusFilter !== 'all' ? statusFilter : ''].filter(Boolean).length;
            return count > 0 ? `Bộ lọc (${count})` : 'Hiện bộ lọc';
          })()}</span>
        </span>
        <ChevronDown size={12} className={`transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* ── Mobile Filter Panel ───────────────────────────────── */}
      <div className={`${mobileFiltersOpen ? 'block' : 'hidden'} sm:hidden w-full`}>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-lg p-4 space-y-0 divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Section: Ngày tháng */}
          <div className={expandedSections.dates ? 'pb-4' : ''}>
            <button
              type="button"
              onClick={() => toggleSection('dates')}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <CalendarDays size={12} className="text-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Ngày tháng</span>
                {dateActiveCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-600 text-[9px] font-bold">
                    {dateActiveCount}
                  </span>
                )}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${expandedSections.dates ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.dates && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <DateFilterInput
                    label="Ngày nhận"
                    value={pickupDateFilter}
                    onChange={setPickupDateFilter}
                  />
                  <DateFilterInput
                    label="Ngày trả"
                    value={returnDateFilter}
                    onChange={setReturnDateFilter}
                  />
                </div>
                <DateFilterInput
                  label="Ngày tạo"
                  value={createdDateFilter}
                  onChange={setCreatedDateFilter}
                />
              </div>
            )}
          </div>

          {/* Section: Người liên quan */}
          <div className={expandedSections.people ? 'pb-4' : ''}>
            <button
              type="button"
              onClick={() => toggleSection('people')}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <User size={12} className="text-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Người liên quan</span>
                {peopleActiveCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-600 text-[9px] font-bold">
                    {peopleActiveCount}
                  </span>
                )}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${expandedSections.people ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.people && (
              <div className="space-y-2.5">
                {!isSaler && (
                <SelectFilterInput
                  icon={User}
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  placeholder="Chủ sở hữu"
                  options={ownerOptions}
                  accent="owner"
                  renderOption={(owner) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(owner.label)}`}>
                        {owner.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{owner.label}</span>
                        <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{owner.subtitle}</span>
                      </span>
                    </div>
                  )}
                />
                )}
                <SelectFilterInput
                  icon={User}
                  value={creatorFilter}
                  onChange={setCreatorFilter}
                  placeholder="Người tạo đơn"
                  options={creatorOptions}
                  accent="owner"
                  renderOption={(creator) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(creator.label)}`}>
                        {creator.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{creator.label}</span>
                        <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{creator.subtitle}</span>
                      </span>
                    </div>
                  )}
                />
              </div>
            )}
          </div>

          {/* Section: Địa điểm */}
          <div className={expandedSections.locations ? 'pb-4' : ''}>
            <button
              type="button"
              onClick={() => toggleSection('locations')}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <Store size={12} className="text-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Địa điểm</span>
                {locationActiveCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-600 text-[9px] font-bold">
                    {locationActiveCount}
                  </span>
                )}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${expandedSections.locations ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.locations && (
              <div className="space-y-2.5">
                <SelectFilterInput
                  icon={Store}
                  value={pickupBranchFilter}
                  onChange={setPickupBranchFilter}
                  placeholder="Nơi nhận"
                  options={branchOptions}
                  accent="branch"
                  renderOption={(branch) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600">
                        <Store size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{branch.label}</span>
                        <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{branch.code || branch.subtitle}</span>
                      </span>
                    </div>
                  )}
                />
                <SelectFilterInput
                  icon={Store}
                  value={returnBranchFilter}
                  onChange={setReturnBranchFilter}
                  placeholder="Nơi trả"
                  options={branchOptions}
                  accent="branch"
                  renderOption={(branch) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600">
                        <Store size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-tight">{branch.label}</span>
                        <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{branch.code || branch.subtitle}</span>
                      </span>
                    </div>
                  )}
                />
              </div>
            )}
          </div>

          {/* Section: Trạng thái & Sắp xếp */}
          <div className={expandedSections.statusSort ? 'pb-4' : ''}>
            <button
              type="button"
              onClick={() => toggleSection('statusSort')}
              className="w-full flex items-center justify-between py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={12} className="text-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Trạng thái & Sắp xếp</span>
                {statusSortActiveCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-100 text-orange-600 text-[9px] font-bold">
                    {statusSortActiveCount}
                  </span>
                )}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${expandedSections.statusSort ? 'rotate-180' : ''}`} />
            </button>
            {expandedSections.statusSort && (
              <div className="space-y-2.5">
                {/* Status dropdown */}
                <div className="relative w-full">
                  <CustomSelect
                    options={options}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    placeholder="Tất cả trạng thái"
                    labelField="label"
                    valueField="value"
                    showSearch={false}
                    accent="slate"
                    buttonClassName="!h-[35px] !rounded-xl !py-0 !pr-3 !shadow-sm [&>span]:text-[12px] [&>span]:font-semibold"
                    renderOption={(opt) => (
                      <div className="flex items-center gap-2.5 min-w-0">
                        {opt.dot && <span className={`w-2 h-2 rounded-full ${opt.dot} flex-shrink-0`} />}
                        <span className="truncate text-[12.5px] font-semibold">{opt.label}</span>
                      </div>
                    )}
                  />
                </div>

                {/* Sort control inside panel */}
                <MobileSortControl sortKey={sortKey} setSortKey={setSortKey} />
              </div>
            )}
          </div>

          {/* Clear all filters button */}
          {(() => {
            const hasAnyFilter = [pickupDateFilter, returnDateFilter, createdDateFilter, ownerFilter, creatorFilter, pickupBranchFilter, returnBranchFilter, statusFilter !== 'all' ? statusFilter : ''].some(Boolean);
            return hasAnyFilter ? (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setPickupDateFilter('');
                    setReturnDateFilter('');
                    setCreatedDateFilter('');
                    setOwnerFilter('');
                    setCreatorFilter('');
                    setPickupBranchFilter('');
                    setReturnBranchFilter('');
                    setStatusFilter('all');
                  }}
                  className="w-full py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-[11.5px] font-bold uppercase tracking-wider hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={14} />
                  Xóa tất cả bộ lọc
                </button>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* ── Desktop Filters (inline) ──────────────────────────── */}
      <div className="hidden sm:contents">

      <DateFilterInput
        label="Ngày nhận"
        value={pickupDateFilter}
        onChange={setPickupDateFilter}
      />

      <DateFilterInput
        label="Ngày trả"
        value={returnDateFilter}
        onChange={setReturnDateFilter}
      />

      <DateFilterInput
        label="Ngày tạo"
        value={createdDateFilter}
        onChange={setCreatedDateFilter}
      />

      {!isSaler && (
      <SelectFilterInput
        icon={User}
        value={ownerFilter}
        onChange={setOwnerFilter}
        placeholder="Chủ sở hữu"
        options={ownerOptions}
        accent="owner"
        renderOption={(owner) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(owner.label)}`}>
              {owner.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{owner.label}</span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{owner.subtitle}</span>
            </span>
          </div>
        )}
      />
      )}

      <SelectFilterInput
        icon={User}
        value={creatorFilter}
        onChange={setCreatorFilter}
        placeholder="Người tạo đơn"
        options={creatorOptions}
        accent="owner"
        renderOption={(creator) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(creator.label)}`}>
              {creator.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{creator.label}</span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{creator.subtitle}</span>
            </span>
          </div>
        )}
      />

      <SelectFilterInput
        icon={Store}
        value={pickupBranchFilter}
        onChange={setPickupBranchFilter}
        placeholder="Nơi nhận"
        options={branchOptions}
        accent="branch"
        renderOption={(branch) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600">
              <Store size={14} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{branch.label}</span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{branch.code || branch.subtitle}</span>
            </span>
          </div>
        )}
      />

      <SelectFilterInput
        icon={Store}
        value={returnBranchFilter}
        onChange={setReturnBranchFilter}
        placeholder="Nơi trả"
        options={branchOptions}
        accent="branch"
        renderOption={(branch) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-600">
              <Store size={14} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{branch.label}</span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{branch.code || branch.subtitle}</span>
            </span>
          </div>
        )}
      />

      {/* Status dropdown */}
      <div className="relative w-full sm:w-auto sm:shrink-0">
        <CustomSelect
          options={options}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Tất cả trạng thái"
          labelField="label"
          valueField="value"
          showSearch={false}
          accent="slate"
          className="sm:w-[188px]"
          buttonClassName="!h-[35px] !rounded-xl !py-0 !pr-3 !shadow-sm [&>span]:text-[12px] [&>span]:font-semibold"
          renderOption={(opt) => (
            <div className="flex items-center gap-2.5 min-w-0">
              {opt.dot && <span className={`w-2 h-2 rounded-full ${opt.dot} flex-shrink-0`} />}
              <span className="truncate text-[12.5px] font-semibold">{opt.label}</span>
            </div>
          )}
        />
      </div>

      </div>

      {/* Tablet sort control (visible on sm..xl, hidden on mobile & desktop) */}
      <div className="hidden sm:block xl:hidden w-full">
        <MobileSortControl sortKey={sortKey} setSortKey={setSortKey} />
      </div>
    </div>
  );
};

/* ── Main Component ───────────────────────────────────────────── */
const RentalList = React.memo(({
  loading = false,
  rentals = [],
  isAdmin = false,
  canQuickStatusEdit = false,
  STATUS_MAP = {},
  equipment = [],
  openStatusModal,
  openEditModal,
  setDeleteTarget,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  view,
  setView,
  startDate,
  endDate,
  sortKey,
  setSortKey,
  pickupDateFilter,
  setPickupDateFilter,
  returnDateFilter,
  setReturnDateFilter,
  ownerFilter,
  setOwnerFilter,
  pickupBranchFilter,
  setPickupBranchFilter,
  returnBranchFilter,
  setReturnBranchFilter,
  creatorFilter,
  setCreatorFilter,
  createdDateFilter,
  setCreatedDateFilter,
  owners = [],
  creators = [],
  branches = [],
  isSaler = false,
}) => {
  const isEmpty = !loading && rentals.length === 0;

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
    const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';

    return (
      <th className={`px-2.5 py-3 text-[10px] font-semibold uppercase tracking-wider ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className={`flex w-full items-center gap-1.5 text-slate-400 hover:text-orange-500 transition-colors ${alignClass}`}
          title="Sắp xếp"
        >
          <span className="min-w-0">{children}</span>
          {active ? (
            <span className="text-[11px] leading-none text-orange-500">{dir === 'asc' ? '↑' : '↓'}</span>
          ) : (
            <ArrowUpDown size={11} className="flex-shrink-0 text-slate-300" />
          )}
        </button>
      </th>
    );
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const getViewLabel = () => {
    if (view === 'pickups_today') {
      return startDate && endDate ? `Giao máy trong kỳ (${fmtDate(startDate)} - ${fmtDate(endDate)})` : 'Giao máy hôm nay';
    }
    if (view === 'returns_today') {
      return startDate && endDate ? `Trả máy trong kỳ (${fmtDate(startDate)} - ${fmtDate(endDate)})` : 'Trả máy hôm nay';
    }
    if (view === 'overdue') return 'Đơn trễ hạn';
    return '';
  };

  /* ── Shared empty / loading states ─────────────────────────── */
  const EmptyState = () => (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
        <Package size={32} />
      </div>
      <p className="text-sm font-semibold text-slate-500">Không có đơn thuê nào</p>
      <p className="text-xs text-slate-400">{view ? `Không có ${getViewLabel()?.toLowerCase()} nào` : 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'}</p>
    </div>
  );

  const LoadingState = () => (
    <div className="flex flex-col items-center gap-3 py-14">
      <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Đang tải...</span>
    </div>
  );

  return (
    <>
      <FilterBar
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        view={view}
        setView={setView}
        startDate={startDate}
        endDate={endDate}
        sortKey={sortKey}
        setSortKey={setSortKey}
        pickupDateFilter={pickupDateFilter}
        setPickupDateFilter={setPickupDateFilter}
        returnDateFilter={returnDateFilter}
        setReturnDateFilter={setReturnDateFilter}
        ownerFilter={ownerFilter}
        setOwnerFilter={setOwnerFilter}
        pickupBranchFilter={pickupBranchFilter}
        setPickupBranchFilter={setPickupBranchFilter}
        returnBranchFilter={returnBranchFilter}
        setReturnBranchFilter={setReturnBranchFilter}
        creatorFilter={creatorFilter}
        setCreatorFilter={setCreatorFilter}
        createdDateFilter={createdDateFilter}
        setCreatedDateFilter={setCreatedDateFilter}
        owners={owners}
        creators={creators}
        branches={branches}
        isSaler={isSaler}
      />

      {/* ── Mobile Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:hidden gap-4 p-4">
        {loading ? (
          <div className="md:col-span-2"><LoadingState /></div>
        ) : isEmpty ? (
          <div className="md:col-span-2"><EmptyState /></div>
        ) : rentals.map(rental => (
          <div key={rental.id} className="flex h-full flex-col bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-100 transition-all">
            {/* Top */}
            <div className="flex gap-3 mb-3">
              <div className="flex-shrink-0">
                <LazyImage
                  entity="rentals"
                  id={rental.id}
                  src={getFirstImage(rental.images)}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover border border-slate-100"
                  fallback={ImageIcon}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5 truncate">
                      {rental.code || `#OD${String(rental.order_number || rental.id).padStart(7, '0')}`}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 min-w-0">
                      <CalendarDays size={10} className="text-slate-300 flex-shrink-0" />
                      <span>Tạo: {formatVN(rental.inserted_at) || '—'}</span>
                    </div>
                  </div>
                  <StatusBadge status={rental.status} />
                  {view === 'overdue' && rental.status === 'pending' && (
                    <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded whitespace-nowrap uppercase tracking-tight ml-1.5">
                      Trễ giao
                    </span>
                  )}
                  {view === 'overdue' && rental.status === 'active' && (
                    <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded whitespace-nowrap uppercase tracking-tight ml-1.5">
                      Trễ trả
                    </span>
                  )}
                </div>
                <h3 className="mb-1.5 min-h-[2.5rem] font-semibold text-slate-900 text-[15px] leading-tight break-words line-clamp-2">
                  {rental.customer_name}
                </h3>
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="mt-0.5 p-1 bg-orange-50 rounded-lg text-orange-500 flex-shrink-0">
                    <Package size={13} />
                  </span>
                  <div>
                    <span className="text-[13px] font-semibold text-slate-700 block leading-tight">{rental.equipment_name}</span>
                    <div className="mt-1">
                      <span className="text-[10px] font-semibold text-orange-500/70 uppercase tracking-widest block mb-0.5">#{rental.equipment_code}</span>
                      <div className="flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
                        <Home size={10} className="text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{rental.original_branch_name || 'Hệ thống'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {rental.pickup_branch_name && (
                  <div className="flex items-center gap-2 text-[11.5px] text-slate-500 font-semibold mt-1">
                    <span className="p-1 bg-violet-50 rounded-lg text-violet-400 flex-shrink-0">
                      <Store size={13} />
                    </span>
                    <span>Nhận: {rental.pickup_branch_name}</span>
                  </div>
                )}
                {(rental.return_branch_name || rental.pickup_branch_name) && (
                  <div className="flex items-center gap-2 text-[11.5px] text-slate-500 font-semibold mt-1">
                    <span className="p-1 bg-emerald-50 rounded-lg text-emerald-500 flex-shrink-0">
                      <Store size={13} />
                    </span>
                    <span>Trả: {rental.return_branch_name || rental.pickup_branch_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[11.5px] text-slate-500 font-semibold mt-1">
                  <span className="p-1 bg-indigo-50 rounded-lg text-indigo-400 flex-shrink-0">
                    <User size={13} />
                  </span>
                  <span className="truncate">{rental.full_name || 'Hệ thống'}</span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="mt-auto flex gap-0 bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Bắt đầu
                </div>
                <p className="text-[12.5px] font-semibold text-slate-900">{formatPeriodDate(rental.start_date, rental.start_period)}</p>
                {rental.pickup_time && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-orange-600 uppercase">
                    <Clock size={9} strokeWidth={3} />
                    Lấy: {formatVN(rental.pickup_time)} {formatTime(rental.pickup_time)}
                  </div>
                )}
              </div>
              <div className="w-px bg-slate-200 mx-3 self-stretch" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  Kết thúc
                </div>
                <p className="text-[12.5px] font-semibold text-slate-900">{formatPeriodDate(rental.end_date, rental.end_period)}</p>
                {rental.return_time && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 uppercase">
                    <Clock size={9} strokeWidth={3} />
                    Trả: {formatVN(rental.return_time)} {formatTime(rental.return_time)}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-50">
              <div>
                <p className="font-semibold text-slate-900 text-[14px]">{formatPrice(rental.total_price)}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{formatPrice(rental.applied_day_price ?? rental.unit_price)}/ngày</p>
                {Number(rental.paid_amount) > 0 && (
                  <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                    {formatPrice(rental.paid_amount)} đã thanh toán
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {canQuickStatusEdit && (
                  <button onClick={() => openStatusModal(rental)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-50 text-violet-700 text-[11.5px] font-semibold hover:bg-violet-100 transition-colors">
                    <Edit2 size={13} /> Trạng thái
                  </button>
                )}
                <button onClick={() => openEditModal(rental)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 hover:-translate-y-0.5 transition-all">
                  <Edit2 size={15} />
                </button>
                {isAdmin && (
                  <button onClick={() => setDeleteTarget(rental)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100 hover:-translate-y-0.5 transition-all">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop Table ─────────────────────────────────────── */}
      <div className="hidden xl:block overflow-visible px-5 pb-2">
        <table className="w-full table-fixed border-separate border-spacing-y-2">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead>
            <tr>
              <SortHeader field="code">Mã Đơn</SortHeader>
              <SortHeader field="created">Ngày Tạo</SortHeader>
              <SortHeader field="customer">Khách Hàng</SortHeader>
              <SortHeader field="equipment">Thiết Bị</SortHeader>
              <SortHeader field="branch">Nơi nhận máy</SortHeader>
              <SortHeader field="start">Bắt Đầu</SortHeader>
              <SortHeader field="end">Kết Thúc</SortHeader>
              <SortHeader field="price">Chi Phí</SortHeader>
              <SortHeader field="status" align="center">Trạng Thái</SortHeader>
              <th className="px-3 py-3 text-right text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="py-16"><LoadingState /></td></tr>
            ) : isEmpty ? (
              <tr><td colSpan={10} className="py-6 bg-white rounded-2xl"><EmptyState /></td></tr>
            ) : (
              rentals.map(rental => (
                <tr key={rental.id} className="group hover:shadow-md transition-all rounded-2xl">
                  {/* Mã đơn */}
                  <td className="px-2.5 py-4 bg-white border-y border-l border-slate-100 rounded-l-2xl group-hover:border-blue-200 transition-colors">
                    <span className="block text-[11px] font-semibold text-slate-400 truncate">
                      {rental.code || `#OD${String(rental.order_number || rental.id).padStart(7, '0')}`}
                    </span>
                  </td>

                  {/* Ngày tạo */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors">
                    <span className="block text-[12px] font-semibold text-slate-600 truncate">{formatVN(rental.inserted_at) || '—'}</span>
                  </td>

                  {/* Khách hàng */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0 ${avatarColor(rental.customer_name)}`}>
                        {getInitials(rental.customer_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-[13px] leading-tight group-hover:text-orange-500 transition-colors truncate">
                          {rental.customer_name}
                        </p>
                        {rental.customer_phone && <p className="text-[11px] text-slate-400 truncate">{rental.customer_phone}</p>}
                      </div>
                    </div>
                  </td>

                  {/* Thiết bị */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="p-1 bg-orange-50 rounded-lg text-orange-500 group-hover:bg-orange-100 transition-colors">
                        <Package size={13} />
                      </span>
                      <div className="min-w-0 w-full">
                        <p className="font-semibold text-slate-800 text-[12.5px] truncate">{rental.equipment_name}</p>
                        <div className="mt-1">
                          <span className="text-[9.5px] font-semibold text-orange-500/60 uppercase tracking-wider block mb-0.5 truncate">{rental.equipment_code}</span>
                          <div className="flex items-center gap-1 text-[10.5px] text-indigo-500 font-semibold">
                            <Home size={10} className="text-indigo-400 flex-shrink-0" />
                            <span className="truncate">{rental.original_branch_name || 'Hệ thống'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Cơ sở */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors">
                    {(rental.pickup_branch_name || rental.return_branch_name) ? (
                      <div className="flex items-start gap-2 text-slate-600">
                        <span className="hidden xl:inline-flex p-1 bg-violet-50 rounded-lg text-violet-500 group-hover:bg-violet-100 transition-colors flex-shrink-0 mt-0.5">
                          <Store size={13} />
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="text-[11px] font-semibold leading-snug whitespace-normal break-words">
                            Nhận: {rental.pickup_branch_name || '—'}
                          </div>
                          <div className="text-[11px] font-semibold leading-snug whitespace-normal break-words text-emerald-600">
                            Trả: {rental.return_branch_name || rental.pickup_branch_name || '—'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-300 italic text-[11px]">Chưa chọn</span>
                    )}
                  </td>
                  {/* Bắt đầu */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12.5px] font-semibold text-slate-900 truncate">{formatPeriodDate(rental.start_date, rental.start_period)}</span>
                    </div>
                    {rental.pickup_time && (
                      <div className="truncate text-[10.5px] font-semibold text-orange-600/80 uppercase tracking-tight">
                        Lấy: {formatVN(rental.pickup_time)} {formatTime(rental.pickup_time)}
                      </div>
                    )}
                  </td>

                  {/* Kết thúc */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12.5px] font-semibold text-slate-900 truncate">{formatPeriodDate(rental.end_date, rental.end_period)}</span>
                    </div>
                    {rental.return_time && (
                      <div className="truncate text-[10.5px] font-semibold text-violet-600/80 uppercase tracking-tight">
                        Trả: {formatVN(rental.return_time)} {formatTime(rental.return_time)}
                      </div>
                    )}
                  </td>



                  {/* Chi phí */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 group-hover:border-blue-200 transition-colors">
                    <p className="text-[12.5px] font-semibold text-slate-900 truncate">{formatPrice(rental.total_price)}</p>
                    <p className="text-[10.5px] font-semibold text-slate-400 truncate">{formatPrice(rental.applied_day_price ?? rental.unit_price)}/Ngày</p>
                    {Number(rental.paid_amount) > 0 && (
                      <p className="text-[10px] font-semibold text-emerald-600 mt-0.5 hidden xl:block truncate">
                        {formatPrice(rental.paid_amount)} đã thanh toán
                      </p>
                    )}
                  </td>

                  {/* Trạng thái */}
                  <td className="px-2.5 py-4 bg-white border-y border-slate-100 text-center group-hover:border-blue-200 transition-colors">
                    <StatusBadge status={rental.status} compact={!view} />
                    {view === 'overdue' && rental.status === 'pending' && (
                      <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded mt-1 whitespace-nowrap uppercase tracking-tight">
                        Trễ giao
                      </span>
                    )}
                    {view === 'overdue' && rental.status === 'active' && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded mt-1 whitespace-nowrap uppercase tracking-tight">
                        Trễ trả
                      </span>
                    )}
                  </td>

                  {/* Hành động */}
                  <td className="px-3 py-4 bg-white border-y border-r border-slate-100 rounded-r-2xl group-hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-end gap-1.5">
                      {canQuickStatusEdit && (
                        <button onClick={() => openStatusModal(rental)} title="Trạng thái"
                          className="!w-9 !min-w-9 h-8 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200 transition-all">
                          <SlidersHorizontal size={14} />
                        </button>
                      )}
                      <button onClick={() => openEditModal(rental)} title="Sửa"
                        className="!w-9 !min-w-9 h-8 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 transition-all">
                        <Edit2 size={14} />
                      </button>
                      {isAdmin && (
                        <button onClick={() => setDeleteTarget(rental)} title="Xoá"
                          className="!w-9 !min-w-9 h-8 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
});

export default RentalList;
