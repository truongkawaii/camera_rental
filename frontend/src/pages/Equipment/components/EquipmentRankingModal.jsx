import React, { useEffect, useMemo } from 'react';
import { X, Loader2, Trophy, Medal, BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatPrice } from '../../../utils/formatters';

const PIE_COLORS = [
  '#FF6B35', // orange
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // deep orange
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#E11D48', // rose
  '#7C3AED', // purple
  '#059669', // green
  '#D946EF', // fuchsia
];

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-3 shadow-xl">
        <p className="text-sm font-bold text-slate-800">{item.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          <span className="font-semibold text-slate-700">{item.rental_count.toLocaleString('vi-VN')}</span> lần thuê
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{formatPrice(item.total_revenue)}</span>
        </p>
      </div>
    );
  }
  return null;
};

const renderLegend = (data, colors) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
    {data.map((entry, index) => (
      <div key={entry.id} className="flex items-center gap-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: colors[index % colors.length] }}
        />
        <span className="text-[11px] text-slate-600 font-medium truncate max-w-[120px]" title={entry.name}>
          {entry.name}
        </span>
      </div>
    ))}
  </div>
);

const RankBadge = ({ rank }) => {
  if (rank === 1) return <Trophy size={18} className="text-yellow-500" />;
  if (rank === 2) return <Medal size={18} className="text-slate-400" />;
  if (rank === 3) return <Medal size={18} className="text-amber-600" />;
  return (
    <span className="text-xs font-bold text-slate-400 w-[18px] text-center">
      {rank}
    </span>
  );
};

const EquipmentRankingModal = ({ data = [], loading, month, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const pieData = useMemo(() => data.map((item) => ({
    id: item.model,
    name: item.model || 'Không xác định',
    value: parseInt(item.rental_count) || 0,
    rental_count: parseInt(item.rental_count) || 0,
    total_revenue: parseFloat(item.total_revenue) || 0,
    percentage: parseFloat(item.percentage) || 0,
  })), [data]);

  const formatMonthLabel = (m) => {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return '';
    const [year, monthNum] = m.split('-');
    return `Tháng ${parseInt(monthNum)}/${year}`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl max-w-6xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Xếp Hạng Model</h2>
              {formatMonthLabel(month) && (
                <p className="text-sm text-slate-500 font-medium">{formatMonthLabel(month)}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            title="Đóng"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Loader2 size={36} className="animate-spin text-orange-500" />
              <span className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Đang tải dữ liệu...</span>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                <BarChart3 size={32} />
              </div>
              <p className="text-sm font-semibold text-slate-500">Chưa có dữ liệu xếp hạng</p>
              <p className="text-xs text-slate-400">Không có lượt thuê nào trong thời gian này</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* ── Left: Ranking Table ── */}
              <div className="lg:w-[65%] min-w-0">
                {/* ── Mobile: Card layout ── */}
                <div className="sm:hidden space-y-2">
                  {data.map((item, index) => {
                    const rank = index + 1;
                    const pieColor = PIE_COLORS[index % PIE_COLORS.length];
                    return (
                      <div
                        key={item.model || index}
                        className="bg-white rounded-xl border border-slate-200 p-3 active:bg-orange-50/30 transition-colors"
                      >
                        {/* Top row: rank + model name + percentage */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <RankBadge rank={rank} />
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: pieColor }}
                            />
                            <span className="text-sm font-bold text-slate-800 truncate">
                              {item.model || 'Không xác định'}
                            </span>
                          </div>
                          <span
                            className="inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 rounded-lg text-[11px] font-bold text-white shrink-0"
                            style={{ backgroundColor: pieColor }}
                          >
                            {(parseFloat(item.percentage) || 0).toFixed(1)}%
                          </span>
                        </div>
                        {/* Brand */}
                        {item.brand && (
                          <p className="text-[11px] text-slate-400 ml-[30px] mt-0.5 truncate">
                            {item.brand}
                          </p>
                        )}
                        {/* Bottom row: equipment count + rental count + revenue */}
                        <div className="flex items-center justify-between mt-2 ml-[30px]">
                          <span className="text-[12px] font-semibold text-slate-500">
                            {(parseInt(item.equipment_count) || 0).toLocaleString('vi-VN')} <span className="text-slate-400 font-medium">máy</span>
                          </span>
                          <span className="text-[12px] font-semibold text-slate-600">
                            {(parseInt(item.rental_count) || 0).toLocaleString('vi-VN')} <span className="text-slate-400 font-medium">lần thuê</span>
                          </span>
                          <span className="text-[12px] font-semibold text-slate-700">
                            {formatPrice(item.total_revenue || 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop: Table layout ── */}
                <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Số lượng
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Lần thuê
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Tổng tiền
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Tỉ lệ %
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map((item, index) => {
                        const rank = index + 1;
                        const pieColor = PIE_COLORS[index % PIE_COLORS.length];
                        return (
                          <tr
                            key={item.model || index}
                            className="hover:bg-orange-50/30 transition-colors group"
                          >
                            <td className="px-4 py-3">
                              <RankBadge rank={rank} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: pieColor }}
                                />
                                <span className="text-sm font-semibold text-slate-800 group-hover:text-orange-600 transition-colors truncate max-w-[100px]">
                                  {item.model || 'Không xác định'}
                                </span>
                              </div>
                              {item.brand && (
                                <p className="text-[11px] text-slate-400 ml-[18px] mt-0.5 truncate">
                                  {item.brand}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-semibold text-slate-600">
                                {(parseInt(item.equipment_count) || 0).toLocaleString('vi-VN')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm font-bold text-slate-700">
                                {(parseInt(item.rental_count) || 0).toLocaleString('vi-VN')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-xs font-semibold text-slate-700">
                                {formatPrice(item.total_revenue || 0)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className="inline-flex items-center justify-center min-w-[52px] px-2 py-1 rounded-lg text-xs font-bold text-white"
                                style={{ backgroundColor: pieColor }}
                              >
                                {(parseFloat(item.percentage) || 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>


              </div>

              {/* ── Right: Pie Chart ── */}
              <div className="lg:w-[35%] shrink-0">
                <div className="sticky top-0">
                  <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <span className="w-1.5 h-4 rounded-full bg-gradient-to-b from-orange-400 to-rose-500" />
                      Tỉ lệ lượt thuê
                    </h3>

                    <div className="relative flex justify-center">
                      {/* Center label – rendered first so tooltip appears above it */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div className="text-center">
                          <p className="text-2xl font-extrabold text-slate-800">
                            {data.length}
                          </p>
                          <p className="text-[11px] font-semibold text-slate-400 uppercase">
                            model
                          </p>
                        </div>
                      </div>

                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                                className="transition-opacity duration-200 hover:opacity-80"
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Legend */}
                    {renderLegend(pieData.slice(0, 10), PIE_COLORS)}
                    {data.length > 10 && (
                      <p className="text-[11px] text-slate-400 mt-1 text-center">
                        +{data.length - 10} model khác
                      </p>
                    )}

                    {/* Summary stats */}
                    {data.length > 0 && (() => {
                      const totalRentals = data.reduce((sum, item) => sum + (parseInt(item.rental_count) || 0), 0);
                      const totalRevenue = data.reduce((sum, item) => sum + (parseFloat(item.total_revenue) || 0), 0);
                      return (
                        <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Tổng lượt thuê
                            </span>
                            <span className="text-sm font-bold text-orange-600">
                              {totalRentals.toLocaleString('vi-VN')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Tổng tiền
                            </span>
                            <span className="text-sm font-bold text-emerald-600">
                              {formatPrice(totalRevenue)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EquipmentRankingModal;
