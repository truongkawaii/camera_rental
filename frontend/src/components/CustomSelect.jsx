import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus, UserPlus, Check } from 'lucide-react';

/* ── Accent color maps ────────────────────────────────────────── */
const ACCENTS = {
  primary: {
    closed: 'border-gray-200 bg-white hover:border-primary/50 hover:shadow-md',
    open: 'border-primary ring-4 ring-primary/10',
    selectedBg: 'bg-primary/10',
    selectedText: 'text-primary',
    selectedBorder: 'border-primary/20',
    hoverBg: 'hover:bg-primary/5',
    hoverText: 'hover:text-primary',
    addBg: 'bg-primary/5',
    addHover: 'hover:bg-primary/10',
    addText: 'text-primary',
  },
  orange: {
    closed: 'border-slate-200 bg-white hover:border-orange-300 hover:shadow-md',
    open: 'border-orange-400 ring-4 ring-orange-100',
    selectedBg: 'bg-orange-50',
    selectedText: 'text-orange-600',
    selectedBorder: 'border-orange-200',
    hoverBg: 'hover:bg-orange-50',
    hoverText: 'hover:text-orange-600',
    addBg: 'bg-orange-50',
    addHover: 'hover:bg-orange-100',
    addText: 'text-orange-600',
  },
  sky: {
    closed: 'border-slate-200 bg-white hover:border-sky-300 hover:shadow-md',
    open: 'border-sky-400 ring-4 ring-sky-100',
    selectedBg: 'bg-sky-50',
    selectedText: 'text-sky-600',
    selectedBorder: 'border-sky-200',
    hoverBg: 'hover:bg-sky-50',
    hoverText: 'hover:text-sky-600',
    addBg: 'bg-sky-50',
    addHover: 'hover:bg-sky-100',
    addText: 'text-sky-600',
  },
  violet: {
    closed: 'border-slate-200 bg-white hover:border-violet-300 hover:shadow-md',
    open: 'border-violet-400 ring-4 ring-violet-100',
    selectedBg: 'bg-violet-50',
    selectedText: 'text-violet-600',
    selectedBorder: 'border-violet-200',
    hoverBg: 'hover:bg-violet-50',
    hoverText: 'hover:text-violet-600',
    addBg: 'bg-violet-50',
    addHover: 'hover:bg-violet-100',
    addText: 'text-violet-600',
  },
  slate: {
    closed: 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:shadow-md',
    open: 'border-slate-400 ring-4 ring-slate-100',
    selectedBg: 'bg-slate-100',
    selectedText: 'text-slate-700',
    selectedBorder: 'border-slate-300',
    hoverBg: 'hover:bg-slate-50',
    hoverText: 'hover:text-slate-700',
    addBg: 'bg-slate-50',
    addHover: 'hover:bg-slate-100',
    addText: 'text-slate-600',
  },
};

const CustomSelect = ({ 
  options = [], 
  value, 
  onChange, 
  placeholder = "Chọn...", 
  labelField = "name", 
  valueField = "id",
  onAddNew,
  addNewLabel = "Thêm mới",
  className = "",
  showSearch = true,
  renderOption = null,
  disabled = false,
  autoFocusSearch = true,
  buttonClassName = "",
  accent = "primary",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  // Normalize options to objects if they are strings (Memoized to prevent unnecessary work)
  const normalizedOptions = React.useMemo(() => 
    options.map(opt => 
      typeof opt === 'string' ? { [valueField]: opt, [labelField]: opt } : opt
    ), [options, valueField, labelField]
  );

  const selectedOption = normalizedOptions.find(opt => opt[valueField]?.toString() === value?.toString());

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = normalizedOptions.filter(opt => 
    opt[labelField]?.toString().toLowerCase().includes(search.toLowerCase())
  );

  const colors = ACCENTS[accent] || ACCENTS.primary;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full h-full min-h-0 flex items-center justify-between px-4 py-1.5 border transition-all duration-300 outline-none
          ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200 rounded-2xl' :
            isOpen 
            ? `${colors.open} rounded-t-2xl rounded-b-lg bg-white shadow-sm`
            : `${colors.closed} rounded-2xl`
          }
          ${buttonClassName}
        `}
      >
        <span className={`min-w-0 text-sm font-medium leading-normal truncate ${selectedOption && !disabled ? "text-gray-900" : "text-gray-400"}`}>
          {selectedOption ? selectedOption[labelField] : placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform duration-300 ${isOpen && !disabled ? `rotate-180 ${colors.selectedText}` : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[100] min-w-full w-full mt-1.5 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden" style={{ animation: 'customSelectFadeIn 0.15s ease-out' }}>
          {showSearch && (
            <div className="px-3 py-0 h-[35px] border-b border-gray-50 flex items-center gap-2 bg-gray-50/50">
              <Search size={14} className="text-gray-400 ml-1" />
              <input
                type="text"
                autoFocus={autoFocusSearch}
                className="w-full py-0 text-sm outline-none bg-transparent placeholder:text-gray-400 font-medium"
                placeholder="Tìm kiếm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto custom-scrollbar p-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = value?.toString() === opt[valueField]?.toString();
                return (
                  <button
                    key={opt[valueField]}
                    type="button"
                    onClick={() => {
                      onChange(opt[valueField]);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full text-left px-3.5 py-2 min-h-[38px] text-sm rounded-xl transition-colors duration-150 flex items-center justify-between gap-3 mb-0.5
                      ${isSelected 
                        ? `${colors.selectedBg} ${colors.selectedText} font-bold border ${colors.selectedBorder}`
                        : `text-gray-600 ${colors.hoverBg} ${colors.hoverText} font-medium`}
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      {renderOption ? (
                        renderOption(opt)
                      ) : (
                        <span className="block whitespace-normal leading-tight">{opt[labelField]}</span>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center">
                <div className="bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search size={20} className="text-gray-300" />
                </div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Không tìm thấy</p>
              </div>
            )}
          </div>

          {onAddNew && (
            <button
              type="button"
              onClick={() => {
                onAddNew(search);
                setIsOpen(false);
                setSearch("");
              }}
              className={`w-full flex items-center gap-2 px-4 py-3.5 ${colors.addBg} ${colors.addText} font-bold text-xs ${colors.addHover} transition-colors border-t border-gray-100 uppercase tracking-widest`}
            >
              <UserPlus size={14} />
              {addNewLabel} {search && `"${search}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
