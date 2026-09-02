import React, { useState, useEffect } from 'react';
import { getActivityLogs } from '../../api/client';
import { Activity, Plus, Edit2, Trash2, User, Package, Calendar, RefreshCw, Building2, Search, X, Receipt, Percent, ArrowRightLeft, ShieldBan, UserCog, Filter } from 'lucide-react';
import Pagination from '../../components/Pagination';
import DateRangePicker from '../../components/DateRangePicker';

const ACTION_CONFIG = {
  CREATE: { label: 'Thêm mới', cls: 'bg-green-100 text-green-700', icon: <Plus size={13} /> },
  UPDATE: { label: 'Cập nhật', cls: 'bg-blue-100 text-blue-700',  icon: <Edit2 size={13} /> },
  DELETE:      { label: 'Xóa',         cls: 'bg-red-100 text-red-600',     icon: <Trash2 size={13} /> },
  BLACKLIST:   { label: 'Chặn',         cls: 'bg-orange-100 text-orange-700', icon: <ShieldBan size={13} /> },
  UNBLACKLIST: { label: 'Bỏ chặn',      cls: 'bg-emerald-100 text-emerald-700', icon: <ShieldBan size={13} /> },
};

const ENTITY_CONFIG = {
  equipment: { label: 'Thiết bị',   icon: <Package size={14} className="text-orange-500" /> },
  rental:    { label: 'Đơn thuê',   icon: <Calendar size={14} className="text-blue-500" /> },
  customer:  { label: 'Khách hàng', icon: <User size={14} className="text-purple-500" /> },
  branch:    { label: 'Cơ sở',      icon: <Building2 size={14} className="text-blue-600" /> },
  ads_cost:  { label: 'Chi phí ads', icon: <Activity size={14} className="text-green-600" /> },
  misc_cost: { label: 'Chi phí phát sinh', icon: <Receipt size={14} className="text-amber-600" /> },
  commission_config: { label: 'Cấu hình hoa hồng', icon: <Percent size={14} className="text-emerald-500" /> },
  collaborator_hierarchy: { label: 'Phân cấp cộng tác', icon: <User size={14} className="text-indigo-500" /> },
  sale_transfer: { label: 'Chuyển tiền', icon: <ArrowRightLeft size={14} className="text-teal-500" /> },
  user:       { label: 'Tài khoản', icon: <UserCog size={14} className="text-cyan-500" /> },
  blacklist:  { label: 'Danh sách hạn chế', icon: <ShieldBan size={14} className="text-red-500" /> },
};

const formatDateTime = (str) => {
  const d = new Date(str);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedEntities, setSelectedEntities] = useState([]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadLogs();
  }, [currentPage, debouncedSearch, dateRange, selectedEntities]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await getActivityLogs(currentPage, 20, debouncedSearch, dateRange.start, dateRange.end, selectedEntities);
      setLogs(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
      setTotalCount(res.data.pagination.total);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleEntity = (entityKey) => {
    setSelectedEntities(prev =>
      prev.includes(entityKey)
        ? prev.filter(e => e !== entityKey)
        : [...prev, entityKey]
    );
    setCurrentPage(1);
  };

  const clearEntityFilter = () => {
    setSelectedEntities([]);
    setCurrentPage(1);
  };

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-3">
              <Activity size={30} className="text-primary" />
              Nhật Ký Hoạt Động
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Tổng cộng <span className="font-semibold text-gray-700">{totalCount}</span> thay đổi được ghi lại
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              label="Lọc theo ngày"
              className="w-full md:w-auto"
              onChange={({ start, end }) => {
                setDateRange({ start, end });
                setCurrentPage(1);
              }}
            />

            <div className="relative w-full md:w-80 xl:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="text"
                placeholder="Tìm hoạt động, người thực hiện..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-[35px] w-full pl-11 pr-10 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm text-sm"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full text-gray-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => { setCurrentPage(1); loadLogs(); }}
              className="h-[35px] w-full md:w-auto flex items-center justify-center gap-2 px-4 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors shadow-sm text-sm whitespace-nowrap font-medium"
            >
              <RefreshCw size={15} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Entity Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="flex items-center gap-1 text-xs text-gray-400 font-medium mr-1">
            <Filter size={13} />
            Lọc theo:
          </span>
          {Object.entries(ENTITY_CONFIG).map(([key, cfg]) => {
            const isActive = selectedEntities.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleEntity(key)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <span className={isActive ? '' : 'opacity-60'}>{cfg.icon}</span>
                {cfg.label}
              </button>
            );
          })}
          {selectedEntities.length > 0 && (
            <button
              onClick={clearEntityFilter}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-red-500 hover:bg-red-50 transition-colors"
            >
              <X size={12} />
              Xóa filter
            </button>
          )}
        </div>

        {/* Log Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Đang tải...</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              {debouncedSearch ? (
                <>
                  <Search size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400">Không tìm thấy hoạt động nào phù hợp với từ khóa.</p>
                  <p className="text-gray-400 text-sm mt-1">Vui lòng thử lại với từ khóa khác.</p>
                </>
              ) : (
                <>
                  <Activity size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-400">Chưa có hoạt động nào được ghi lại.</p>
                  <p className="text-gray-400 text-sm mt-1">Thêm, sửa hoặc xóa thiết bị, đơn thuê, khách hàng để bắt đầu.</p>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((log) => {
                const action = ACTION_CONFIG[log.action] ?? { label: log.action, cls: 'bg-gray-100 text-gray-600', icon: null };
                const entity = ENTITY_CONFIG[log.entity_type] ?? { label: log.entity_type, icon: null };
                return (
                  <div key={log.id} className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4 px-4 md:px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Action badge */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap mt-0.5 ${action.cls}`}>
                        {action.icon}
                        {action.label}
                      </span>

                      {/* Entity type */}
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap mt-0.5">
                        {entity.icon}
                        {entity.label}
                      </span>

                      {/* Performed by user */}
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100 whitespace-nowrap mt-0.5">
                        <User size={12} className="text-gray-400" />
                        {log.performed_by_name || log.performed_by_username || 'Hệ thống'}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="flex-1 text-sm text-gray-700 leading-relaxed pt-0.5">
                      {log.description}
                    </p>

                    {/* Timestamp */}
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5 shrink-0 md:text-right">
                      {formatDateTime(log.inserted_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/20">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
