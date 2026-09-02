import React, { useState, useEffect } from 'react';
import { getDashboardMetrics, getActivityLogs, getRentals } from '../../api/client';
import {
  TrendingUp, DollarSign, Package, Users, Calendar,
  Activity, ArrowUpRight, ArrowDownRight, CheckCircle2,
  Clock, Camera
} from 'lucide-react';

/* ── Helpers ─────────────────────────────────────────────────────── */
const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + ' ₫';
const fmtNum = (n) => Number(n || 0).toLocaleString('vi-VN');
const fmtTime = (str) => {
  const d = new Date(str);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ACTION_STYLE = {
  CREATE: { dot: 'bg-emerald-400', text: 'text-emerald-600', label: 'Thêm mới' },
  UPDATE: { dot: 'bg-blue-400', text: 'text-blue-600', label: 'Cập nhật' },
  DELETE: { dot: 'bg-red-400', text: 'text-red-500', label: 'Xóa' },
};

const STATUS_VN = { active: 'Đang thuê', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
const STATUS_CLS = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
};

/* ── Stat Card ───────────────────────────────────────────────────── */
const StatCard = ({ icon: Icon, label, value, sub, accent, trend }) => (
  <div className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg ${accent}`}>
    {/* Background decoration */}
    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
    <div className="absolute -right-2 -bottom-6 h-32 w-32 rounded-full bg-white/10" />

    <div className="relative z-10 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-white/80">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="mt-1 text-xs text-white/70">{sub}</p>}
      </div>
      <div className="rounded-xl bg-white/20 p-2.5">
        <Icon size={22} />
      </div>
    </div>

    {trend != null && (
      <div className="relative z-10 mt-4 flex items-center gap-1 text-xs font-medium text-white/90">
        {trend >= 0
          ? <ArrowUpRight size={14} />
          : <ArrowDownRight size={14} />}
        <span>{Math.abs(trend)}% so với tháng trước</span>
      </div>
    )}
  </div>
);

/* ── Main Dashboard ──────────────────────────────────────────────── */
const Dashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [metricsRes, logsRes, rentalsRes] = await Promise.all([
        getDashboardMetrics(),
        getActivityLogs(1, 8),
        getRentals(1, 5),
      ]);
      setMetrics(metricsRes.data);
      setLogs(logsRes.data.data);
      setRentals(rentalsRes.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Chào buổi sáng ☀️';
    if (h < 18) return 'Chào buổi chiều 🌤️';
    return 'Chào buổi tối 🌙';
  };

  const padTime = (n) => String(n).padStart(2, '0');
  const timeStr = `${padTime(now.getHours())}:${padTime(now.getMinutes())}:${padTime(now.getSeconds())}`;
  const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 min-h-screen">
        <div className="text-center">
          <Camera size={48} className="mx-auto text-orange-400 animate-bounce mb-4" />
          <p className="text-gray-500 text-lg">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 h-screen overflow-hidden flex flex-col">
      {/* ── Hero banner (Compact) ──────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-orange-900 px-6 py-4 text-white shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-orange-500/20 p-2 rounded-xl border border-orange-500/30">
              <Camera size={24} className="text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">
                SnapPro<span className="text-orange-400"> Dashboard</span>
              </h1>
              <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-semibold">{dateStr}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-2xl font-mono font-semibold text-orange-300 tabular-nums leading-none">
                {timeStr}
              </p>
              <p className="text-gray-500 text-[10px] mt-1 uppercase">Thời gian thực</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-4">
        {/* ── Top Stat Grid (6 items in one row) ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
          <StatCard
            icon={DollarSign}
            label="Doanh Thu"
            value={fmtVND(metrics?.monthly_revenue)}
            accent="bg-gradient-to-br from-orange-500 to-amber-500"
          />
          <StatCard
            icon={TrendingUp}
            label="Lợi Nhuận"
            value={fmtVND(metrics?.profit)}
            accent="bg-gradient-to-br from-emerald-500 to-teal-600"
          />
          <StatCard
            icon={CheckCircle2}
            label="Đơn Hoàn Thành"
            value={fmtNum(metrics?.completed_rentals)}
            accent="bg-gradient-to-br from-blue-500 to-indigo-600"
          />
          <StatCard
            icon={ArrowDownRight}
            label="Chi Phí Tháng"
            value={fmtVND(metrics?.expenses)}
            sub={`Lương: ${fmtVND(metrics?.payroll_cost)}`}
            accent="bg-gradient-to-br from-rose-500 to-red-600"
          />
          <StatCard
            icon={TrendingUp}
            label="Biên Lợi Nhuận"
            value={`${metrics?.profit_percentage ?? 0}%`}
            accent="bg-gradient-to-br from-orange-600 to-red-500"
          />
          <StatCard
            icon={Users}
            label="Khách Hàng"
            value={fmtNum(metrics?.total_customers)}
            accent="bg-gradient-to-br from-purple-500 to-violet-600"
          />
        </div>

        {/* ── Main Content Area ──────────────────── */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
          {/* Recent rentals — 2/3 width */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 bg-gray-50/30">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-800">Đơn Thuê Gần Đây</h2>
              </div>
              <a href="/rentals" className="text-[10px] text-primary hover:underline font-semibold uppercase">Tất cả</a>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {rentals.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300">
                  <Calendar size={32} className="mb-2 opacity-20" />
                  <p className="text-xs">Chưa có đơn thuê</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {rentals.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                      <div className="bg-orange-50 p-2 rounded-lg shrink-0">
                        <Camera size={14} className="text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.customer_name}</p>
                        <p className="text-xs text-gray-400 truncate">{r.equipment_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900">{fmtVND(r.total_price)}</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${STATUS_CLS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_VN[r.status] ?? r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Activity feed — 1/3 width */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50 bg-gray-50/30">
              <Activity size={14} className="text-orange-500" />
              <h2 className="text-sm font-semibold text-gray-800">Hoạt Động</h2>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300">
                  <Activity size={32} className="mb-2 opacity-20" />
                  <p className="text-xs">Chưa có hoạt động</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {logs.map((log) => {
                    const s = ACTION_STYLE[log.action] ?? ACTION_STYLE.UPDATE;
                    return (
                      <div key={log.id} className="flex gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className="mt-1 shrink-0">
                          <span className={`block h-2 w-2 rounded-full ${s.dot}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 leading-normal line-clamp-3 font-medium">{log.description}</p>
                          <p className="text-[11px] text-gray-400 mt-1">{fmtTime(log.inserted_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/30">
              <a href="/activity" className="text-xs text-primary hover:underline font-semibold uppercase">Xem nhật ký →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
