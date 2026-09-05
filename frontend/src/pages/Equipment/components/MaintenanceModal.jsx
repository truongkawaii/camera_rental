import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon } from 'lucide-react';
import { createMaintenance, updateMaintenance } from '../../../api/client';
import { useToast } from '../../../components/Toast';
import CustomSelect from '../../../components/CustomSelect';

const EMPTY_FORM = {
  equipment_id: '',
  maintenance_type: '',
  maintenance_date: new Date().toISOString().split('T')[0],
  completed_date: new Date().toISOString().split('T')[0],
  maintenance_cost: 0,
  provider: '',
  status: 'Đã lên lịch',
  description: '',
  notes: ''
};

const STATUS_OPTIONS = [
  { id: 'Đã lên lịch', name: 'Đã lên lịch' },
  { id: 'Đang bảo trì', name: 'Đang bảo trì' },
  { id: 'Hoàn thành', name: 'Hoàn thành' },
  { id: 'Đã hủy', name: 'Đã hủy' }
];

const MaintenanceModal = ({ editingItem, equipmentList = [], onClose, onSuccess }) => {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    if (editingItem) {
      setFormData({
        equipment_id: editingItem.equipment_id,
        maintenance_type: editingItem.maintenance_type || '',
        maintenance_date: editingItem.maintenance_date ? editingItem.maintenance_date.split('T')[0] : '',
        completed_date: editingItem.completed_date ? editingItem.completed_date.split('T')[0] : '',
        maintenance_cost: editingItem.maintenance_cost || 0,
        provider: editingItem.provider || '',
        status: editingItem.status || 'Đã lên lịch',
        description: editingItem.description || '',
        notes: editingItem.notes || ''
      });
    }
    return () => { document.body.style.overflow = ''; };
  }, [editingItem]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.equipment_id) {
      toast.error('Vui lòng chọn thiết bị');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await updateMaintenance(editingItem.id, formData);
        toast.success('Cập nhật lịch bảo trì thành công');
      } else {
        await createMaintenance(formData);
        toast.success('Tạo lịch bảo trì thành công');
      }
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const equipmentOptions = equipmentList.map(eq => ({
    id: eq.id,
    name: `${eq.name} (${eq.code})`
  }));

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center z-[200] p-4 sm:p-6 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl w-full max-w-6xl shadow-2xl relative my-auto overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-200/60 bg-white flex justify-between items-center sticky top-0 z-10">
          <div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800 flex items-center gap-1.5 text-sm font-medium transition-colors mb-2">
              ← Quay lại
            </button>
            <h2 className="text-2xl font-bold text-slate-800">
              {editingItem ? 'Chỉnh sửa lịch bảo trì' : 'Tạo lịch bảo trì'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">Nhập đầy đủ thông tin nghiệp vụ trước khi lưu.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 flex flex-col lg:flex-row gap-8">
          {/* Main Form Area */}
          <div className="flex-1 bg-white p-8 rounded-2xl border border-slate-200/60 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-800 mb-6">Thông tin bảo trì</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Thiết bị</label>
                <CustomSelect
                  options={equipmentOptions}
                  value={formData.equipment_id}
                  onChange={(val) => setFormData({ ...formData, equipment_id: val })}
                  placeholder="Chọn thiết bị..."
                  showSearch={true}
                  className="h-[42px]"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Loại bảo trì</label>
                <input
                  type="text"
                  placeholder="Bảo dưỡng định kỳ"
                  value={formData.maintenance_type}
                  onChange={(e) => setFormData({ ...formData, maintenance_type: e.target.value })}
                  className="w-full h-[42px] px-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Ngày bắt đầu</label>
                <div className="relative">
                  <CalendarIcon size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={formData.maintenance_date}
                    onChange={(e) => setFormData({ ...formData, maintenance_date: e.target.value })}
                    className="w-full h-[42px] pl-4 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Ngày kết thúc</label>
                <div className="relative">
                  <CalendarIcon size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={formData.completed_date}
                    onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })}
                    className="w-full h-[42px] pl-4 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Chi phí</label>
                <input
                  type="number"
                  min="0"
                  value={formData.maintenance_cost}
                  onChange={(e) => setFormData({ ...formData, maintenance_cost: e.target.value })}
                  className="w-full h-[42px] px-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Nhà cung cấp</label>
                <input
                  type="text"
                  placeholder="Tên đơn vị"
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                  className="w-full h-[42px] px-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Trạng thái</label>
                <CustomSelect
                  options={STATUS_OPTIONS}
                  value={formData.status}
                  onChange={(val) => setFormData({ ...formData, status: val })}
                  className="h-[42px]"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-xs font-semibold text-slate-700 mb-2">Nội dung</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
            </div>

            <div className="mt-6">
              <label className="block text-xs font-semibold text-slate-700 mb-2">Ghi chú</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full p-4 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="w-full lg:w-80 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm sticky top-0">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Lưu thay đổi</h3>
              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-bold shadow-sm flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {saving ? 'Đang lưu...' : (
                  <>
                    <span className="text-lg leading-none mt-[-2px]">✓</span>
                    {editingItem ? 'Cập nhật' : 'Tạo mới'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaintenanceModal;
