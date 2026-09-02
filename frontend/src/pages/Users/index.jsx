import React, { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser, getRoles, getBranches, getAllRuleSetUsers } from '../../api/client';
import { Plus, User, Shield, ShieldCheck, Mail, Lock, Edit2, Trash2, X, AlertTriangle, Store, CheckSquare, Square } from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';

const ROLE_LABEL = {
  admin: { label: 'Quản trị viên', color: 'orange' },
  camera_manager: { label: 'Quản lý Camera', color: 'purple' },
  investor: { label: 'Nhà đầu tư', color: 'green' },
  saler: { label: 'Nhân viên bán hàng', color: 'blue' },
  driver: { label: 'Giao nhận máy', color: 'cyan' },
};

const ROLE_COLORS = {
  orange: { badge: 'bg-orange-100 text-orange-700', icon: 'bg-orange-50 text-orange-600' },
  purple: { badge: 'bg-purple-100 text-purple-700', icon: 'bg-purple-50 text-purple-600' },
  green:  { badge: 'bg-emerald-100 text-emerald-700', icon: 'bg-emerald-50 text-emerald-600' },
  blue:   { badge: 'bg-blue-100 text-blue-700',     icon: 'bg-blue-50 text-blue-600'   },
  cyan:   { badge: 'bg-cyan-100 text-cyan-700',     icon: 'bg-cyan-50 text-cyan-600'   },
};

const getPrimaryColor = (roles = []) => {
  if (roles.some(r => r.name === 'admin'))          return 'orange';
  if (roles.some(r => r.name === 'camera_manager')) return 'purple';
  if (roles.some(r => r.name === 'investor'))       return 'green';
  return 'blue';
};

const EMPTY_FORM = {
  username: '', password: '', full_name: '',
  role_ids: [], branch_ids: [], base_salary: 0
};

// ── Multi-Role Checkbox Picker ──────────────────────────────────────────────
function RolePicker({ roles, selected, onChange }) {
  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter(r => r !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {roles.map(role => {
        const meta = ROLE_LABEL[role.name] || { label: role.name, color: 'blue' };
        const colors = ROLE_COLORS[meta.color];
        const checked = selected.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => toggle(role.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all text-left
              ${checked
                ? `border-${meta.color}-400 ${colors.badge} font-semibold shadow-sm`
                : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
              }`}
          >
            {checked
              ? <CheckSquare size={18} className={`text-${meta.color}-500 shrink-0`} />
              : <Square size={18} className="text-gray-300 shrink-0" />
            }
            <span className="text-sm">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Multi-Branch Checkbox Picker ───────────────────────────────────────────
function BranchPicker({ branches, selected, onChange }) {
  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter(bid => bid !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      {branches.map(branch => {
        const checked = selected.includes(branch.id);
        return (
          <button
            key={branch.id}
            type="button"
            onClick={() => toggle(branch.id)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all text-left
              ${checked
                ? 'border-primary-400 bg-primary-50/50 text-primary-700 font-semibold shadow-sm'
                : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200'
              }`}
          >
            {checked
              ? <CheckSquare size={18} className="text-primary-500 shrink-0" />
              : <Square size={18} className="text-gray-300 shrink-0" />
            }
            <span className="text-sm">{branch.name}</span>
          </button>
        );
      })}
    </div>
  );
}

const Users = () => {
  const [users, setUsers]           = useState([]);
  const [roles, setRoles]           = useState([]);
  const [branches, setBranches]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]     = useState(false);
  const [userCommissionMap, setUserCommissionMap] = useState({});

  const { toasts, toast, removeToast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, branchesRes] = await Promise.all([
        getUsers(), getRoles(), getBranches()
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setBranches(branchesRes.data);

      // Build user → commission config map (single API call instead of N+1)
      const map = {};
      const assignedUsers = (await getAllRuleSetUsers()).data || [];

      // Deduplicate by user_id + assigned_role (backend may return duplicates due to JOINs)
      const seen = new Set();
      assignedUsers.forEach(u => {
        const key = `${u.user_id}-${u.assigned_role || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (!map[u.user_id]) map[u.user_id] = [];
        map[u.user_id].push({
          ruleSetId: u.rule_set_id,
          ruleSetName: u.rule_set_name,
          ruleType: u.rule_type,
          ratePercent: u.rate_percent,
          assignedRole: u.assigned_role,
          isActive: u.is_active
        });
      });

      setUserCommissionMap(map);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Không thể tải danh sách tài khoản');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      username: item.username,
      password: '',
      full_name: item.full_name || '',
      role_ids: (item.roles || []).map(r => r.id),
      branch_ids: (item.branches || []).map(b => b.id),
      base_salary: item.base_salary || 0
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingItem && !formData.password) {
      toast.error('Vui lòng nhập mật khẩu cho tài khoản mới');
      return;
    }
    if (formData.role_ids.length === 0) {
      toast.error('Vui lòng chọn ít nhất một vai trò');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await updateUser(editingItem.id, formData);
        toast.success('Cập nhật tài khoản thành công');
      } else {
        await createUser(formData);
        toast.success('Tạo tài khoản thành công');
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to save user:', error);
      toast.error(error.response?.data?.error || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Đã xóa tài khoản');
      loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error(error.response?.data?.error || 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Quản Lý Tài Khoản</h1>
            <p className="text-gray-500 mt-1">Quản lý đội ngũ nhân viên và phân quyền hệ thống</p>
          </div>
          <button
            onClick={openAddModal}
            className="h-[35px] w-full md:w-auto bg-primary text-white px-6 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20 font-semibold"
          >
            <Plus size={20} />
            Thêm Tài Khoản
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Đang tải...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {users.map((u) => {
              const userRoles = u.roles || [];
              const primaryColor = getPrimaryColor(userRoles);
              const colors = ROLE_COLORS[primaryColor];
              const isManagerOrAdmin = userRoles.some(r => r.name === 'admin' || r.name === 'camera_manager' || r.name === 'investor');

              return (
                <div key={u.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group h-full">
                  <div className="p-6 h-full flex flex-col">
                    <div className="flex items-start justify-between mb-4 min-h-[128px]">
                      <div className={`p-3 rounded-2xl ${colors.icon}`}>
                        {isManagerOrAdmin ? <ShieldCheck size={28} /> : <User size={28} />}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {/* Show all role badges */}
                        {userRoles.map(role => {
                          const meta = ROLE_LABEL[role.name] || { label: role.name, color: 'blue' };
                          return (
                            <span
                              key={role.id}
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${ROLE_COLORS[meta.color].badge}`}
                            >
                              {meta.label}
                            </span>
                          );
                        })}
                        {/* Show all assigned branches */}
                        {(u.branches || []).map(branch => (
                          <span 
                            key={branch.id}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-tight bg-gray-100 px-2 py-0.5 rounded-md mt-0.5"
                          >
                            <Store size={10} className="shrink-0" />
                            {branch.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 truncate">{u.full_name}</h3>
                    <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <Mail size={12} />
                      @{u.username}
                    </p>

                    <div className="mt-4 space-y-2 min-h-[48px]">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Lương cứng:</span>
                        <span className="font-semibold text-gray-900">{Number(u.base_salary || 0).toLocaleString('vi-VN')}đ</span>
                      </div>
                      {/* Commission config assignments */}
                      {(userCommissionMap[u.id] || []).length > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Hoa hồng</span>
                          {userCommissionMap[u.id].map((cfg, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs bg-amber-50/50 rounded-lg px-2.5 py-1.5 border border-amber-100/50">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.isActive ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                                <span className="text-gray-700 truncate font-medium">{cfg.ruleSetName}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  cfg.assignedRole === 'saler'
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'bg-purple-50 text-purple-600'
                                }`}>
                                  {cfg.assignedRole === 'saler' ? 'Sales' : 'Giao nhận'}
                                </span>
                                <span className="font-semibold text-amber-700">{parseFloat(cfg.ratePercent)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Hoa hồng:</span>
                          <span className="text-gray-400 text-xs italic">Chưa có cấu hình</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto pt-6 border-t border-gray-50 flex items-center justify-between">
                      <div className="text-xs text-gray-400">
                        Tham gia: {new Date(u.inserted_at).toLocaleDateString('vi-VN')}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={18} />
                        </button>
                        {currentUser.id !== u.id && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xóa tài khoản"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {editingItem ? 'Cập Nhật Tài Khoản' : 'Thêm Tài Khoản Mới'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-full hover:bg-white hover:shadow-md text-gray-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Họ và tên</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Nguyễn Văn A"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên đăng nhập</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-50 disabled:text-gray-400"
                      required
                      disabled={!!editingItem}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {editingItem ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      required={!editingItem}
                    />
                  </div>
                </div>

                {/* Roles multi-select */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vai trò <span className="text-gray-400 font-normal">(có thể chọn nhiều)</span>
                  </label>
                  <RolePicker
                    roles={roles}
                    selected={formData.role_ids}
                    onChange={(ids) => setFormData({ ...formData, role_ids: ids })}
                  />
                  {formData.role_ids.length === 0 && (
                    <p className="text-xs text-red-500 mt-1.5">Vui lòng chọn ít nhất một vai trò</p>
                  )}
                </div>

                {/* Branches multi-select */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cơ sở làm việc <span className="text-gray-400 font-normal">(có thể chọn nhiều)</span>
                  </label>
                  <BranchPicker
                    branches={branches}
                    selected={formData.branch_ids}
                    onChange={(ids) => setFormData({ ...formData, branch_ids: ids })}
                  />
                </div>

                {/* Salary */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Lương cứng (VND)</label>
                  <input
                    type="text"
                    value={formatCurrencyInput(formData.base_salary)}
                    onChange={(e) => setFormData({ ...formData, base_salary: parseCurrencyInput(e.target.value) })}
                    placeholder="0"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>

                {/* Commission config note */}
                <div className="bg-amber-50/50 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">Hoa hồng</span> được cấu hình tại mục
                    {' '}<span className="font-semibold">Cấu Hình Hoa Hồng</span>. Mỗi nhân viên sẽ được gán vào
                    bộ quy tắc hoa hồng tương ứng với vai trò.
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={saving || formData.role_ids.length === 0}
                    className="flex-1 bg-primary text-white py-3 rounded-xl hover:opacity-90 font-semibold shadow-lg shadow-primary/20 disabled:opacity-60 transition-all transform active:scale-[0.98]"
                  >
                    {saving ? 'Đang lưu...' : editingItem ? 'Cập Nhật' : 'Tạo Tài Khoản'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl hover:bg-gray-200 font-semibold transition-all transform active:scale-[0.98]"
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-red-100 rounded-full text-red-600">
                  <AlertTriangle size={28} />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Xóa tài khoản?</h2>
              <p className="text-gray-600 mb-6">
                Bạn có chắc muốn xóa tài khoản <span className="font-semibold text-gray-900">@{deleteTarget.username}</span>?
                Nhân viên này sẽ không thể đăng nhập vào hệ thống nữa.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 font-semibold shadow-lg shadow-red-600/20 disabled:opacity-60 transition-all"
                >
                  {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl hover:bg-gray-200 font-semibold transition-all"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}

        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    </div>
  );
};

export default Users;
