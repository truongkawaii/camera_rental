import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  List,
  UserRound
} from 'lucide-react';

const StatusLegend = () => (
  <div className="relative z-[44] shrink-0 bg-white px-4 pt-3 md:px-6 lg:px-8">
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max flex-nowrap items-center gap-2 text-[10px] md:text-xs">
      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-1">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <span className="truncate text-slate-500">Trống</span>
      </div>

      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1">
        <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="truncate text-amber-700">Chờ giao</span>
      </div>

      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-2.5 py-1">
        <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <span className="truncate text-red-700">Đang thuê</span>
      </div>

      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="truncate text-emerald-700">Hoàn thành</span>
      </div>
      </div>
    </div>
  </div>
);

const CalendarToolbar = ({
  headerTitle,
  isWeekView,
  openDropdown,
  setOpenDropdown,
  fBr,
  setFBr,
  fSaler,
  setFSaler,
  fModel,
  setFModel,
  isDriver,
  branchOptions,
  salerOptions,
  modelOptions,
  handleMonthView,
  handleWeekView,
  handlePrev,
  handleToday,
  handleNext
}) => {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileDateControlsOpen, setMobileDateControlsOpen] = useState(false);
  const controlledViewMode = isWeekView ? 'week' : 'month';
  const [activeViewMode, setActiveViewMode] = useState(controlledViewMode);
  const [searchSaler, setSearchSaler] = useState('');
  const [searchBranch, setSearchBranch] = useState('');
  const [searchModel, setSearchModel] = useState('');
  const isActiveFilter = (value) => Array.isArray(value) && !value.includes('ALL') && value.length > 0;
  const isSelected = (value, optionValue) => Array.isArray(value) && value.includes(optionValue);
  const activeFilterCount = Number(isActiveFilter(fBr)) + Number(isActiveFilter(fSaler)) + Number(isActiveFilter(fModel));
  const activeIsWeekView = activeViewMode === 'week';

  const toggleFilterValue = (currentValue, optionValue, setter) => {
    if (optionValue === 'ALL') {
      setter(['ALL']);
      return;
    }

    const currentItems = Array.isArray(currentValue) ? currentValue.filter((value) => value !== 'ALL') : [];
    const nextItems = currentItems.includes(optionValue)
      ? currentItems.filter((value) => value !== optionValue)
      : [...currentItems, optionValue];

    setter(nextItems.length > 0 ? nextItems : ['ALL']);
  };

  const getSelectedSummary = (value, options, formatter = (option) => option.label) => {
    if (!isActiveFilter(value)) return options.find((opt) => opt.value === 'ALL')?.label;

    const selectedOptions = options.filter((opt) => value.includes(opt.value));
    if (selectedOptions.length === 0) return options.find((opt) => opt.value === 'ALL')?.label;
    if (selectedOptions.length === 1) return formatter(selectedOptions[0]);
    return `${selectedOptions[0].label} +${selectedOptions.length - 1}`;
  };

  useEffect(() => {
    setActiveViewMode(controlledViewMode);
  }, [controlledViewMode]);

  // Reset search khi đóng dropdown
  useEffect(() => {
    if (openDropdown !== 'saler') setSearchSaler('');
    if (openDropdown !== 'branch') setSearchBranch('');
    if (openDropdown !== 'model') setSearchModel('');
  }, [openDropdown]);

  const toggleMobileFilters = () => {
    setOpenDropdown(null);
    setMobileFiltersOpen((open) => !open);
  };

  const toggleMobileDateControls = () => {
    setOpenDropdown(null);
    setMobileDateControlsOpen((open) => !open);
  };

  return (
    <>
      <StatusLegend />

      <div className="relative z-[45] shrink-0 border-b border-slate-200/70 bg-white px-4 py-4 md:px-6 lg:px-8">
        <div className="grid gap-3 md:gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-3 lg:flex lg:items-center lg:gap-6">
            <h2 className="truncate text-lg font-semibold leading-tight tracking-tight text-slate-950 sm:text-xl md:text-2xl">
              {headerTitle}
            </h2>

            <div className="grid gap-2">
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  type="button"
                  onClick={toggleMobileDateControls}
                  className={`flex h-9 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border px-3.5 text-sm font-medium transition-colors ${
                    mobileDateControlsOpen
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-slate-200 bg-slate-50/80 text-slate-700'
                  }`}
                  aria-label="Điều hướng lịch"
                  aria-expanded={mobileDateControlsOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{isWeekView ? 'Điều hướng tuần' : 'Điều hướng tháng'}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${mobileDateControlsOpen ? 'rotate-180' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={toggleMobileFilters}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                    mobileFiltersOpen || activeFilterCount > 0
                      ? 'border-violet-200 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-100 active:bg-slate-200'
                  }`}
                  aria-label="Bộ lọc"
                  aria-expanded={mobileFiltersOpen}
                >
                  <Filter className="h-4 w-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-none text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              <div
                className={`${
                  mobileDateControlsOpen ? 'flex' : 'hidden'
                } w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-1 md:gap-3 md:p-1.5 lg:flex lg:w-auto lg:flex-nowrap lg:border-0 lg:bg-transparent lg:p-0`}
              >
                <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
                  <button
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-75 md:gap-2 md:px-3 md:text-sm ${
                      !activeIsWeekView ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => {
                      setActiveViewMode('month');
                      handleMonthView();
                    }}
                    aria-pressed={!activeIsWeekView}
                  >
                    <CalendarIcon className="h-4 w-4" /> Tháng
                  </button>
                  <button
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-75 md:gap-2 md:px-3 md:text-sm ${
                      activeIsWeekView ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => {
                      setActiveViewMode('week');
                      handleWeekView();
                    }}
                    aria-pressed={activeIsWeekView}
                  >
                    <List className="h-4 w-4" /> Tuần
                  </button>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button
                    onClick={handlePrev}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200"
                  >
                    <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                  <button
                    onClick={handleToday}
                    className="whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[13px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 active:bg-violet-200 md:px-3.5 md:text-sm"
                  >
                    Hôm nay
                  </button>
                  <button
                    onClick={handleNext}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200"
                  >
                    <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={`${mobileFiltersOpen ? 'grid' : 'hidden'} relative grid-cols-1 gap-2 md:grid-cols-2 lg:flex lg:items-center lg:justify-end`}>
            {!isDriver && (
            <div className="relative min-w-0 md:col-span-2 lg:col-span-1">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'saler' ? null : 'saler')}
                className={`flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors lg:w-auto ${
                  isActiveFilter(fSaler) || openDropdown === 'saler'
                    ? 'border-sky-200 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <UserRound className={`h-3.5 w-3.5 ${isActiveFilter(fSaler) ? 'text-sky-500' : 'text-gray-400'}`} />
                <span className="min-w-0 truncate">{getSelectedSummary(fSaler, salerOptions)}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openDropdown === 'saler' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'saler' && (
                <div className="absolute left-0 top-full z-[50] mt-1 max-h-[15.5rem] w-full min-w-72 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl lg:left-auto lg:right-0">
                  <div className="sticky top-0 border-b border-gray-100 bg-white px-3 py-2">
                    <input
                      type="text"
                      placeholder="Tìm kiếm..."
                      value={searchSaler}
                      onChange={(e) => setSearchSaler(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-colors focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
                    />
                  </div>
                  <div className="max-h-[12rem] overflow-y-auto py-1">
                  {salerOptions.filter((opt) => opt.label.toLowerCase().includes(searchSaler.toLowerCase())).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        toggleFilterValue(fSaler, option.value, setFSaler);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                    >
                      <span className={isSelected(fSaler, option.value) ? 'font-semibold text-sky-700' : 'text-gray-700'}>{option.label}</span>
                      {isSelected(fSaler, option.value) && <span className="font-semibold text-sky-600">✓</span>}
                    </button>
                  ))}
                  {salerOptions.filter((opt) => opt.label.toLowerCase().includes(searchSaler.toLowerCase())).length === 0 && (
                    <div className="px-4 py-3 text-center text-sm text-gray-400">Không tìm thấy</div>
                  )}
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="relative min-w-0">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'branch' ? null : 'branch')}
                className={`flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors lg:w-auto ${
                  isActiveFilter(fBr) || openDropdown === 'branch'
                    ? 'border-orange-200 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 truncate">{getSelectedSummary(fBr, branchOptions)}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openDropdown === 'branch' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'branch' && (
                <div className="absolute left-0 top-full z-[50] mt-1 w-full min-w-48 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl lg:left-auto lg:right-0">
                  <div className="sticky top-0 border-b border-gray-100 bg-white px-3 py-2">
                    <input
                      type="text"
                      placeholder="Tìm kiếm..."
                      value={searchBranch}
                      onChange={(e) => setSearchBranch(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-colors focus:border-orange-300 focus:ring-1 focus:ring-orange-200"
                    />
                  </div>
                  <div className="max-h-[12rem] overflow-y-auto py-1">
                  {branchOptions.filter((opt) => opt.label.toLowerCase().includes(searchBranch.toLowerCase())).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        toggleFilterValue(fBr, option.value, setFBr);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                    >
                      <span className={isSelected(fBr, option.value) ? 'font-semibold text-orange-700' : 'text-gray-700'}>{option.label}</span>
                      {isSelected(fBr, option.value) && <span className="font-semibold text-orange-600">✓</span>}
                    </button>
                  ))}
                  {branchOptions.filter((opt) => opt.label.toLowerCase().includes(searchBranch.toLowerCase())).length === 0 && (
                    <div className="px-4 py-3 text-center text-sm text-gray-400">Không tìm thấy</div>
                  )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative min-w-0">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'model' ? null : 'model')}
                className={`flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors lg:w-auto ${
                  isActiveFilter(fModel) || openDropdown === 'model'
                    ? 'border-teal-200 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 truncate">{getSelectedSummary(fModel, modelOptions)}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openDropdown === 'model' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'model' && (
                <div className="absolute left-0 top-full z-[50] mt-1 w-full min-w-48 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl lg:left-auto lg:right-0">
                  <div className="sticky top-0 border-b border-gray-100 bg-white px-3 py-2">
                    <input
                      type="text"
                      placeholder="Tìm kiếm..."
                      value={searchModel}
                      onChange={(e) => setSearchModel(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-colors focus:border-teal-300 focus:ring-1 focus:ring-teal-200"
                    />
                  </div>
                  <div className="max-h-[12rem] overflow-y-auto py-1">
                  {modelOptions.filter((opt) => opt.label.toLowerCase().includes(searchModel.toLowerCase())).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        toggleFilterValue(fModel, option.value, setFModel);
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                    >
                      <span className={isSelected(fModel, option.value) ? 'font-semibold text-teal-700' : 'text-gray-700'}>{option.label}</span>
                      {isSelected(fModel, option.value) && <span className="font-semibold text-teal-600">✓</span>}
                    </button>
                  ))}
                  {modelOptions.filter((opt) => opt.label.toLowerCase().includes(searchModel.toLowerCase())).length === 0 && (
                    <div className="px-4 py-3 text-center text-sm text-gray-400">Không tìm thấy</div>
                  )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(CalendarToolbar);
