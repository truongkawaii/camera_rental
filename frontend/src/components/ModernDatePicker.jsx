import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatVN } from '../utils/formatters';

const ModernDatePicker = ({ value, onChange, label, required, min, className = "", placeholder = 'Chọn ngày...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({ opacity: 0, visibility: 'hidden' });

  // Positioning logic
  useEffect(() => {
    if (isOpen) {
      const updatePosition = () => {
        if (!inputRef.current) return;
        const rect = inputRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;

        if (isMobile) {
          setPopupStyle({});
          return;
        }

        const popupWidth = 320;
        const estimatedMaxHeight = 400;
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

        // Vertical
        if (spaceBelow < estimatedMaxHeight && spaceAbove > spaceBelow) {
          style.bottom = `${window.innerHeight - rect.top + 8}px`;
          style.maxHeight = `${Math.min(estimatedMaxHeight, spaceAbove)}px`;
        } else {
          style.top = `${rect.bottom + 8}px`;
          style.maxHeight = `${Math.min(estimatedMaxHeight, spaceBelow)}px`;
        }

        // Horizontal
        const spaceRight = window.innerWidth - rect.left;
        if (spaceRight < popupWidth) {
          style.right = `${window.innerWidth - rect.right}px`;
        } else {
          style.left = `${rect.left}px`;
        }

        style.opacity = 1;
        style.visibility = 'visible';
        setPopupStyle(style);
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

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

  const parseDate = (dateStr) => {
    if (!dateStr) return new Date();
    // Handle ISO datetime strings (TIMESTAMPTZ) by extracting only the date part
    const dateOnly = dateStr.split('T')[0];
    const [y, m, d] = dateOnly.split('-');
    const parsed = new Date(y, m - 1, d);
    // Fallback to current date if parsing fails
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const [currentMonth, setCurrentMonth] = useState(() => parseDate(value));

  // Sync currentMonth when value changes externally
  useEffect(() => {
    if (value) {
      setCurrentMonth(parseDate(value));
    }
  }, [value]);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleSelectDate = (day) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);

    // Format to YYYY-MM-DD
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    const dateString = `${y}-${m}-${d}`;

    // Check min constraint
    if (min) {
      const minDate = new Date(min);
      minDate.setHours(0, 0, 0, 0);
      if (selectedDate < minDate) return;
    }

    onChange(dateString);
    setIsOpen(false);
  };

  const isDateSelected = (day) => {
    if (!value) return false;
    const [y, m, d] = value.split('-');
    return (
      currentMonth.getFullYear() === parseInt(y) &&
      currentMonth.getMonth() === parseInt(m) - 1 &&
      day === parseInt(d)
    );
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      currentMonth.getFullYear() === today.getFullYear() &&
      currentMonth.getMonth() === today.getMonth() &&
      day === today.getDate()
    );
  };

  const isDateDisabled = (day) => {
    if (!min) return false;
    const dateToCheck = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const minDate = new Date(min);
    minDate.setHours(0, 0, 0, 0);
    return dateToCheck < minDate;
  };

  const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-widest">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div
        ref={inputRef}
        className="relative h-[35px] cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={`absolute inset-0 flex items-center pl-8 pr-3 border transition-all duration-300 rounded-[14px] ${isOpen ? 'bg-white border-primary ring-4 ring-primary/10' : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:shadow-md'} ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          <div className={`absolute left-2.5 ${isOpen ? 'text-primary' : 'text-gray-400'}`}>
            <CalendarIcon size={15} />
          </div>
          <span className="text-[13px] font-medium flex-1 truncate">
            {value ? formatVN(value) : placeholder}
          </span>
          {value && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="ml-1 p-0.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              title="Xóa ngày"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {isOpen && createPortal(
        <>
          {/* Mobile Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-[99990] sm:hidden transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div
            ref={popupRef}
            style={popupStyle}
            className="fixed z-[99999] sm:bg-white bg-white sm:border sm:border-gray-200 sm:rounded-2xl shadow-2xl p-6 sm:p-4 animate-in sm:slide-in-from-bottom-2 duration-200 transition-opacity max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden custom-scrollbar-none max-sm:top-1/2 max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:w-[calc(100%-3rem)] max-sm:max-w-[360px] max-sm:rounded-[2rem] max-sm:zoom-in-95"
          >
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex justify-between items-center mb-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="font-semibold text-gray-900 text-[15px]">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-400 pb-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                <div key={`empty-${index}`} />
              ))}

              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const selected = isDateSelected(day);
                const disabled = isDateDisabled(day);
                const today = isToday(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      onClick={(e) => { e.stopPropagation(); handleSelectDate(day); }}
                      className={`
                        relative w-9 h-9 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-sm sm:text-xs transition-all
                        ${disabled ? 'text-gray-300 cursor-not-allowed' : 
                          selected ? 'bg-primary text-white shadow-md scale-110 z-10 hover:brightness-95' : 
                          'text-gray-700 hover:bg-primary/10 cursor-pointer'}
                        ${today && !selected ? 'border-2 border-primary text-primary bg-primary/5' : ''}
                      `}
                    >
                      {day}
                      {today && !selected && (
                        <div className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />
                      )}
                    </button>
                  );
              })}
            </div>

            <div className="mt-6 sm:hidden">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full py-2.5 bg-primary text-white text-[13px] font-bold uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
              >
                Xác Nhận
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ModernDatePicker;
