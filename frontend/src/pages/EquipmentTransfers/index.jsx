import React, { useState, useEffect } from 'react';
import {
  getEquipmentTransfers, createEquipmentTransfer, approveTransfer,
  rejectTransfer, completeTransfer, cancelTransfer, deleteEquipmentTransfer,
  getBranches, getEquipment, getBranchTransferStats, getBranchEquipment
} from '../../api/client';
import {
  ArrowRightLeft, Plus, Check, X, Ban, Trash2,
  Clock, CheckCircle2, XCircle, PackageCheck, ChevronDown,
  Building2, ArrowDownRight, ArrowUpRight, Layers, Eye, Search, Package, RefreshCw
} from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import CustomSelect from '../../components/CustomSelect';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const equipmentModel = (item) => item.model?.trim() || item.name?.trim() || 'Chưa có model';
const modelKey = (item) => equipmentModel(item).toLocaleLowerCase('vi-VN');

const STATUS_MAP = {
  pending: { label: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Đã duyệt', color: 'bg-blue-100 text-blue-700', icon: Check },
  completed: { label: 'Hoàn tất', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Đã huỷ', color: 'bg-gray-100 text-gray-500', icon: Ban },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${s.color}`}>
      <Icon size={13} /> {s.label}
    </span>
  );
};

const BranchEquipmentModal = ({ branch, onClose }) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getBranchEquipment(branch.id)
      .then((response) => {
        if (active) setEquipment(response.data?.equipment || []);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.error || 'Không thể tải danh sách thiết bị');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [branch.id, retryKey]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const normalizedSearch = search.trim().toLocaleLowerCase('vi-VN');
  const modelCounts = new Map();
  for (const item of equipment) {
    const key = modelKey(item);
    const group = modelCounts.get(key);
    if (group) group.count += 1;
    else modelCounts.set(key, { key, name: equipmentModel(item), count: 1 });
  }
  const modelOptions = [...modelCounts.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const visibleEquipment = equipment.filter((item) =>
    (!selectedModel || modelKey(item) === selectedModel) &&
    (!normalizedSearch || [item.code, item.name, item.category, item.brand, item.model]
      .some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(normalizedSearch)))
  );
  const visibleGroups = new Map();
  for (const item of visibleEquipment) {
    const key = modelKey(item);
    if (!visibleGroups.has(key)) visibleGroups.set(key, { key, name: equipmentModel(item), items: [] });
    visibleGroups.get(key).items.push(item);
  }
  const sortedGroups = [...visibleGroups.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const transferredIn = equipment.filter((item) => item.original_branch_id && Number(item.original_branch_id) !== Number(branch.id)).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="branch-equipment-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-white px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Building2 size={21} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Thiết bị hiện có tại cơ sở</p>
              <h2 id="branch-equipment-title" className="mt-0.5 text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">{branch.name}</h2>
              <p className="mt-1 text-xs text-slate-500">Bao gồm thiết bị gốc và thiết bị đã chuyển đến.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng danh sách thiết bị" className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">{loading ? '…' : equipment.length} thiết bị tại cơ sở</span>
            {!loading && <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{modelOptions.length} model</span>}
            {!loading && transferredIn > 0 && <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{transferredIn} chuyển đến</span>}
            {branch.code && <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-600">{branch.code}</span>}
          </div>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm theo tên, mã, danh mục, hãng..."
                aria-label="Tìm thiết bị tại cơ sở"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              aria-label="Lọc thiết bị theo model"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition-colors focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Tất cả model ({equipment.length})</option>
              {modelOptions.map((model) => <option key={model.key} value={model.key}>{model.name} ({model.count})</option>)}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-7">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><RefreshCw size={17} className="animate-spin text-indigo-500" /> Đang tải thiết bị...</div>
          ) : error ? (
            <div className="py-14 text-center">
              <p className="text-sm text-rose-600">{error}</p>
              <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-3 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Thử lại</button>
            </div>
          ) : visibleEquipment.length === 0 ? (
            <div className="py-14 text-center text-slate-500">
              <Package size={30} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm">{search || selectedModel ? 'Không tìm thấy thiết bị phù hợp.' : 'Cơ sở này hiện chưa có thiết bị.'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map((group) => (
                <section key={group.key}>
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-indigo-100 bg-white/95 py-2 backdrop-blur-sm">
                    <h3 className="min-w-0 truncate text-xs font-extrabold uppercase tracking-wide text-indigo-700" title={group.name}>{group.name}</h3>
                    <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600">{group.items.length} thiết bị</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {group.items.map((item) => {
                      const isTransferred = item.original_branch_id && Number(item.original_branch_id) !== Number(branch.id);
                      return (
                        <li key={item.id} className="flex items-start gap-3 py-3.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Package size={18} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-bold text-slate-900">{item.name}</span>
                              {isTransferred && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Chuyển đến</span>}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <span className="font-mono font-semibold text-indigo-600">{item.code || `#${item.id}`}</span>
                              {item.category && <><span className="text-slate-300">•</span><span>{item.category}</span></>}
                              {(item.brand || item.model) && <><span className="text-slate-300">•</span><span>{[item.brand, item.model].filter(Boolean).join(' / ')}</span></>}
                            </div>
                            {isTransferred && item.original_branch_name && <p className="mt-1 text-[11px] text-emerald-700">Từ cơ sở gốc: {item.original_branch_name}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-7">
          <span className="text-xs text-slate-500">{!loading && !error ? `Đang hiển thị ${visibleEquipment.length}/${equipment.length} thiết bị` : 'Danh sách theo vị trí thực tế hiện tại'}</span>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">Đóng</button>
        </div>
      </div>
    </div>
  );
};

const EquipmentTransfers = () => {
  const { toasts, removeToast, toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [transfers, setTransfers] = useState([]);
  const [branchStats, setBranchStats] = useState([]);
  const [detailBranch, setDetailBranch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ equipment_id: '', to_branch_id: '', reason: '', notes: '' });
  const [branches, setBranches] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [rawEquipmentList, setRawEquipmentList] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');

  const [confirmModal, setConfirmModal] = useState({
    show: false, title: '', message: '', type: 'warning', onConfirm: () => {},
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const params = { month: selectedMonth, _t: Date.now() };
      if (statusFilter) params.status = statusFilter;

      const [transfersRes, branchesRes, eqRes, branchStatsRes] = await Promise.all([
        getEquipmentTransfers(params).catch(() => ({ data: { transfers: [] } })),
        getBranches().catch(() => ({ data: [] })),
        getEquipment ? getEquipment(1, 1000).catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
        getBranchTransferStats().catch(() => ({ data: { branches: [] } }))
      ]);

      setTransfers(transfersRes.data?.transfers || []);
      setBranchStats(branchStatsRes.data?.branches || []);
      const branchList = Array.isArray(branchesRes.data) ? branchesRes.data : (branchesRes.data?.branches || []);
      setBranches(branchList.map(b => ({ id: b.id, name: b.name })));

      const eqList = eqRes.data?.data || (Array.isArray(eqRes.data) ? eqRes.data : []);
      setRawEquipmentList(eqList);
      setEquipmentList(eqList.map(e => ({ id: e.id, name: `${e.code || ''} - ${e.name}` })));
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedMonth, statusFilter]);

  const openModal = () => {
    setForm({ equipment_id: '', to_branch_id: '', reason: '', notes: '' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.equipment_id) { toast.error('Vui lòng chọn thiết bị'); return; }
    if (!form.to_branch_id) { toast.error('Vui lòng chọn chi nhánh đích'); return; }

    try {
      await createEquipmentTransfer(form);
      toast.success('Đã tạo yêu cầu điều chuyển');
      setShowModal(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Lỗi khi tạo yêu cầu');
    }
  };

  const handleAction = (action, id, label) => {
    const actionMap = {
      approve: { fn: () => approveTransfer(id), msg: `Bạn có chắc muốn duyệt yêu cầu #${id}?`, success: 'Đã duyệt', title: 'Duyệt yêu cầu', type: 'info' },
      reject: { fn: () => rejectTransfer(id, 'Từ chối bởi Admin'), msg: `Bạn có chắc muốn từ chối yêu cầu #${id}?`, success: 'Đã từ chối', title: 'Từ chối yêu cầu', type: 'danger' },
      complete: { fn: () => completeTransfer(id), msg: `Xác nhận hoàn tất điều chuyển #${id}? Vị trí thiết bị sẽ được cập nhật.`, success: 'Hoàn tất điều chuyển', title: 'Hoàn tất điều chuyển', type: 'info' },
      cancel: { fn: () => cancelTransfer(id), msg: `Bạn có chắc muốn huỷ yêu cầu #${id}?`, success: 'Đã huỷ', title: 'Huỷ yêu cầu', type: 'warning' },
      delete: { fn: () => deleteEquipmentTransfer(id), msg: `Xoá vĩnh viễn yêu cầu #${id}?`, success: 'Đã xoá', title: 'Xoá yêu cầu', type: 'danger' },
    };

    const a = actionMap[action];
    setConfirmModal({
      show: true, title: a.title, message: a.msg, type: a.type,
      onConfirm: async () => {
        try {
          await a.fn();
          toast.success(a.success);
          setConfirmModal(prev => ({ ...prev, show: false }));
          loadData();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Lỗi khi thực hiện');
        }
      }
    });
  };

  const safeList = Array.isArray(transfers) ? transfers : [];
  const stats = {
    total: safeList.length,
    pending: safeList.filter(t => t.status === 'pending').length,
    approved: safeList.filter(t => t.status === 'approved').length,
    completed: safeList.filter(t => t.status === 'completed').length,
  };

  const totalSystemEquipment = branchStats.reduce((sum, b) => sum + (Number(b.current_count) || 0), 0);

  const statusFilterOptions = [
    { id: '', name: 'Tất cả' },
    { id: 'pending', name: 'Chờ duyệt' },
    { id: 'approved', name: 'Đã duyệt' },
    { id: 'completed', name: 'Hoàn tất' },
    { id: 'rejected', name: 'Từ chối' },
    { id: 'cancelled', name: 'Đã huỷ' },
  ];

  // Lọc chi nhánh đích: Không được trùng với chi nhánh hiện tại của thiết bị
  const selectedEq = rawEquipmentList.find(e => String(e.id) === String(form.equipment_id));
  const currentBranchId = selectedEq ? (selectedEq.current_branch_id || selectedEq.branch_id) : null;
  const filteredBranches = currentBranchId 
    ? branches.filter(b => String(b.id) !== String(currentBranchId)) 
    : branches;

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Điều chuyển Thiết bị</h1>
            <p className="text-sm text-gray-500 mt-1">Theo dõi và quản lý việc điều chuyển thiết bị giữa các chi nhánh</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <ModernMonthPicker value={selectedMonth} onChange={setSelectedMonth} className="w-full md:w-48" />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Tổng yêu cầu', value: stats.total, color: 'indigo' },
            { label: 'Chờ duyệt', value: stats.pending, color: 'yellow' },
            { label: 'Đã duyệt', value: stats.approved, color: 'blue' },
            { label: 'Hoàn tất', value: stats.completed, color: 'green' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-2xl font-extrabold text-${kpi.color}-600 mt-1`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Phân bổ số lượng thiết bị theo từng cơ sở */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-gray-900 leading-tight">
                  Số lượng thiết bị thực tế theo từng cơ sở
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Số lượng hiện tại = Ban đầu <span className="font-semibold text-slate-700">(Gốc)</span> - Chuyển đi + Chuyển đến
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700 self-start sm:self-auto">
              <Layers size={14} className="text-indigo-600" />
              <span>Toàn hệ thống: <strong className="text-indigo-600 font-bold">{totalSystemEquipment}</strong> thiết bị</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {branchStats.map((b) => {
              const diff = (b.transferred_in || 0) - (b.transferred_out || 0);
              return (
                <div 
                  key={b.id} 
                  className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/60 p-4 hover:shadow-md hover:border-indigo-200 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Name & Code */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="font-bold text-slate-900 text-sm leading-snug line-clamp-1" title={b.name}>
                        {b.name}
                      </h4>
                      {b.code && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 uppercase shrink-0">
                          {b.code}
                        </span>
                      )}
                    </div>

                    {/* Main count */}
                    <div className="mb-4">
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block mb-1">
                        Hiện có mặt tại cơ sở
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-indigo-600 leading-none">
                          {b.current_count}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">thiết bị</span>
                        {diff !== 0 && (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            diff > 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Breakdown & formula */}
                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500">Thiết bị ban đầu:</span>
                      <span className="font-bold text-slate-800">{b.initial_count}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ArrowDownRight size={13} className="text-rose-500" />
                        Đã chuyển đi:
                      </span>
                      <span className="font-bold text-rose-600">
                        -{b.transferred_out}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ArrowUpRight size={13} className="text-emerald-500" />
                        Được chuyển đến:
                      </span>
                      <span className="font-bold text-emerald-600">
                        +{b.transferred_in}
                      </span>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200 flex items-center justify-center">
                      <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-medium">
                        {b.initial_count} - {b.transferred_out} + {b.transferred_in} = <strong className="text-indigo-600">{b.current_count}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailBranch(b)}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                      aria-label={`Xem danh sách thiết bị tại ${b.name}`}
                    >
                      <Eye size={14} /> Xem thiết bị <span className="font-normal text-indigo-500">({b.current_count})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                <ArrowRightLeft size={16} className="text-indigo-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Danh sách điều chuyển</h3>
            </div>
            <div className="flex items-center gap-3">
              <CustomSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} placeholder="Lọc trạng thái" className="w-40" showSearch={false} />
              <button onClick={openModal} className="flex justify-center items-center gap-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition-all shadow-sm">
                <Plus size={16} /> Tạo yêu cầu
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Thiết bị</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Từ</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-center">→</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Đến</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Trạng thái</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Người yêu cầu</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Ngày tạo</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan="8" className="px-6 py-12 text-center text-gray-400">Đang tải...</td></tr>
                ) : safeList.length === 0 ? (
                  <tr><td colSpan="8" className="px-6 py-12 text-center text-gray-400">Không có yêu cầu điều chuyển nào</td></tr>
                ) : (
                  safeList.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">{item.equipment_name}</div>
                        <div className="text-xs text-gray-400">{item.equipment_code}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.from_branch_name}</td>
                      <td className="px-6 py-4 text-center"><ArrowRightLeft size={14} className="text-gray-300 mx-auto" /></td>
                      <td className="px-6 py-4 text-sm font-semibold text-indigo-600">{item.to_branch_name}</td>
                      <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{item.requested_by_name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{fmtDate(item.inserted_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1.5">
                          {item.status === 'pending' && (
                            <>
                              <button onClick={() => handleAction('approve', item.id)} title="Duyệt" className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                                <Check size={16} />
                              </button>
                              <button onClick={() => handleAction('reject', item.id)} title="Từ chối" className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <XCircle size={16} />
                              </button>
                              <button onClick={() => handleAction('cancel', item.id)} title="Huỷ" className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
                                <Ban size={16} />
                              </button>
                            </>
                          )}
                          {item.status === 'approved' && (
                            <button onClick={() => handleAction('complete', item.id)} title="Hoàn tất" className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors">
                              <PackageCheck size={16} />
                            </button>
                          )}
                          {['completed', 'rejected', 'cancelled'].includes(item.status) && (
                            <button onClick={() => handleAction('delete', item.id)} title="Xoá" className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail section - reason/notes */}
        {safeList.some(t => t.reason || t.notes) && (
          <div className="mt-6 space-y-3">
            {safeList.filter(t => t.status === 'pending' || t.status === 'approved').map(t => (
              t.reason ? (
                <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3">
                  <ArrowRightLeft size={16} className="text-indigo-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{t.equipment_name}: {t.from_branch_name} → {t.to_branch_name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">Lý do: {t.reason}</p>
                  </div>
                </div>
              ) : null
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Tạo yêu cầu điều chuyển</h3>
              <button onClick={() => setShowModal(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Thiết bị</label>
                <CustomSelect options={equipmentList} value={form.equipment_id} onChange={v => setForm({...form, equipment_id: v})} placeholder="Chọn thiết bị cần điều chuyển" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Chi nhánh đích</label>
                <CustomSelect options={filteredBranches} value={form.to_branch_id} onChange={v => setForm({...form, to_branch_id: v})} placeholder="Chọn chi nhánh nhận" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Lý do điều chuyển</label>
                <textarea rows="2" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none" placeholder="VD: Hỗ trợ sự kiện, thiếu máy..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Ghi chú</label>
                <textarea rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 outline-none" placeholder="Ghi chú thêm..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold text-gray-700 hover:bg-gray-200 transition-colors">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors">Tạo yêu cầu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal(prev => ({ ...prev, show: false }))} />
      {detailBranch && <BranchEquipmentModal branch={detailBranch} onClose={() => setDetailBranch(null)} />}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default EquipmentTransfers;
