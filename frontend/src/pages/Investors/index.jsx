import React, { useState, useEffect, useRef } from 'react';
import { getInvestorRevenue, getMiscCosts } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PieChart, TrendingUp, ChevronDown, ChevronUp, ShoppingBag, DollarSign, Wallet, RefreshCw, Layers } from 'lucide-react';
import DateRangePicker, { getVNToday } from '../../components/DateRangePicker';

const RENTAL_STATUS_MAP = {
  pending: { label: 'Chờ giao', dot: 'bg-amber-400', text: 'text-amber-600' },
  active: { label: 'Đang thuê', dot: 'bg-blue-500', text: 'text-blue-600' },
  completed: { label: 'Hoàn thành', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  cancelled: { label: 'Đã hủy', dot: 'bg-rose-500', text: 'text-rose-600' },
};

const formatVND = (value) => `${Math.round(parseFloat(value || 0)).toLocaleString('vi-VN')}đ`;

const getRentalStatus = (status) => RENTAL_STATUS_MAP[status] || {
  label: status || 'N/A',
  dot: 'bg-slate-400',
  text: 'text-slate-500'
};

const InvestorsPage = () => {
  const { user, isAdmin, hasRole } = useAuth();
  const isInvestor = hasRole ? (hasRole('investor') && !isAdmin && !hasRole('camera_manager')) : ((user?.roles?.includes('investor') || user?.role === 'investor') && !isAdmin && !(user?.roles?.includes('camera_manager') || user?.role === 'camera_manager'));

  const [investorRevenue, setInvestorRevenue] = useState([]);
  const [miscCosts, setMiscCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedInvestors, setExpandedInvestors] = useState([]);
  const [expandedCostCells, setExpandedCostCells] = useState({});
  const investorGroupKeyRef = useRef('');

  // Date filter - default: current month
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const toISO = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    return { start: toISO(firstDay), end: toISO(lastDay) };
  });

  const toggleInvestor = (id) => {
    setExpandedInvestors(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleCostCell = (key) => {
    setExpandedCostCells(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = async (start, end, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [investorRes, miscRes] = await Promise.all([
        getInvestorRevenue(start, end).catch(err => {
          console.error('getInvestorRevenue error:', err);
          return { data: [] };
        }),
        getMiscCosts({ startDate: start, endDate: end }).catch(() => ({ data: { misc_costs: [] } }))
      ]);

      let data = investorRes?.data || [];
      // If investor role, filter only self if needed, or backend already scopes it
      if (isInvestor && user?.id) {
        data = data.filter(inv => inv.id === user.id);
      }

      setInvestorRevenue(data);
      setMiscCosts(miscRes?.data?.misc_costs || miscRes?.data || []);
    } catch (err) {
      console.error('Error loading investor report:', err);
      setInvestorRevenue([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(dateRange.start, dateRange.end);
  }, [dateRange]);

  const investorOrderRows = investorRevenue.flatMap(investor =>
    (investor.orders || []).map(order => ({
      ...order,
      investor_id: investor.id,
      investor_name: investor.full_name,
      investor_username: investor.username,
      investor_net_amount: investor.net_amount
    }))
  );

  const totalInvestorOrderValue = investorOrderRows.reduce((sum, order) => sum + parseFloat(order.total_order_value || 0), 0);
  const totalInvestorRevenue = investorOrderRows.reduce((sum, order) => sum + parseFloat(order.total_revenue || 0), 0);
  
  const investorGroupRows = investorRevenue.map(investor => ({
    ...investor,
    orders: (investor.orders || []).sort((a, b) => {
      const aTime = new Date(a.returned_at || a.inserted_at || 0).getTime();
      const bTime = new Date(b.returned_at || b.inserted_at || 0).getTime();
      return bTime - aTime;
    })
  }));

  const totalInvestorAdsCost = investorGroupRows.reduce((sum, investor) => sum + parseFloat(investor.ads_cost || 0), 0);
  const totalInvestorCommission = investorGroupRows.reduce((sum, investor) => sum + parseFloat(investor.commission_amount || 0), 0);
  const totalInvestorDriverCommission = investorGroupRows.reduce((sum, investor) => sum + parseFloat(investor.driver_commission_amount || 0), 0);
  
  const totalInvestorMiscCost = miscCosts.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
  const totalOverallCost = totalInvestorCommission + totalInvestorDriverCommission + totalInvestorAdsCost;
  const totalOverallNet = totalInvestorRevenue - totalOverallCost;

  const investorGroupKey = investorGroupRows.map(investor => investor.id).join('|');

  const getInvestorOrdersSplit = (investor) => {
    const orders = investor.orders || [];
    const inMonth = orders.filter(o => {
      if (!o.inserted_at) return false;
      const d = o.inserted_at.slice(0, 10);
      return d >= dateRange.start && d <= dateRange.end;
    });
    const beforeMonth = orders.filter(o => {
      if (!o.inserted_at) return false;
      return o.inserted_at.slice(0, 10) < dateRange.start;
    });
    const cancelled = orders.filter(o => o.status === 'cancelled');
    return { inMonth: inMonth.length, beforeMonth: beforeMonth.length, cancelled: cancelled.length, total: orders.length };
  };

  const totalInvestorOrdersInMonth = investorGroupRows.reduce((sum, inv) => sum + getInvestorOrdersSplit(inv).inMonth, 0);
  const totalInvestorOrdersBeforeMonth = investorGroupRows.reduce((sum, inv) => sum + getInvestorOrdersSplit(inv).beforeMonth, 0);
  const totalInvestorCancelledOrders = investorGroupRows.reduce((sum, inv) => sum + getInvestorOrdersSplit(inv).cancelled, 0);

  useEffect(() => {
    if (!investorGroupKey) {
      if (!investorGroupKeyRef.current) return;
      investorGroupKeyRef.current = '';
      setExpandedInvestors([]);
      return;
    }
    if (investorGroupKeyRef.current === investorGroupKey) return;

    investorGroupKeyRef.current = investorGroupKey;
    setExpandedInvestors([]);
  }, [investorGroupKey]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <PieChart size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Báo Cáo Nhà Đầu Tư</h1>
              <p className="text-sm text-gray-500 mt-0.5">Theo dõi doanh thu, chi phí và lợi nhuận ròng của từng nhà đầu tư</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DateRangePicker
            value={dateRange}
            onChange={(newRange) => setDateRange(newRange)}
          />
          <button
            onClick={() => loadData(dateRange.start, dateRange.end, true)}
            disabled={loading || refreshing}
            className="p-2.5 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shrink-0 shadow-sm"
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin text-primary' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tổng Đơn</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <ShoppingBag size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-800 mt-2">{investorOrderRows.length}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500">
            <span className="text-emerald-600 font-semibold">{totalInvestorOrdersInMonth} mới</span>
            {totalInvestorOrdersBeforeMonth > 0 && <span className="text-amber-600">+{totalInvestorOrdersBeforeMonth} cũ</span>}
            {totalInvestorCancelledOrders > 0 && <span className="text-rose-500">+{totalInvestorCancelledOrders} hủy</span>}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Doanh Số Hợp Đồng</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-800 mt-2 truncate">{formatVND(totalInvestorOrderValue)}</p>
          <p className="text-[11px] text-gray-400 mt-1">Tổng giá trị hợp đồng</p>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 border border-emerald-100 shadow-sm bg-gradient-to-br from-white to-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Thực Thu</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2 truncate">{formatVND(totalInvestorRevenue)}</p>
          <p className="text-[11px] text-emerald-600/80 mt-1">Đã thu về hệ thống</p>
        </div>

        <div className="bg-white rounded-2xl p-4 md:p-5 border border-rose-100 shadow-sm bg-gradient-to-br from-white to-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-500">Tổng Chi Phí</span>
            <div className="p-2 bg-rose-50 text-rose-500 rounded-xl">
              <Wallet size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-500 mt-2 truncate">-{formatVND(totalOverallCost)}</p>
          <p className="text-[11px] text-rose-400 mt-1">Hoa hồng + Giao nhận + Ads</p>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-4 md:p-5 text-white shadow-md shadow-emerald-600/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-100">Lợi Nhuận Còn Lại</span>
            <div className="p-2 bg-white/20 rounded-xl text-white backdrop-blur-sm">
              <Layers size={18} />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-2 truncate">{formatVND(totalOverallNet)}</p>
          <p className="text-[11px] text-emerald-100 mt-1">Lợi nhuận ròng sau chi phí</p>
        </div>
      </div>

      {/* Main Investor List Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
        <div className="p-5 border-b border-emerald-50 bg-emerald-50/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800">Danh Sách Nhà Đầu Tư ({investorGroupRows.length})</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wider">
            <span className="rounded-full bg-white px-3 py-1 text-slate-500 border border-emerald-100 shadow-sm">
              {investorOrderRows.length} đơn
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-slate-500 border border-emerald-100 shadow-sm">
              Doanh số: {formatVND(totalInvestorOrderValue)}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-orange-500 border border-orange-100 shadow-sm">
              Ads: {formatVND(totalInvestorAdsCost)}
            </span>
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-white shadow-sm">
              Đã thu: {formatVND(totalInvestorRevenue)}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-9 h-9 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Đang tải dữ liệu nhà đầu tư...</p>
          </div>
        ) : (
          <div className="divide-y divide-emerald-50 bg-white">
            {investorGroupRows.map(investor => {
              const isExpanded = expandedInvestors.includes(investor.id);
              const investorMiscCost = miscCosts
                .filter(m => investor.orders.some(o => o.branch_id != null && Number(o.branch_id) === Number(m.branch_id)))
                .reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
              const investorMaintenanceCost = parseFloat(investor.maintenance_cost || 0);
              const investorTotalCost = parseFloat(investor.commission_amount || 0) + parseFloat(investor.driver_commission_amount || 0) + parseFloat(investor.ads_cost || 0) + investorMiscCost + investorMaintenanceCost;
              const investorNetAmount = parseFloat(investor.total_revenue || 0) - investorTotalCost;

              return (
                <div key={investor.id}>
                  <button
                    type="button"
                    onClick={() => toggleInvestor(investor.id)}
                    className="w-full p-4 md:p-5 text-left hover:bg-emerald-50/30 transition-colors cursor-pointer"
                  >
                    {/* Mobile layout: card-style metrics */}
                    <div className="lg:hidden space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${investor.id === 0 ? (isExpanded ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-amber-100 text-amber-600') : (isExpanded ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-emerald-100 text-emerald-600')}`}>
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 text-[13px] leading-snug">{investor.full_name}</p>
                          {investor.username ? (
                            <p className="text-[12px] font-semibold text-slate-400">@{investor.username}</p>
                          ) : (
                            <p className="text-[12px] font-semibold text-slate-400 italic">Thiết bị chưa gán chủ sở hữu</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-2xl p-3">
                          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Đơn</p>
                          <p className="text-lg font-black text-slate-800 mt-0.5">
                            {investor.orders.length}
                          </p>
                          {(() => {
                            const split = getInvestorOrdersSplit(investor);
                            if (split.total === 0) return null;
                            return (
                              <div className="flex items-center gap-1 mt-1 text-[10px]">
                                <span className="text-slate-400">{split.inMonth} mới</span>
                                {split.beforeMonth > 0 && (
                                  <span className="text-amber-500"> + {split.beforeMonth} cũ</span>
                                )}
                                {split.cancelled > 0 && (
                                  <span className="text-rose-400"> + {split.cancelled} hủy</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-3">
                          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Doanh số</p>
                          <p className="text-base font-semibold text-slate-700 mt-0.5 truncate">{formatVND(investor.total_order_value)}</p>
                        </div>
                        <div className="bg-emerald-50/70 rounded-2xl p-3">
                          <p className="text-[10px] font-bold uppercase text-emerald-500 tracking-wide">Đã thu</p>
                          <p className="text-base font-semibold text-emerald-600 mt-0.5 truncate">{formatVND(investor.total_revenue)}</p>
                        </div>
                        <div
                          className="bg-rose-50/70 rounded-2xl p-3 cursor-pointer select-none active:scale-[0.98] transition-transform"
                          onClick={(e) => { e.stopPropagation(); toggleCostCell(`investor_${investor.id}`); }}
                        >
                          <div className="flex items-center gap-1">
                            <p className="text-[10px] font-bold uppercase text-rose-400 tracking-wide">Chi phí</p>
                            {expandedCostCells[`investor_${investor.id}`] ? <ChevronUp size={12} className="text-rose-400" /> : <ChevronDown size={12} className="text-rose-400" />}
                          </div>
                          <p className="text-base font-semibold text-rose-500 mt-0.5 truncate">-{formatVND(investorTotalCost)}</p>
                          {expandedCostCells[`investor_${investor.id}`] && (
                            <div className="mt-2.5 pt-2.5 border-t border-rose-100 space-y-1.5">
                              <p className="text-[12px] text-slate-500 font-medium flex justify-between"><span>Hoa hồng</span> <span className="text-rose-500 font-semibold">-{formatVND(investor.commission_amount)}</span></p>
                              <p className="text-[12px] text-slate-500 font-medium flex justify-between"><span>Giao nhận</span> <span className="text-rose-500 font-semibold">-{formatVND(investor.driver_commission_amount)}</span></p>
                              <p className="text-[12px] text-slate-500 font-medium flex justify-between"><span>Ads</span> <span className="text-rose-500 font-semibold">-{formatVND(investor.ads_cost)}</span></p>
                              <p className="text-[12px] text-slate-500 font-medium flex justify-between"><span>Phát sinh</span> <span className="text-rose-500 font-semibold">-{formatVND(investorMiscCost)}</span></p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={`rounded-2xl p-3 flex items-center justify-between ${investorNetAmount >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                        <p className={`text-[11px] font-bold uppercase tracking-wider ${investorNetAmount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>Còn lại</p>
                        <p className={`text-base font-semibold ${investorNetAmount >= 0 ? 'text-emerald-700' : 'text-rose-500'}`}>{formatVND(investorNetAmount)}</p>
                      </div>
                    </div>

                    {/* Desktop layout: inline grid */}
                    <div className="hidden lg:flex lg:items-center lg:justify-between w-full">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${investor.id === 0 ? (isExpanded ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600') : (isExpanded ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600')}`}>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 text-[13px] truncate">{investor.full_name}</p>
                          {investor.username ? (
                            <p className="text-[11px] font-semibold text-slate-400">@{investor.username}</p>
                          ) : (
                            <p className="text-[11px] font-semibold text-slate-400 italic">Thiết bị chưa gán chủ sở hữu</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-x-2 gap-y-2.5 xl:min-w-[800px]">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400 truncate">Đơn</p>
                          <p className="text-[15px] font-black text-slate-800">
                            {investor.orders.length}
                          </p>
                          {(() => {
                            const split = getInvestorOrdersSplit(investor);
                            if (split.total === 0) return null;
                            return (
                              <div className="flex items-center gap-1 mt-0.5 text-[10px]">
                                <span className="text-slate-400">{split.inMonth} mới</span>
                                {split.beforeMonth > 0 && (
                                  <span className="text-amber-500"> + {split.beforeMonth} cũ</span>
                                )}
                                {split.cancelled > 0 && (
                                  <span className="text-rose-400"> + {split.cancelled} hủy</span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400 truncate">Doanh số</p>
                          <p className="text-[13px] font-semibold text-slate-700">{formatVND(investor.total_order_value)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400 truncate">Đã thu</p>
                          <p className="text-[13px] font-semibold text-emerald-600">{formatVND(investor.total_revenue)}</p>
                        </div>
                        <div
                          className="min-w-0 cursor-pointer select-none"
                          onClick={(e) => { e.stopPropagation(); toggleCostCell(`investor_${investor.id}`); }}
                          title="Nhấn để xem chi tiết chi phí"
                        >
                          <div className="inline-flex items-center gap-1">
                            <p className="text-[9px] font-bold uppercase text-slate-400 truncate">Chi phí</p>
                            {expandedCostCells[`investor_${investor.id}`] ? <ChevronUp size={10} className="text-slate-400" /> : <ChevronDown size={10} className="text-slate-400" />}
                          </div>
                          <p className="text-[13px] font-semibold text-rose-500">
                            -{formatVND(investorTotalCost)}
                          </p>
                          {expandedCostCells[`investor_${investor.id}`] && (
                            <div className="text-[11px] text-slate-400 font-medium mt-0.5 space-y-0.5">
                              <p>Hoa hồng: -{formatVND(investor.commission_amount)}</p>
                              <p>Giao nhận: -{formatVND(investor.driver_commission_amount)}</p>
                              <p>Ads: -{formatVND(investor.ads_cost)}</p>
                              <p>Phát sinh: -{formatVND(investorMiscCost)}</p>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400 truncate">Còn lại</p>
                          <p className={`text-[13px] font-semibold ${investorNetAmount >= 0 ? 'text-emerald-700' : 'text-rose-500'}`}>{formatVND(investorNetAmount)}</p>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-emerald-50 bg-emerald-50/20">
                      <div className="hidden lg:block overflow-x-auto scrollbar-hide max-h-[340px] overflow-y-auto custom-scrollbar">
                        <table className="w-full min-w-[1080px] border-separate border-spacing-0">
                          <thead className="sticky top-0 z-10">
                            <tr className="text-left text-slate-400 bg-emerald-50/95 backdrop-blur-sm">
                              <th className="py-3 pl-6 pr-4 text-[10px] font-bold uppercase border-b border-emerald-50">Đơn</th>
                              <th className="py-3 px-4 text-[10px] font-bold uppercase border-b border-emerald-50">Cơ sở</th>
                              <th className="py-3 px-4 text-[10px] font-bold uppercase border-b border-emerald-50">Nhân viên</th>
                              <th className="py-3 px-4 text-[10px] font-bold uppercase border-b border-emerald-50">Thiết bị</th>
                              <th className="py-3 px-4 text-right text-[10px] font-bold uppercase border-b border-emerald-50">Doanh số</th>
                              <th className="py-3 px-6 text-right text-[10px] font-bold uppercase border-b border-emerald-50">Đã thu</th>
                              <th className="py-3 px-4 text-right text-[10px] font-bold uppercase border-b border-emerald-50">Chi phí</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50 bg-white">
                            {investor.orders.map(order => {
                              const statusInfo = getRentalStatus(order.status);

                              return (
                              <tr key={`${investor.id}-${order.id}`} className="hover:bg-emerald-50/30 transition-colors">
                                <td className="py-4 pl-6 pr-4 border-b border-emerald-50">
                                  <p className="text-[13px] font-bold text-slate-800">{order.code}</p>
                                  <p className={`mt-1 flex items-center gap-1.5 text-[10px] font-semibold ${statusInfo.text}`}>
                                    <span className={`h-2 w-2 rounded-full ${statusInfo.dot}`} />
                                    <span>{statusInfo.label}</span>
                                  </p>
                                </td>
                                <td className="py-4 px-4 text-[12px] font-semibold text-slate-600 border-b border-emerald-50">{order.branch_name}</td>
                                <td className="py-4 px-4 border-b border-emerald-50">
                                  <p className="text-[12px] font-bold text-slate-700">{order.employee_name || 'N/A'}</p>
                                  {order.manager_name && order.manager_id !== order.employee_id && (
                                    <p className="text-[10px] text-slate-400">Phụ trách: {order.manager_name}</p>
                                  )}
                                </td>
                                <td className="py-4 px-4 border-b border-emerald-50">
                                  <p className="text-[12px] font-semibold text-slate-700">{order.equipment_name}</p>
                                  <p className="text-[10px] text-slate-400">{order.customer_name || 'Không có khách'}</p>
                                </td>
                                <td className="py-4 px-4 text-right text-[12px] font-bold text-slate-500 border-b border-emerald-50">{formatVND(order.total_order_value)}</td>
                                <td className="py-4 px-6 text-right text-[13px] font-black text-emerald-600 border-b border-emerald-50">{formatVND(order.total_revenue)}</td>
                                <td
                                  className="py-4 px-4 text-right border-b border-emerald-50 cursor-pointer select-none hover:bg-emerald-50/50 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); toggleCostCell(`inv_order_${investor.id}_${order.id}`); }}
                                  title="Nhấn để xem chi tiết chi phí"
                                >
                                  <div className="inline-flex items-center gap-1 justify-end">
                                    <p className="text-[13px] font-bold text-rose-500">
                                      -{formatVND(parseFloat(order.commission_amount || 0) + parseFloat(order.driver_commission_amount || 0))}
                                    </p>
                                    {expandedCostCells[`inv_order_${investor.id}_${order.id}`] ? <ChevronUp size={10} className="text-slate-400" /> : <ChevronDown size={10} className="text-slate-400" />}
                                  </div>
                                  {expandedCostCells[`inv_order_${investor.id}_${order.id}`] && (
                                    <div className="text-[11px] text-slate-400 font-medium mt-0.5 space-y-0.5">
                                      <p>Hoa hồng: -{formatVND(order.commission_amount)}</p>
                                      <p>Giao nhận: -{formatVND(order.driver_commission_amount)}</p>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="lg:hidden p-3 space-y-2.5 max-h-[700px] overflow-y-auto custom-scrollbar">
                        {investor.orders.map(order => {
                          const statusInfo = getRentalStatus(order.status);
                          const orderCost = parseFloat(order.commission_amount || 0) + parseFloat(order.driver_commission_amount || 0);

                          return (
                          <div key={`${investor.id}-${order.id}`} className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
                            <div className="flex items-start justify-between gap-3 p-3 pb-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-[14px] font-extrabold text-slate-800">{order.code}</p>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusInfo.text} bg-white border`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                                    {statusInfo.label}
                                  </span>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{order.branch_name}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wide">Đã thu</p>
                                <p className="text-[15px] font-extrabold text-emerald-600">{formatVND(order.total_revenue)}</p>
                              </div>
                            </div>

                            <div className="mx-3 border-t border-slate-50" />

                            <div className="p-3 pt-2 grid grid-cols-2 gap-x-3 gap-y-2.5">
                              <div>
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Nhân viên</p>
                                <p className="text-[12px] font-semibold text-slate-700 mt-0.5">{order.employee_name || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Thiết bị</p>
                                <p className="text-[12px] font-semibold text-slate-700 mt-0.5 truncate">{order.equipment_name}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Doanh số</p>
                                <p className="text-[12px] font-bold text-slate-600 mt-0.5">{formatVND(order.total_order_value)}</p>
                              </div>
                              {order.customer_name && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Khách</p>
                                  <p className="text-[12px] font-semibold text-slate-500 mt-0.5 truncate">{order.customer_name}</p>
                                </div>
                              )}
                            </div>

                            <div
                              className="mx-3 mb-3 rounded-xl bg-rose-50/60 p-2.5 cursor-pointer select-none active:scale-[0.98] transition-transform"
                              onClick={(e) => { e.stopPropagation(); toggleCostCell(`m_inv_order_${investor.id}_${order.id}`); }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold uppercase text-rose-400 tracking-wide">Chi phí</span>
                                  {expandedCostCells[`m_inv_order_${investor.id}_${order.id}`] ? <ChevronUp size={12} className="text-rose-400" /> : <ChevronDown size={12} className="text-rose-400" />}
                                </div>
                                <p className="text-[13px] font-extrabold text-rose-500">-{formatVND(orderCost)}</p>
                              </div>
                              {expandedCostCells[`m_inv_order_${investor.id}_${order.id}`] && (
                                <div className="mt-2 pt-2 border-t border-rose-100 flex justify-between text-[11px]">
                                  <span className="text-slate-500 font-medium">Hoa hồng: <span className="text-rose-500 font-semibold">-{formatVND(order.commission_amount)}</span></span>
                                  <span className="text-slate-500 font-medium">Giao nhận: <span className="text-rose-500 font-semibold">-{formatVND(order.driver_commission_amount)}</span></span>
                                </div>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {investorGroupRows.length === 0 && (
              <div className="p-12 text-center text-sm font-semibold text-slate-400">
                Chưa có đơn nào thuộc nhà đầu tư trong khoảng thời gian này.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestorsPage;
