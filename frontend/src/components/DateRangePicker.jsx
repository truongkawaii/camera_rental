import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, ChevronDown, X, ChevronLeft, ChevronRight } from 'lucide-react';

/* ── Utilities ───────────────────────────────────────────────── */
const toLocalDate = (isoStr) => {
  if (!isoStr) return null;
  // Parse YYYY-MM-DD or ISO string → local Date
  const d = new Date(isoStr);
  return isNaN(d) ? null : d;
};

const toLocalISO = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDisplay = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const MONTHS_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
const DAYS_VI = ['T2','T3','T4','T5','T6','T7','CN'];

// Get VN "today" as YYYY-MM-DD
const getVNToday = () => {
  const vnStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
  const vn = new Date(vnStr);
  return toLocalISO(vn);
};

// Get start of week (Monday) for a given date
const startOfWeek = (d) => {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day;
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  return toLocalISO(s);
};

/* ── Mini Calendar ───────────────────────────────────────────── */
const MiniCalendar = ({ year, month, onYearMonth, selectingStart, startDate, endDate, hoverDate, onDateClick, onDateHover }) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = getVNToday();

  // Offset so Mon=first column
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const toStr = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const rangeStart = startDate; // Already rangeStartDisplay from parent
  const rangeEnd   = hoverDate || endDate;
  const hasRange   = rangeStart && rangeEnd && rangeStart !== rangeEnd;

  const isInRange = (str) => {
    if (!rangeStart || !rangeEnd) return false;
    const [a, b] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    return str > a && str < b;
  };

  const isStart = (str) => str === rangeStart;
  const isEnd   = (str) => str === rangeEnd;
  const isToday = (str) => str === today;

  return (
    <div className="flex-1 min-w-[220px]">
      {/* Month/Year Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onYearMonth(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1)}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[13px] font-bold text-slate-700">
          {MONTHS_VI[month]} {year}
        </span>
        <button
          onClick={() => onYearMonth(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1)}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_VI.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const str = toStr(d);
          const inRange = isInRange(str);
          const start   = isStart(str);
          const end     = isEnd(str);
          const todayDot = isToday(str);
          const selected = start || end;

          // Corner rounding logic
          const isRangeStart = start && hasRange;
          const isRangeEnd   = end && hasRange;
          const isReversed = rangeStart > rangeEnd;

          return (
            <button
              key={str}
              onClick={() => onDateClick(str)}
              onMouseEnter={() => onDateHover(str)}
              className={`
                relative h-8 text-[12px] font-medium transition-all duration-100 cursor-pointer
                ${selected
                  ? 'bg-orange-500 text-white font-bold z-10 shadow-md shadow-orange-200'
                  : inRange
                    ? 'bg-orange-100 text-orange-700 rounded-none'
                    : 'text-slate-700 hover:bg-orange-50 hover:text-orange-600 rounded-xl'
                }
                ${selected && !hasRange ? 'rounded-xl' : ''}
                ${isRangeStart ? (isReversed ? 'rounded-r-xl' : 'rounded-l-xl') : ''}
                ${isRangeEnd ? (isReversed ? 'rounded-l-xl' : 'rounded-r-xl') : ''}
              `}
            >
              {d}
              {todayDot && !selected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ── Main Component ──────────────────────────────────────────── */
/**
 * DateRangePicker
 * Props:
 *   startDate: string | null  (YYYY-MM-DD)
 *   endDate:   string | null  (YYYY-MM-DD)
 *   onChange: ({ start, end }) => void
 *   label?: string
 *   className?: string
 */
const DateRangePicker = ({ startDate, endDate, onChange, label = 'Khoảng thời gian', className = '', showTabs = true, dropdownAlign = 'left' }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('date'); // 'date', 'month', 'year'

  // Range selection state (for date mode)
  const [selectingStart, setSelectingStart] = useState(true);
  const [tempStart, setTempStart] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);

  // Calendar navigation state
  const today = new Date(getVNToday() + 'T00:00:00');
  const [leftYear,  setLeftYear]  = useState(startDate ? parseInt(startDate.substring(0, 4)) : today.getFullYear());
  const [leftMonth, setLeftMonth] = useState(startDate ? parseInt(startDate.substring(5, 7)) - 1 : today.getMonth());

  // Reset range selection state when dropdown opens
  useEffect(() => {
    if (open) {
      setSelectingStart(true);
      setTempStart(null);
      setHoverDate(null);
    }
  }, [open]);

  // Automatically determine mode on open
  useEffect(() => {
    if (open && showTabs && startDate && endDate) {
      if (startDate === endDate) {
        setMode('date');
        setLeftYear(parseInt(startDate.substring(0, 4)));
        setLeftMonth(parseInt(startDate.substring(5, 7)) - 1);
      } else if (startDate.endsWith('-01-01') && endDate.endsWith('-12-31') && startDate.substring(0,4) === endDate.substring(0,4)) {
        setMode('year');
        setLeftYear(parseInt(startDate.substring(0, 4)));
      } else {
        const dStart = new Date(startDate + 'T00:00:00');
        const dEnd = new Date(endDate + 'T00:00:00');
        if (dStart.getDate() === 1 && dStart.getMonth() === dEnd.getMonth() && dStart.getFullYear() === dEnd.getFullYear()) {
          const lastDayOfMonth = new Date(dStart.getFullYear(), dStart.getMonth() + 1, 0).getDate();
          if (dEnd.getDate() === lastDayOfMonth) {
            setMode('month');
            setLeftYear(dStart.getFullYear());
            return;
          }
        }
        setMode('date');
      }
    } else if (open && !showTabs) {
      setMode('date');
    }
  }, [open]); // eslint-disable-line

  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSelectingStart(true);
        setTempStart(null);
        setHoverDate(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Date range click handler: two-step selection
  const handleRangeDateClick = useCallback((str) => {
    if (selectingStart) {
      // First click: set start date, wait for end
      setTempStart(str);
      setSelectingStart(false);
      setHoverDate(null);
    } else {
      // Second click: set end date and confirm
      const [s, e] = tempStart <= str ? [tempStart, str] : [str, tempStart];
      onChange({ start: s, end: e });
      setOpen(false);
      setSelectingStart(true);
      setTempStart(null);
      setHoverDate(null);
    }
  }, [selectingStart, tempStart, onChange]);

  const handleMonthClick = useCallback((m) => {
    const start = `${leftYear}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(leftYear, m + 1, 0).getDate();
    const end = `${leftYear}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    onChange({ start, end });
    setOpen(false);
  }, [leftYear, onChange]);

  const handleYearClick = useCallback((y) => {
    const start = `${y}-01-01`;
    const end = `${y}-12-31`;
    onChange({ start, end });
    setOpen(false);
  }, [onChange]);

  const handleClear = (e) => {
    e.stopPropagation();
    onChange({ start: null, end: null });
  };

  /* Display text helper */
  const getDisplayText = () => {
    if (!startDate || !endDate) return label;
    if (startDate === endDate) return formatDisplay(startDate);
    
    if (startDate.endsWith('-01-01') && endDate.endsWith('-12-31') && startDate.substring(0,4) === endDate.substring(0,4)) {
      return `Năm ${startDate.substring(0,4)}`;
    }

    const dStart = new Date(startDate + 'T00:00:00');
    const dEnd = new Date(endDate + 'T00:00:00');
    if (dStart.getDate() === 1 && dStart.getMonth() === dEnd.getMonth() && dStart.getFullYear() === dEnd.getFullYear()) {
      const lastDayOfMonth = new Date(dStart.getFullYear(), dStart.getMonth() + 1, 0).getDate();
      if (dEnd.getDate() === lastDayOfMonth) {
        return `Tháng ${dStart.getMonth() + 1}, ${dStart.getFullYear()}`;
      }
    }

    return `${formatDisplay(startDate)} – ${formatDisplay(endDate)}`;
  };

  const displayText = getDisplayText();
  const hasRange = startDate && endDate;
  const dropdownPositionClass = dropdownAlign === 'right' ? 'right-0 left-auto' : 'left-0 right-auto';

  // Computed values for date mode display
  const rangeStartDisplay = tempStart || startDate;
  const rangeEndDisplay = tempStart ? null : endDate;
  const selectingLabel = !selectingStart && tempStart ? (
    <div className="px-4 pt-3 pb-1 text-center">
      <span className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-600 text-[11px] font-bold px-3 py-1.5 rounded-full">
        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
        Chọn ngày kết thúc
      </span>
    </div>
  ) : null;

  // Render logic for different modes
  const renderModeContent = () => {
    if (mode === 'date') {
      return (
        <div className="flex flex-col w-full min-w-[280px]">
          {selectingLabel}
          <div className="p-4 flex justify-center">
            <MiniCalendar
              year={leftYear}
              month={leftMonth}
              onYearMonth={(y, m) => { setLeftYear(y); setLeftMonth(m); }}
              selectingStart={selectingStart}
              startDate={rangeStartDisplay}
              endDate={rangeEndDisplay}
              hoverDate={!selectingStart ? hoverDate : null}
              onDateClick={handleRangeDateClick}
              onDateHover={(str) => { if (!selectingStart) setHoverDate(str); }}
            />
          </div>
        </div>
      );
    }

    if (mode === 'month') {
      return (
        <div className="p-3 w-full">
          <div className="flex items-center justify-between mb-4 px-1">
            <button onClick={() => setLeftYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ChevronLeft size={18}/></button>
            <span className="font-bold text-slate-800 text-[14px]">Năm {leftYear}</span>
            <button onClick={() => setLeftYear(y => y + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ChevronRight size={18}/></button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_VI.map((name, i) => {
              const isSelected = startDate && startDate.startsWith(`${leftYear}-${String(i+1).padStart(2,'0')}`);
              return (
                <button 
                  key={i} 
                  onClick={() => handleMonthClick(i)}
                  className={`py-2.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-200' 
                      : 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (mode === 'year') {
      const startYear = Math.floor(leftYear / 12) * 12;
      return (
        <div className="p-3 w-full">
          <div className="flex items-center justify-between mb-4 px-1">
            <button onClick={() => setLeftYear(y => y - 12)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ChevronLeft size={18}/></button>
            <span className="font-bold text-slate-800 text-[14px]">{startYear} - {startYear + 11}</span>
            <button onClick={() => setLeftYear(y => y + 12)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"><ChevronRight size={18}/></button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({length: 12}).map((_, i) => {
              const y = startYear + i;
              const isSelected = startDate && startDate.startsWith(`${y}-`);
              return (
                <button 
                  key={y} 
                  onClick={() => handleYearClick(y)}
                  className={`py-2.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-200' 
                      : 'bg-slate-50 text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                  }`}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Default to date mode content if somehow reached
    return (
      <div className="flex flex-col w-full min-w-[280px]">
        {selectingLabel}
        <div className="p-4 flex justify-center">
          <MiniCalendar
            year={leftYear}
            month={leftMonth}
            onYearMonth={(y, m) => { setLeftYear(y); setLeftMonth(m); }}
            selectingStart={selectingStart}
            startDate={rangeStartDisplay}
            endDate={rangeEndDisplay}
            hoverDate={!selectingStart ? hoverDate : null}
            onDateClick={handleRangeDateClick}
            onDateHover={(str) => { if (!selectingStart) setHoverDate(str); }}
          />
        </div>
      </div>
    );
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`
          h-[35px] w-full flex items-center gap-2 px-3.5 rounded-2xl border transition-all duration-200 text-[13px] font-semibold select-none cursor-pointer
          ${open
            ? 'border-orange-400 bg-orange-50 text-orange-600 shadow-md shadow-orange-100/50 ring-2 ring-orange-200/50'
            : hasRange
              ? 'border-orange-200 bg-orange-50/70 text-orange-600 hover:border-orange-300 hover:shadow-sm'
              : 'border-slate-200 bg-white text-slate-500 hover:border-orange-300 hover:text-orange-500 hover:shadow-sm'
          }
        `}
      >
        <Calendar size={15} className={hasRange ? 'text-orange-500' : 'text-slate-400'} />
        <span className="flex-1 text-left whitespace-nowrap">{displayText}</span>
        {hasRange ? (
          <span
            onClick={handleClear}
            className="ml-0.5 p-0.5 rounded-full hover:bg-orange-200 transition-colors cursor-pointer"
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={`absolute top-full z-[1000] mt-2 w-[min(300px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl ${dropdownPositionClass}`}
        >
          {/* Mode Tabs */}
          {showTabs && (
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-2 pt-2">
              {[
                { id: 'date', label: 'Ngày' },
                { id: 'month', label: 'Tháng' },
                { id: 'year', label: 'Năm' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMode(tab.id)}
                  className={`flex-1 px-3 py-2 text-[10.5px] font-bold uppercase tracking-widest border-b-2 transition-all cursor-pointer ${
                    mode === tab.id
                      ? 'border-orange-500 text-orange-600 bg-white rounded-t-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]'
                      : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-white/50 rounded-t-xl'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Dynamic Content based on Mode */}
          {renderModeContent()}

        </div>
      )}
    </div>
  );
};

export { getVNToday };
export default DateRangePicker;
