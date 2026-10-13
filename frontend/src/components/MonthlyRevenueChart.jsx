import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { getMonthlyRevenue } from '../api/client';

const formatShort = (value) => {
  const v = Number(value || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1).replace(/\.0$/, '')} tỷ`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')} tr`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(v);
};

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-bold text-gray-800">{row.label}</p>
      <p className="mt-1 text-indigo-600 font-semibold">{Math.round(row.revenue).toLocaleString('vi-VN')}đ</p>
      <p className="text-gray-400">{row.orders} đơn hoàn tất</p>
    </div>
  );
};

const MonthlyRevenueChart = () => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(currentYear);
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMonthlyRevenue(year)
      .then((res) => { if (!cancelled) setMonths(res.data?.months || []); })
      .catch((err) => { console.error('Failed to load monthly revenue:', err); if (!cancelled) setMonths([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const data = useMemo(() => months.map((m) => ({ ...m, label: `Tháng ${m.month}`, short: `T${m.month}` })), [months]);
  const yearTotal = data.reduce((s, m) => s + m.revenue, 0);

  return (
    <div className="mb-8 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-50 bg-gray-50/30 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <BarChart3 size={20} className="text-indigo-500" />
            Doanh Số Theo Tháng
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Tổng năm {year}: <span className="font-semibold text-gray-600">{Math.round(yearTotal).toLocaleString('vi-VN')}đ</span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          <button
            type="button"
            id="monthly-chart-prev-year"
            onClick={() => setYear((y) => y - 1)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Năm trước"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[56px] text-center text-sm font-bold text-gray-700">{year}</span>
          <button
            type="button"
            id="monthly-chart-next-year"
            onClick={() => setYear((y) => Math.min(y + 1, currentYear))}
            disabled={year >= currentYear}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Năm sau"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="p-3 md:p-5">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400">Đang tải biểu đồ...</div>
        ) : (
          <div className="h-64 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="short" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={36}>
                  {data.map((m) => (
                    <Cell
                      key={m.month}
                      fill={year === currentYear && m.month === currentMonth ? '#6366f1' : '#a5b4fc'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonthlyRevenueChart;
