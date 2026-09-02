import React, { useState, useEffect, useRef } from 'react';
import { getPayrollTransfers, createPayrollTransfer, updatePayrollTransfer, deletePayrollTransfer, uploadPayrollTransferImage, getUsers } from '../../api/client';
import { Send, Calendar, Plus, Edit, Trash2, X, Upload, Eye } from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import ModernDatePicker from '../../components/ModernDatePicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import CustomSelect from '../../components/CustomSelect';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';

const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const SaleAdminTransfers = () => {
  const { toasts, removeToast, toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [saleTransfers, setSaleTransfers] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [transferForm, setTransferForm] = useState({ sale_user_id: '', transfer_date: '', amount: '', notes: '' });
  const [saleUsers, setSaleUsers] = useState([]);
  
  const [transferImage, setTransferImage] = useState(null);
  const transferFileInputRef = useRef(null);
  
  const [imagePreview, setImagePreview] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    show: false, title: '', message: '', type: 'warning', onConfirm: () => {},
  });

  const loadData = async () => {
    setLoadingTransfers(true);
    try {
      const [transfersRes, usersRes] = await Promise.all([
        getPayrollTransfers(selectedMonth).catch(err => {
          console.error('getPayrollTransfers error:', err);
          return { data: { transfers: [] } };
        }),
        getUsers().catch(err => {
          console.error('getUsers error:', err);
          return { data: [] };
        })
      ]);

      const transfersList = transfersRes.data?.transfers || (Array.isArray(transfersRes.data) ? transfersRes.data : []);
      setSaleTransfers(transfersList);

      const rawUsers = usersRes.data?.users || (Array.isArray(usersRes.data) ? usersRes.data : []);
      const sales = rawUsers.filter(u => {
        if (!u) return false;
        if (Array.isArray(u.roles)) {
          return u.roles.some(r => r === 'saler' || r === 'sale' || r?.name === 'saler' || r?.name === 'sale');
        }
        return u.role === 'saler' || u.role === 'sale';
      });

      setSaleUsers(sales.map(s => ({ id: s.id, name: `${s.full_name || s.username} (${s.username})` })));
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setLoadingTransfers(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedMonth]);

  const openTransferModal = (item = null) => {
    setEditingTransfer(item);
    if (item) {
      setTransferForm({
        sale_user_id: item.sale_user_id || '',
        transfer_date: item.transfer_date ? item.transfer_date.split('T')[0] : '',
        amount: item.amount || '',
        notes: item.notes || ''
      });
      setTransferImage(null);
    } else {
      setTransferForm({ sale_user_id: saleUsers[0]?.id || '', transfer_date: `${selectedMonth}-01`, amount: '', notes: '' });
      setTransferImage(null);
    }
    setShowTransferModal(true);
  };

  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.sale_user_id) { toast.error('Vui lòng chọn nhân viên Sale'); return; }
    if (!transferForm.amount || transferForm.amount <= 0) { toast.error('Vui lòng nhập số tiền hợp lệ'); return; }
    
    try {
      const payload = { ...transferForm, month: selectedMonth };
      let newTransfer = null;
      if (editingTransfer) {
        await updatePayrollTransfer(editingTransfer.id, payload);
        toast.success('Đã cập nhật lệnh chuyển tiền');
        newTransfer = { ...editingTransfer };
      } else {
        const res = await createPayrollTransfer(payload);
        toast.success('Đã lưu lệnh chuyển tiền mới');
        newTransfer = res.data;
      }

      if (transferImage && transferImage.dataUri && newTransfer) {
        const transferId = editingTransfer ? editingTransfer.id : newTransfer.id;
        await uploadPayrollTransferImage(transferId, transferImage.dataUri, transferImage.file?.name);
        toast.success('Đã tải ảnh lên thành công');
      }

      setShowTransferModal(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Lỗi khi lưu lệnh chuyển tiền');
    }
  };

  const handleDeleteTransfer = (id) => {
    setConfirmModal({
      show: true, title: 'Xóa lệnh chuyển tiền', message: 'Bạn có chắc chắn muốn xóa?', type: 'danger',
      onConfirm: async () => {
        try {
          await deletePayrollTransfer(id);
          toast.success('Đã xóa lệnh chuyển tiền');
          loadData();
        } catch (err) { toast.error('Lỗi khi xóa'); }
      }
    });
  };

  const safeTransfersList = Array.isArray(saleTransfers) ? saleTransfers : [];
  const totalTransferAmount = safeTransfersList.reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Sổ chuyển tiền</h1>
            <p className="text-sm text-gray-500 mt-1">Theo dõi tiền Sale chuyển cho Admin trong tháng {selectedMonth}</p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <ModernMonthPicker value={selectedMonth} onChange={setSelectedMonth} className="w-full md:w-48" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
             <div>
               <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tổng đã nhận</p>
               <p className="text-2xl font-extrabold text-teal-600 mt-0.5">{fmtVND(totalTransferAmount)}</p>
             </div>
             <div className="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center">
               <Send size={24} className="text-teal-600" />
             </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center">
                  <Send size={16} className="text-teal-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Danh sách các lần chuyển</h3>
             </div>
             <button onClick={() => openTransferModal()} className="flex justify-center items-center gap-2 text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 px-4 py-2.5 rounded-xl transition-all shadow-sm">
                <Plus size={16} /> Thêm mới
             </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Ngày chuyển</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Sale</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-right">Số tiền</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Minh chứng</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase">Ghi chú</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingTransfers ? (
                   <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400">Đang tải...</td></tr>
                ) : safeTransfersList.length === 0 ? (
                   <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400">Chưa có giao dịch nào trong tháng này</td></tr>
                ) : (
                   safeTransfersList.map(item => (
                     <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-600">{item.transfer_date ? new Date(item.transfer_date).toLocaleDateString('vi-VN') : ''}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.sale_full_name || item.sale_username || '-'}</td>
                        <td className="px-6 py-4 text-sm font-bold text-teal-600 text-right">{fmtVND(item.amount)}</td>
                        <td className="px-6 py-4">
                           {item.images && item.images.length > 0 ? (
                             <button onClick={() => setImagePreview(item.images[0])} className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                               <Eye size={12} /> Xem ảnh
                             </button>
                           ) : <span className="text-gray-400 text-xs italic">Không có</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 italic">{item.notes || '-'}</td>
                        <td className="px-6 py-4">
                           <div className="flex justify-end gap-2">
                             <button onClick={() => openTransferModal(item)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200">
                               <Edit size={16} />
                             </button>
                             <button onClick={() => handleDeleteTransfer(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
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

      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
               <h3 className="text-xl font-bold">{editingTransfer ? 'Sửa' : 'Thêm'} giao dịch chuyển tiền</h3>
               <button onClick={() => setShowTransferModal(false)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleSaveTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nhân viên Sale</label>
                <CustomSelect options={saleUsers} value={transferForm.sale_user_id} onChange={v => setTransferForm({...transferForm, sale_user_id: v})} placeholder="Chọn nhân viên" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="block text-sm font-medium mb-1">Ngày chuyển</label>
                   <ModernDatePicker value={transferForm.transfer_date} onChange={(date) => setTransferForm({...transferForm, transfer_date: date})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium mb-1">Số tiền</label>
                    <input required type="text" value={formatCurrencyInput(transferForm.amount)} onChange={e => setTransferForm({...transferForm, amount: parseCurrencyInput(e.target.value)})} className="w-full p-2 border rounded-xl bg-gray-50" />
                 </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Ghi chú</label>
                <textarea rows="2" value={transferForm.notes} onChange={e => setTransferForm({...transferForm, notes: e.target.value})} className="w-full p-2 border rounded-xl bg-gray-50" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ảnh minh chứng</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => transferFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors">
                    <Upload size={16} /> Chọn ảnh mới
                  </button>
                  {transferImage?.dataUri && (
                    <img src={transferImage.dataUri} alt="Preview" className="h-10 w-10 object-cover rounded-lg border border-gray-200" />
                  )}
                </div>
                <input type="file" accept="image/*" ref={transferFileInputRef} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onloadend = () => setTransferImage({ file, dataUri: reader.result });
                  reader.readAsDataURL(file);
                }} className="hidden" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-semibold">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-semibold hover:opacity-90">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setImagePreview(null)}>
          <div className="relative max-w-4xl w-full h-full flex items-center justify-center">
            <button className="absolute top-4 right-4 text-white hover:text-gray-300 z-50 bg-black/50 p-2 rounded-full"><X size={24} /></button>
            <img src={imagePreview} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
          </div>
        </div>
      )}
      
      <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal(prev => ({ ...prev, show: false }))} />
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default SaleAdminTransfers;
