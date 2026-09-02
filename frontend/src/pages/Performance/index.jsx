import React, { useState, useEffect } from 'react';
import { getPerformanceMetrics, getRevenueByBranch, getAdsCosts, getMiscCosts } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { TrendingUp, Award, ShoppingBag, CheckCircle, Clock, Users, ChevronRight, Star, Store, ChevronDown, ChevronUp, HelpCircle, Megaphone, Calculator, PieChart, Receipt } from 'lucide-react';
import DateRangePicker, { getVNToday } from '../../components/DateRangePicker';

const RENTAL_STATUS_MAP = {
  pending: { label: 'Chờ giao', dot: 'bg-amber-400', text: 'text-amber-600' },
  active: { label: 'Đang thuê', dot: 'bg-blue-500', text: 'text-blue-600' },
  completed: { label: 'Hoàn thành', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  cancelled: { label: 'Đã hủy', dot: 'bg-rose-500', text: 'text-rose-600' },
};

const PAGE_SIZE = 5;

const Performance = () => {
  const { user, isAdmin, hasRole } = useAuth();
  const isInvestor = hasRole ? (hasRole('investor') && !isAdmin && !hasRole('camera_manager')) : ((user?.roles?.includes('investor') || user?.role === 'investor') && !isAdmin && !(user?.roles?.includes('camera_manager') || user?.role === 'camera_manager'));
  const isManager = hasRole ? (hasRole('manager') || hasRole('camera_manager') || hasRole('investor')) : (user?.roles?.includes('manager') || user?.roles?.includes('camera_manager') || user?.roles?.includes('investor') || user?.role === 'manager' || user?.role === 'camera_manager' || user?.role === 'investor');
  const isSalerOnly = hasRole ? (hasRole('saler') && !isAdmin && !isManager) : ((user?.roles?.includes('saler') || user?.role === 'saler') && !isAdmin && !isManager);
  const canViewBranchProfit = isAdmin || isInvestor;

  const [metrics, setMetrics] = useState([]);
  const [branchRevenue, setBranchRevenue] = useState([]);
  const [adsCosts, setAdsCosts] = useState([]);
  const [miscCosts, setMiscCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [expandedBranches, setExpandedBranches] = useState([]);
  const [expandedEmployees, setExpandedEmployees] = useState([]);
  const [expandedEmpOrders, setExpandedEmpOrders] = useState([]);
  const [showStatsOnMobile, setShowStatsOnMobile] = useState(true);
  const [showAllEmployees, setShowAllEmployees] = useState({});
  const [expandedCostCells, setExpandedCostCells] = useState({});
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // Date filter - default: current month
  const todayISO = getVNToday();
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

  const toggleBranch = (id) => {
    setExpandedBranches(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleEmployee = (name) => {
    setExpandedEmployees(prev =>
      prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]
    );
  };

  const toggleEmpOrders = (empId, branchId) => {
    const key = `${empId}_${branchId}`;
    setExpandedEmpOrders(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleShowAllEmployees = (branchId) => {
    setShowAllEmployees(prev => ({ ...prev, [branchId]: !prev[branchId] }));
  };

  const toggleCostCell = (key) => {
    setExpandedCostCells(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = async (start, end, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const promises = [
        getPerformanceMetrics(start, end),
        getRevenueByBranch(start, end)
      ];

      if (isAdmin || isInvestor) {
        promises.push(getAdsCosts({ startDate: start, endDate: end }));
        promises.push(getMiscCosts({ startDate: start, endDate: end }));
      }

      const results = await Promise.all(promises);

      setMetrics(results[0].data);
      setBranchRevenue(results[1].data);

      if (isAdmin || isInvestor) {
        setAdsCosts(results[2]?.data?.ads_costs || []);
        setMiscCosts(results[3]?.data?.misc_costs || []);
      } else {
        setAdsCosts([]);
        setMiscCosts([]);
      }
    } catch (err) {
      console.error('Failed to load performance metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(dateRange.start, dateRange.end);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!loading) {
      loadData(dateRange.start, dateRange.end);
    }
  }, [dateRange]); // eslint-disable-line

  // Reset mobile pagination when metrics data changes
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [metrics]);

  const currentUserMetrics = metrics.find(m => user && m.username === user.username);
  const userCommission = currentUserMetrics ? parseFloat(currentUserMetrics.commission_amount || 0) : 0;

  const totalRevenue = metrics.reduce((sum, m) => sum + parseFloat(m.total_revenue), 0);
  const hasMoreMetrics = displayCount < metrics.length;
  const assignedBranchIds = user?.branch_ids || [];
  const filteredBranchRevenue = (isAdmin || isInvestor) ? branchRevenue : branchRevenue.filter(b => assignedBranchIds.includes(b.id));
  const hasBranchRevenueValue = (branch) => {
    const branchAdsCost = parseFloat(branch.ads_cost || 0);
    const branchOperatingCost = parseFloat(branch.total_commissions || 0);
    const branchRevenue = parseFloat(branch.total_revenue || 0);
    const branchProfit = branchRevenue - branchOperatingCost - branchAdsCost;

    return [
      parseInt(branch.total_orders || 0),
      parseInt(branch.cancelled_orders || 0),
      parseFloat(branch.total_order_value || 0),
      branchRevenue,
      branchOperatingCost,
      branchAdsCost,
      branchProfit
    ].some(value => value !== 0);
  };
  const hasEmployeeData = (emp) => {
    return [
      parseInt(emp.total_saler_orders || 0),
      parseInt(emp.total_completed_orders || 0),
      parseFloat(emp.total_saler_order_value || 0),
      parseFloat(emp.total_completed_order_value || 0),
      parseFloat(emp.total_saler_revenue || 0),
      parseFloat(emp.total_revenue || 0),
      parseFloat(emp.commission_amount || 0),
      parseFloat(emp.commission_amount_new || 0),
      parseFloat(emp.driver_commission_cost || 0),
      parseFloat(emp.driver_commission_cost_new || 0),
      parseFloat(emp.upline_commission_cost || 0),
      parseFloat(emp.upline_commission_cost_new || 0),
      parseFloat(emp.profit || 0),
      parseInt(emp.total_orders || 0),
    ].some(v => v !== 0);
  };
  const visibleBranchRevenue = filteredBranchRevenue.filter(b => !b.is_hidden);
  const branchRevenueTotal = filteredBranchRevenue.reduce((sum, b) => sum + parseFloat(b.total_revenue || 0), 0);
  const branchOrderValueTotal = filteredBranchRevenue.reduce((sum, b) => sum + parseFloat(b.total_order_value || 0), 0);
  const branchOrdersTotal = filteredBranchRevenue.reduce((sum, b) => sum + parseInt(b.total_orders || 0), 0);
  const branchOrdersFromBeforeTotal = filteredBranchRevenue.reduce((sum, b) => sum + parseInt(b.orders_from_before || 0), 0);
  const branchCancelledOrdersTotal = filteredBranchRevenue.reduce((sum, b) => sum + parseInt(b.cancelled_orders || 0), 0);
  const metricRevenueTotal = currentUserMetrics ? parseFloat(currentUserMetrics.total_revenue || 0) : 0;
  const metricOrderValueTotal = currentUserMetrics ? parseFloat(currentUserMetrics.total_order_value || 0) : 0;
  const metricOrdersTotal = currentUserMetrics ? parseInt(currentUserMetrics.total_orders || 0) : 0;

  const totalBranchRevenue = isInvestor
    ? (branchRevenueTotal || metricRevenueTotal)
    : (isAdmin || isManager || isSalerOnly)
      ? branchRevenueTotal
    : (currentUserMetrics ? parseFloat(currentUserMetrics.total_revenue || 0) : 0);

  const totalBranchOrderValue = isInvestor
    ? (branchOrderValueTotal || metricOrderValueTotal)
    : (isAdmin || isManager || isSalerOnly)
      ? branchOrderValueTotal
    : (currentUserMetrics ? parseFloat(currentUserMetrics.total_order_value || 0) : 0);

  const totalSalariesCost = filteredBranchRevenue.reduce((sum, b) => sum + parseFloat(b.branch_salaries || 0), 0);
  const totalCommissions = filteredBranchRevenue.reduce((sum, b) => sum + parseFloat(b.total_commissions || 0), 0);
  const totalMaintenance = filteredBranchRevenue.reduce((sum, b) => sum + parseFloat(b.maintenance_cost || 0), 0);
  const totalAdsCost = adsCosts.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
  const totalMiscCost = miscCosts.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
  const totalAdsAndMiscCost = totalAdsCost + totalMiscCost;
  const totalRevenueForCost = isAdmin ? branchRevenueTotal : totalRevenue;
  const totalCost = totalCommissions + totalAdsCost + totalMiscCost;
  const totalProfit = totalRevenueForCost - totalCost;
  const profitMargin = totalRevenueForCost > 0 ? (totalProfit / totalRevenueForCost) * 100 : 0;

  const totalBranchOrders = isInvestor
    ? (branchOrdersTotal || metricOrdersTotal)
    : (isAdmin || isManager || isSalerOnly)
      ? branchOrdersTotal
    : (currentUserMetrics ? parseInt(currentUserMetrics.total_orders || 0) : 0);
  const totalSystemOrders = totalBranchOrders + branchOrdersFromBeforeTotal + branchCancelledOrdersTotal;
  const totalOrdersWithOld = totalBranchOrders + branchOrdersFromBeforeTotal;
  const salerMetrics = metrics.filter(m => m.is_saler);
  const topSeller = salerMetrics.length > 0 ? salerMetrics[0] : null;
  const formatVND = (value) => `${Math.round(parseFloat(value || 0)).toLocaleString('vi-VN')}đ`;
  const getRentalStatus = (status) => RENTAL_STATUS_MAP[status] || {
    label: status || 'N/A',
    dot: 'bg-slate-400',
    text: 'text-slate-500'
  };
  const StatCardHeader = ({ icon: Icon, title, titleClassName = 'text-white/90', badge }) => (
    <div className="mb-2.5 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 backdrop-blur-md md:h-8 md:w-8 md:rounded-xl">
          <Icon size={17} />
        </div>
        <p className={`${titleClassName} min-w-0 text-[9px] font-bold uppercase leading-tight tracking-normal md:text-[10px] md:tracking-wider`}>
          {title}
        </p>
      </div>
      {badge}
    </div>
  );

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-3 md:mb-6 relative z-30">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-3">
              <TrendingUp size={32} className="text-primary" />
              Báo Cáo Hiệu Suất
            </h1>
            <p className="text-gray-500 mt-1">Theo dõi doanh số và lợi nhuận theo nhân viên và cơ sở</p>
          </div>
          <div className="relative z-50 flex w-full items-center gap-3 flex-wrap md:w-auto md:flex-nowrap">
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              onChange={({ start, end }) => setDateRange({ start, end })}
              className="w-full sm:w-auto"
              dropdownAlign="right"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Đang tải dữ liệu báo cáo...</div>
        ) : (
          <>
            {/* Top Stats */}
            <button
              type="button"
              onClick={() => setShowStatsOnMobile(prev => !prev)}
              className="mb-3 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-bold text-slate-700 shadow-sm active:scale-[0.99] md:hidden"
            >
              <span>Tổng quan</span>
              {showStatsOnMobile ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            <div className={`${showStatsOnMobile ? 'grid' : 'hidden'} grid-cols-2 gap-3 mb-8 md:grid md:gap-4 xl:grid-cols-4 xl:gap-6`}>
              {/* Doanh Số Tổng */}
              <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-blue-100/50 overflow-hidden relative group border border-white/10">
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <StatCardHeader icon={ShoppingBag} title="Doanh Số Tổng" titleClassName="text-blue-50/90" />
                  <div>
                    <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                      {Math.round(totalBranchOrderValue).toLocaleString('vi-VN')}
                      <span className="text-[10px] ml-1 opacity-70">VND</span>
                    </h2>
                  </div>
                </div>
                <TrendingUp size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
              </div>

              {/* Doanh Thu */}
              <div className="bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-indigo-100/50 overflow-hidden relative group border border-white/10">
                <div className="relative z-10 h-full flex flex-col justify-between">
                  <StatCardHeader icon={CheckCircle} title="Doanh Thu" titleClassName="text-indigo-50/90" />
                  <div>
                    <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                      {Math.round(totalBranchRevenue).toLocaleString('vi-VN')}
                      <span className="text-[10px] ml-1 opacity-70">VND</span>
                    </h2>
                  </div>
                </div>
                <CheckCircle size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
              </div>

              {/* Card 3: Hoa hồng for Saler, Tổng đơn for Admin */}
              {!isAdmin ? (
                <div className="bg-gradient-to-br from-orange-400 via-orange-500 to-amber-600 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-orange-100/50 overflow-hidden relative group border border-white/10">
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <StatCardHeader icon={Calculator} title="Hoa Hồng Của Bạn" titleClassName="text-orange-50/90" />
                    <div>
                      <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                        {Math.round(userCommission).toLocaleString('vi-VN')}
                        <span className="text-[10px] ml-1 opacity-70">VND</span>
                      </h2>
                    </div>
                  </div>
                  <Calculator size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                </div>
              ) : (
                <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-emerald-100/50 overflow-hidden relative group border border-white/10">
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <StatCardHeader icon={ShoppingBag} title="Tổng Đơn" titleClassName="text-emerald-50/90" />
                    <div>
                      <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                        {totalSystemOrders}
                        <span className="text-[10px] ml-1 opacity-70">đơn</span>
                      </h2>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-white/65">
                        <span>{totalBranchOrders} mới</span>
                        {branchOrdersFromBeforeTotal > 0 && (
                          <span> + {branchOrdersFromBeforeTotal} cũ</span>
                        )}
                        {branchCancelledOrdersTotal > 0 && (
                          <span className="text-rose-300"> + {branchCancelledOrdersTotal} hủy</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ShoppingBag size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                </div>
              )}

              {/* Card 4: Tổng đơn for Saler, Top Seller for Admin */}
              {!isAdmin ? (
                <div className="bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-emerald-100/50 overflow-hidden relative group border border-white/10">
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <StatCardHeader icon={ShoppingBag} title="Tổng Đơn" titleClassName="text-emerald-50/90" />
                    <div>
                      <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                        {totalBranchOrders}
                        <span className="text-[10px] ml-1 opacity-70">đơn</span>
                      </h2>
                    </div>
                  </div>
                  <ShoppingBag size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                </div>
              ) : (
                <div className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-amber-100/50 overflow-hidden relative group border border-white/20 transition-all duration-500">
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <StatCardHeader
                      icon={Award}
                      title="Nhân Viên Xuất Sắc"
                      titleClassName="text-amber-50/90"
                      badge={(
                        <div className="shrink-0 bg-white/20 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 border border-white/30">
                          <Star size={8} fill="white" />
                          <span>TOP</span>
                        </div>
                      )}
                    />
                    <div>
                      <h2 className="text-base md:text-xl xl:text-lg font-black mt-1 drop-shadow-md leading-tight break-words">
                        {topSeller ? topSeller.full_name : 'N/A'}
                      </h2>
                    </div>
                  </div>
                  <Star size={100} className="absolute -right-4 -bottom-4 text-white/10 group-hover:rotate-12 transition-transform duration-1000" />
                </div>
              )}
              {/* Admin only cards (Row 2) */}
              {isAdmin && (
                <>
                  <div className="bg-gradient-to-br from-pink-500 via-pink-600 to-rose-600 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-pink-100/50 overflow-hidden relative group border border-white/10">
                    <div className="relative z-10 h-full flex flex-col justify-between">
                      <StatCardHeader icon={Megaphone} title="Chi Phí Ads & Phát Sinh" titleClassName="text-pink-50/90" />
                      <div>
                        <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                          {Math.round(totalAdsAndMiscCost).toLocaleString('vi-VN')}
                          <span className="text-[10px] ml-1 opacity-70">VND</span>
                        </h2>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold">
                            <Megaphone size={10} className="opacity-50" />
                            {Math.round(totalAdsCost).toLocaleString('vi-VN')}đ
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold">
                            <Receipt size={10} className="opacity-50" />
                            {Math.round(totalMiscCost).toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      </div>
                    </div>
                    <Megaphone size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                  </div>

                  <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-red-500 rounded-3xl p-3 md:p-4 text-white shadow-xl shadow-orange-100/50 overflow-hidden relative group border border-white/10">
                    <div className="relative z-10 h-full flex flex-col justify-between">
                      <StatCardHeader icon={Calculator} title="Tổng Chi Phí" titleClassName="text-orange-50/90" />
                      <div>
                        <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                          {Math.round(totalCost).toLocaleString('vi-VN')}
                          <span className="text-[10px] ml-1 opacity-70">VND</span>
                        </h2>
                      </div>
                    </div>
                    <Calculator size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                  </div>

                  <div className={`bg-gradient-to-br ${totalProfit >= 0 ? 'from-violet-500 via-violet-600 to-fuchsia-600 shadow-violet-100/50' : 'from-rose-500 via-rose-600 to-red-700 shadow-rose-100/50'} rounded-3xl p-3 md:p-4 text-white shadow-xl overflow-hidden relative group border border-white/10`}>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                      <StatCardHeader icon={TrendingUp} title="Lợi Nhuận Ròng" />
                      <div>
                        <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                          {Math.round(totalProfit).toLocaleString('vi-VN')}
                          <span className="text-[10px] ml-1 opacity-70">VND</span>
                        </h2>
                      </div>
                    </div>
                    <Star size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                  </div>

                  <div className={`bg-gradient-to-br ${profitMargin >= 0 ? 'from-cyan-500 via-cyan-600 to-blue-600 shadow-cyan-100/50' : 'from-rose-400 via-rose-500 to-red-600 shadow-rose-100/50'} rounded-3xl p-3 md:p-4 text-white shadow-xl overflow-hidden relative group border border-white/10`}>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                      <StatCardHeader icon={PieChart} title="Tỉ Suất Lợi Nhuận" />
                      <div>
                        <h2 className="text-base md:text-xl xl:text-lg font-bold mt-1">
                          {Math.round(profitMargin).toLocaleString('vi-VN')}
                          <span className="text-[14px] ml-1 opacity-90">%</span>
                        </h2>
                      </div>
                    </div>
                    <PieChart size={80} className="absolute -right-2 -bottom-2 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                  </div>
                </>
              )}
            </div>


            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
              {/* Branch Revenue Section */}
              {(isAdmin || isManager || isSalerOnly) && (
                <div className="xl:col-span-2 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Store size={20} className="text-orange-500" />
                      Doanh Thu Theo Cơ Sở
                    </h3>
                  </div>
                  <div className="p-0 md:p-4">
                    {/* Desktop View: Table */}
                    <div className="hidden xl:block overflow-x-auto scrollbar-hide">
                      <table className="w-full min-w-[680px] 2xl:min-w-[760px] border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-slate-400">
                            <th className="pb-4 pl-4 pr-3 text-[10px] font-semibold uppercase border-b border-gray-50">Cơ Sở</th>
                            <th className="pb-4 text-[10px] font-semibold uppercase text-center border-b border-gray-50">Đơn</th>
                            <th className="pb-4 text-right text-[10px] font-semibold uppercase px-4 border-b border-gray-50">Doanh Số</th>
                            <th className="pb-4 text-right text-[10px] font-semibold uppercase px-4 border-b border-gray-50">Đã Thu</th>
                            {canViewBranchProfit && <th className="pb-4 text-right text-[10px] font-semibold uppercase px-4 border-b border-gray-50">Chi Phí</th>}
                            {canViewBranchProfit && <th className="pb-4 text-right text-[10px] font-semibold uppercase px-4 border-b border-gray-50">Lợi Nhuận</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {visibleBranchRevenue.map((b) => {
                            const branchAdsCost = parseFloat(b.ads_cost || 0);
                            const branchOperatingCost = parseFloat(b.total_commissions || 0);
                            const branchMiscCost = miscCosts
                              .filter(m => Number(m.branch_id) === b.id)
                              .reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
                            const branchTotalCost = branchOperatingCost + branchAdsCost + branchMiscCost;
                            const branchRevenue = parseFloat(b.total_revenue || 0);
                            const branchProfit = branchRevenue - branchTotalCost;
                            const branchProfitPercentage = branchRevenue > 0 ? Math.round((branchProfit / branchRevenue) * 100) : 0;
                            const isExpanded = expandedBranches.includes(b.id);
                            const branchEmployees = b.employees || [];
                            const visibleEmployees = showAllEmployees[b.id] ? branchEmployees : branchEmployees.filter(hasEmployeeData);
                            const zeroDataCount = branchEmployees.filter(emp => !hasEmployeeData(emp)).length;

                            return (
                              <React.Fragment key={b.id}>
                                <tr className="group hover:bg-slate-50/30 transition-all cursor-pointer" onClick={() => toggleBranch(b.id)}>
                                  <td className="py-4 pl-4 pr-3 border-b border-slate-50 relative">
                                    <div className="flex items-center gap-2">
                                      <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                        <ChevronRight size={16} className="text-slate-400 group-hover:text-orange-500" />
                                      </div>
                                      <p className="font-semibold text-slate-800 text-[13px] leading-snug">{b.name}</p>
                                    </div>
                                    {b.id === 1 && <div className="absolute bottom-0 left-0 w-8 h-1 bg-orange-500 rounded-t-full"></div>}
                                  </td>
                                  <td className="py-4 text-center border-b border-slate-50">
                                    <p className="text-sm font-bold text-slate-800">
                                      {parseInt(b.total_orders || 0) + parseInt(b.orders_from_before || 0) + parseInt(b.cancelled_orders || 0)}
                                    </p>
                                    <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px]">
                                      <span className="text-slate-400">{b.total_orders} mới</span>
                                      {parseInt(b.orders_from_before || 0) > 0 && (
                                        <span className="text-amber-500"> + {b.orders_from_before} cũ</span>
                                      )}
                                      {parseInt(b.cancelled_orders || 0) > 0 && (
                                        <span className="text-rose-400"> + {b.cancelled_orders} hủy</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-4 text-right px-4 font-semibold text-slate-400 text-[13px] border-b border-slate-50">{Math.round(parseFloat(b.total_order_value || 0)).toLocaleString('vi-VN')}đ</td>
                                  <td className="py-4 text-right px-4 font-semibold text-slate-700 text-[13px] border-b border-slate-50">{Math.round(parseFloat(b.total_revenue)).toLocaleString('vi-VN')}đ</td>
                                  {canViewBranchProfit && (
                                    <>
                                      <td
                                        className="py-4 text-right px-4 border-b border-slate-50 cursor-pointer select-none hover:bg-slate-50/30 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); toggleCostCell(`branch_${b.id}`); }}
                                        title="Nhấn để xem chi tiết chi phí"
                                      >
                                        <div className="inline-flex items-center gap-1">
                                          <p className="font-semibold text-[12px] text-rose-500">
                                            -{Math.round(branchTotalCost).toLocaleString('vi-VN')}đ
                                          </p>
                                          {expandedCostCells[`branch_${b.id}`] ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                                        </div>
                                        {expandedCostCells[`branch_${b.id}`] && (
                                          <div className="text-[10px] text-slate-400 font-medium mt-0.5 space-y-0.5">
                                            <p>Hoa hồng: -{Math.round(parseFloat(b.total_commissions || 0) - parseFloat(b.driver_commissions || 0)).toLocaleString('vi-VN')}đ</p>
                                            <p>Giao nhận: -{Math.round(parseFloat(b.driver_commissions || 0)).toLocaleString('vi-VN')}đ</p>
                                            <p>Ads: -{Math.round(branchAdsCost).toLocaleString('vi-VN')}đ</p>
                                            <p>Phát sinh: -{Math.round(branchMiscCost).toLocaleString('vi-VN')}đ</p>
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-4 text-right px-4 border-b border-slate-50">
                                        <p className={`font-semibold text-[12px] ${branchProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>
                                          {Math.round(branchProfit).toLocaleString('vi-VN')}đ
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-normal uppercase tracking-tighter">
                                          {branchProfitPercentage}% biên lợi nhuận
                                        </p>
                                      </td>
                                    </>
                                  )}
                                </tr>
                                {isExpanded && branchEmployees.length > 0 && (
                                  <tr>
                                    <td colSpan={canViewBranchProfit ? 7 : 5} className="p-0 border-b border-slate-50 bg-slate-50/50">
                                      <div className="py-4 px-8 bg-white/50 border-t border-slate-50/50 shadow-inner">
                                          {zeroDataCount > 0 && (
                                            <div className="flex items-center justify-end gap-2 mb-2">
                                              <span className="text-[10px] text-slate-400 font-medium">
                                                {showAllEmployees[b.id] ? `Đang hiện tất cả (${zeroDataCount} người không có dữ liệu)` : `Đang ẩn ${zeroDataCount} người không có dữ liệu`}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); toggleShowAllEmployees(b.id); }}
                                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${showAllEmployees[b.id] ? 'bg-orange-500' : 'bg-gray-300'}`}
                                              >
                                                <span className={`absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showAllEmployees[b.id] ? 'translate-x-4' : 'translate-x-0'}`} />
                                              </button>
                                            </div>
                                          )}
                                          <table className="w-full border-separate border-spacing-0">
                                            <thead>
                                              <tr className="text-left text-slate-400">
                                                <th className="pb-3 text-[10px] font-semibold uppercase pr-4">Nhân viên</th>
                                                <th className="pb-3 text-[10px] font-semibold uppercase text-center">Đơn</th>
                                                <th className="pb-3 text-right text-[10px] font-semibold uppercase px-4">Doanh số</th>
                                                <th className="pb-3 text-right text-[10px] font-semibold uppercase px-4">Thực thu</th>
                                                {canViewBranchProfit && <th className="pb-3 text-right text-[10px] font-semibold uppercase px-2">Chi phí</th>}
                                                {canViewBranchProfit && <th className="pb-3 text-right text-[10px] font-semibold uppercase pl-4">Lợi nhuận</th>}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {visibleEmployees.map(m => {
                                                const empCommissionOld = parseFloat(m.commission_amount_old || 0);
                                                const empDriverCost = parseFloat(m.driver_commission_cost || 0);
                                                const empUplineCost = parseFloat(m.upline_commission_cost || 0);
                                                const empCommissionNew = parseFloat(m.commission_amount_new || 0);
                                                const empDriverCostNew = parseFloat(m.driver_commission_cost_new || 0);
                                                const empUplineCostNew = parseFloat(m.upline_commission_cost_new || 0);
                                                const empProfit = parseFloat(m.profit || 0);
                                                const salerOrders = parseInt(m.total_saler_orders || 0);
                                                const completedOrders = parseInt(m.total_completed_orders || 0);
                                                const salerOrderValue = parseFloat(m.total_saler_order_value || 0);
                                                const completedOrderValue = parseFloat(m.total_completed_order_value || 0);
                                                const empOrders = m.orders || [];
                                                const isEmpExpanded = expandedEmpOrders.includes(`${m.id}_${b.id}`);
                                                // Separate orders into bán (user_id = employee) and giao (handover_user_id)
                                                // For now show all orders since the backend groups by user_id
                                                return (
                                                  <React.Fragment key={m.id}>
                                                    {/* Row 1: Đơn tạo trong tháng */}
                                                    <tr className="border-t border-slate-100 hover:bg-white transition-colors group/emp">
                                                      <td
                                                        className="py-3 pr-4 border-t border-slate-100/60 cursor-pointer"
                                                        rowSpan={isEmpExpanded ? 3 : 2}
                                                        onClick={() => empOrders.length > 0 && toggleEmpOrders(m.id, b.id)}
                                                      >
                                                        <div className="flex items-center gap-3">
                                                          {empOrders.length > 0 && (
                                                            <div className={`transition-transform duration-200 ${isEmpExpanded ? 'rotate-90' : ''}`}>
                                                              <ChevronRight size={14} className="text-slate-300 group-hover/emp:text-orange-500" />
                                                            </div>
                                                          )}
                                                          <div className="w-7 h-7 rounded-full bg-slate-100 group-hover/emp:bg-orange-100 flex items-center justify-center text-[11px] font-bold text-slate-500 group-hover/emp:text-orange-600 transition-colors">
                                                            {m.full_name ? m.full_name.charAt(0) : '?'}
                                                          </div>
                                                          <div>
                                                            <span className="text-[12px] font-semibold text-slate-700">{m.full_name}</span>
                                                          </div>
                                                        </div>
                                                      </td>
                                                      <td className="py-3 text-center border-t border-slate-100/60">
                                                        <span className="text-[10px] text-slate-400 font-medium">Tạo trong tháng:</span>
                                                        <span className="text-[11px] font-semibold text-slate-600 ml-1">{salerOrders}</span>
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[12px] font-medium text-slate-400 border-t border-slate-100/60">{formatVND(salerOrderValue)}</td>
                                                      <td className="py-3 px-4 text-right text-[12px] font-semibold text-slate-700 border-t border-slate-100/60">{formatVND(m.total_saler_revenue)}</td>
                                                      {canViewBranchProfit && (
                                                        <>
                                                          <td
                                                            className="py-3 px-2 text-right border-t border-slate-100/60 cursor-pointer select-none hover:bg-white/80 transition-colors"
                                                            onClick={(e) => { e.stopPropagation(); toggleCostCell(`emp_${m.id}_${b.id}_new`); }}
                                                            title="Nhấn để xem chi tiết chi phí"
                                                          >
                                                            <div className="inline-flex items-center gap-1">
                                                              <p className="text-[13px] font-semibold text-rose-400">-{formatVND(empCommissionNew + empDriverCostNew + empUplineCostNew)}</p>
                                                              {expandedCostCells[`emp_${m.id}_${b.id}_new`] ? <ChevronUp size={10} className="text-slate-300" /> : <ChevronDown size={10} className="text-slate-300" />}
                                                            </div>
                                                            {expandedCostCells[`emp_${m.id}_${b.id}_new`] && (
                                                              <div className="text-[11px] text-slate-400 font-medium mt-0.5 space-y-0.5">
                                                                <p>Hoa hồng: -{formatVND(empCommissionNew)}</p>
                                                                <p>Giao nhận: -{formatVND(empDriverCostNew)}</p>
                                                                <p>Cấp trên: -{formatVND(empUplineCostNew)}</p>
                                                              </div>
                                                            )}
                                                          </td>
                                                          <td className={`py-3 pl-4 text-right text-[12px] font-bold border-t border-slate-100/60 ${empProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`} rowSpan={isEmpExpanded ? 3 : 2}>
                                                            {formatVND(empProfit)}
                                                          </td>
                                                        </>
                                                      )}
                                                    </tr>
                                                    {/* Row 2: Đơn tạo tháng trước */}
                                                    <tr className="hover:bg-white transition-colors group/emp">
                                                      <td className="py-3 text-center border-t border-slate-100/60">
                                                        <span className="text-[10px] text-slate-400 font-medium">Tạo tháng trước:</span>
                                                        <span className="text-[11px] font-semibold text-slate-600 ml-1">{completedOrders}</span>
                                                      </td>
                                                      <td className="py-3 px-4 text-right text-[12px] font-medium text-slate-400 border-t border-slate-100/60">{formatVND(completedOrderValue)}</td>
                                                      <td className="py-3 px-4 text-right text-[12px] font-semibold text-slate-700 border-t border-slate-100/60">{formatVND(completedOrderValue)}</td>
                                                      {canViewBranchProfit && (
                                                        <td
                                                          className="py-3 px-2 text-right border-t border-slate-100/60 cursor-pointer select-none hover:bg-white/80 transition-colors"
                                                          onClick={(e) => { e.stopPropagation(); toggleCostCell(`emp_${m.id}_${b.id}_old`); }}
                                                          title="Nhấn để xem chi tiết chi phí"
                                                        >
                                                          <div className="inline-flex items-center gap-1">
                                                            <p className="text-[13px] font-semibold text-rose-400">-{formatVND(empCommissionOld + empDriverCost + empUplineCost)}</p>
                                                            {expandedCostCells[`emp_${m.id}_${b.id}_old`] ? <ChevronUp size={10} className="text-slate-300" /> : <ChevronDown size={10} className="text-slate-300" />}
                                                          </div>
                                                          {expandedCostCells[`emp_${m.id}_${b.id}_old`] && (
                                                            <div className="text-[11px] text-slate-400 font-medium mt-0.5 space-y-0.5">
                                                              <p>Hoa hồng: -{formatVND(empCommissionOld)}</p>
                                                              <p>Giao nhận: -{formatVND(empDriverCost)}</p>
                                                              <p>Cấp trên: -{formatVND(empUplineCost)}</p>
                                                            </div>
                                                          )}
                                                        </td>
                                                      )}
                                                    </tr>
                                                    {/* Row 3: Chi tiết đơn hàng */}
                                                    {isEmpExpanded && (
                                                      <tr>
                                                        <td colSpan={canViewBranchProfit ? 5 : 4} className="p-0 border-b border-slate-50 bg-slate-50/30">
                                                          <div className="py-3 px-6">
                                                            <table className="w-full border-separate border-spacing-0">
                                                              <thead>
                                                                <tr className="text-left text-slate-400">
                                                                  <th className="pb-2 text-[10px] font-semibold uppercase">Mã đơn</th>
                                                                  <th className="pb-2 text-[10px] font-semibold uppercase">Khách hàng</th>
                                                                  <th className="pb-2 text-[10px] font-semibold uppercase">Thiết bị</th>
                                                                  <th className="pb-2 text-[10px] font-semibold uppercase">Trạng thái</th>
                                                                  <th className="pb-2 text-right text-[10px] font-semibold uppercase">Giá trị</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {empOrders.map(order => {
                                                                  const statusInfo = getRentalStatus(order.status);
                                                                  return (
                                                                    <tr key={order.id} className="border-t border-slate-100 hover:bg-white transition-colors">
                                                                      <td className="py-2 text-[12px] font-semibold text-slate-700">{order.code}</td>
                                                                      <td className="py-2 text-[12px] text-slate-500">{order.customer_name || '—'}</td>
                                                                      <td className="py-2 text-[12px] text-slate-500">{order.equipment_name || '—'}</td>
                                                                      <td className="py-2">
                                                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${statusInfo.text}`}>
                                                                          <span className={`h-2 w-2 rounded-full ${statusInfo.dot}`} />
                                                                          {statusInfo.label}
                                                                        </span>
                                                                      </td>
                                                                      <td className="py-2 text-right text-[12px] font-semibold text-slate-700">{formatVND(order.total_price)}</td>
                                                                    </tr>
                                                                  );
                                                                })}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    )}
                                                  </React.Fragment>
                                                )
                                              })}
                                            </tbody>
                                          </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>

                      <div className="mt-8 bg-gradient-to-r from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex flex-col items-center md:items-start">
                          <h4 className="text-xs font-bold uppercase tracking-[0.2em] opacity-80 mb-2">TỔNG HỆ THỐNG</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black">{totalSystemOrders}</span>
                            <span className="text-[11px] opacity-70">đơn</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] opacity-70">
                            <span>{totalBranchOrders} mới</span>
                            {branchOrdersFromBeforeTotal > 0 && (
                              <span> + {branchOrdersFromBeforeTotal} cũ</span>
                            )}
                            {branchCancelledOrdersTotal > 0 && (
                              <span className="text-rose-300"> + {branchCancelledOrdersTotal} hủy</span>
                            )}
                          </div>
                        </div>
                        <div className="text-center md:text-right">
                          {isAdmin && (
                            <div className="text-3xl font-black mb-1 flex items-center justify-center md:justify-end gap-2">
                              <TrendingUp size={24} className={totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
                              {Math.round(totalProfit).toLocaleString('vi-VN')}đ
                            </div>
                          )}
                          <div className="text-[10px] font-bold uppercase tracking-widest opacity-80 flex items-center justify-center md:justify-end gap-2">
                            <span>TỔNG DS: {Math.round(totalBranchOrderValue).toLocaleString('vi-VN')}đ</span>
                            {isAdmin && (
                              <>
                                <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                                <span>BIÊN: {Math.round(profitMargin)}%</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mobile View: Cards */}
                    <div className="xl:hidden p-3 space-y-3 bg-gray-50/50">
                      {visibleBranchRevenue.map((b) => {
                        const branchAdsCost = parseFloat(b.ads_cost || 0);
                        const branchOperatingCost = parseFloat(b.total_commissions || 0);
                        const branchMiscCost = miscCosts
                          .filter(m => Number(m.branch_id) === b.id)
                          .reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
                        const branchTotalCost = branchOperatingCost + branchAdsCost + branchMiscCost;
                        const branchRevenue = parseFloat(b.total_revenue || 0);
                        const branchProfit = branchRevenue - branchTotalCost;
                        const branchProfitPercentage = branchRevenue > 0 ? Math.round((branchProfit / branchRevenue) * 100) : 0;
                        const isExpanded = expandedBranches.includes(b.id);
                        const branchEmployees = b.employees || [];
                        const visibleEmployees = showAllEmployees[b.id] ? branchEmployees : branchEmployees.filter(hasEmployeeData);
                        const zeroDataCount = branchEmployees.filter(emp => !hasEmployeeData(emp)).length;

                        return (
                          <div key={b.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all border ${isExpanded ? 'border-orange-200 shadow-md' : 'border-slate-100'}`}>
                            {/* Collapsed header */}
                            <div
                              className="p-4 cursor-pointer active:bg-slate-50/50 transition-colors"
                              onClick={() => toggleBranch(b.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isExpanded ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-orange-50 text-orange-500'}`}>
                                  <Store size={20} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-slate-800 text-[15px] leading-tight truncate">{b.name}</p>
                                  {/* Mini metric pills */}
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                                      <ShoppingBag size={10} />{parseInt(b.total_orders || 0) + parseInt(b.orders_from_before || 0) + parseInt(b.cancelled_orders || 0)} đơn
                                      <span className="font-medium text-slate-400 ml-0.5">
                                        ({b.total_orders} mới{parseInt(b.orders_from_before || 0) > 0 ? ` +${b.orders_from_before} cũ` : ''}{parseInt(b.cancelled_orders || 0) > 0 ? ` +${b.cancelled_orders} hủy` : ''})
                                      </span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">
                                      {Math.round(parseFloat(b.total_order_value || 0)).toLocaleString('vi-VN')}đ
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600">
                                      Thu: {Math.round(parseFloat(b.total_revenue)).toLocaleString('vi-VN')}đ
                                    </span>
                                  </div>
                                </div>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isExpanded ? 'bg-orange-100 text-orange-500' : 'bg-slate-50 text-slate-400'}`}>
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                              </div>
                            </div>

                            {/* Expanded content */}
                            {isExpanded && (
                              <div className="px-4 pb-4 border-t border-slate-50 pt-4">
                                {/* Metrics grid */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-slate-50 rounded-2xl p-3">
                                    <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Đơn</p>
                                    <p className="text-lg font-black text-slate-800 mt-0.5">
                                      {parseInt(b.total_orders || 0) + parseInt(b.orders_from_before || 0) + parseInt(b.cancelled_orders || 0)}
                                    </p>
                                    <div className="flex items-center gap-1 mt-1 text-[10px]">
                                      <span className="text-slate-400">{b.total_orders} mới</span>
                                      {parseInt(b.orders_from_before || 0) > 0 && (
                                        <span className="text-amber-500"> + {b.orders_from_before} cũ</span>
                                      )}
                                      {parseInt(b.cancelled_orders || 0) > 0 && (
                                        <span className="text-rose-400"> + {b.cancelled_orders} hủy</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="bg-emerald-50/70 rounded-2xl p-3">
                                    <p className="text-[10px] font-bold uppercase text-emerald-500 tracking-wide">Đã thu</p>
                                    <p className="text-base font-bold text-emerald-600 mt-0.5 truncate">{Math.round(parseFloat(b.total_revenue)).toLocaleString('vi-VN')}đ</p>
                                  </div>
                                  <div className="bg-blue-50/70 rounded-2xl p-3">
                                    <p className="text-[10px] font-bold uppercase text-blue-500 tracking-wide">Doanh số</p>
                                    <p className="text-base font-bold text-blue-600 mt-0.5 truncate">{Math.round(parseFloat(b.total_order_value || 0)).toLocaleString('vi-VN')}đ</p>
                                  </div>
                                  {canViewBranchProfit && (
                                    <div
                                      className="bg-rose-50/70 rounded-2xl p-3 cursor-pointer select-none active:scale-[0.98] transition-transform"
                                      onClick={(e) => { e.stopPropagation(); toggleCostCell(`m_branch_${b.id}`); }}
                                    >
                                      <div className="flex items-center gap-1">
                                        <p className="text-[10px] font-bold uppercase text-rose-400 tracking-wide">Chi phí</p>
                                        {expandedCostCells[`m_branch_${b.id}`] ? <ChevronUp size={12} className="text-rose-400" /> : <ChevronDown size={12} className="text-rose-400" />}
                                      </div>
                                      <p className="text-base font-bold text-rose-500 mt-0.5 truncate">-{Math.round(branchTotalCost).toLocaleString('vi-VN')}đ</p>
                                      {expandedCostCells[`m_branch_${b.id}`] && (
                                        <div className="mt-2.5 pt-2.5 border-t border-rose-100 space-y-1.5">
                                          <p className="text-[10px] text-slate-500 font-medium flex justify-between"><span>Hoa hồng</span> <span className="text-rose-500 font-semibold">-{Math.round(parseFloat(b.total_commissions || 0) - parseFloat(b.driver_commissions || 0)).toLocaleString('vi-VN')}đ</span></p>
                                          <p className="text-[10px] text-slate-500 font-medium flex justify-between"><span>Giao nhận</span> <span className="text-rose-500 font-semibold">-{Math.round(parseFloat(b.driver_commissions || 0)).toLocaleString('vi-VN')}đ</span></p>
                                          <p className="text-[10px] text-slate-500 font-medium flex justify-between"><span>Ads</span> <span className="text-rose-500 font-semibold">-{Math.round(branchAdsCost).toLocaleString('vi-VN')}đ</span></p>
                                          <p className="text-[10px] text-slate-500 font-medium flex justify-between"><span>Phát sinh</span> <span className="text-rose-500 font-semibold">-{Math.round(branchMiscCost).toLocaleString('vi-VN')}đ</span></p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Profit + margin row */}
                                {canViewBranchProfit && (
                                  <div className="mt-2 flex items-stretch gap-2">
                                    <div className={`flex-1 rounded-2xl p-3 ${branchProfit >= 0 ? 'bg-indigo-50' : 'bg-rose-50'}`}>
                                      <p className={`text-[10px] font-bold uppercase tracking-wide ${branchProfit >= 0 ? 'text-indigo-500' : 'text-rose-400'}`}>Lợi nhuận</p>
                                      <p className={`text-sm font-semibold mt-0.5 ${branchProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{Math.round(branchProfit).toLocaleString('vi-VN')}đ</p>
                                    </div>
                                    <div className="w-[120px] rounded-2xl p-3 bg-slate-50 flex flex-col justify-between">
                                      <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">Biên</p>
                                      <div>
                                        <p className={`text-sm font-semibold ${branchProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{branchProfitPercentage}%</p>
                                        <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ${branchProfit >= 0 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                                            style={{ width: `${Math.min(Math.abs(branchProfitPercentage), 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Employees section */}
                                {branchEmployees.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-slate-100">
                                    <div className="flex items-center justify-between mb-3">
                                      <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Nhân viên ({visibleEmployees.length})</p>
                                      {zeroDataCount > 0 && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-slate-400 font-medium">
                                            {showAllEmployees[b.id] ? 'Tất cả' : `Ẩn ${zeroDataCount}`}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); toggleShowAllEmployees(b.id); }}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${showAllEmployees[b.id] ? 'bg-orange-500' : 'bg-gray-300'}`}
                                          >
                                            <span className={`absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showAllEmployees[b.id] ? 'translate-x-4' : 'translate-x-0'}`} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      {visibleEmployees.map(emp => {
                                        const empCommissionOld = parseFloat(emp.commission_amount_old || 0);
                                        const empDriverCost = parseFloat(emp.driver_commission_cost || 0);
                                        const empUplineCost = parseFloat(emp.upline_commission_cost || 0);
                                        const empCommissionNew = parseFloat(emp.commission_amount_new || 0);
                                        const empDriverCostNew = parseFloat(emp.driver_commission_cost_new || 0);
                                        const empUplineCostNew = parseFloat(emp.upline_commission_cost_new || 0);
                                        const empProfit = parseFloat(emp.profit || 0);
                                        const salerOrders = parseInt(emp.total_saler_orders || 0);
                                        const completedOrders = parseInt(emp.total_completed_orders || 0);
                                        const salerOrderValue = parseFloat(emp.total_saler_order_value || 0);
                                        const completedOrderValue = parseFloat(emp.total_completed_order_value || 0);
                                        const totalEmpCost = empCommissionNew + empDriverCostNew + empUplineCostNew + empCommissionOld + empDriverCost + empUplineCost;
                                        return (
                                          <div key={emp.id} className="bg-slate-50/60 rounded-2xl p-3 border border-slate-100">
                                            {/* Employee header */}
                                            <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-[11px] font-bold text-orange-600">
                                                  {emp.full_name ? emp.full_name.charAt(0) : '?'}
                                                </div>
                                                <span className="text-[13px] font-bold text-slate-700">{emp.full_name}</span>
                                              </div>
                                              <span className="text-[11px] font-bold text-slate-400">{emp.total_orders} đơn</span>
                                            </div>

                                            {/* Quick stats chips */}
                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                              <span className="px-2 py-0.5 rounded-full bg-white text-[10px] font-semibold text-slate-500 border border-slate-100">
                                                Tạo trong tháng: {salerOrders} đơn · {Math.round(salerOrderValue || 0).toLocaleString('vi-VN')}đ
                                              </span>
                                              <span className="px-2 py-0.5 rounded-full bg-white text-[10px] font-semibold text-slate-500 border border-slate-100">
                                                Tạo tháng trước: {completedOrders} đơn · {Math.round(completedOrderValue || 0).toLocaleString('vi-VN')}đ
                                              </span>
                                            </div>

                                            {/* Revenue & cost row */}
                                            <div className="grid grid-cols-3 gap-2">
                                              <div className="bg-white rounded-xl p-2 text-center">
                                                <p className="text-[9px] font-bold uppercase text-slate-400">Thực thu</p>
                                                <p className="text-[12px] font-bold text-slate-700 mt-0.5">{Math.round(emp.total_revenue || 0).toLocaleString('vi-VN')}đ</p>
                                              </div>
                                              {canViewBranchProfit && (
                                                <div
                                                  className="bg-white rounded-xl p-2 text-center cursor-pointer select-none active:scale-[0.97] transition-transform"
                                                  onClick={(e) => { e.stopPropagation(); toggleCostCell(`m_emp_${emp.id}_${b.id}`); }}
                                                >
                                                  <div className="flex items-center justify-center gap-1">
                                                    <p className="text-[9px] font-bold uppercase text-rose-400">Chi phí</p>
                                                    {expandedCostCells[`m_emp_${emp.id}_${b.id}`] ? <ChevronUp size={10} className="text-rose-400" /> : <ChevronDown size={10} className="text-rose-400" />}
                                                  </div>
                                                  <p className="text-[12px] font-bold text-rose-500 mt-0.5">-{Math.round(totalEmpCost).toLocaleString('vi-VN')}đ</p>
                                                </div>
                                              )}
                                              {canViewBranchProfit && (
                                                <div className={`rounded-xl p-2 text-center ${empProfit >= 0 ? 'bg-indigo-50' : 'bg-rose-50'}`}>
                                                  <p className={`text-[9px] font-bold uppercase ${empProfit >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>Lợi nhuận</p>
                                                  <p className={`text-[12px] font-extrabold mt-0.5 ${empProfit >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{Math.round(empProfit).toLocaleString('vi-VN')}đ</p>
                                                </div>
                                              )}
                                            </div>

                                            {/* Expanded cost details */}
                                            {canViewBranchProfit && expandedCostCells[`m_emp_${emp.id}_${b.id}`] && (
                                              <div className="mt-2.5 pt-2.5 border-t border-slate-200 space-y-2">
                                                <div>
                                                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Đơn tạo trong tháng</p>
                                                  <div className="space-y-1 text-[11px]">
                                                    <p className="flex justify-between text-slate-500"><span>Hoa hồng</span> <span className="text-rose-500 font-semibold">-{Math.round(empCommissionNew).toLocaleString('vi-VN')}đ</span></p>
                                                    <p className="flex justify-between text-slate-500"><span>Giao nhận</span> <span className="text-rose-500 font-semibold">-{Math.round(empDriverCostNew).toLocaleString('vi-VN')}đ</span></p>
                                                    <p className="flex justify-between text-slate-500"><span>Cấp trên</span> <span className="text-rose-500 font-semibold">-{Math.round(empUplineCostNew).toLocaleString('vi-VN')}đ</span></p>
                                                  </div>
                                                </div>
                                                <div>
                                                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Đơn tạo tháng trước</p>
                                                  <div className="space-y-1 text-[11px]">
                                                    <p className="flex justify-between text-slate-500"><span>Hoa hồng</span> <span className="text-rose-500 font-semibold">-{Math.round(empCommissionOld).toLocaleString('vi-VN')}đ</span></p>
                                                    <p className="flex justify-between text-slate-500"><span>Giao nhận</span> <span className="text-rose-500 font-semibold">-{Math.round(empDriverCost).toLocaleString('vi-VN')}đ</span></p>
                                                    <p className="flex justify-between text-slate-500"><span>Cấp trên</span> <span className="text-rose-500 font-semibold">-{Math.round(empUplineCost).toLocaleString('vi-VN')}đ</span></p>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="bg-gradient-to-r from-indigo-500 to-violet-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200/50 flex justify-between items-center mt-2">
                        <div className="flex flex-col">
                          <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-90 mb-1">TỔNG HỆ THỐNG</h4>
                          <div className="flex items-center gap-1.5">
                            <span className="text-lg font-black">{totalSystemOrders}</span>
                            <span className="text-[11px] opacity-70">đơn</span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] opacity-70">
                            <span>{totalBranchOrders} mới</span>
                            {branchOrdersFromBeforeTotal > 0 && (
                              <span> + {branchOrdersFromBeforeTotal} cũ</span>
                            )}
                            {branchCancelledOrdersTotal > 0 && (
                              <span className="text-rose-300"> + {branchCancelledOrdersTotal} hủy</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {isAdmin && (
                            <div className="text-lg font-black mb-0.5">
                              {Math.round(totalProfit).toLocaleString('vi-VN')}đ
                            </div>
                          )}
                          <div className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                            TỔNG DS: {Math.round(totalBranchOrderValue).toLocaleString('vi-VN')}đ
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Leaderboard Section */}
              {(isAdmin || isManager || isSalerOnly) && (
              <div className="xl:col-span-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-gray-50 flex justify-between items-center bg-white">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Users size={20} className="text-orange-500" />
                    Bảng Xếp Hạng Nhân Viên
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {salerMetrics.slice(0, 5).map((m, index) => {
                    const isCurrentUser = user && user.username === m.username;

                    let rankBg = 'bg-slate-50 text-slate-400';
                    if (index === 0) rankBg = 'bg-[#FBBF24] text-slate-800 shadow-sm';
                    else if (index === 1) rankBg = 'bg-[#CBD5E1] text-slate-700 shadow-sm';
                    else if (index === 2) rankBg = 'bg-[#FDBA74] text-slate-800 shadow-sm';

                    const cardClass = isCurrentUser ? 'border border-orange-100 bg-orange-50/30' : 'border border-transparent bg-white';

                    return (
                      <div key={m.id} className={`flex items-center justify-between p-3 rounded-2xl ${cardClass}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-[1rem] flex items-center justify-center font-bold text-lg ${rankBg}`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-800 text-[15px]">{m.full_name}</p>
                              {isCurrentUser && <span className="bg-orange-100 text-orange-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">BẠN</span>}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Tổng: {m.total_orders} ĐƠN</p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="text-right">
                            <p className="font-bold text-slate-800 text-[14px]">{Math.round(parseFloat(m.total_revenue || 0)).toLocaleString('vi-VN')} đ</p>
                            <p className="text-[10px] font-bold text-emerald-500 uppercase mt-0.5">{m.profit_percentage || 0}% HIỆU QUẢ</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>



            {/* Detailed Performance Table */}
            {/* Detailed Performance Table - Admin Only */}
            {isAdmin && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                  <h3 className="text-lg font-semibold text-gray-800">Chi Tiết Năng Suất Nhân Viên</h3>
                </div>
                <div className="hidden md:block overflow-x-auto scrollbar-hide">
                  <table className="w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="sticky left-0 z-10 bg-white/95 backdrop-blur-sm py-4 px-6 text-[10px] font-bold uppercase tracking-widest border-b border-slate-50">Nhân Viên</th>
                        <th className="py-4 px-4 text-[10px] font-bold uppercase tracking-widest text-center border-b border-slate-50">Đơn</th>
                        <th className="py-4 px-4 text-right text-[10px] font-bold uppercase tracking-widest border-b border-slate-50">Doanh Số</th>
                        <th className="py-4 px-4 text-right text-[10px] font-bold uppercase tracking-widest border-b border-slate-50">Thực Thu</th>
                        <th className="py-4 px-4 text-right text-[10px] font-bold uppercase tracking-widest border-b border-slate-50 group/th">
                          <div className="flex items-center justify-end gap-1">
                            Chi Phí Lương
                            <HelpCircle size={10} className="text-slate-300 group-hover/th:text-primary transition-colors" />
                          </div>
                        </th>
                        <th className="py-4 px-4 text-right text-[10px] font-bold uppercase tracking-widest border-b border-slate-50">Hoa Hồng</th>
                        <th className="py-4 px-6 text-right text-[10px] font-bold uppercase tracking-widest border-b border-slate-50">Lợi Nhuận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {metrics.slice(0, displayCount).map((m, index) => {
                        const isPositive = m.profit >= 0;
                        return (
                          <tr key={m.id} className="group hover:bg-slate-50/50 transition-all">
                            <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/50 py-4 px-6 border-b border-slate-50 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400">
                                {m.full_name ? m.full_name.charAt(0) : '?'}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-700 text-[13px] truncate">{m.full_name}</p>
                                <p className="text-[10px] text-slate-400 font-medium">@{m.username}</p>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center font-bold text-slate-500 text-[12px] border-b border-slate-50">{m.total_orders}</td>
                            <td className="py-4 px-4 text-right font-bold text-slate-400 text-[12px] border-b border-slate-50">{Math.round(parseFloat(m.total_order_value || 0)).toLocaleString('vi-VN')}đ</td>
                            <td className="py-4 px-4 text-right font-bold text-slate-700 text-[12px] border-b border-slate-50">{Math.round(parseFloat(m.total_revenue)).toLocaleString('vi-VN')}đ</td>
                            <td className="py-4 px-4 text-right border-b border-slate-50">
                              <p className="font-bold text-slate-700 text-[12px]">{Math.round(parseFloat(m.base_salary_cost)).toLocaleString('vi-VN')}đ</p>
                              <p className="text-[9px] text-slate-400 font-medium">Mức: {Math.round(parseFloat(m.base_salary)).toLocaleString('vi-VN')}đ</p>
                            </td>
                            <td className="py-4 px-4 text-right border-b border-slate-50">
                              <p className="font-bold text-orange-500 text-[12px]">{Math.round(parseFloat(m.commission_amount)).toLocaleString('vi-VN')}đ</p>
                              {parseFloat(m.paid_to_upline || 0) > 0 && (
                                <p className="text-[11px] text-rose-400 font-semibold text-right mt-0.5">
                                  Chia cấp trên: {Math.round(parseFloat(m.paid_to_upline || 0)).toLocaleString('vi-VN')}đ
                                </p>
                              )}
                              {parseFloat(m.received_from_downline || 0) > 0 && (
                                <p className="text-[11px] text-emerald-500 font-semibold text-right mt-0.5">
                                  Nhận từ cấp dưới: {Math.round(parseFloat(m.received_from_downline || 0)).toLocaleString('vi-VN')}đ
                                </p>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right border-b border-slate-50">
                              <p className={`font-black text-[13px] ${isPositive ? 'text-indigo-600' : 'text-rose-500'}`}>
                                {Math.round(parseFloat(m.profit)).toLocaleString('vi-VN')}đ
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {hasMoreMetrics && (
                    <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/30 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
                        className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors py-2 px-6 rounded-lg hover:bg-indigo-50 active:scale-95"
                      >
                        Xem thêm ({metrics.length - displayCount} người còn lại)
                      </button>
                    </div>
                  )}
                </div>

                {/* Mobile View: Cards (Visible only on < md) */}
                <div className="md:hidden space-y-4 p-4 pt-0">
                  {metrics.slice(0, displayCount).map((m) => {
                    const isExpanded = expandedEmployees.includes(m.full_name);
                    const isCurrentUser = user && user.username === m.username;
                    return (
                      <div key={m.full_name} className={`rounded-2xl border transition-all overflow-hidden flex flex-col ${isCurrentUser ? 'border-primary/30 bg-primary/[0.02] ring-1 ring-primary/10 shadow-md shadow-primary/5' : 'bg-white border-slate-100 shadow-sm'}`}>
                        {/* Header: Name & Performance */}
                        <div
                          className={`p-4 flex items-center justify-between cursor-pointer active:bg-slate-50 transition-colors ${isCurrentUser ? 'bg-primary/[0.02]' : ''}`}
                          onClick={() => toggleEmployee(m.full_name)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isCurrentUser ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-orange-100 text-orange-600'}`}>
                              {m.full_name ? m.full_name.charAt(0) : '?'}
                            </div>
                            <div>
                              <p className="text-[14px] font-bold text-slate-900 leading-tight flex items-center gap-2">
                                {m.full_name}
                                {isCurrentUser && <span className="bg-primary text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm">Bạn</span>}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">@{m.username}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isAdmin && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">HIỆU SUẤT</span>
                                <span className="text-[14px] font-black text-orange-500">{m.profit_percentage || 0}%</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-slate-400">
                              <span className="text-[10px] font-medium italic">{isExpanded ? 'Thu gọn' : 'Xem thêm'}</span>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>
                        </div>

                        {/* Quick Money View */}
                        {!isExpanded && (
                          <div className="px-4 pb-4 flex justify-between items-center border-t border-slate-50/50 pt-3">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase">Doanh thu</span>
                              <span className="text-[14px] font-bold text-slate-700">{Math.round(parseFloat(m.total_revenue || 0)).toLocaleString('vi-VN')}đ</span>
                            </div>
                            {isAdmin && (
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase">Lợi nhuận</span>
                                <span className={`text-[14px] font-bold ${parseFloat(m.profit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {Math.round(parseFloat(m.profit || 0)).toLocaleString('vi-VN')}đ
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="pt-3 border-t border-slate-100 space-y-4">
                              {/* Metrics Grid */}
                              <div className="grid grid-cols-2 gap-3">
                                {/* Row 1: Counts (2 columns) */}
                                <div className="col-span-2 bg-slate-50/50 rounded-xl p-3 flex justify-between items-center">
                                  <span className="text-slate-400 text-xs font-semibold">Đơn</span>
                                  <span className="text-slate-800 font-bold text-sm">{m.total_orders}</span>
                                </div>

                                {/* Row 2: Sales (Full Width) */}
                                <div className="col-span-2 bg-slate-50/50 rounded-xl p-3 flex justify-between items-center">
                                  <span className="text-slate-400 text-xs font-semibold">Doanh số</span>
                                  <span className="text-slate-800 font-bold text-sm">{Math.round(parseFloat(m.total_order_value || 0)).toLocaleString('vi-VN')}đ</span>
                                </div>

                                {/* Row 3: Revenue (Full Width) */}
                                <div className="col-span-2 bg-slate-50/50 rounded-xl p-3 flex justify-between items-center">
                                  <span className="text-slate-400 text-xs font-semibold">Thực thu</span>
                                  <span className="text-slate-800 font-bold text-sm">{Math.round(parseFloat(m.total_revenue || 0)).toLocaleString('vi-VN')}đ</span>
                                </div>

                                {isAdmin && (
                                  <div className="col-span-2 bg-slate-50/50 rounded-xl p-3 flex justify-between items-center">
                                    <span className="text-slate-400 text-xs font-semibold">Chi phí lương</span>
                                    <span className="text-slate-800 font-bold text-sm">{Math.round(parseFloat(m.base_salary_cost || 0)).toLocaleString('vi-VN')}đ</span>
                                  </div>
                                )}

                                {(isAdmin || isCurrentUser) && (
                                  <>
                                    <div className="col-span-2 bg-slate-50/50 rounded-xl p-3 flex justify-between items-center">
                                      <span className="text-slate-400 text-xs font-semibold">Hoa hồng</span>
                                      <span className="text-slate-800 font-bold text-sm">{Math.round(parseFloat(m.commission_amount || 0)).toLocaleString('vi-VN')}đ</span>
                                    </div>
                                    {parseFloat(m.paid_to_upline || 0) > 0 && (
                                      <div className="col-span-2 rounded-xl p-3 flex justify-between items-center bg-rose-50/30 border border-rose-100">
                                        <span className="text-slate-400 text-xs font-semibold">Chia cho cấp trên</span>
                                        <span className="text-rose-500 font-bold text-sm">{Math.round(parseFloat(m.paid_to_upline || 0)).toLocaleString('vi-VN')}đ</span>
                                      </div>
                                    )}
                                    {parseFloat(m.received_from_downline || 0) > 0 && (
                                      <div className="col-span-2 rounded-xl p-3 flex justify-between items-center bg-emerald-50/50 border border-emerald-100">
                                        <span className="text-slate-400 text-xs font-semibold">Nhận từ cấp dưới</span>
                                        <span className="text-emerald-600 font-bold text-sm">{Math.round(parseFloat(m.received_from_downline || 0)).toLocaleString('vi-VN')}đ</span>
                                      </div>
                                    )}
                                  </>
                                )}

                                {isAdmin && (
                                  <div className={`col-span-2 mt-2 p-4 rounded-2xl flex justify-between items-center border ${parseFloat(m.profit || 0) >= 0 ? 'bg-indigo-50/50 border-indigo-100 text-indigo-700' : 'bg-rose-50/30 border-rose-100 text-rose-700'}`}>
                                    <span className="text-xs font-bold uppercase tracking-widest">LỢI NHUẬN:</span>
                                    <span className="text-lg font-black">{Math.round(parseFloat(m.profit || 0)).toLocaleString('vi-VN')}đ</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {hasMoreMetrics && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
                        className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors py-2 px-6 rounded-lg hover:bg-indigo-50 active:scale-95"
                      >
                        Xem thêm ({metrics.length - displayCount} người còn lại)
                      </button>
                    </div>
                  )}
                </div>

                {metrics.length === 0 && (
                  <div className="md:hidden bg-white rounded-[2rem] p-12 text-center text-gray-400 shadow-sm border border-slate-100 mx-4 mb-4">
                    Chưa có dữ liệu hiệu suất nhân viên.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Performance;
