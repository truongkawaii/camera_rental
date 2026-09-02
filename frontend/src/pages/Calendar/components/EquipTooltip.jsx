import React, { useLayoutEffect, useRef } from 'react';
import { Activity, DollarSign, MapPin, Package, Tag } from 'lucide-react';
import LazyImage from '../../../components/LazyImage';
import { ConditionBadge } from '../../Equipment/utils';
import { getFirstImage } from '../../../utils/formatters';

const EquipTooltip = ({ eq, initialPos }) => {
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    if (!eq) return;

    if (!tooltipRef.current || !initialPos) return;

    const isMobile = window.innerWidth < 768;
    const tooltipWidth = isMobile ? 200 : 288;
    const gap = isMobile ? 8 : 20;
    let x = initialPos.x + gap;
    let y = initialPos.y + 10;

    if (x + tooltipWidth > window.innerWidth) x = initialPos.x - tooltipWidth - gap;
    if (x < 10) x = 10;

    const tooltipHeight = tooltipRef.current.offsetHeight || (isMobile ? 240 : 420);
    if (y + tooltipHeight > window.innerHeight) {
      y = Math.max(10, window.innerHeight - tooltipHeight - 10);
    }

    tooltipRef.current.style.left = `${x}px`;
    tooltipRef.current.style.top = `${y}px`;
  }, [eq, initialPos]);

  if (!eq) return null;

  return (
    <div
      ref={tooltipRef}
      data-equip-tooltip="true"
      className="fixed z-[9999] pointer-events-auto w-[200px] md:w-72 bg-white/95 backdrop-blur-xl border border-violet-200/50 rounded-2xl shadow-2xl shadow-violet-500/20 overflow-hidden animate-[fadeInScale_0.2s_ease-out]"
      style={{ left: '-9999px', top: '-9999px' }}
    >
      <div className="relative h-20 md:h-40 bg-slate-100">
        <LazyImage
          entity="equipment"
          id={eq.id}
          src={getFirstImage(eq.images)}
          alt={eq.name}
          className="relative z-0 w-full h-full object-cover"
          fallback={Package}
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-1.5 md:bottom-3 left-2 md:left-3 right-2 md:right-3 z-20">
          <p className="text-white font-bold text-xs md:text-sm leading-tight drop-shadow-md">{eq.name}</p>
          <p className="text-violet-200 font-mono text-[9px] md:text-[10px] mt-0.5 drop-shadow-sm uppercase tracking-wider">{eq.code}</p>
        </div>
      </div>

      <div className="p-2 md:p-4 space-y-2 md:space-y-3.5">
        <div className="grid grid-cols-2 gap-1.5 md:gap-2">
          <div className="bg-violet-50/50 p-1.5 md:p-2 rounded-xl border border-violet-100/50">
            <p className="text-[9px] md:text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-0.5">Theo Ngày</p>
            <p className="text-xs md:text-[13px] font-semibold text-violet-700">
              {Number(eq.price_per_day).toLocaleString('vi-VN')}đ
            </p>
          </div>
          <div className="bg-emerald-50/50 p-1.5 md:p-2 rounded-xl border border-emerald-100/50">
            <p className="text-[9px] md:text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-0.5">Theo Buổi</p>
            <p className="text-xs md:text-[13px] font-semibold text-emerald-700">
              {Number(eq.price_per_session || 0).toLocaleString('vi-VN')}đ
            </p>
          </div>
        </div>

        {eq.price_per_day_discount > 0 && (
          <div className="bg-amber-50/60 px-2 md:px-2.5 py-1.5 md:py-2 rounded-lg border border-amber-200/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <DollarSign size={12} className="text-amber-600 md:w-3.5 md:h-3.5" />
              <p className="text-xs md:text-sm font-bold text-amber-700">
                {Number(eq.price_per_day_discount).toLocaleString('vi-VN')}đ
                <span className="text-[10px] md:text-xs font-semibold text-amber-500 ml-0.5">/ngày</span>
              </p>
            </div>
            <p className="text-[9px] md:text-[10px] font-bold text-amber-600 bg-white/80 px-1.5 py-0.5 rounded">≥{eq.discount_day_threshold}n</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Tag size={10} className="text-gray-400 shrink-0" />
            <span className="text-[11px] md:text-xs font-medium text-gray-700 truncate">{eq.category}</span>
          </div>

          <div className="flex items-center gap-1.5 text-gray-600">
            <MapPin size={10} className="text-gray-400 shrink-0" />
            <span className="text-[11px] md:text-xs font-medium text-gray-700 truncate">{eq.branch_name || 'Hệ thống'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Activity size={10} className="text-gray-400 shrink-0" />
            <ConditionBadge condition={eq.condition} className="scale-75 origin-left -ml-1" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipTooltip;
