import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  List,
  UserRound,
  X,
  Check,
  SlidersHorizontal,
} from 'lucide-react';

// ── Legend items
const LEGEND_ITEMS = [
  { label: 'Trống',     color: '#94a3b8' },
  { label: 'Chờ giao',  color: '#f59e0b' },
  { label: 'Đang thuê', color: '#f87171' },
  { label: 'Hoàn thành',color: '#34d399' },
];

// ── Mobile Filter Bottom Sheet
const FilterSheet = ({ open, onClose, children }) => (
  <>
    {/* Backdrop */}
    <div
      className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    />
    {/* Drawer */}
    <div
      className={`fixed bottom-0 inset-x-0 z-[61] bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out lg:hidden flex flex-col ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ maxHeight: '85dvh' }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full bg-slate-200" />
      </div>
      {children}
    </div>
  </>
);

// ── Dropdown for desktop
const DesktopDropdown = ({ id, label, openDropdown, setOpenDropdown, value, options, onToggle, onModelSelect, searchValue, onSearch, accentColor = 'violet', icon: Icon }) => {
  const colorMap = {
    sky:    { btn: 'border-sky-200 bg-sky-50 text-sky-700',    ring: 'focus:border-sky-300 focus:ring-sky-200',    check: 'text-sky-600',    selected: 'text-sky-700' },
    orange: { btn: 'border-orange-200 bg-orange-50 text-orange-700', ring: 'focus:border-orange-300 focus:ring-orange-200', check: 'text-orange-600', selected: 'text-orange-700' },
    teal:   { btn: 'border-teal-200 bg-teal-50 text-teal-700', ring: 'focus:border-teal-300 focus:ring-teal-200',  check: 'text-teal-600',   selected: 'text-teal-700' },
  };
  const c = colorMap[accentColor] || colorMap.sky;
  const isActive = Array.isArray(value) && !value.includes('ALL') && value.length > 0;
  const isOpen = openDropdown === id;
  const filtered = options.filter(o => o.label.toLowerCase().includes((searchValue || '').toLowerCase()));
  const isSelected = (opt) => Array.isArray(value) && value.includes(opt);

  return (
    <div className="relative">
      <button
        onClick={() => setOpenDropdown(isOpen ? null : id)}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
          isActive || isOpen ? c.btn : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        {Icon && <Icon className={`h-3.5 w-3.5 ${isActive ? '' : 'text-gray-400'}`} />}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-[50] mt-1 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
          <div className="sticky top-0 border-b border-gray-100 bg-white px-3 py-2">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchValue}
              onChange={e => onSearch(e.target.value)}
              className={`w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none transition-colors focus:ring-1 ${c.ring}`}
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map(option => (
              <button
                key={option.value}
                onClick={() => onToggle ? onToggle(option.value) : onModelSelect(option.value)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50"
              >
                <span className={isSelected(option.value) ? `font-semibold ${c.selected}` : 'text-gray-700'}>{option.label}</span>
                {isSelected(option.value) && <Check className={`h-4 w-4 ${c.check}`} />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-center text-sm text-gray-400">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component
const CalendarToolbar = ({
  headerTitle,
  isWeekView,
  openDropdown,
  setOpenDropdown,
  fBr, setFBr,
  fSaler, setFSaler,
  fModel, setFModel,
  isDriver,
  branchOptions, salerOptions, modelOptions,
  handleMonthView, handleWeekView,
  handlePrev, handleToday, handleNext,
}) => {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState(isWeekView ? 'week' : 'month');
  const [searchSaler, setSearchSaler] = useState('');
  const [searchBranch, setSearchBranch] = useState('');
  const [searchModel, setSearchModel] = useState('');

  // Swipe detection refs
  const swipeRef = useRef(null);

  const isActiveFilter = (val) => Array.isArray(val) && !val.includes('ALL') && val.length > 0;
  const isSelected = (val, opt) => Array.isArray(val) && val.includes(opt);
  const activeFilterCount = Number(isActiveFilter(fBr)) + Number(isActiveFilter(fSaler)) + Number(isActiveFilter(fModel));

  const toggleFilterValue = useCallback((curr, optVal, setter) => {
    if (optVal === 'ALL') { setter(['ALL']); return; }
    const items = Array.isArray(curr) ? curr.filter(v => v !== 'ALL') : [];
    const next = items.includes(optVal) ? items.filter(v => v !== optVal) : [...items, optVal];
    setter(next.length > 0 ? next : ['ALL']);
  }, []);

  const getSelectedSummary = (val, opts) => {
    if (!isActiveFilter(val)) return opts.find(o => o.value === 'ALL')?.label || '—';
    const sel = opts.filter(o => val.includes(o.value));
    if (!sel.length) return opts.find(o => o.value === 'ALL')?.label || '—';
    if (sel.length === 1) return sel[0].label;
    return `${sel[0].label} +${sel.length - 1}`;
  };

  const clearAllFilters = useCallback(() => {
    setFBr(['ALL']); setFSaler(['ALL']); setFModel(['ALL']);
  }, [setFBr, setFSaler, setFModel]);

  useEffect(() => { setActiveViewMode(isWeekView ? 'week' : 'month'); }, [isWeekView]);

  useEffect(() => {
    if (openDropdown !== 'saler') setSearchSaler('');
    if (openDropdown !== 'branch') setSearchBranch('');
    if (openDropdown !== 'model') setSearchModel('');
  }, [openDropdown]);

  // ── Swipe gesture: header area only (won't conflict with grid cell touches)
  const handleSwipeTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    swipeRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      t: Date.now(),
    };
  }, []);

  const handleSwipeTouchEnd = useCallback((e) => {
    if (!swipeRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.x;
    const dy = e.changedTouches[0].clientY - swipeRef.current.y;
    const dt = Date.now() - swipeRef.current.t;
    swipeRef.current = null;

    // Trigger only: fast (<600ms), ≥40px horizontal, horizontal dominates (1.5× ratio)
    if (dt > 600 || Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) handleNext();
    else handlePrev();
  }, [handleNext, handlePrev]);

  // Shared tap style
  const tapStyle = { WebkitTapHighlightColor: 'transparent' };

  return (
    <>
      {/* ═══════════════════════════════════════════
          DESKTOP LAYOUT (lg+)
      ═══════════════════════════════════════════ */}
      <div className="hidden lg:block relative z-[45] shrink-0 border-b border-slate-200/70 bg-white">
        {/* Status legend row */}
        <div className="px-6 lg:px-8 pt-3">
          <div className="flex items-center gap-3 text-xs">
            {LEGEND_ITEMS.map(item => (
              <div key={item.label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                <span className="text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Controls row */}
        <div className="px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-6">
            {/* Left: title + view switcher + nav */}
            <div className="flex items-center gap-4 min-w-0">
              <h2 className="text-xl font-semibold leading-tight tracking-tight text-slate-950 md:text-2xl truncate">
                {headerTitle}
              </h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex rounded-xl bg-slate-100 p-1">
                  <button
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-75 ${activeViewMode === 'month' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => { setActiveViewMode('month'); handleMonthView(); }}
                  >
                    <CalendarIcon className="h-4 w-4" /> Tháng
                  </button>
                  <button
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-75 ${activeViewMode === 'week' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    onClick={() => { setActiveViewMode('week'); handleWeekView(); }}
                  >
                    <List className="h-4 w-4" /> Tuần
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={handlePrev} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={handleToday} className="whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 active:bg-violet-200">
                    Hôm nay
                  </button>
                  <button onClick={handleNext} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: desktop filter dropdowns */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isDriver && (
                <DesktopDropdown
                  id="saler" openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
                  value={fSaler} options={salerOptions}
                  label={getSelectedSummary(fSaler, salerOptions)}
                  onToggle={(v) => toggleFilterValue(fSaler, v, setFSaler)}
                  searchValue={searchSaler} onSearch={setSearchSaler}
                  accentColor="sky" icon={UserRound}
                />
              )}
              <DesktopDropdown
                id="branch" openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
                value={fBr} options={branchOptions}
                label={getSelectedSummary(fBr, branchOptions)}
                onToggle={(v) => toggleFilterValue(fBr, v, setFBr)}
                searchValue={searchBranch} onSearch={setSearchBranch}
                accentColor="orange"
              />
              <DesktopDropdown
                id="model" openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
                value={fModel} options={modelOptions}
                label={getSelectedSummary(fModel, modelOptions)}
                onModelSelect={(v) => {
                  if (v === 'ALL' || isSelected(fModel, v)) setFModel(['ALL']);
                  else setFModel([v]);
                  setOpenDropdown(null);
                }}
                searchValue={searchModel} onSearch={setSearchModel}
                accentColor="teal"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          MOBILE LAYOUT (< lg) — COMPACT STICKY HEADER
      ═══════════════════════════════════════════ */}
      <div className="lg:hidden relative z-[45] shrink-0 bg-white border-b border-slate-200/70">

        {/* Row 1: Navigation + Filter button */}
        {/* Full row is swipe-sensitive for prev/next navigation */}
        <div
          className="flex items-center gap-2 px-3 pt-3 pb-1.5"
          onTouchStart={handleSwipeTouchStart}
          onTouchEnd={handleSwipeTouchEnd}
          // touch-action: manipulation = disables double-tap zoom, keeps scroll
          style={{ touchAction: 'manipulation', userSelect: 'none' }}
        >
          {/* Prev */}
          <button
            onClick={handlePrev}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 active:bg-slate-100 active:scale-95 transition-all"
            style={tapStyle}
            aria-label="Tháng trước"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Title / Today button - tap to jump to today */}
          <button
            onClick={handleToday}
            className="flex-1 min-w-0 flex flex-col items-center py-1 rounded-xl active:bg-violet-50 transition-colors"
            style={tapStyle}
            aria-label="Về hôm nay"
          >
            <span className="text-sm font-bold text-slate-800 leading-tight truncate max-w-full">
              {headerTitle}
            </span>
            <span className="text-[9px] text-violet-500 font-semibold tracking-wide mt-0.5 leading-none">
              ↑ Hôm nay
            </span>
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-600 active:bg-slate-100 active:scale-95 transition-all"
            style={tapStyle}
            aria-label="Tháng sau"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Filter icon with badge */}
          <button
            onClick={() => setFilterSheetOpen(true)}
            className={`relative flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${
              activeFilterCount > 0
                ? 'border-violet-300 bg-violet-50 text-violet-600'
                : 'border-slate-200 text-slate-500 active:bg-slate-100'
            }`}
            style={tapStyle}
            aria-label="Mở bộ lọc"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white shadow-sm">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 2: Status legend + View mode toggle */}
        <div className="flex items-center justify-between px-3 pb-2.5">
          {/* Legend: compact colored dots */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            {LEGEND_ITEMS.map(item => (
              <div key={item.label} className="flex items-center gap-1 flex-shrink-0">
                <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                <span className="text-[10px] text-slate-500 leading-none whitespace-nowrap">{item.label}</span>
              </div>
            ))}
          </div>

          {/* View mode pill */}
          <div className="flex-shrink-0 flex rounded-lg bg-slate-100 p-0.5 ml-2">
            <button
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold leading-none transition-colors ${
                activeViewMode === 'month' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400'
              }`}
              onClick={() => { setActiveViewMode('month'); handleMonthView(); }}
              style={tapStyle}
            >
              <CalendarIcon className="h-3 w-3" />
              Tháng
            </button>
            <button
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold leading-none transition-colors ${
                activeViewMode === 'week' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400'
              }`}
              onClick={() => { setActiveViewMode('week'); handleWeekView(); }}
              style={tapStyle}
            >
              <List className="h-3 w-3" />
              Tuần
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          MOBILE FILTER BOTTOM SHEET
      ═══════════════════════════════════════════ */}
      <FilterSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)}>
        {/* Sheet header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-800">Bộ lọc</h3>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-xs text-rose-500 font-semibold px-3 py-1.5 rounded-lg active:bg-rose-50 transition-colors"
                style={tapStyle}
              >
                Xóa tất cả
              </button>
            )}
            <button
              onClick={() => setFilterSheetOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:bg-slate-200 transition-colors"
              style={tapStyle}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          
          {/* Nhân viên sale */}
          {!isDriver && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UserRound className="h-4 w-4 text-sky-500 flex-shrink-0" />
                <span className="text-sm font-bold text-slate-700">Nhân viên</span>
              </div>
              {salerOptions.length > 5 && (
                <div className="mb-2">
                  <input
                    type="text"
                    placeholder="Tìm nhân viên..."
                    value={searchSaler}
                    onChange={e => setSearchSaler(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:bg-white transition-colors"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {salerOptions
                  .filter(o => o.label.toLowerCase().includes(searchSaler.toLowerCase()))
                  .map(option => (
                    <button
                      key={option.value}
                      onClick={() => toggleFilterValue(fSaler, option.value, setFSaler)}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
                        isSelected(fSaler, option.value)
                          ? 'bg-sky-500 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 active:bg-slate-200'
                      }`}
                      style={tapStyle}
                    >
                      {isSelected(fSaler, option.value) && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                      {option.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Chi nhánh */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-slate-700">Chi nhánh</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {branchOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => toggleFilterValue(fBr, option.value, setFBr)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
                    isSelected(fBr, option.value)
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 active:bg-slate-200'
                  }`}
                  style={tapStyle}
                >
                  {isSelected(fBr, option.value) && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-slate-700">Model thiết bị</span>
            </div>
            {modelOptions.length > 6 && (
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Tìm model..."
                  value={searchModel}
                  onChange={e => setSearchModel(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-teal-300 focus:bg-white transition-colors"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {modelOptions
                .filter(o => o.label.toLowerCase().includes(searchModel.toLowerCase()))
                .map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (option.value === 'ALL' || isSelected(fModel, option.value)) setFModel(['ALL']);
                      else setFModel([option.value]);
                    }}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${
                      isSelected(fModel, option.value)
                        ? 'bg-teal-500 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 active:bg-slate-200'
                    }`}
                    style={tapStyle}
                  >
                    {isSelected(fModel, option.value) && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                    {option.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Safe area bottom padding */}
          <div className="h-2" />
        </div>

        {/* Apply / close CTA */}
        <div
          className="flex-shrink-0 px-5 py-3 border-t border-slate-100 bg-white"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
        >
          <button
            onClick={() => setFilterSheetOpen(false)}
            className="w-full rounded-2xl bg-violet-600 py-3.5 text-sm font-bold text-white active:bg-violet-700 transition-colors shadow-sm shadow-violet-200"
            style={tapStyle}
          >
            {activeFilterCount > 0 ? `Áp dụng · ${activeFilterCount} bộ lọc` : 'Đóng'}
          </button>
        </div>
      </FilterSheet>
    </>
  );
};

export default React.memo(CalendarToolbar);
