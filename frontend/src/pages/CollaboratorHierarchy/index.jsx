import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Plus, Trash2, Save, RefreshCw, Users } from 'lucide-react';
import {
  createCollaboratorHierarchy,
  deleteCollaboratorHierarchy,
  getCollaboratorHierarchy,
  getUsers,
  updateCollaboratorHierarchy
} from '../../api/client';
import CustomSelect from '../../components/CustomSelect';
import ModernDatePicker from '../../components/ModernDatePicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useToast, ToastContainer } from '../../components/Toast';

const normalizePercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
};

const formatDate = (value) => {
  if (!value) return 'Không giới hạn';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không hợp lệ';
  return date.toLocaleDateString('vi-VN');
};

const CollaboratorHierarchy = () => {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterChildId, setFilterChildId] = useState('');
  const [editingById, setEditingById] = useState({});
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ show: false, type: 'warning', title: '', message: '', onConfirm: null });
  const [form, setForm] = useState({
    child_user_id: '',
    parent_user_id: '',
    share_rate_percent: 5,
    effective_from: '',
    effective_to: '',
    is_active: true
  });

  const { toast, toasts, removeToast } = useToast();

  const userOptions = useMemo(() => users.map((user) => ({
    ...user,
    label: user.full_name || user.username,
    value: user.id
  })), [users]);

  const loadUsers = async () => {
    try {
      const response = await getUsers();
      setUsers(response.data.data || response.data || []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể tải danh sách nhân viên');
    }
  };

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const response = await getCollaboratorHierarchy(filterChildId || '');
      const list = response.data || [];
      setItems(list);

      const initialEditing = {};
      for (const item of list) {
        initialEditing[item.id] = {
          parent_user_id: item.parent_user_id,
          share_rate_percent: Number(item.share_rate_percent),
          effective_from: item.effective_from ? String(item.effective_from).slice(0, 10) : '',
          effective_to: item.effective_to ? String(item.effective_to).slice(0, 10) : '',
          is_active: Boolean(item.is_active)
        };
      }
      setEditingById(initialEditing);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể tải dữ liệu phân cấp cộng tác');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadHierarchy();
  }, [filterChildId]);

  const handleCreate = async (event) => {
    event.preventDefault();

    if (!form.child_user_id || !form.parent_user_id) {
      toast.error('Vui lòng chọn người cấp dưới và người cấp trên');
      return;
    }

    if (String(form.child_user_id) === String(form.parent_user_id)) {
      toast.error('Người cấp dưới và người cấp trên không được trùng nhau');
      return;
    }

    if (form.effective_from && form.effective_to && form.effective_from > form.effective_to) {
      toast.error('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
      return;
    }

    setSaving(true);
    try {
      await createCollaboratorHierarchy({
        child_user_id: Number(form.child_user_id),
        parent_user_id: Number(form.parent_user_id),
        share_rate_percent: normalizePercent(form.share_rate_percent),
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
        is_active: Boolean(form.is_active)
      });

      toast.success('Đã tạo quan hệ phân cấp');
      setForm({
        child_user_id: '',
        parent_user_id: '',
        share_rate_percent: 5,
        effective_from: '',
        effective_to: '',
        is_active: true
      });
      await loadHierarchy();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể tạo quan hệ phân cấp');
    } finally {
      setSaving(false);
    }
  };

  const doUpdate = async (id) => {
    const editing = editingById[id];
    if (!editing) return;

    if (String(editing.parent_user_id) === String(items.find((item) => item.id === id)?.child_user_id)) {
      toast.error('Người cấp dưới và người cấp trên không được trùng nhau');
      return;
    }

    setUpdatingId(id);
    try {
      await updateCollaboratorHierarchy(id, {
        parent_user_id: Number(editing.parent_user_id),
        share_rate_percent: normalizePercent(editing.share_rate_percent),
        effective_from: editing.effective_from || null,
        effective_to: editing.effective_to || null,
        is_active: Boolean(editing.is_active)
      });
      toast.success('Đã cập nhật quan hệ phân cấp');
      await loadHierarchy();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể cập nhật quan hệ phân cấp');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdate = (id) => {
    const editing = editingById[id];
    if (!editing) return;

    const childItem = items.find((item) => item.id === id);
    const childLabel = childItem?.child_full_name || childItem?.child_username || `#${childItem?.child_user_id}`;
    const parentUser = users.find((u) => String(u.id) === String(editing.parent_user_id));
    const parentLabel = parentUser ? (parentUser.full_name || parentUser.username) : 'Không xác định';

    setConfirmModal({
      show: true,
      type: 'info',
      title: 'Xác nhận cập nhật',
      message: `Bạn có chắc chắn muốn cập nhật quan hệ phân cấp của "${childLabel}"?\n\nNgười cấp trên: ${parentLabel}\nTỷ lệ chia: ${normalizePercent(editing.share_rate_percent)}%`,
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doUpdate(id);
      }
    });
  };

  const handleDelete = (id) => {
    const childItem = items.find((item) => item.id === id);
    const childLabel = childItem?.child_full_name || childItem?.child_username || `#${childItem?.child_user_id}`;

    setConfirmModal({
      show: true,
      type: 'danger',
      title: 'Xóa quan hệ phân cấp',
      message: `Bạn có chắc chắn muốn xóa quan hệ phân cấp của "${childLabel}"?\n\nHành động này không thể hoàn tác.`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        setDeletingId(id);
        try {
          await deleteCollaboratorHierarchy(id);
          toast.success('Đã xóa quan hệ phân cấp');
          await loadHierarchy();
        } catch (error) {
          toast.error(error.response?.data?.error || 'Không thể xóa quan hệ phân cấp');
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const closeConfirmModal = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, show: false }));
  }, []);

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gradient-to-br from-gray-50 via-white to-amber-50/30 min-h-screen">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <ConfirmationModal
        show={confirmModal.show}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.type === 'danger' ? 'Xóa' : 'Cập nhật'}
        cancelText="Hủy"
        loading={confirmModal.type === 'danger' ? !!deletingId : !!updatingId}
        onConfirm={confirmModal.onConfirm || (() => {})}
        onClose={closeConfirmModal}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
                <GitBranch size={18} className="text-white" />
              </div>
              Phân Cấp Cộng Tác
            </h1>
            <p className="text-gray-500 mt-1.5 ml-12">Quản lý chia sẻ hoa hồng theo cấp trên và cấp dưới</p>
          </div>
          <button
            type="button"
            onClick={loadHierarchy}
            className="h-[38px] px-5 rounded-2xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 hover:border-gray-300 transition-all font-semibold text-sm flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={15} />
            Tải lại
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-sm shrink-0">
                <Plus size={17} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Tạo quan hệ mới</h2>
                <p className="text-xs text-gray-400">Thiết lập tuyến phân cấp</p>
              </div>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Người cấp dưới</label>
                <CustomSelect
                  options={userOptions}
                  value={form.child_user_id}
                  onChange={(value) => setForm((prev) => ({ ...prev, child_user_id: value }))}
                  labelField="label"
                  valueField="value"
                  placeholder="Chọn người cấp dưới"
                  showSearch
                  autoFocusSearch={false}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Người cấp trên</label>
                <CustomSelect
                  options={userOptions.filter((user) => String(user.id) !== String(form.child_user_id))}
                  value={form.parent_user_id}
                  onChange={(value) => setForm((prev) => ({ ...prev, parent_user_id: value }))}
                  labelField="label"
                  valueField="value"
                  placeholder="Chọn người cấp trên"
                  showSearch
                  autoFocusSearch={false}
                />
              </div>

              <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tỷ lệ chia (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.share_rate_percent}
                  onChange={(event) => setForm((prev) => ({ ...prev, share_rate_percent: event.target.value }))}
                  className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ModernDatePicker
                  label="Hiệu lực từ"
                  value={form.effective_from}
                  onChange={(value) => setForm((prev) => ({ ...prev, effective_from: value }))}
                />
                <ModernDatePicker
                  label="Hiệu lực đến"
                  value={form.effective_to}
                  min={form.effective_from || undefined}
                  onChange={(value) => setForm((prev) => ({ ...prev, effective_to: value }))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                Đang hoạt động
              </label>

              <button
                type="submit"
                disabled={saving}
                className={`w-full h-[40px] rounded-2xl font-semibold text-sm text-white transition-all flex items-center justify-center gap-2 ${
                  saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]'
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Tạo phân cấp
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-amber-50/50 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-sm shrink-0">
                  <Users size={17} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Danh sách quan hệ</h2>
                  <p className="text-xs text-gray-400">Cập nhật người cấp trên, tỷ lệ chia và khung thời gian hiệu lực</p>
                </div>
              </div>
              <div className="w-full md:w-72">
                <CustomSelect
                  options={[{ label: 'Tất cả người cấp dưới', value: '' }, ...userOptions]}
                  value={filterChildId}
                  onChange={setFilterChildId}
                  labelField="label"
                  valueField="value"
                  showSearch
                  placeholder="Lọc theo người cấp dưới"
                  autoFocusSearch={false}
                />
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {loading ? (
                <div className="text-sm text-gray-400 py-8 text-center">Đang tải dữ liệu...</div>
              ) : items.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">Chưa có quan hệ nào</div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => {
                    const editing = editingById[item.id] || {};
                    const childLabel = item.child_full_name || item.child_username || `#${item.child_user_id}`;

                    return (
                      <div key={item.id} className="rounded-2xl border border-gray-100 p-5 sm:p-6 hover:border-amber-200 hover:shadow-md transition-all bg-white">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-amber-700">{childLabel.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cấp dưới</p>
                              <p className="text-sm font-bold text-gray-900">{childLabel}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => handleDelete(item.id)}
                            className="h-[32px] px-3.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-500 text-xs font-semibold flex items-center gap-1.5 transition-all hover:border-rose-300 disabled:opacity-50"
                          >
                            {deletingId === item.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-rose-300 border-t-rose-500 rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Xóa
                          </button>
                        </div>

                        <div className="space-y-3">
                          {/* Row 1: Người cấp trên — full width */}
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Người cấp trên</label>
                            <CustomSelect
                              options={userOptions.filter((user) => String(user.id) !== String(item.child_user_id))}
                              value={editing.parent_user_id}
                              onChange={(value) => setEditingById((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], parent_user_id: value }
                              }))}
                              labelField="label"
                              valueField="value"
                              showSearch
                              placeholder="Chọn người cấp trên"
                              autoFocusSearch={false}
                            />
                          </div>

                          {/* Row 2: Tỷ lệ chia (left) + Checkbox & Nút (right) */}
                          <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Tỷ lệ chia (%)</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.0001"
                                value={editing.share_rate_percent ?? 0}
                                onChange={(event) => setEditingById((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], share_rate_percent: event.target.value }
                                }))}
                                className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                              />
                            </div>
                            <div className="flex flex-col sm:flex-col items-stretch sm:items-end gap-3">
                              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={Boolean(editing.is_active)}
                                  onChange={(event) => setEditingById((prev) => ({
                                    ...prev,
                                    [item.id]: { ...prev[item.id], is_active: event.target.checked }
                                  }))}
                                  className="rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                Đang hoạt động
                              </label>
                              <button
                                type="button"
                                disabled={updatingId === item.id}
                                onClick={() => handleUpdate(item.id)}
                                className="h-[35px] w-full sm:w-auto px-5 rounded-xl bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {updatingId === item.id ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Đang cập nhật
                                  </>
                                ) : (
                                  <>
                                    <Save size={14} />
                                    Cập nhật
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Row 3: Hiệu lực — 2 date pickers cạnh nhau */}
                          <div>
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Hiệu lực</label>
                            <div className="grid grid-cols-2 gap-3">
                              <ModernDatePicker
                                value={editing.effective_from || ''}
                                placeholder="Hiệu lực từ"
                                onChange={(value) => setEditingById((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], effective_from: value }
                                }))}
                              />
                              <ModernDatePicker
                                value={editing.effective_to || ''}
                                min={editing.effective_from || undefined}
                                placeholder="Hiệu lực đến"
                                onChange={(value) => setEditingById((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], effective_to: value }
                                }))}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2 text-xs text-gray-500">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${item.is_active ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                          <span>{item.effective_from || item.effective_to ? `Hiệu lực: ${formatDate(item.effective_from)} — ${formatDate(item.effective_to)}` : 'Không giới hạn thời gian'}</span>
                          {item.is_active && (
                            <span className="ml-auto px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold shrink-0">Đang hoạt động</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaboratorHierarchy;
