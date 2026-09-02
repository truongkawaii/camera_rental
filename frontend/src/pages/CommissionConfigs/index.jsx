import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Percent, Plus, CheckCircle2, Calendar, Save, RefreshCw, SlidersHorizontal, Users, X, UserPlus, ChevronDown, ChevronUp, AlertCircle, Trash2, Pencil } from 'lucide-react';
import {
  activateCommissionConfig,
  deactivateCommissionConfig,
  createCommissionConfig,
  getCommissionConfigs,
  updateCommissionConfig,
  updateCommissionRates,
  getUsers,
  getRuleSetUsers,
  addUserToRuleSet,
  removeUserFromRuleSet,
  deleteCommissionConfig
} from '../../api/client';
import ConfirmationModal from '../../components/ConfirmationModal';
import ModernDatePicker from '../../components/ModernDatePicker';
import { useToast, ToastContainer } from '../../components/Toast';

const toRate = (value) => {
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

const formatRuleName = (name) => {
  return name || '';
};

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  camera_manager: 'Quản lý thiết bị',
  saler: 'Nhân viên sales',
  driver: 'Giao nhận'
};

const formatRoleName = (roleCode) => ROLE_LABELS[roleCode] || roleCode || '';

// ─── Sub-component: User assignment panel ────────────────────────────────────
const UserAssignmentPanel = ({ item, allUsers, toast, onCountChange, reloadParent }) => {
  const [expanded, setExpanded] = useState(false);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [removingUserId, setRemovingUserId] = useState(null);
  const [userToRemove, setUserToRemove] = useState(null);
  const [userToAdd, setUserToAdd] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // Use rule_type directly from the rule set (matches role name in DB)
  const selectedRole = item.rule_type;
  const dropdownRef = useRef(null);

  const loadAssignedUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await getRuleSetUsers(item.id);
      // Deduplicate by user_id + assigned_role (same user can be saler AND driver)
      const seen = new Set();
      const unique = (res.data || []).filter((u) => {
        const key = `${u.id}-${u.assigned_role || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAssignedUsers(unique);
      onCountChange(item.id, unique.length);
    } catch {
      // silently ignore
    } finally {
      setLoadingUsers(false);
    }
  }, [item.id, onCountChange]);

  useEffect(() => {
    if (expanded) loadAssignedUsers();
  }, [expanded, loadAssignedUsers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Track which (userId, role) pairs are already assigned
  const assignedPairs = useMemo(() => {
    const set = new Set();
    for (const u of assignedUsers) {
      set.add(`${u.id}-${u.assigned_role || ''}`);
    }
    return set;
  }, [assignedUsers]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allUsers.filter(
      (u) => !assignedPairs.has(`${u.id}-${selectedRole}`) && (
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q)
      )
    );
  }, [allUsers, assignedPairs, searchQuery, selectedRole]);

  const doAddUser = async (user) => {
    setAddingUser(true);
    try {
      await addUserToRuleSet(item.id, user.id, selectedRole);
      toast.success(`Đã thêm ${user.full_name || user.username} vào vai trò ${formatRoleName(selectedRole)}`);
      await loadAssignedUsers();
      reloadParent?.();
      setUserToAdd(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Không thể thêm nhân viên');
    } finally {
      setAddingUser(false);
    }
  };

  const handleAdd = (user) => {
    setDropdownOpen(false);
    setSearchQuery('');
    setUserToAdd(user);
  };

  const handleRemove = async (user) => {
    if (!user) return;
    setRemovingUserId(user.id);
    try {
      await removeUserFromRuleSet(item.id, user.id, user.assigned_role);
      toast.success(`Đã gỡ ${user.full_name || user.username} khỏi vai trò ${formatRoleName(user.assigned_role)}`);
      await loadAssignedUsers();
      reloadParent?.();
      setUserToRemove(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Không thể gỡ nhân viên');
    } finally {
      setRemovingUserId(null);
    }
  };

  const count = Number(item.assigned_user_count) || assignedUsers.length;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <ConfirmationModal
        show={!!userToRemove}
        type="danger"
        title="Xác nhận gỡ nhân viên"
        message={`Bạn có chắc chắn muốn gỡ nhân viên "${userToRemove?.full_name || userToRemove?.username}" khỏi bộ quy tắc hoa hồng này?`}
        confirmText="Gỡ nhân viên"
        cancelText="Hủy"
        loading={removingUserId === userToRemove?.id}
        onConfirm={() => handleRemove(userToRemove)}
        onClose={() => setUserToRemove(null)}
      />

      <ConfirmationModal
        show={!!userToAdd}
        type="info"
        title="Xác nhận thêm nhân viên"
        message={`Bạn có chắc chắn muốn thêm nhân viên "${userToAdd?.full_name || userToAdd?.username}" vào vai trò ${formatRoleName(selectedRole)}?`}
        confirmText="Thêm nhân viên"
        cancelText="Hủy"
        loading={addingUser}
        onConfirm={() => doAddUser(userToAdd)}
        onClose={() => setUserToAdd(null)}
      />

      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 hover:text-amber-700 transition-colors group"
      >
        <span className="flex items-center gap-2">
          <Users size={15} className="text-amber-600" />
          Nhân viên áp dụng
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
            {count}
          </span>
        </span>
        {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-3 space-y-2 animate-fadeIn">
          {/* Add user row */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              disabled={addingUser || allUsers.length === 0}
              onClick={() => { setDropdownOpen((p) => !p); setSearchQuery(''); }}
              className="w-full h-[34px] px-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingUser ? (
                <>
                  <div className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-600 rounded-full animate-spin" />
                  Đang thêm...
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  + Thêm nhân viên
                </>
              )}
            </button>

            {dropdownOpen && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên hoặc username..."
                    className="w-full h-[30px] px-3 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-xs"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <div className="py-4 text-center text-xs text-gray-400">
                      {allUsers.length === 0 ? 'Không có nhân viên nào' : 'Không tìm thấy nhân viên phù hợp'}
                    </div>
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleAdd(u)}
                        className="w-full px-3 py-2 text-left hover:bg-amber-50 flex items-center gap-2.5 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-amber-700">
                            {(u.full_name || u.username || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-800 truncate">{u.full_name || u.username}</div>
                          <div className="text-[10px] text-gray-400 truncate">{u.username} {u.role_name ? `· ${formatRoleName(u.role_name)}` : ''}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Assigned users list */}
          {loadingUsers ? (
            <div className="text-xs text-gray-400 text-center py-3">Đang tải danh sách...</div>
          ) : assignedUsers.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              Chưa có nhân viên nào được gán — sẽ không có hoa hồng
            </div>
          ) : (
            <div className="space-y-1.5">
              {assignedUsers.map((u) => (
                <div
                  key={`${u.id}-${u.assigned_role || ''}`}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 hover:border-amber-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-amber-700">
                        {(u.full_name || u.username || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">{u.full_name || u.username}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          u.assigned_role === 'saler'
                            ? 'bg-blue-50 text-blue-600 border border-blue-100'
                            : u.assigned_role === 'driver'
                            ? 'bg-purple-50 text-purple-600 border border-purple-100'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {formatRoleName(u.assigned_role)}
                        </span>
                        {u.user_role_name && <span className="text-[10px] text-gray-400">{formatRoleName(u.user_role_name)}</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={removingUserId === u.id}
                    onClick={() => setUserToRemove(u)}
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                    title="Gỡ khỏi bộ quy tắc"
                  >
                    {removingUserId === u.id
                      ? <div className="w-3 h-3 border-2 border-gray-300/40 border-t-gray-500 rounded-full animate-spin" />
                      : <X size={13} />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const CommissionConfigs = () => {
  const [items, setItems] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRates, setEditingRates] = useState({});
  const [savingRateId, setSavingRateId] = useState(null);
  const [userCounts, setUserCounts] = useState({});
  const [confirmModal, setConfirmModal] = useState({ show: false, type: 'info', title: '', message: '', onConfirm: null });
  const [form, setForm] = useState({
    name: '',
    rule_type: 'saler',
    effective_from: '',
    effective_to: '',
    saler_rate: 30,
    driver_rate: 5,
    is_active: false
  });
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingForm, setEditingForm] = useState({ name: '', effective_from: '', effective_to: '' });

  const { toast, toasts, removeToast } = useToast();

  const activeSalerCount = useMemo(() => items.filter((item) => item.is_active && item.rule_type === 'saler').length, [items]);
  const activeDriverCount = useMemo(() => items.filter((item) => item.is_active && item.rule_type === 'driver').length, [items]);

  const handleCountChange = useCallback((ruleSetId, count) => {
    setUserCounts((prev) => ({ ...prev, [ruleSetId]: count }));
  }, []);

  const loadData = async () => {
    setLoading(true);
    setUserCounts({}); // Reset counts so backend assigned_user_count takes priority
    try {
      const [configRes, usersRes] = await Promise.all([
        getCommissionConfigs(),
        getUsers()
      ]);
      const list = configRes.data || [];
      setItems(list);
      setAllUsers(usersRes.data || []);

      const initialEditing = {};
      for (const item of list) {
        const rate = Number(item.rate_percent) || 0;
        initialEditing[item.id] = {
          saler: item.rule_type === 'saler' ? rate : 0,
          driver: item.rule_type === 'driver' ? rate : 0
        };
      }
      setEditingRates(initialEditing);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể tải cấu hình hoa hồng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const doCreate = async () => {
    setSaving(true);
    try {
      const ratePayload = form.rule_type === 'saler'
        ? { saler: toRate(form.saler_rate) }
        : { driver: toRate(form.driver_rate) };

      await createCommissionConfig({
        name: form.name.trim(),
        rule_type: form.rule_type,
        is_active: Boolean(form.is_active),
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
        rates: ratePayload
      });

      toast.success('Đã tạo bộ quy tắc hoa hồng');
      setForm({
        name: '',
        rule_type: 'saler',
        effective_from: '',
        effective_to: '',
        saler_rate: 30,
        driver_rate: 5,
        is_active: false
      });
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể tạo bộ quy tắc');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('Vui lòng nhập tên bộ quy tắc');
      return;
    }

    if (form.effective_from && form.effective_to && form.effective_from > form.effective_to) {
      toast.error('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
      return;
    }

    const rateLabel = form.rule_type === 'saler' ? 'Nhân viên sales' : 'Giao nhận';
    const rateValue = form.rule_type === 'saler' ? toRate(form.saler_rate) : toRate(form.driver_rate);

    setConfirmModal({
      show: true,
      type: 'info',
      title: 'Xác nhận tạo bộ quy tắc',
      message: `Bạn có chắc chắn muốn tạo bộ quy tắc "${form.name.trim()}"?\n\nLoại: ${rateLabel}\nTỷ lệ: ${rateValue}%${form.is_active ? '\nTrạng thái: Kích hoạt ngay' : ''}`,
      confirmText: 'Tạo bộ quy tắc',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doCreate();
      }
    });
  };

  const doActivate = async (id) => {
    try {
      await activateCommissionConfig(id);
      toast.success('Đã kích hoạt bộ quy tắc');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể kích hoạt bộ quy tắc');
    }
  };

  const handleActivate = (id) => {
    const item = items.find((i) => i.id === id);
    setConfirmModal({
      show: true,
      type: 'info',
      title: 'Xác nhận kích hoạt',
      message: `Bạn có chắc chắn muốn kích hoạt bộ quy tắc "${formatRuleName(item?.name)}"?\n\nBộ quy tắc này sẽ được áp dụng ngay khi có rental mới.`,
      confirmText: 'Kích hoạt',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doActivate(id);
      }
    });
  };

  const doDeactivate = async (id) => {
    try {
      await deactivateCommissionConfig(id);
      toast.success('Đã hủy kích hoạt bộ quy tắc');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể hủy kích hoạt bộ quy tắc');
    }
  };

  const handleDeactivate = (id) => {
    const item = items.find((i) => i.id === id);
    setConfirmModal({
      show: true,
      type: 'warning',
      title: 'Xác nhận hủy kích hoạt',
      message: `Bạn có chắc chắn muốn hủy kích hoạt bộ quy tắc "${formatRuleName(item?.name)}"?\n\nHoa hồng sẽ không được tính cho nhân viên thuộc bộ quy tắc này nữa.`,
      confirmText: 'Hủy kích hoạt',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doDeactivate(id);
      }
    });
  };

  // ─── Unified edit mode ──────────────────────────────────────────────────────
  const handleStartEdit = (item) => {
    setEditingItemId(item.id);
    setEditingForm({
      name: item.name || '',
      effective_from: item.effective_from || '',
      effective_to: item.effective_to || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingForm({ name: '', effective_from: '', effective_to: '' });
  };

  const doSaveItem = async (id) => {
    try {
      const item = items.find((i) => i.id === id);
      const isSaler = item?.rule_type === 'saler';
      const updates = {};

      if (editingForm.name.trim() && editingForm.name.trim() !== item?.name) {
        updates.name = editingForm.name.trim();
      }

      const fromChanged = (editingForm.effective_from || null) !== (item?.effective_from || null);
      const toChanged = (editingForm.effective_to || null) !== (item?.effective_to || null);

      if (fromChanged || toChanged) {
        updates.effective_from = editingForm.effective_from || null;
        updates.effective_to = editingForm.effective_to || null;
      }

      // Save name & dates
      if (Object.keys(updates).length > 0) {
        await updateCommissionConfig(id, updates);
      }

      // Save rate if changed
      const target = editingRates[id] || { saler: 0, driver: 0 };
      const newRate = isSaler ? toRate(target.saler) : toRate(target.driver);
      const currentRate = Number(item?.rate_percent) || 0;
      if (newRate !== currentRate) {
        const payload = isSaler ? { saler: newRate } : { driver: newRate };
        await updateCommissionRates(id, payload);
        // Update local state
        setItems((prev) => prev.map((it) =>
          it.id === id ? { ...it, rate_percent: newRate } : it
        ));
        setEditingRates((prev) => ({
          ...prev,
          [id]: {
            saler: isSaler ? newRate : 0,
            driver: isSaler ? 0 : newRate
          }
        }));
      }

      toast.success('Đã cập nhật bộ quy tắc');
      setEditingItemId(null);
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể cập nhật bộ quy tắc');
    }
  };

  const handleSaveItem = (id) => {
    const trimmed = editingForm.name.trim();
    if (!trimmed) {
      toast.error('Tên bộ quy tắc không được để trống');
      return;
    }

    if (editingForm.effective_from && editingForm.effective_to && editingForm.effective_from > editingForm.effective_to) {
      toast.error('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc');
      return;
    }

    const item = items.find((i) => i.id === id);
    setConfirmModal({
      show: true,
      type: 'info',
      title: 'Xác nhận lưu thay đổi',
      message: `Bạn có chắc chắn muốn lưu thay đổi cho bộ quy tắc "${formatRuleName(item?.name)}"?`,
      confirmText: 'Lưu thay đổi',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doSaveItem(id);
      }
    });
  };

  const doDelete = async (id) => {
    try {
      await deleteCommissionConfig(id);
      toast.success('Đã xóa bộ quy tắc thành công');
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể xóa bộ quy tắc');
    }
  };

  const handleDelete = (id) => {
    const item = items.find((i) => i.id === id);
    setConfirmModal({
      show: true,
      type: 'danger',
      title: 'Xác nhận xóa bộ quy tắc',
      message: `Bạn có chắc chắn muốn xóa bộ quy tắc "${formatRuleName(item?.name)}"?\n\nHành động này không thể hoàn tác và toàn bộ phân công nhân viên liên quan sẽ bị gỡ bỏ.`,
      confirmText: 'Xóa bộ quy tắc',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doDelete(id);
      }
    });
  };

  const doRateSave = async (id) => {
    const target = editingRates[id] || { saler: 0, driver: 0 };
    const item = items.find((i) => i.id === id);
    const isSaler = item?.rule_type === 'saler';
    setSavingRateId(id);
    try {
      const newRate = isSaler ? toRate(target.saler) : toRate(target.driver);
      const payload = isSaler
        ? { saler: newRate }
        : { driver: newRate };
      await updateCommissionRates(id, payload);
      toast.success('Cập nhật tỷ lệ thành công');

      // Lightweight reload: refresh just the configs list without loading overlay
      try {
        const configRes = await getCommissionConfigs();
        const list = configRes.data || [];
        setItems(list);
        // Sync editingRates with fresh data
        const initialEditing = { ...editingRates };
        for (const it of list) {
          const rate = Number(it.rate_percent) || 0;
          if (!initialEditing[it.id]) {
            initialEditing[it.id] = {
              saler: it.rule_type === 'saler' ? rate : 0,
              driver: it.rule_type === 'driver' ? rate : 0
            };
          }
        }
        setEditingRates(initialEditing);
      } catch {
        // Fallback: keep local state update if reload fails
        setItems((prev) => prev.map((it) =>
          it.id === id ? { ...it, rate_percent: newRate } : it
        ));
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Không thể cập nhật tỷ lệ');
    } finally {
      setSavingRateId(null);
    }
  };

  const handleRateSave = (id) => {
    const target = editingRates[id] || { saler: 0, driver: 0 };
    const item = items.find((i) => i.id === id);
    const isSaler = item?.rule_type === 'saler';
    const rateLabel = isSaler ? 'Nhân viên sales' : 'Giao nhận';
    const rateValue = isSaler ? toRate(target.saler) : toRate(target.driver);

    setConfirmModal({
      show: true,
      type: 'info',
      title: 'Xác nhận lưu tỷ lệ',
      message: `Bạn có chắc chắn muốn cập nhật tỷ lệ hoa hồng cho bộ quy tắc "${formatRuleName(item?.name)}"?\n\n${rateLabel}: ${rateValue}%`,
      confirmText: 'Lưu tỷ lệ',
      onConfirm: () => {
        setConfirmModal((prev) => ({ ...prev, show: false }));
        doRateSave(id);
      }
    });
  };

  const closeConfirmModal = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, show: false }));
  }, []);

  // Merge live userCounts into items for display and sort default (is_active) to the top
  const itemsWithCounts = useMemo(() => {
    const list = items.map((item) => ({
      ...item,
      assigned_user_count: userCounts[item.id] ?? item.assigned_user_count ?? 0
    }));
    return [...list].sort((a, b) => {
      // 1. is_active DESC
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      // 2. rule_type ASC
      if (a.rule_type !== b.rule_type) {
        return a.rule_type.localeCompare(b.rule_type);
      }
      // 3. id DESC
      return b.id - a.id;
    });
  }, [items, userCounts]);

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gradient-to-br from-gray-50 via-white to-amber-50/30 min-h-screen">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <ConfirmationModal
        show={confirmModal.show}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText || "Xác nhận"}
        cancelText="Hủy"
        loading={confirmModal.loading || !!savingRateId}
        onConfirm={confirmModal.onConfirm || (() => {})}
        onClose={closeConfirmModal}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-md shadow-primary/20">
                <Percent size={22} className="text-white" />
              </div>
              Cấu Hình Hoa Hồng
            </h1>
            <p className="text-gray-500 mt-1.5 ml-12">Quản lý bộ quy tắc hoa hồng và phân công nhân viên áp dụng</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="h-[38px] px-5 rounded-2xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-100 hover:border-gray-300 transition-all font-semibold text-sm flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={15} />
            Tải lại
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Create form ── */}
          <div className="lg:col-span-1 bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-sm">
                <Plus size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Tạo bộ quy tắc mới</h2>
                <p className="text-xs text-gray-400">Thiết lập tỷ lệ hoa hồng mới</p>
              </div>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tên bộ quy tắc</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="VD: Quy tắc Quý 3/2026"
                />
              </div>

              {/* Rule type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Loại quy tắc</label>
                <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, rule_type: 'saler' }))}
                    className={`flex-1 h-[32px] rounded-lg text-xs font-semibold transition-all ${
                      form.rule_type === 'saler'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    🛒 Nhân viên sales
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, rule_type: 'driver' }))}
                    className={`flex-1 h-[32px] rounded-lg text-xs font-semibold transition-all ${
                      form.rule_type === 'driver'
                        ? 'bg-purple-500 text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    🚚 Giao nhận
                  </button>
                </div>
              </div>

              {/* Single rate input based on rule_type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {form.rule_type === 'saler' ? 'Nhân viên sales (%)' : 'Giao nhận (%)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.rule_type === 'saler' ? form.saler_rate : form.driver_rate}
                  onChange={(event) => setForm((prev) => (
                    form.rule_type === 'saler'
                      ? { ...prev, saler_rate: event.target.value }
                      : { ...prev, driver_rate: event.target.value }
                  ))}
                  className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                Kích hoạt ngay sau khi tạo
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
                    Tạo bộ quy tắc
                  </>
                )}
              </button>
            </form>

            {/* Legend */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                <span className="font-semibold text-gray-500">Lưu ý:</span> Chỉ bộ quy tắc <span className="text-emerald-600 font-semibold">Đang dùng</span> mới được áp dụng khi tính hoa hồng trong rental. Nhân viên phải được gán vào bộ quy tắc đang kích hoạt để nhận hoa hồng.
              </p>
            </div>
          </div>

          {/* ── Rule sets list ── */}
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-3xl shadow-sm">
            <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-amber-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-t-3xl">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-sm shrink-0">
                  <SlidersHorizontal size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Danh sách bộ quy tắc</h2>
                  <p className="text-xs text-gray-400">Chỉnh sửa tỷ lệ, kích hoạt và phân công nhân viên</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {activeSalerCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-xs font-semibold">
                    <CheckCircle2 size={14} />
                    Nhân viên sales: {activeSalerCount} bộ đang dùng
                  </div>
                )}
                {activeDriverCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-100 bg-purple-50 text-purple-700 text-xs font-semibold">
                    <CheckCircle2 size={14} />
                    Giao nhận: {activeDriverCount} bộ đang dùng
                  </div>
                )}
                {activeSalerCount === 0 && activeDriverCount === 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-100 bg-amber-50 text-amber-700 text-xs font-semibold">
                    <AlertCircle size={14} />
                    Chưa có bộ quy tắc nào được kích hoạt
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {loading ? (
                <div className="text-sm text-gray-400 py-8 text-center">Đang tải danh sách...</div>
              ) : items.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">Chưa có bộ quy tắc nào</div>
              ) : (
                <div className="space-y-4">
                  {itemsWithCounts.map((item) => {
                    const editing = editingRates[item.id] || { saler: 0, driver: 0 };
                    const isSaler = item.rule_type === 'saler';
                    const rateValue = isSaler ? toRate(editing.saler) : toRate(editing.driver);
                    const rateLabel = isSaler ? 'Nhân viên sales' : 'Giao nhận';

                    return (
                      <div key={item.id} className={`rounded-2xl border p-5 sm:p-6 hover:shadow-md transition-all bg-white ${
                        isSaler ? 'border-blue-100 hover:border-blue-300' : 'border-purple-100 hover:border-purple-300'
                      }`}>
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${
                              isSaler ? 'bg-gradient-to-br from-blue-100 to-cyan-100' : 'bg-gradient-to-br from-purple-100 to-pink-100'
                            }`}>
                              <SlidersHorizontal size={18} className={isSaler ? 'text-blue-700' : 'text-purple-700'} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {editingItemId === item.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editingForm.name}
                                      onChange={(e) => setEditingForm((prev) => ({ ...prev, name: e.target.value }))}
                                      className="h-[28px] px-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-900 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') handleCancelEdit();
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <h3 className="text-sm font-bold text-gray-900">
                                    {formatRuleName(item.name)}
                                  </h3>
                                )}
                                {/* Rule type badge */}
                                <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  isSaler
                                    ? 'bg-blue-50 border-blue-100 text-blue-700'
                                    : 'bg-purple-50 border-purple-100 text-purple-700'
                                }`}>
                                  {isSaler ? '🛒 Nhân viên sales' : '🚚 Giao nhận'}
                                </span>
                                {item.is_active && (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700 uppercase">
                                    <CheckCircle2 size={13} /> Đang dùng
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5 text-xs text-gray-500 flex items-center gap-1.5">
                                <Calendar size={12} />
                                {editingItemId === item.id ? (
                                  <span className="text-amber-600 font-medium">Đang chỉnh sửa...</span>
                                ) : item.effective_from || item.effective_to ? (
                                  <>{formatDate(item.effective_from)} — {formatDate(item.effective_to)}</>
                                ) : (
                                  <span>Không giới hạn thời gian</span>
                                )}
                              </div>
                              {/* Rate badge - view mode only */}
                              {editingItemId !== item.id && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                                    isSaler
                                      ? 'bg-blue-50 border-blue-100 text-blue-700'
                                      : 'bg-purple-50 border-purple-100 text-purple-700'
                                  }`}>
                                    {rateLabel} {rateValue}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end md:self-auto">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="h-[32px] px-3.5 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 text-gray-600 hover:text-primary text-xs font-semibold transition-all hover:shadow-sm active:scale-[0.97] flex items-center gap-1.5"
                              title="Sửa bộ quy tắc"
                            >
                              <Pencil size={13} />
                              Sửa
                            </button>
                            {!item.is_active ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleActivate(item.id)}
                                  className="h-[32px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all hover:shadow-md active:scale-[0.97]"
                                >
                                  Kích hoạt
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item.id)}
                                  className="h-[32px] w-[32px] rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50 text-red-500 flex items-center justify-center transition-all hover:shadow-sm active:scale-[0.97]"
                                  title="Xóa bộ quy tắc"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDeactivate(item.id)}
                                className="h-[32px] px-3.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold transition-all hover:shadow-sm active:scale-[0.97]"
                                title="Hủy kích hoạt"
                              >
                                Hủy kích hoạt
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Unified edit panel */}
                        {editingItemId === item.id && (
                          <div className="mt-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/50 animate-fadeIn space-y-4">
                            <div className="flex items-center gap-2">
                              <Pencil size={14} className="text-amber-600" />
                              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Chỉnh sửa bộ quy tắc</span>
                            </div>

                            {/* Edit name */}
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Tên bộ quy tắc</label>
                              <input
                                type="text"
                                value={editingForm.name}
                                onChange={(e) => setEditingForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                                placeholder="Tên bộ quy tắc"
                              />
                            </div>

                            {/* Edit dates */}
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Thời gian hiệu lực</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <ModernDatePicker
                                  label="Từ ngày"
                                  value={editingForm.effective_from}
                                  onChange={(value) => setEditingForm((prev) => ({ ...prev, effective_from: value }))}
                                />
                                <ModernDatePicker
                                  label="Đến ngày"
                                  value={editingForm.effective_to}
                                  min={editingForm.effective_from || undefined}
                                  onChange={(value) => setEditingForm((prev) => ({ ...prev, effective_to: value }))}
                                />
                              </div>
                            </div>

                            {/* Edit rate */}
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">{rateLabel} (%)</label>
                              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={isSaler ? editing.saler : editing.driver}
                                  onChange={(event) => setEditingRates((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      [isSaler ? 'saler' : 'driver']: event.target.value
                                    }
                                  }))}
                                  className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                />
                                <div />
                              </div>
                            </div>

                            <div className="flex items-center gap-2 justify-end flex-wrap pt-1">
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="h-[32px] px-4 rounded-xl border border-gray-200 bg-white text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-all whitespace-nowrap"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveItem(item.id)}
                                className="h-[32px] px-4 rounded-xl bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Save size={13} />
                                Lưu thay đổi
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Rates row - view mode only (shown when NOT editing) */}
                        {editingItemId !== item.id && (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-gray-500 mb-1">{rateLabel} (%)</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={isSaler ? editing.saler : editing.driver}
                                onChange={(event) => setEditingRates((prev) => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    [isSaler ? 'saler' : 'driver']: event.target.value
                                  }
                                }))}
                                className="w-full h-[35px] px-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                type="button"
                                disabled={savingRateId === item.id}
                                onClick={() => handleRateSave(item.id)}
                                className="h-[35px] px-5 rounded-xl bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                              >
                                {savingRateId === item.id ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Đang lưu...
                                  </>
                                ) : (
                                  <>
                                    <Save size={14} />
                                    Lưu tỷ lệ
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* User assignment panel */}
                        <UserAssignmentPanel
                          item={item}
                          allUsers={allUsers}
                          toast={toast}
                          onCountChange={handleCountChange}
                          reloadParent={loadData}
                        />
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

export default CommissionConfigs;
