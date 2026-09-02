import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

const ModernMonthPicker = ({ value, onChange, label, className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({ opacity: 0, visibility: 'hidden' });

  // Parsing value "YYYY-MM"
  const parseValue = (val) => {
    if (!val) return { year: new Date().getFullYear(), month: new Date().getMonth() };
    const [y, m] = val.split('-');
    return { year: parseInt(y), month: parseInt(m) - 1 };
  };

  const { year: selectedYear, month: selectedMonthIndex } = parseValue(value);
  const [viewYear, setViewYear] = useState(selectedYear);

  // Sync viewYear when value changes externally
  useEffect(() => {
    if (value) {
      const { year } = parseValue(value);
      setViewYear(year);
    }
  }, [value]);

  // Positioning logic (similar to ModernDatePicker)
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

        const popupWidth = 300;
        const estimatedMaxHeight = 350;
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

        if (spaceBelow < estimatedMaxHeight && spaceAbove > spaceBelow) {
          style.bottom = `${window.innerHeight - rect.top + 8}px`;
        } else {
          style.top = `${rect.bottom + 8}px`;
        }

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
      if (containerRef.current && !containerRef.current.contains(event.target) &&
          popupRef.current && !popupRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const monthNames = [
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", 
    "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", 
    "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
  ];

  const handleSelectMonth = (monthIndex) => {
    const m = String(monthIndex + 1).padStart(2, '0');
    onChange(`${viewYear}-${m}`);
    setIsOpen(false);
  };

  const handleThisMonth = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    onChange(`${y}-${m}`);
    setViewYear(y);
    setIsOpen(false);
  };

  const formatDisplay = (val) => {
    if (!val) return 'Chọn tháng...';
    const { year, month } = parseValue(val);
    return `${monthNames[month]}, ${year}`;
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}

      <div
        ref={inputRef}
        className="relative h-[35px] cursor-pointer group"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={`absolute inset-0 flex items-center pl-9 pr-3 bg-white border ${isOpen ? 'border-primary ring-4 ring-primary/10' : 'border-gray-200 group-hover:border-primary/30'} rounded-2xl transition-all duration-300 ${value ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>
          <div className={`absolute left-3.5 ${isOpen ? 'text-primary' : 'text-gray-400 group-hover:text-primary/50'}`}>
            <CalendarIcon size={15} />
          </div>
          <span className="text-[13px]">
            {formatDisplay(value)}
          </span>
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
             <ChevronRight size={14} className={`transform transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </div>
        </div>
      </div>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-[99990] sm:hidden" onClick={() => setIsOpen(false)} />
          
          <div
            ref={popupRef}
            style={popupStyle}
            className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto z-[99999] bg-white sm:border sm:border-gray-100 rounded-t-[2.5rem] sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-6 sm:p-5 animate-in slide-in-from-bottom-4 duration-300"
          >
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden" />
            
            {/* Year Selector */}
            <div className="flex justify-between items-center mb-6 px-1">
              <button
                type="button"
                onClick={() => setViewYear(v => v - 1)}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-all active:scale-90"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-lg font-bold text-gray-900 tracking-tight">
                {viewYear}
              </div>
              <button
                type="button"
                onClick={() => setViewYear(v => v + 1)}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-all active:scale-90"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Month Grid */}
            <div className="grid grid-cols-3 gap-2">
              {monthNames.map((name, idx) => {
                const isSelected = selectedYear === viewYear && selectedMonthIndex === idx;
                const isCurrentMonth = new Date().getFullYear() === viewYear && new Date().getMonth() === idx;
                
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectMonth(idx)}
                    className={`
                      py-3 rounded-2xl text-[13px] font-semibold transition-all
                      ${isSelected 
                        ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105 z-10' 
                        : 'text-gray-600 hover:bg-primary/5 hover:text-primary'}
                      ${isCurrentMonth && !isSelected ? 'border-2 border-primary/20 bg-primary/5' : ''}
                    `}
                  >
                    {name.replace('Tháng ', 'T')}
                  </button>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => { onChange(''); setIsOpen(false); }}
                className="text-xs font-semibold text-gray-400 hover:text-rose-500 transition-colors px-2 py-1"
              >
                Xóa
              </button>
              <button
                type="button"
                onClick={handleThisMonth}
                className="text-xs font-bold text-primary hover:bg-primary/5 px-4 py-2 rounded-xl transition-all"
              >
                Tháng này
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ModernMonthPicker;
