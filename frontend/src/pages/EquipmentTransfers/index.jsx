import React, { useState, useEffect } from 'react';
import {
  getEquipmentTransfers, createEquipmentTransfer, approveTransfer,
  rejectTransfer, completeTransfer, cancelTransfer, deleteEquipmentTransfer,
  getBranches, getEquipment
} from '../../api/client';
import {
  ArrowRightLeft, Plus, Check, X, Ban, Trash2,
  Clock, CheckCircle2, XCircle, PackageCheck, ChevronDown
} from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import CustomSelect from '../../components/CustomSelect';

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

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

const EquipmentTransfers = () => {
  const { toasts, removeToast, toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [transfers, setTransfers] = useState([]);
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

      const [transfersRes, branchesRes, eqRes] = await Promise.all([
        getEquipmentTransfers(params).catch(() => ({ data: { transfers: [] } })),
        getBranches().catch(() => ({ data: [] })),
        getEquipment ? getEquipment({ limit: 500 }).catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } })
      ]);

      setTransfers(transfersRes.data?.transfers || []);
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
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default EquipmentTransfers;
