import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { formatVN } from '../utils/formatters';

const ModernDateTimePicker = ({ value, onChange, label, required, min, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({ opacity: 0, visibility: 'hidden' });

  // Auto-scroll and positioning logic
  useEffect(() => {
    if (isOpen) {
      const updatePosition = () => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;

        if (isMobile) {
          setPopupStyle({}); // Use classes for mobile
          return;
        }

        const popupWidth = isMobile ? 320 : 550;
        const estimatedMaxHeight = 650;
        const margin = 12;
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;

        const style = {
          position: 'fixed',
          zIndex: 99999,
          width: `${popupWidth}px`,
          display: 'flex',
          flexDirection: 'column'
        };

        // Vertical positioning
        if (spaceBelow < estimatedMaxHeight && spaceAbove > spaceBelow) {
          // Open upwards if more space above OR space below is too small
          style.bottom = `${window.innerHeight - rect.top + 8}px`;
          style.maxHeight = `${Math.min(estimatedMaxHeight, spaceAbove)}px`;
        } else {
          // Open downwards
          style.top = `${rect.bottom + 8}px`;
          style.maxHeight = `${Math.min(estimatedMaxHeight, spaceBelow)}px`;
        }

        // Horizontal positioning
        const spaceRight = window.innerWidth - rect.left;
        if (spaceRight < popupWidth) {
          // Align right edge of popup with right edge of input
          style.right = `${window.innerWidth - rect.right}px`;
        } else {
          // Align left edge
          style.left = `${rect.left}px`;
        }

        style.opacity = 1;
        style.visibility = 'visible';
        setPopupStyle(style);
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      // Listen to scroll on any scrollable container
      window.addEventListener('scroll', updatePosition, true);

      if (!value) {
        const now = new Date();
        setCurrentDate(now);
        setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      }

      setTimeout(() => {
        const scrollToCenter = (container, activeItem) => {
          if (!container || !activeItem) return;
          const containerHeight = container.clientHeight;
          const itemHeight = activeItem.clientHeight;
          const itemOffsetTop = activeItem.offsetTop;
          container.scrollTo({
            top: itemOffsetTop - (containerHeight / 2) + (itemHeight / 2),
            behavior: 'smooth'
          });
        };

        const activeHour = hourListRef.current?.querySelector('.active-time');
        const activeMinute = minuteListRef.current?.querySelector('.active-time');
        scrollToCenter(hourListRef.current, activeHour);
        scrollToCenter(minuteListRef.current, activeMinute);
      }, 100);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, value]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(event.target);
      const isOutsidePopup = popupRef.current && !popupRef.current.contains(event.target);
      if (isOutsideContainer && isOutsidePopup) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const parseDateTime = (dtStr) => (!dtStr ? new Date() : new Date(dtStr));
  const [currentDate, setCurrentDate] = useState(() => parseDateTime(value));
  const [viewMonth, setViewMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  useEffect(() => {
    if (value) {
      const dt = parseDateTime(value);
      setCurrentDate(dt);
      if (isOpen) setViewMonth(new Date(dt.getFullYear(), dt.getMonth(), 1));
    }
  }, [value]);

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();

  const updateDateTime = (newDate, newHours, newMinutes) => {
    const dt = new Date(newDate);
    dt.setHours(newHours !== undefined ? newHours : currentDate.getHours());
    dt.setMinutes(newMinutes !== undefined ? newMinutes : currentDate.getMinutes());

    if (min && dt < new Date(min)) {
      onChange(min);
      return;
    }

    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    // Luôn gửi kèm timezone +07:00 (Việt Nam) và seconds để backend parse nhất quán
    onChange(`${y}-${m}-${d}T${hh}:${mm}:00+07:00`);
  };

  const handleTimeChange = (type, val) => {
    if (type === 'hour') updateDateTime(currentDate, val, undefined);
    else updateDateTime(currentDate, undefined, val);
  };

  const handleSelectDate = (day) => {
    updateDateTime(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
  };

  const isDateSelected = (day) => {
    if (!value) return false;
    const dt = parseDateTime(value);
    return viewMonth.getFullYear() === dt.getFullYear() && viewMonth.getMonth() === dt.getMonth() && day === dt.getDate();
  };

  const isToday = (day) => {
    const today = new Date();
    return viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth() && day === today.getDate();
  };

  const isDateDisabled = (day) => {
    if (!min) return false;
    const dateToCheck = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    dateToCheck.setHours(23, 59, 59);
    return dateToCheck < new Date(min);
  };

  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

  const formatDisplay = (val) => {
    if (!val) return 'Chọn thời điểm...';
    const dt = new Date(val);
    if (isNaN(dt.getTime())) return 'Ngày không hợp lệ';
    return `${formatVN(dt)} • ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-widest">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div ref={inputRef} className="relative h-[35px] cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className={`absolute inset-0 flex items-center pl-8 pr-3 bg-white border ${isOpen ? 'border-primary ring-4 ring-primary/10' : 'border-orange-200 hover:border-primary/50 hover:shadow-md'} rounded-[14px] transition-all duration-300 ${value ? 'text-gray-900 font-medium' : 'text-gray-400'} text-[13px]`}>
          <div className={`absolute left-2.5 ${isOpen ? 'text-primary' : 'text-gray-400'}`}>
            <CalendarIcon size={15} />
          </div>
          {formatDisplay(value)}
        </div>
      </div>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 bg-black/20 z-[99990] sm:hidden" onClick={() => setIsOpen(false)} />
          <div
            ref={popupRef}
            style={popupStyle}
            className={`
            fixed z-[99999] bg-white sm:border sm:border-gray-200 sm:rounded-2xl shadow-2xl p-6 flex flex-col gap-4
            sm:animate-in sm:slide-in-from-bottom-2 duration-200 transition-opacity
            max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden custom-scrollbar-none
            max-sm:top-1/2 max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:w-[calc(100%-3rem)] max-sm:max-w-[400px] max-sm:rounded-[2rem] max-sm:zoom-in-95
          `}>
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Calendar Section */}
              <div className="flex flex-col gap-4 min-w-[280px]">
                <div className="flex justify-between items-center px-1">
                  <button type="button" onClick={e => { e.stopPropagation(); setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)); }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><ChevronLeft size={18} /></button>
                  <div className="font-semibold text-gray-900 text-sm">{monthNames[viewMonth.getMonth()]} {viewMonth.getFullYear()}</div>
                  <button type="button" onClick={e => { e.stopPropagation(); setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)); }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"><ChevronRight size={18} /></button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (<div key={day} className="text-[10px] font-semibold text-gray-400 uppercase">{day}</div>))}
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => (<div key={`e-${i}`} />))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = i + 1;
                    const selected = isDateSelected(d);
                    const disabled = isDateDisabled(d);
                    const today = isToday(d);
                      return (
                        <button key={d} type="button" disabled={disabled} onClick={e => { e.stopPropagation(); handleSelectDate(d); }}
                          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-xs font-semibold transition-all flex items-center justify-center relative
                            ${disabled ? 'text-gray-200 cursor-not-allowed' : 
                              selected ? 'bg-primary text-white shadow-lg z-10 scale-105 hover:brightness-95' : 
                              'hover:bg-primary/10 text-gray-700'}
                            ${today && !selected ? 'border-2 border-primary/30 text-primary' : ''}
                          `}>
                          {d}
                          {today && !selected && <div className="absolute bottom-1.5 w-1 h-1 bg-primary rounded-full" />}
                        </button>
                      );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px bg-gray-100 self-stretch" />

              {/* Time Picker Section */}
              <div className="border-t border-gray-100 pt-4 sm:border-t-0 sm:pt-0 flex-1">
                <div className="flex items-center gap-2 mb-3 text-primary font-semibold text-[10px] uppercase px-1 tracking-widest"><Clock size={14} /> Chọn giờ</div>
                <div className="flex justify-center items-center gap-2 h-[150px] sm:h-[280px] bg-gray-50/50 rounded-2xl border border-gray-100 relative overflow-hidden">
                  {/* Hours */}
                  <div ref={hourListRef} className="w-14 h-full overflow-y-auto custom-scrollbar-none py-4 scroll-smooth">
                    {[...Array(24).keys(), ...Array(24).keys(), ...Array(24).keys()].map((i, idx) => {
                      const isRealSelected = currentDate.getHours() === i && Math.floor(idx / 24) === 1;
                      return (
                        <button key={idx} type="button" onClick={() => handleTimeChange('hour', i)}
                          className={`w-full py-2 text-xs transition-all rounded-lg ${isRealSelected ? 'bg-primary text-white font-semibold shadow-md active-time' : 'text-gray-400 hover:text-gray-600 font-medium'}`}>
                          {String(i).padStart(2, '0')}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-gray-300 font-semibold">:</div>
                  {/* Minutes */}
                  <div ref={minuteListRef} className="w-12 h-full overflow-y-auto custom-scrollbar-none py-4 scroll-smooth">
                    {[...Array(60).keys(), ...Array(60).keys(), ...Array(60).keys()].map((i, idx) => {
                      const isRealSelected = currentDate.getMinutes() === i && Math.floor(idx / 60) === 1;
                      return (
                        <button key={idx} type="button" onClick={() => handleTimeChange('minute', i)}
                          className={`w-full py-2 text-xs transition-all rounded-lg ${isRealSelected ? 'bg-primary text-white font-semibold shadow-md active-time' : 'text-gray-400 hover:text-gray-600 font-medium'}`}>
                          {String(i).padStart(2, '0')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <button type="button" onClick={() => { if (!value) updateDateTime(currentDate); setIsOpen(false); }}
              className="w-full py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95">
              Xác nhận
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ModernDateTimePicker;
