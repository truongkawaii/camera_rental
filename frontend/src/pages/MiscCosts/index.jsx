import React, { useState, useEffect } from 'react';
import { getMiscCosts, createMiscCost, updateMiscCost, deleteMiscCost, getBranches } from '../../api/client';
import { Receipt, Calendar, Plus, Edit, Trash2, X, Building2 } from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import ModernDatePicker from '../../components/ModernDatePicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import CustomSelect from '../../components/CustomSelect';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';

const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtMiscCode = (id) => `MISC-${String(id).padStart(6, '0')}`;
const toYMD = (value) => (value ? String(value).split('T')[0] : '');
const fmtMiscRange = (item) => {
  const start = toYMD(item.start_date || item.date);
  const end = toYMD(item.end_date || item.date);
  const format = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN') : '';
  return start === end ? format(start) : `${format(start)} - ${format(end)}`;
};

const MiscCosts = () => {
  const { toasts, removeToast, toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [miscCosts, setMiscCosts] = useState([]);
  const [loadingMisc, setLoadingMisc] = useState(false);
  const [showMiscModal, setShowMiscModal] = useState(false);
  const [editingMisc, setEditingMisc] = useState(null);
  const [miscForm, setMiscForm] = useState({ date: '', start_date: '', end_date: '', amount: '', category: '', branch_id: '', notes: '' });
  const [branches, setBranches] = useState([]);

  const [confirmModal, setConfirmModal] = useState({
    show: false, title: '', message: '', type: 'warning', onConfirm: () => {},
  });

  const loadData = async () => {
    setLoadingMisc(true);
    try {
      const [miscRes, branchesRes] = await Promise.all([
        getMiscCosts({ month: selectedMonth }).catch(err => {
          console.error('getMiscCosts error:', err);
          return { data: { misc_costs: [] } };
        }),
        getBranches().catch(err => {
          console.error('getBranches error:', err);
          return { data: [] };
        })
      ]);

      const costsList = miscRes.data?.misc_costs || (Array.isArray(miscRes.data) ? miscRes.data : []);
      const branchesList = branchesRes.data?.branches || (Array.isArray(branchesRes.data) ? branchesRes.data : []);

      setMiscCosts(costsList);
      setBranches(branchesList.map(b => ({ id: b.id, name: b.name })));
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu chi phí phát sinh');
    } finally {
      setLoadingMisc(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedMonth]);

  const openMiscModal = (item = null) => {
    setEditingMisc(item);
    if (item) {
      setMiscForm({
        date: item.date ? item.date.split('T')[0] : '',
        start_date: item.start_date ? item.start_date.split('T')[0] : (item.date ? item.date.split('T')[0] : ''),
        end_date: item.end_date ? item.end_date.split('T')[0] : (item.date ? item.date.split('T')[0] : ''),
        amount: item.amount || '', category: item.category || '', branch_id: item.branch_id || '', notes: item.notes || ''
      });
    } else {
      const startOf = `${selectedMonth}-01`;
      setMiscForm({ date: startOf, start_date: startOf, end_date: startOf, amount: '', category: '', branch_id: branches[0]?.id || '', notes: '' });
    }
    setShowMiscModal(true);
  };

  const handleSaveMisc = async (e) => {
    e.preventDefault();
    if (!miscForm.branch_id) { toast.error('Vui lòng chọn cơ sở'); return; }
    if (!miscForm.amount || miscForm.amount <= 0) { toast.error('Vui lòng nhập số tiền'); return; }
    
    try {
      const payload = {
        date: miscForm.start_date || miscForm.date,
        start_date: miscForm.start_date || miscForm.date,
        end_date: miscForm.end_date || miscForm.date,
        amount: miscForm.amount,
        category: miscForm.category,
        branch_id: miscForm.branch_id,
        notes: miscForm.notes
      };
      
      if (editingMisc) {
        await updateMiscCost(editingMisc.id, payload);
        toast.success('Đã cập nhật chi phí Phát sinh');
      } else {
        await createMiscCost(payload);
        toast.success('Đã thêm chi phí Phát sinh');
      }
      setShowMiscModal(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Lỗi khi lưu');
    }
  };

  const handleDeleteMisc = (id) => {
    setConfirmModal({
      show: true, title: 'Xóa chi phí', message: 'Bạn có chắc chắn muốn xóa chi phí này?', type: 'danger',
      onConfirm: async () => {
        try {
          await deleteMiscCost(id);
          toast.success('Đã xóa chi phí');
          loadData();
        } catch (err) { toast.error('Lỗi khi xóa'); }
      }
    });
  };

  const safeMiscList = Array.isArray(miscCosts) ? miscCosts : [];
  const totalMiscCost = safeMiscList.reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Chi phí Phát sinh</h1>
            <p className="text-sm text-gray-500 mt-1">Quản lý các chi phí vận hành khác trong tháng {selectedMonth}</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <ModernMonthPicker value={selectedMonth} onChange={setSelectedMonth} className="w-full md:w-48" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
             <div>
               <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tổng chi phí</p>
               <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{fmtVND(totalMiscCost)}</p>
             </div>
             <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
               <Receipt size={24} className="text-amber-600" />
             </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Receipt size={16} className="text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Danh sách chi phí phát sinh</h3>
             </div>
             <button onClick={() => openMiscModal()} className="flex justify-center items-center gap-2 text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 px-4 py-2.5 rounded-xl transition-all shadow-sm">
                <Plus size={16} /> Thêm chi phí
             </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Mã</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Thời gian</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Cơ sở</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Hạng mục</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-right">Số tiền</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Ghi chú</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingMisc ? (
                   <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400">Đang tải...</td></tr>
                ) : safeMiscList.length === 0 ? (
                   <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400">Không có dữ liệu trong tháng này</td></tr>
                ) : (
                   safeMiscList.map(item => (
                     <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{fmtMiscCode(item.id)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{fmtMiscRange(item)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.branch_name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 font-semibold">{item.category || '-'}</td>
                        <td className="px-6 py-4 text-sm font-bold text-amber-600 text-right">{fmtVND(item.amount)}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 italic max-w-[200px] truncate">{item.notes || '-'}</td>
                        <td className="px-6 py-4">
                           <div className="flex justify-end gap-2">
                             <button onClick={() => openMiscModal(item)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200">
                               <Edit size={16} />
                             </button>
                             <button onClick={() => handleDeleteMisc(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                               <Trash2 size={16} />
                             </button>
                           </div>
                        </td>
                     </tr>
                   ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showMiscModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
               <h3 className="text-xl font-bold">{editingMisc ? 'Sửa' : 'Thêm'} chi phí phát sinh</h3>
               <button onClick={() => setShowMiscModal(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSaveMisc} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="block text-sm font-medium mb-1">Từ ngày</label>
                   <ModernDatePicker value={miscForm.start_date} onChange={(date) => setMiscForm({...miscForm, start_date: date, end_date: miscForm.end_date || date})} />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1">Đến ngày</label>
                   <ModernDatePicker value={miscForm.end_date} min={miscForm.start_date} onChange={(date) => setMiscForm({...miscForm, end_date: date})} />
                 </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cơ sở</label>
                <CustomSelect options={branches} value={miscForm.branch_id} onChange={v => setMiscForm({...miscForm, branch_id: v})} placeholder="Chọn cơ sở" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hạng mục</label>
                <input required type="text" value={miscForm.category} onChange={e => setMiscForm({...miscForm, category: e.target.value})} className="w-full p-2 border rounded-xl bg-gray-50" placeholder="VD: Điện nước, Mặt bằng..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Số tiền</label>
                <input required type="text" value={formatCurrencyInput(miscForm.amount)} onChange={e => setMiscForm({...miscForm, amount: parseCurrencyInput(e.target.value)})} className="w-full p-2 border rounded-xl bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ghi chú</label>
                <textarea rows="2" value={miscForm.notes} onChange={e => setMiscForm({...miscForm, notes: e.target.value})} className="w-full p-2 border rounded-xl bg-gray-50" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowMiscModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:opacity-90">Lưu</button>
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

export default MiscCosts;
