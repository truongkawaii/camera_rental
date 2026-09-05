import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Calendar, Wrench, X, CheckCircle, Clock } from 'lucide-react';
import { getMaintenance, deleteMaintenance } from '../../../api/client';
import { useToast } from '../../../components/Toast';
import { formatPrice, formatVN } from '../../../utils/formatters';
import MaintenanceModal from './MaintenanceModal';
import DeleteModal from './DeleteModal';

const STATUS_MAP = {
  'Đã lên lịch': { label: 'Đã lên lịch', color: 'bg-blue-100 text-blue-700', icon: Calendar },
  'Đang bảo trì': { label: 'Đang bảo trì', color: 'bg-amber-100 text-amber-700', icon: Clock },
  'Hoàn thành': { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  'Đã hủy': { label: 'Đã hủy', color: 'bg-slate-100 text-slate-700', icon: X }
};

const MaintenanceTab = ({ equipmentList = [] }) => {
  const [maintenances, setMaintenances] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  
  const { toast } = useToast();

  useEffect(() => {
    loadMaintenances();
  }, []);

  const loadMaintenances = async () => {
    setLoading(true);
    try {
      const response = await getMaintenance();
      setMaintenances(response.data || []);
    } catch (error) {
      console.error('Failed to load maintenance records:', error);
      toast.error('Không thể tải danh sách bảo trì');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMaintenance(deleteTarget.id);
      toast.success('Xóa lịch bảo trì thành công');
      setDeleteTarget(null);
      loadMaintenances();
    } catch (error) {
      toast.error('Xóa lịch bảo trì thất bại');
    }
  };

  const formatDateRange = (start, end) => {
    if (!start) return '';
    const startDate = formatVN(start);
    if (!end) return startDate;
    const endDate = formatVN(end);
    return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Lịch Bảo Trì
          </h2>
          <p className="text-sm text-slate-500 mt-1">{maintenances.length} lịch bảo trì</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-orange-500 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors font-semibold shadow-sm text-sm"
        >
          <Plus size={16} />
          Tạo lịch
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="p-4 pl-6">Thiết bị</th>
              <th className="p-4">Nội dung</th>
              <th className="p-4">Thời gian</th>
              <th className="p-4 text-right">Chi phí</th>
              <th className="p-4 text-center">Trạng thái</th>
              <th className="p-4 pr-6 text-right w-[180px]"></th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">Đang tải dữ liệu...</td>
              </tr>
            ) : maintenances.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-500">Chưa có lịch bảo trì nào</td>
              </tr>
            ) : (
              maintenances.map((item) => {
                const statusInfo = STATUS_MAP[item.status] || STATUS_MAP['Đã lên lịch'];
                const StatusIcon = statusInfo.icon;
                
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="font-semibold text-slate-800">{item.equipment_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.equipment_code}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-800">{item.maintenance_type}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.provider || item.description}</div>
                    </td>
                    <td className="p-4 text-slate-600 font-medium whitespace-nowrap">
                      {formatDateRange(item.maintenance_date, item.completed_date)}
                    </td>
                    <td className="p-4 text-right font-bold text-slate-800">
                      {item.maintenance_cost > 0 ? formatPrice(item.maintenance_cost) : '-'}
                    </td>
                    <td className="p-4 text-center">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${statusInfo.color}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75"></span>
                        {statusInfo.label}
                      </div>
                    </td>
                    <td className="p-4 pr-6">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-primary transition-colors"
                        >
                          Hoàn tất
                        </button>
                        <button
                          onClick={() => setDeleteTarget(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                        >
                          Hủy
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <MaintenanceModal
          editingItem={editingItem}
          equipmentList={equipmentList}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            loadMaintenances();
          }}
        />
      )}

      <DeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Xóa lịch bảo trì"
        message={`Bạn có chắc chắn muốn xóa lịch bảo trì cho thiết bị "${deleteTarget?.equipment_name}"?`}
      />
    </div>
  );
};

export default MaintenanceTab;
