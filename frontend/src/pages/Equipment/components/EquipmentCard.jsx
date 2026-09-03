import React from 'react';
import { Edit2, Trash2, Package, Building2, UserRound, Copy } from 'lucide-react';
import { ConditionBadge } from '../utils';
import LazyImage from '../../../components/LazyImage';
import { getFirstImage } from '../../../utils/formatters';

const getVisibilityFlags = (statsVisibility) => ({
  hideSensitiveStats: statsVisibility === 'sensitive',
  hideMetrics: statsVisibility === 'sensitive' || statsVisibility === 'metrics-only',
});

const EquipmentCard = ({ item, canManage, statsVisibility = 'full', onEdit, onDelete, onDuplicate }) => {
  const { hideSensitiveStats, hideMetrics } = getVisibilityFlags(statsVisibility);

  return (
    <div className="flex h-full flex-col bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="flex gap-4">
        {/* Image */}
        <div className="shrink-0">
          <LazyImage 
            entity="equipment" 
            id={item.id} 
            src={getFirstImage(item.images)}
            alt={item.name} 
            className="h-20 w-20 rounded-xl object-cover shadow-sm border border-gray-100"
            fallback={Package}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="min-h-[2.5rem] font-semibold text-gray-900 leading-tight mb-1 line-clamp-2">{item.name}</h3>
          {(item.brand || item.model) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {item.brand && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  {item.brand}
                </span>
              )}
              {item.model && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-50 border border-cyan-100 text-[10px] font-bold text-cyan-600 uppercase tracking-wider">
                  {item.model}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1 mb-2">
            <p className="text-sm font-semibold text-slate-900 leading-none">
              {Number(item.price_per_day).toLocaleString('vi-VN')}{' '}
              <span className="text-[10px] font-normal text-slate-400 uppercase">/ ngày</span>
            </p>
            {item.price_per_session && (
              <p className="text-xs font-medium text-slate-400">
                {Number(item.price_per_session).toLocaleString('vi-VN')}{' '}
                <span className="text-[10px] font-normal text-slate-400 uppercase">/ buổi</span>
              </p>
            )}
            {item.price_per_day_discount && (
              <p className="text-xs font-semibold text-emerald-600 leading-none mt-1">
                Ưu đãi: {Number(item.price_per_day_discount).toLocaleString('vi-VN')}{' '}
                <span className="text-[9px] font-normal text-emerald-400 uppercase">/ ngày</span>
                {item.discount_day_threshold && (
                  <span className="text-[10px] font-medium text-emerald-500/70 ml-1">
                    (từ {item.discount_day_threshold} ngày)
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
              {item.category}
            </span>
            <ConditionBadge condition={item.condition} />
          </div>
        </div>
      </div>

      {/* Meta Info */}
      <div className="mt-4 bg-gray-50/50 p-3 rounded-xl border border-gray-50 text-sm">
        <div className={`${hideSensitiveStats ? 'flex justify-end' : 'grid grid-cols-[minmax(0,1fr)_auto]'} items-start gap-2 mb-3`}>
          {!hideSensitiveStats && (
            <div className="flex min-h-[2.5rem] items-start gap-1.5 min-w-0">
              <Building2 size={14} className="text-blue-500" />
              <span className="text-gray-700 font-medium leading-snug line-clamp-2">
                {item.branch_name || (
                  <span className="text-gray-400 italic font-normal">Chưa gán cơ sở</span>
                )}
              </span>
            </div>
          )}
          {!hideMetrics && (
            <div className="text-right">
              <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {item.rental_count || 0} lần ({item.total_rentals > 0 ? ((item.rental_count / item.total_rentals) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          )}
        </div>
        {!hideMetrics && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Doanh số</span>
            <span className="font-bold text-slate-700">
              {Math.round(item.total_sales || 0).toLocaleString('vi-VN')}đ
            </span>
          </div>
        )}
        {!hideMetrics && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Doanh thu</span>
            <span className="font-bold text-indigo-600">
              {Math.round(item.total_revenue || 0).toLocaleString('vi-VN')}đ
            </span>
          </div>
        )}
        {!hideSensitiveStats && (
          <div className="flex justify-between items-center mb-2 gap-3">
            <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Chủ sở hữu</span>
            <span className="font-semibold text-slate-700 flex items-center gap-1 min-w-0">
              <UserRound size={12} className="text-emerald-500 shrink-0" />
              <span className="truncate max-w-[150px]">{item.owner_name || item.owner_username || 'Chưa gán'}</span>
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Mã thiết bị</span>
          <span className="font-mono font-semibold text-primary">{item.code}</span>
        </div>
      </div>

      {/* Actions */}
      {canManage && (
        <div className="flex justify-end gap-2 mt-auto pt-3 border-t border-gray-50">
          {onDuplicate && (
            <button
              onClick={() => onDuplicate(item)}
              title="Nhân bản thiết bị"
              className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
            >
              <Copy size={18} />
            </button>
          )}
          <button
            onClick={() => onEdit(item)}
            className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={() => onDelete(item)}
            className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default EquipmentCard;
