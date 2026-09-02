import React from 'react';
import { Edit2, Trash2, Package, Building2, ArrowDown, ArrowUp, ArrowUpDown, UserRound } from 'lucide-react';
import Pagination from '../../../components/Pagination';
import { ConditionBadge } from '../utils';
import LazyImage from '../../../components/LazyImage';
import { getFirstImage } from '../../../utils/formatters';
import CustomSelect from '../../../components/CustomSelect';

import EquipmentCard from './EquipmentCard';

const getVisibilityFlags = (statsVisibility) => ({
  hideSensitiveStats: statsVisibility === 'sensitive',
  hideMetrics: statsVisibility === 'sensitive' || statsVisibility === 'metrics-only',
});

/* ── Shared empty / loading states ─────────────────────────────── */
const LoadingState = () => (
  <div className="flex flex-col items-center gap-3 py-14">
    <div className="w-8 h-8 border-[3px] border-orange-500 border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Đang tải...</span>
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center gap-3 py-14 text-center">
    <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
      <Package size={32} />
    </div>
    <p className="text-sm font-semibold text-slate-500">Chưa có thiết bị nào</p>
    <p className="text-xs text-slate-400">Nhấn "+ Thêm Thiết Bị" để bắt đầu</p>
  </div>
);

/* ── Desktop Table Row ─────────────────────────────────────────── */
const EquipmentRow = ({ item, canManage, statsVisibility, onEdit, onDelete }) => {
  const td = 'px-4 py-4 bg-white border-y border-slate-100 group-hover:border-blue-100 transition-colors';
  const { hideSensitiveStats, hideMetrics } = getVisibilityFlags(statsVisibility);

  return (
    <tr className="group hover:shadow-md transition-all rounded-2xl">
      {/* Hình ảnh */}
      <td className={`hidden 2xl:table-cell ${td} border-l rounded-l-2xl`}>
        <LazyImage
          entity="equipment"
          id={item.id}
          src={getFirstImage(item.images)}
          alt={item.name}
          className="w-12 h-12 rounded-xl object-cover border border-slate-100 group-hover:scale-105 transition-transform"
          fallback={Package}
        />
      </td>

      {/* Tên */}
      <td className={`${td} 2xl:border-l-0 border-l rounded-l-2xl 2xl:rounded-l-none`}>
        <p className="font-semibold text-slate-900 text-[13.5px] leading-tight group-hover:text-orange-500 transition-colors">
          {item.name}
        </p>
        {(item.brand || item.model) && (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {item.brand && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[9px] font-bold text-indigo-600 uppercase tracking-wider leading-none">
                {item.brand}
              </span>
            )}
            {item.model && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-100 text-[9px] font-bold text-cyan-600 uppercase tracking-wider leading-none">
                {item.model}
              </span>
            )}
          </div>
        )}
      </td>

      {/* Danh mục */}
      <td className={td}>
        <span className="text-[12px] font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
          {item.category}
        </span>
      </td>

      {/* Cơ sở */}
      {!hideSensitiveStats && (
        <>
      <td className={`hidden xl:table-cell ${td}`}>
        {item.branch_name ? (
          <div className="flex items-center gap-2 text-slate-600">
            <span className="p-1 bg-violet-50 rounded-lg text-violet-500 group-hover:bg-violet-100 transition-colors">
              <Building2 size={13} />
            </span>
            <span className="text-[12px] font-semibold">{item.branch_name}</span>
          </div>
        ) : (
          <span className="text-slate-300 italic text-[11px]">Chưa gán</span>
        )}
      </td>

      {/* Chủ sở hữu */}
      <td className={`hidden 2xl:table-cell ${td}`}>
        {item.owner_name || item.owner_username ? (
          <div className="flex items-center gap-2 text-slate-600">
            <span className="p-1 bg-emerald-50 rounded-lg text-emerald-500 group-hover:bg-emerald-100 transition-colors">
              <UserRound size={13} />
            </span>
            <span className="text-[12px] font-semibold">{item.owner_name || item.owner_username}</span>
          </div>
        ) : (
          <span className="text-slate-300 italic text-[11px]">Chưa gán</span>
        )}
      </td>

      {/* Mã TB */}
        </>
      )}

      <td className={td}>
        <span className="font-mono font-semibold text-[11px] text-orange-500/80 uppercase tracking-widest">
          {item.code}
        </span>
      </td>

      {/* Giá thuê */}
      <td className={`${td} whitespace-nowrap`}>
        <p className="text-[11px] font-semibold text-slate-900 whitespace-nowrap">
          {Number(item.price_per_day).toLocaleString('vi-VN')}{' '}
          <span className="text-[9px] text-slate-400 font-normal uppercase">/ ngày</span>
        </p>
        {item.price_per_session && (
          <p className="text-[9px] font-medium text-slate-400 whitespace-nowrap">
            {Number(item.price_per_session).toLocaleString('vi-VN')}{' '}
            <span className="text-[9px] text-slate-400 font-normal uppercase">/ buổi</span>
          </p>
        )}
      </td>

      {/* Giá ưu đãi */}
      <td className={`${td} whitespace-nowrap`}>
        {item.price_per_day_discount ? (
          <>
            <p className="text-[11px] font-semibold text-emerald-600 whitespace-nowrap">
              {Number(item.price_per_day_discount).toLocaleString('vi-VN')}{' '}
              <span className="text-[9px] text-emerald-400 font-normal uppercase">/ ngày</span>
            </p>
            {item.discount_day_threshold && (
              <p className="text-[9px] font-medium text-emerald-500/70 whitespace-nowrap">
                Từ {item.discount_day_threshold} ngày
              </p>
            )}
          </>
        ) : (
          <span className="text-slate-300 italic text-[11px]">Không có</span>
        )}
      </td>

      {!hideMetrics && (
        <td className={`${td} text-center whitespace-nowrap`}>
          <div className="flex flex-col items-center justify-center">
            <p className="text-[11px] font-bold text-slate-700">{item.rental_count || 0}</p>
            <p className="text-[9px] font-medium text-slate-400 mt-0.5">
              {item.total_rentals > 0 
                ? `${((item.rental_count / item.total_rentals) * 100).toFixed(1)}%` 
                : '0%'}
            </p>
          </div>
        </td>
      )}

      {!hideMetrics && (
        <td className={`${td} text-right whitespace-nowrap`}>
          <p className="text-[11px] font-bold text-slate-700">
            {Math.round(item.total_sales || 0).toLocaleString('vi-VN')}đ
          </p>
        </td>
      )}

      {!hideMetrics && (
        <td className={`${td} text-right whitespace-nowrap`}>
          <p className="text-[11px] font-bold text-indigo-600">
            {Math.round(item.total_revenue || 0).toLocaleString('vi-VN')}đ
          </p>
        </td>
      )}

      {/* Tình trạng */}
      <td className={`${td} text-center`}>
        <ConditionBadge condition={item.condition} />
      </td>

      {/* Hành động */}
      <td className={`${td} border-r rounded-r-2xl`}>
        <div className="flex items-center justify-end gap-1.5">
          {canManage && (
            <>
              <button
                onClick={() => onEdit(item)}
                title="Chỉnh sửa"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-200 hover:shadow-md hover:shadow-blue-100 transition-all"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={() => onDelete(item)}
                title="Xóa"
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 hover:shadow-md hover:shadow-rose-100 transition-all"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

const EquipmentList = ({
  equipment,
  loading,
  canManage,
  currentPage,
  totalPages,
  onPageChange,
  onEdit,
  onDelete,
  month,
  sortBy,
  sortOrder,
  statsVisibility = 'full',
  onSort,
}) => {
  const { hideSensitiveStats, hideMetrics } = getVisibilityFlags(statsVisibility);
  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <ArrowUpDown size={12} className="opacity-30 inline-block ml-1" />;
    if (sortOrder === 'ASC') return <ArrowUp size={12} className="text-primary inline-block ml-1" />;
    return <ArrowDown size={12} className="text-primary inline-block ml-1" />;
  };

  const thClass = "px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.18em]";
  const sortableThClass = `${thClass} cursor-pointer hover:text-slate-600 transition-colors select-none group`;
  
  const displayMonth = month ? ` (T${month.split('-')[1]})` : '';

  const sortOptions = [
    { value: 'name', label: 'Tên thiết bị' },
    { value: 'brand', label: 'Thương hiệu' },
    { value: 'model', label: 'Model' },
    { value: 'category', label: 'Danh mục' },
    { value: 'branch', label: 'Cơ sở' },
    { value: 'owner', label: 'Chủ sở hữu' },
    { value: 'code', label: 'Mã TB' },
    { value: 'price', label: 'Giá thuê' },
    { value: 'discount_price', label: 'Giá ưu đãi' },
    { value: 'rentals', label: `Lượt thuê${displayMonth}` },
    { value: 'sales', label: `Doanh số${displayMonth}` },
    { value: 'revenue', label: `Doanh thu${displayMonth}` },
  ];
  
  const hiddenSortValues = new Set();
  if (hideSensitiveStats) {
    ['branch', 'owner', 'rentals', 'sales', 'revenue'].forEach((value) => hiddenSortValues.add(value));
  }
  if (statsVisibility === 'metrics-only') {
    ['rentals', 'sales', 'revenue'].forEach((value) => hiddenSortValues.add(value));
  }
  const visibleSortOptions = sortOptions.filter((option) => !hiddenSortValues.has(option.value));
  const tableColumnCount = 13 - (hideSensitiveStats ? 2 : 0) - (hideMetrics ? 3 : 0);
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">

      {/* Mobile Sort Controls */}
      <div className="block xl:hidden px-4 pt-4 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Sắp xếp:</span>
          <div className="relative flex-1">
            <CustomSelect
              options={visibleSortOptions}
              value={sortBy}
              onChange={(val) => { if (val !== sortBy) onSort(val); }}
              placeholder="Sắp xếp"
              labelField="label"
              valueField="value"
              showSearch={false}
              accent="slate"
              buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-sm [&>span]:font-medium"
            />
          </div>
          <button 
            onClick={() => onSort(sortBy)}
            className="h-[35px] w-[35px] shrink-0 flex items-center justify-center border border-slate-200 rounded-xl bg-slate-50 text-slate-500 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors shadow-sm"
          >
            {sortOrder === 'ASC' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="block xl:hidden p-4">
        {loading ? (
          <div className="md:col-span-2"><LoadingState /></div>
        ) : equipment.length === 0 ? (
          <div className="md:col-span-2"><EmptyState /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {equipment.map((item) => (
              <EquipmentCard
                key={item.id}
                item={item}
                canManage={canManage}
                statsVisibility={statsVisibility}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden xl:block overflow-x-auto pb-2">
        <table className="w-full border-separate border-spacing-y-2 min-w-[800px] px-4">
          <thead>
            <tr>
              <th className={`hidden 2xl:table-cell text-left ${thClass}`}>Hình Ảnh</th>
              <th className={`text-left ${sortableThClass}`} onClick={() => onSort('name')}>
                Tên Thiết Bị <SortIcon column="name" />
              </th>
              <th className={`text-left ${sortableThClass}`} onClick={() => onSort('category')}>
                Danh Mục <SortIcon column="category" />
              </th>
              <th className={`${hideSensitiveStats ? 'hidden' : 'hidden xl:table-cell'} text-left ${sortableThClass}`} onClick={() => onSort('branch')}>
                Cơ Sở <SortIcon column="branch" />
              </th>
              <th className={`${hideSensitiveStats ? 'hidden' : 'hidden 2xl:table-cell'} text-left ${sortableThClass}`} onClick={() => onSort('owner')}>
                Chủ Sở Hữu <SortIcon column="owner" />
              </th>
              <th className={`text-left ${sortableThClass}`} onClick={() => onSort('code')}>
                Mã TB <SortIcon column="code" />
              </th>
              <th className={`text-left ${sortableThClass}`} onClick={() => onSort('price')}>
                Giá Thuê <SortIcon column="price" />
              </th>
              <th className={`text-left ${sortableThClass}`} onClick={() => onSort('discount_price')}>
                Giá Ưu Đãi <SortIcon column="discount_price" />
              </th>
              {!hideMetrics && (
                <th className={`text-center ${sortableThClass}`} onClick={() => onSort('rentals')}>
                  Lượt Thuê{displayMonth} <SortIcon column="rentals" />
                </th>
              )}
              {!hideMetrics && (
                <th className={`text-right ${sortableThClass}`} onClick={() => onSort('sales')}>
                  Doanh Số{displayMonth} <SortIcon column="sales" />
                </th>
              )}
              {!hideMetrics && (
                <th className={`text-right ${sortableThClass}`} onClick={() => onSort('revenue')}>
                  Doanh Thu{displayMonth} <SortIcon column="revenue" />
                </th>
              )}
              <th className={`text-center ${thClass}`}>Tình Trạng</th>
              <th className={`text-right ${thClass}`}>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={tableColumnCount} className="py-16"><LoadingState /></td></tr>
            ) : equipment.length === 0 ? (
              <tr><td colSpan={tableColumnCount} className="py-6"><EmptyState /></td></tr>
            ) : (
              equipment.map((item) => (
                <EquipmentRow
                  key={item.id}
                  item={item}
                  canManage={canManage}
                  statsVisibility={statsVisibility}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t border-slate-100">
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
      </div>
    </div>
  );
};

export default EquipmentList;
