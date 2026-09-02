import React, { useEffect, useState } from 'react';
import { X, Calendar as CalendarIcon, Package, User, Plus, AlertTriangle, Upload, ImageIcon, Image as ImageIcon2, ChevronRight, CheckCircle2, CircleDollarSign, Tag, Percent, MapPin, Phone, Edit2, Home, ShieldBan } from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';
import ModernDatePicker from '../../../components/ModernDatePicker';
import ModernDateTimePicker from '../../../components/ModernDateTimePicker';
import NewCustomerForm from './NewCustomerForm';
import ConfirmModal from './ConfirmModal';
import { formatPrice, formatVN, formatCurrencyInput, parseCurrencyInput } from '../../../utils/formatters';
import { checkBlacklist, previewRentalCommission } from '../../../api/client';

const PERIOD_OPTIONS = ['sáng', 'chiều', 'tối'];
const MAX_DISCOUNT_AMOUNT = 50000;
const PERIOD_TIME_RANGE = {
  'sáng': { start: '22:30', end: '12:00', startDayOffset: -1 },
  'chiều': { start: '12:00', end: '18:00', startDayOffset: 0 },
  'tối': { start: '18:00', end: '22:30', startDayOffset: 0 }
};

const ROLE_BADGE_STYLES = {
  admin: 'bg-orange-50 text-orange-600 border-orange-100',
  camera_manager: 'bg-violet-50 text-violet-600 border-violet-100',
  investor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  saler: 'bg-blue-50 text-blue-600 border-blue-100',
  driver: 'bg-cyan-50 text-cyan-600 border-cyan-100',
};

const ROLE_BADGE_LABELS = {
  admin: 'Admin',
  camera_manager: 'Camera',
  investor: 'Nhà đầu tư',
  saler: 'Saler',
  driver: 'Giao nhận máy',
};

const getRoleName = (role) => role?.name || role;

const getRoleLabel = (role) => {
  const roleName = getRoleName(role);
  return ROLE_BADGE_LABELS[roleName] || roleName?.replace(/_/g, ' ');
};

const CREATOR_ROLE_NAMES = ['saler', 'camera_manager', 'manager', 'investor'];
const DRIVER_ROLE_NAME = 'driver';
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const isCreatorRole = (user) => {
  const roles = Array.isArray(user?.roles) ? user.roles.map(getRoleName) : [];
  if (user?.role) roles.push(getRoleName(user.role));
  return roles.some((roleName) => CREATOR_ROLE_NAMES.includes(roleName));
};

const isDriverRole = (user) => {
  const roles = Array.isArray(user?.roles) ? user.roles.map(getRoleName) : [];
  if (user?.role) roles.push(getRoleName(user.role));
  return roles.includes(DRIVER_ROLE_NAME);
};

const toYMD = (date) => {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getPeriodPickupTime = (dateYMD, period) => {
  if (!dateYMD) return '';
  const timeRange = PERIOD_TIME_RANGE[period] || PERIOD_TIME_RANGE['sáng'];
  const pickupDate = addDays(new Date(`${dateYMD}T00:00:00`), timeRange.startDayOffset || 0);
  return `${toYMD(pickupDate)}T${timeRange.start}`;
};

const getPeriodReturnTime = (dateYMD, period) => {
  if (!dateYMD) return '';
  const timeRange = PERIOD_TIME_RANGE[period] || PERIOD_TIME_RANGE['sáng'];
  return `${dateYMD}T${timeRange.end}`;
};

const RentalModal = ({
  showModal = false,
  onClose,
  step = 1,
  setStep,
  editingItem = null,
  saving = false,
  loading = false,
  formData = {},
  setFormData,
  editCustomerData = null,
  setEditCustomerData = () => { },
  isCreatingCustomer = false,
  setIsCreatingCustomer,
  newCustomerData = {},
  setNewCustomerData,
  customers = [],
  equipment = [],
  branches = [],
  users = [],
  handleSubmit,
  imagePreviews = [],
  handleImageSelect,
  removeImage,
  calculateTotalDays,
  renderTotalTime,
  isAdmin = false,
  isCameraManager = false,
  isSaler = false,
  isDriver = false,
  isFetchingImages = false,
  currentUserId,
  toast
}) => {
  const [showConfirmUpdate, setShowConfirmUpdate] = useState(false);
  const [customerBlacklist, setCustomerBlacklist] = useState(null); // { is_blacklisted, reason }
  const [commissionPreview, setCommissionPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setShowConfirmUpdate(false);
      setCommissionPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal]);

  // Check blacklist status when customer changes
  useEffect(() => {
    if (!formData.customer_id || isCreatingCustomer) {
      setCustomerBlacklist(null);
      return;
    }
    let cancelled = false;
    checkBlacklist(formData.customer_id)
      .then(res => {
        if (!cancelled) setCustomerBlacklist(res.data);
      })
      .catch(() => {
        if (!cancelled) setCustomerBlacklist(null);
      });
    return () => { cancelled = true; };
  }, [formData.customer_id, isCreatingCustomer]);

  // Always include the currently selected handover user, even if they don't have driver role
  const baseDriverUsers = users.filter(isDriverRole);
  const handoverUserId = formData.handover_user_id || '';
  const driverUsers = React.useMemo(() => {
    if (handoverUserId && !baseDriverUsers.some(u => String(u.id) === String(handoverUserId))) {
      const selectedUser = users.find(u => String(u.id) === String(handoverUserId));
      if (selectedUser) return [...baseDriverUsers, selectedUser];
    }
    return baseDriverUsers;
  }, [users, handoverUserId, baseDriverUsers]);

  // Always include the currently selected creator user, even if they don't have a creator role
  const canAssignCreator = isAdmin || isCameraManager || isSaler || isDriver;

  // Preview hoa hồng: only inserted_by or admin can see when editing
  const canViewCommissionPreview = !editingItem || isAdmin || (editingItem && currentUserId && Number(editingItem.inserted_by) === Number(currentUserId));
  const creatorUserId = formData.user_id || '';
  const baseCreatorUsers = users.filter(isCreatorRole);
  const creatorUsers = React.useMemo(() => {
    if (creatorUserId && !baseCreatorUsers.some(u => String(u.id) === String(creatorUserId))) {
      const selectedUser = users.find(u => String(u.id) === String(creatorUserId));
      if (selectedUser) return [...baseCreatorUsers, selectedUser];
    }
    return baseCreatorUsers;
  }, [users, creatorUserId, baseCreatorUsers]);

  if (!showModal) return null;

  const todayDate = new Date().toISOString().split('T')[0];
  const nowDateTime = new Date().toLocaleString('sv').replace(' ', 'T').slice(0, 16); // Local ISO format
  const selectedCreator = creatorUsers.find(u => String(u.id) === String(creatorUserId));
  const selectedHandoverUser = driverUsers.find(u => String(u.id) === String(handoverUserId));

  const duplicateCustomer = (isCreatingCustomer && newCustomerData?.name && newCustomerData?.phone)
    ? customers.find(c =>
      c.name.trim().toLowerCase() === newCustomerData.name.trim().toLowerCase() &&
      c.phone?.trim() === newCustomerData.phone?.trim()
    )
    : null;
  const duplicateError = duplicateCustomer ? `Khách hàng "${duplicateCustomer.name}" với số điện thoại này đã tồn tại.` : null;

  const rentalCode = formData.code || editingItem?.code || (
    editingItem?.order_number || editingItem?.id
      ? `OD${String(editingItem.order_number || editingItem.id).padStart(7, '0')}`
      : ''
  );

  const getNumberOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  };

  const calculateGrandTotalForPreview = () => {
    const selectedEq = (equipment || []).find(e => e.id === formData.equipment_id);
    const { fullDays, sessions } = calculateTotalDays();

    let pricingDays = fullDays;
    let pricingSessions = sessions;

    const isEditingSameEquipment = editingItem && String(editingItem.equipment_id) === String(formData.equipment_id);
    const savedDayPrice = getNumberOrNull(formData.unit_price) ?? getNumberOrNull(editingItem?.unit_price);
    const savedAppliedDayPrice = getNumberOrNull(formData.applied_day_price) ?? getNumberOrNull(editingItem?.applied_day_price);
    const savedSessionPrice = getNumberOrNull(formData.unit_price_session) ?? getNumberOrNull(editingItem?.unit_price_session);
    const savedDiscountDayPrice = getNumberOrNull(formData.discount_day_price) ?? getNumberOrNull(editingItem?.discount_day_price);
    const savedDiscountThreshold = getNumberOrNull(formData.discount_day_threshold_snapshot) ?? getNumberOrNull(editingItem?.discount_day_threshold_snapshot);
    const usedSavedDiscountDayPrice = Boolean(formData.used_discount_day_price ?? editingItem?.used_discount_day_price);

    const threshold = selectedEq?.discount_day_threshold ? Number(selectedEq.discount_day_threshold) : null;
    const discountDayPrice = selectedEq?.price_per_day_discount ? Number(selectedEq.price_per_day_discount) : null;
    const recalculatedDayPrice = (threshold && discountDayPrice && pricingDays >= threshold)
      ? discountDayPrice
      : Number(selectedEq?.price_per_day || 0);

    const savedDiscountApplies = Boolean(
      isEditingSameEquipment &&
      savedDiscountDayPrice !== null &&
      (usedSavedDiscountDayPrice || (savedDiscountThreshold && pricingDays >= savedDiscountThreshold))
    );

    const savedBaseDayPrice = savedDiscountApplies ? savedDiscountDayPrice : savedDayPrice;
    const effectiveDayPrice = isEditingSameEquipment && savedAppliedDayPrice !== null
      ? savedAppliedDayPrice
      : (isEditingSameEquipment && savedBaseDayPrice !== null ? savedBaseDayPrice : recalculatedDayPrice);

    const effectiveSessionPrice = isEditingSameEquipment && savedSessionPrice !== null
      ? savedSessionPrice
      : Number(selectedEq?.price_per_session || 0);

    const eqTotal = (effectiveDayPrice * pricingDays) + (effectiveSessionPrice * pricingSessions);
    const accessoriesTotal = (formData.accessories || []).reduce((sum, acc) => {
      return sum + ((Number(acc.price_per_day || 0) * pricingDays) + (Number(acc.price_per_session || 0) * pricingSessions));
    }, 0);

    const totalBeforeDiscount = eqTotal + accessoriesTotal;
    let discountAmountVal = 0;
    if (formData.discount_type === 'percentage') {
      discountAmountVal = Math.round(totalBeforeDiscount * (Number(formData.discount_amount || 0) / 100));
    } else {
      discountAmountVal = Number(formData.discount_amount || 0);
    }
    discountAmountVal = Math.min(discountAmountVal, MAX_DISCOUNT_AMOUNT);

    const calculatedGrandTotal = Math.max(0, totalBeforeDiscount - discountAmountVal);
    const grandTotal = formData.custom_total !== undefined && formData.custom_total !== null && formData.custom_total !== ''
      ? Number(formData.custom_total)
      : calculatedGrandTotal;

    return Number.isFinite(grandTotal) ? grandTotal : 0;
  };

  const handlePreviewCommission = async () => {
    const totalPrice = calculateGrandTotalForPreview();

    if (!totalPrice || totalPrice <= 0) {
      setCommissionPreview(null);
      setPreviewError('Vui lòng nhập tổng đơn hợp lệ trước khi preview hoa hồng.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError('');
    try {
      const response = await previewRentalCommission({
        total_price: totalPrice,
        user_id: formData.user_id || null,
        handover_user_id: formData.handover_user_id || null,
        effective_at: formData.return_time || undefined
      });

      setCommissionPreview(response.data || null);
    } catch (error) {
      setCommissionPreview(null);
      setPreviewError(error.response?.data?.error || 'Không thể tải preview hoa hồng.');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-1.5 sm:p-4 transition-opacity duration-300 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-[1.25rem] sm:rounded-[2rem] w-full max-w-[calc(100vw-0.75rem)] sm:max-w-6xl shadow-2xl overflow-hidden h-[calc(100dvh-0.75rem)] sm:h-[90vh] max-h-[calc(100dvh-0.75rem)] sm:max-h-[90vh] flex flex-col border border-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Steps */}
        <div className="px-4 py-4 sm:px-8 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-5 sm:mb-8">
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-tight break-words">
                {editingItem ? 'Chỉnh Sửa Đơn Thuê' : 'Tạo Đơn Thuê Mới'}
              </h2>
              {editingItem && rentalCode && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-orange-600">
                  <Tag size={12} />
                  <span>Mã đơn</span>
                  <span>{rentalCode}</span>
                </div>
              )}
              <p className="text-[10px] sm:text-xs text-gray-400 font-medium uppercase tracking-wider mt-1 leading-snug">Hoàn thành 3 bước để tạo đơn hàng</p>
            </div>
            <button onClick={onClose} className="p-2 sm:p-3 bg-white shadow-sm border border-gray-100 rounded-xl sm:rounded-2xl hover:bg-gray-50 transition-all text-gray-400 hover:text-primary">
              <X size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>

          <div className="flex items-start justify-center max-w-2xl mx-auto">
            <StepItem current={step} target={1} icon={<User size={18} />} label="Khách hàng" />
            <StepDivider active={step >= 2} />
            <StepItem current={step} target={2} icon={<Package size={18} />} label="Thiết bị & Phụ kiện" />
            <StepDivider active={step >= 3} />
            <StepItem current={step} target={3} icon={<CheckCircle2 size={18} />} label="Thanh toán & Ghi chú" />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-4 sm:p-6" style={{ willChange: 'transform' }}>
          {loading && (
            <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-6">
              <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-slate-700">Đang tải dữ liệu đơn thuê...</p>
            </div>
          )}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10">
              <div className="space-y-6 sm:space-y-8">
                <SectionHeader icon={<User size={20} />} title="Thông tin khách hàng" />
                <div className="space-y-5 sm:space-y-6">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Chọn khách hàng</label>
                    <div className="flex gap-3 min-w-0">
                      <div className="flex-1 h-[34px] sm:h-[38px]">
                        <CustomSelect
                          options={customers}
                          value={formData.customer_id}
                          onChange={(val) => {
                            setFormData({ ...formData, customer_id: val });
                            setIsCreatingCustomer(false);
                            if (editingItem) {
                              const c = customers.find((x) => String(x.id) === String(val));
                              setEditCustomerData(c ? { id: c.id, name: c.name || '', phone: c.phone || '', email: c.email || '' } : null);
                            }
                          }}
                          placeholder="Chọn khách hàng từ danh sách..."
                          showSearch={true}
                          autoFocusSearch={false}
                          onAddNew={(search) => {
                            setIsCreatingCustomer(true);
                            setFormData({ ...formData, customer_id: '' });
                            setNewCustomerData({ ...newCustomerData, name: search });
                          }}
                          addNewLabel="Đăng ký khách hàng mới"
                          renderOption={(cust) => (
                            <div className="flex w-full min-w-0 items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold leading-tight truncate">{cust.name}</div>
                                <div className="text-[10px] text-gray-400 font-medium leading-snug">{cust.phone || 'Chưa có SĐT'}</div>
                              </div>
                              {cust.is_blacklisted && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[9px] font-semibold uppercase border border-red-100 shrink-0">
                                  <ShieldBan size={10} />
                                  Hạn chế
                                </span>
                              )}
                            </div>
                          )}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingCustomer(!isCreatingCustomer);
                          if (!isCreatingCustomer) setFormData({ ...formData, customer_id: '' });
                        }}
                        title={isCreatingCustomer ? "Hủy đăng ký mới" : "Đăng ký khách mới"}
                        className={`w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] flex items-center justify-center rounded-[14px] border transition-all shrink-0
                          ${isCreatingCustomer
                            ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                            : 'bg-white text-gray-400 border-gray-100 hover:border-primary/30 hover:text-primary hover:bg-primary/5'
                          }
                        `}
                      >
                        <Plus size={16} className={`transition-transform duration-300 ${isCreatingCustomer ? 'rotate-45' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {formData.customer_id && !isCreatingCustomer && (
                    <div className="bg-gray-50/50 p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 text-primary shrink-0">
                            <User size={20} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm sm:text-base font-semibold text-gray-900 leading-tight truncate">
                              {customers.find(c => c.id === formData.customer_id)?.name}
                            </h4>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">Khách hàng cá nhân</p>
                          </div>
                        </div>
                        {customers.find(c => c.id === formData.customer_id)?.total_rentals > 0 && (
                          <div className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-green-50 text-green-600 text-[9px] sm:text-[10px] font-semibold uppercase rounded-lg border border-green-100 shrink-0">
                            Khách quen
                          </div>
                        )}
                      </div>

                      {/* Blacklist Warning */}
                      {customerBlacklist?.is_blacklisted && (
                        <div className="mt-4 bg-red-50 border-2 border-red-200 rounded-2xl p-4 sm:p-5 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-red-100 rounded-xl shrink-0">
                              <ShieldBan size={20} className="text-red-600" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-red-700">Khách hàng trong danh sách hạn chế</h4>
                              {customerBlacklist.entry?.reason && (
                                <p className="text-xs text-red-600 mt-1 bg-red-100/50 px-2 py-1 rounded-lg inline-block">
                                  Lý do: {customerBlacklist.entry.reason}
                                </p>
                              )}
                              <p className="text-[11px] text-amber-600 mt-2">
                                Cảnh báo: Khách hàng này đang bị hạn chế. Cân nhắc trước khi tạo đơn thuê.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {editingItem && (
                        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 min-w-0">
                          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Chỉnh sửa thông tin khách</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="relative">
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Tên khách</label>
                              <input
                                type="text"
                                value={editCustomerData?.name ?? ''}
                                onChange={(e) => setEditCustomerData({ ...(editCustomerData || {}), id: formData.customer_id, name: e.target.value })}
                                className="w-full h-[35px] px-4 py-1 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-sm font-semibold text-gray-900"
                                placeholder="Tên khách hàng"
                              />
                            </div>
                            <div className="relative">
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">SĐT</label>
                              <div className="absolute left-3.5 top-[31px] text-gray-400"><Phone size={14} /></div>
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={editCustomerData?.phone ?? ''}
                                onChange={(e) => setEditCustomerData({ ...(editCustomerData || {}), id: formData.customer_id, phone: digitsOnly(e.target.value) })}
                                className="w-full h-[35px] pl-9 pr-4 py-1 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-sm font-semibold text-gray-900"
                                placeholder="Số điện thoại"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {!editingItem && (
                        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 flex items-center gap-3 sm:gap-4">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-50 text-gray-400 rounded-xl flex items-center justify-center shrink-0">
                            <Phone size={18} />
                          </div>
                          <div>
                            <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Số điện thoại liên hệ</p>
                            <p className="text-sm font-semibold text-gray-900 tracking-tight">
                              {customers.find(c => c.id === formData.customer_id)?.phone || 'Chưa cập nhật'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isCreatingCustomer && (
                    <>
                      <NewCustomerForm
                        data={newCustomerData}
                        onChange={setNewCustomerData}
                        error={duplicateError}
                      />

                      {/* Gợi ý khách hàng khớp */}
                      {(() => {
                        const nameQuery = (newCustomerData.name || '').trim().toLowerCase();
                        const phoneQuery = (newCustomerData.phone || '').trim();
                        if (!nameQuery && !phoneQuery) return null;

                        const suggestions = customers.filter(c => {
                          if (duplicateCustomer && String(c.id) === String(duplicateCustomer.id)) return false;
                          const nameMatch = nameQuery && c.name?.toLowerCase().includes(nameQuery);
                          const phoneMatch = phoneQuery && c.phone?.includes(phoneQuery);
                          return nameMatch || phoneMatch;
                        }).slice(0, 3);

                        if (suggestions.length === 0) return null;

                        return (
                          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-3 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <User size={12} />
                              Khách hàng tương tự — bấm để chọn
                            </p>
                            <div className="space-y-2">
                              {suggestions.map(cust => (
                                <button
                                  key={cust.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, customer_id: cust.id });
                                    setIsCreatingCustomer(false);
                                  }}
                                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-white border border-blue-100 hover:border-blue-300 hover:shadow-sm transition-all text-left group"
                                >
                                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                                    <User size={14} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{cust.name}</p>
                                    {cust.phone && (
                                      <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                        <Phone size={10} /> {cust.phone}
                                      </p>
                                    )}
                                  </div>
                                  {cust.is_blacklisted && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-[9px] font-semibold shrink-0">
                                      <ShieldBan size={9} /> Hạn chế
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}

                  <div className="space-y-5 sm:space-y-6">
                    <SectionHeader icon={<User size={20} />} title="Phân công" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    {canAssignCreator && (
                      <div>
                        <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Người tạo đơn</label>
                        <CustomSelect
                          options={creatorUsers}
                          value={formData.user_id}
                          onChange={(val) => setFormData({ ...formData, user_id: val })}
                          placeholder="Chọn người tạo đơn..."
                          labelField="full_name"
                          valueField="id"
                          showSearch={true}
                          autoFocusSearch={false}
                          renderOption={(user) => (
                            <div className="flex w-full min-w-0 items-start gap-3">
                              <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg shrink-0">
                                <User size={14} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold leading-tight">{user.full_name || user.username}</div>
                                <div className="truncate text-[10px] text-gray-400 font-medium leading-snug mb-1.5">
                                  {user.username || 'Người tạo'}
                                </div>
                                {Array.isArray(user.roles) && user.roles.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {user.roles.map((role, idx) => {
                                      const roleName = getRoleName(role);

                                      return (
                                        <span
                                          key={idx}
                                          className={`inline-flex h-4 items-center rounded-md border px-1.5 text-[8px] font-bold uppercase leading-none tracking-normal ${ROLE_BADGE_STYLES[roleName] || 'bg-slate-50 text-slate-500 border-slate-100'}`}
                                        >
                                          {getRoleLabel(role)}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Giao nhận máy <span className="text-red-500 font-bold text-[11px] ml-1">(bắt buộc)</span></label>
                      <CustomSelect
                        options={driverUsers}
                        value={handoverUserId}
                        onChange={(val) => setFormData({ ...formData, handover_user_id: val })}
                        placeholder="Chọn người giao nhận máy..."
                        labelField="full_name"
                        valueField="id"
                        showSearch={true}
                        autoFocusSearch={false}
                        renderOption={(driver) => (
                          <div className="flex w-full min-w-0 items-start gap-3">
                            <div className="p-1.5 bg-cyan-100 text-cyan-600 rounded-lg shrink-0">
                              <User size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold leading-tight">{driver.full_name || driver.username}</div>
                              <div className="truncate text-[10px] text-gray-400 font-medium leading-snug">{driver.username || 'driver'}</div>
                            </div>
                          </div>
                        )}
                      />
                      <div className="mt-1.5 flex min-h-[16px] items-center justify-between gap-2">
                        <p className="text-xs text-cyan-700 font-medium">
                          {handoverUserId ? (selectedHandoverUser?.full_name || selectedHandoverUser?.username || 'Đã chọn người giao nhận máy') : ''}
                        </p>
                        {handoverUserId && (
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, handover_user_id: '' })}
                            className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            Xóa người giao nhận
                          </button>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <SectionHeader icon={<CalendarIcon size={20} />} title="Thời gian thuê & Giao nhận" />
                <div className="bg-blue-50/30 p-4 rounded-[1.5rem] border border-blue-100/50 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                      <div className="w-4 h-4 rounded-md bg-blue-500 flex items-center justify-center text-[10px] text-white">1</div>
                      Khoảng thời gian thuê (Tính giá)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                      <ModernDatePicker
                        label="Ngày bắt đầu"
                        value={formData.start_date}
                        onChange={(val) => {
                          const period = formData.start_period || 'sáng';
                          setFormData({
                            ...formData,
                            start_date: val,
                            pickup_time: getPeriodPickupTime(val, period),
                            custom_total: null
                          });
                        }}
                        required
                        min={todayDate}
                      />
                      <div className="flex flex-col">
                        <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-widest">Buổi bắt đầu</label>
                        <CustomSelect
                          options={PERIOD_OPTIONS}
                          value={formData.start_period}
                          onChange={(val) => setFormData({
                            ...formData,
                            start_period: val,
                            pickup_time: getPeriodPickupTime(formData.start_date, val),
                            custom_total: null
                          })}
                          showSearch={false}
                          className="h-[35px]"
                          buttonClassName="border-orange-200 rounded-[14px]"
                        />
                      </div>

                      <ModernDatePicker
                        label="Ngày kết thúc"
                        value={formData.end_date}
                        onChange={(val) => {
                          const period = formData.end_period || 'chiều';
                          setFormData({
                            ...formData,
                            end_date: val,
                            return_time: getPeriodReturnTime(val, period),
                            custom_total: null
                          });
                        }}
                        required
                        min={formData.start_date || todayDate}
                      />
                      <div className="flex flex-col">
                        <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-widest">Buổi kết thúc</label>
                        <CustomSelect
                          options={PERIOD_OPTIONS}
                          value={formData.end_period}
                          onChange={(val) => setFormData({
                            ...formData,
                            end_period: val,
                            return_time: getPeriodReturnTime(formData.end_date, val),
                            custom_total: null
                          })}
                          showSearch={false}
                          className="h-[35px]"
                          buttonClassName="border-orange-200 rounded-[14px]"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <h4 className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center text-[10px] text-white">2</div>
                      Thời gian giao nhận thực tế
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ModernDateTimePicker
                        label="Thời điểm nhận máy"
                        value={formData.pickup_time}
                        onChange={(val) => setFormData({ ...formData, pickup_time: val })}
                        min={nowDateTime}
                      />
                      <ModernDateTimePicker
                        label="Thời điểm trả máy"
                        value={formData.return_time}
                        onChange={(val) => setFormData({ ...formData, return_time: val })}
                        min={formData.pickup_time || nowDateTime}
                      />
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden group hover:border-orange-200 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center shadow-inner">
                        <CalendarIcon size={20} />
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-0">Thời gian dự kiến</p>
                        <h4 className="text-xs font-semibold text-gray-700">Tổng thời hạn thuê máy</h4>
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <span className="text-lg font-semibold text-orange-600 tracking-tight bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100">
                        {renderTotalTime(calculateTotalDays())}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 sm:space-y-6">
                  <SectionHeader icon={<MapPin size={20} />} title="Chi nhánh giao nhận" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nơi nhận máy (Store)</label>
                      <CustomSelect
                        options={branches}
                        value={formData.pickup_branch_id}
                        onChange={(val) => setFormData({
                          ...formData,
                          pickup_branch_id: val,
                          return_branch_id: editingItem ? formData.return_branch_id : val
                        })}
                        placeholder="Chọn nơi nhận máy..."
                        renderOption={(branch) => (
                          <div className="flex w-full min-w-0 items-start gap-3">
                            <div className="p-1.5 bg-primary/10 text-primary rounded-lg shrink-0">
                              <MapPin size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold leading-tight break-words">{branch.name}</div>
                              <div className="text-[10px] text-gray-400 font-medium leading-snug whitespace-normal break-words">
                                {branch.address}
                              </div>
                            </div>
                          </div>
                        )}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nơi trả máy (Store)</label>
                      <CustomSelect
                        options={branches}
                        value={formData.return_branch_id}
                        onChange={(val) => setFormData({ ...formData, return_branch_id: val })}
                        placeholder="Chọn nơi trả máy..."
                        renderOption={(branch) => (
                          <div className="flex w-full min-w-0 items-start gap-3">
                            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                              <MapPin size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold leading-tight break-words">{branch.name}</div>
                              <div className="text-[10px] text-gray-400 font-medium leading-snug whitespace-normal break-words">
                                {branch.address}
                              </div>
                            </div>
                          </div>
                        )}
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="space-y-8">
                <SectionHeader icon={<Package size={20} />} title="Thiết bị chính" />
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Chọn máy ảnh / Ống kính</label>
                    <CustomSelect
                      options={(equipment || []).filter(e => e.category !== 'Phụ kiện' && e.condition !== 'maintenance')}
                      value={formData.equipment_id}
                      onChange={(val) => {
                        const selected = equipment.find(e => e.id === val);
                        const equipmentChanged = String(formData.equipment_id || '') !== String(val || '');
                        setFormData({
                          ...formData,
                          equipment_id: val,
                          branch_id: selected?.branch_id || formData.branch_id,
                          custom_total: equipmentChanged ? null : formData.custom_total
                        });
                      }}
                      labelField="name"
                      placeholder="Tìm thiết bị..."
                      renderOption={(eq) => (
                        <div className="flex flex-col gap-1 py-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded uppercase leading-none">
                              {eq.code}
                            </span>
                            <span className="font-semibold truncate text-slate-800">{eq.name}</span>
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 text-[9.5px] font-bold rounded-md leading-none border border-indigo-100 flex-shrink-0 flex items-center gap-1">
                              <Home size={10} className="text-indigo-400 flex-shrink-0" />
                              <span>{eq.branch_name || 'Hệ thống'}</span>
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 mt-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                            <span className="text-orange-600/80">{formatPrice(eq.price_per_day)} / ngày</span>
                            <span className="text-blue-600/80">{formatPrice(eq.price_per_session)} / buổi</span>
                            {eq.price_per_day_discount && eq.discount_day_threshold && (
                              <span className="text-amber-600/90 flex items-center gap-1">
                                ★ Ưu đãi: {formatPrice(eq.price_per_day_discount)} / ngày (từ {eq.discount_day_threshold} ngày)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    />
                  </div>

                  {formData.equipment_id && (
                    <div className="bg-gray-50 p-4 rounded-[1.5rem] border border-gray-100 animate-in zoom-in-95 duration-300">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center border border-gray-100">
                          <Package size={24} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Đang chọn</p>
                          <h4 className="text-base font-semibold text-gray-900 leading-tight">
                            {(equipment || []).find(e => e.id === formData.equipment_id)?.name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="inline-block px-1.5 py-0.5 bg-primary/10 text-primary text-[9.5px] font-semibold uppercase rounded border border-primary/10">
                              {(equipment || []).find(e => e.id === formData.equipment_id)?.code}
                            </span>
                            <span className="inline-block px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[9.5px] font-semibold uppercase rounded border border-indigo-100 flex items-center gap-1">
                              <Home size={10} className="text-indigo-400 flex-shrink-0" />
                              <span>{(equipment || []).find(e => e.id === formData.equipment_id)?.branch_name || 'Hệ thống'}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              <div className="space-y-8">
                <SectionHeader icon={<Plus size={20} />} title="Phụ kiện đi kèm" />

                <div className="bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100/50">
                  <div className="grid grid-cols-1 gap-4">
                    {(equipment || [])
                      .filter(e => e.category === 'Phụ kiện' && e.condition !== 'maintenance')
                      .map((accEq) => {
                        const isChecked = (formData.accessories || []).some(a => (a.id || a.equipment_id) === accEq.id);

                        return (
                          <label
                            key={accEq.id}
                            className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all cursor-pointer group
                              ${isChecked
                                ? 'bg-primary/5 border-primary shadow-sm'
                                : 'bg-white border-transparent hover:border-gray-100 hover:shadow-sm'}
                            `}
                          >
                            <div className="relative flex items-center justify-center">
                              <input
                                type="checkbox"
                                className="peer hidden"
                                checked={isChecked}
                                onChange={() => {
                                  let updated;
                                  if (isChecked) {
                                    updated = formData.accessories.filter(a => (a.id || a.equipment_id) !== accEq.id);
                                  } else {
                                    updated = [...(formData.accessories || []), {
                                      equipment_id: accEq.id,
                                      id: accEq.id,
                                      name: accEq.name,
                                      price_per_day: accEq.price_per_day,
                                      price_per_session: accEq.price_per_session
                                    }];
                                  }
                                  setFormData({ ...formData, accessories: updated });
                                }}
                              />
                              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all
                                ${isChecked
                                  ? 'bg-primary border-primary text-white scale-110 shadow-lg shadow-primary/20'
                                  : 'bg-white border-gray-200 text-transparent group-hover:border-primary/50'}
                              `}>
                                <CheckCircle2 size={16} strokeWidth={3} />
                              </div>
                            </div>

                            <div className="flex-1">
                              <h4 className={`text-sm font-semibold transition-colors ${isChecked ? 'text-primary' : 'text-gray-700'}`}>
                                {accEq.name}
                              </h4>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-0.5">
                                + {formatPrice(accEq.price_per_day)} / ngày | {formatPrice(accEq.price_per_session)} / buổi
                              </p>
                            </div>
                          </label>
                        );
                      })}

                    {(!equipment || equipment.filter(e => e.category === 'Phụ kiện' && e.condition !== 'maintenance').length === 0) && (
                      <div className="py-8 text-center text-gray-400">
                        <p className="text-xs font-semibold uppercase tracking-widest">Không có phụ kiện khả dụng</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {step === 3 && (() => {
            const { fullDays, sessions } = calculateTotalDays();
            const selectedEq = (equipment || []).find(e => e.id === formData.equipment_id);
            const isEditingSameEquipment = editingItem && String(editingItem.equipment_id) === String(formData.equipment_id);
            const savedDayPrice = getNumberOrNull(formData.unit_price) ?? getNumberOrNull(editingItem?.unit_price);
            const savedAppliedDayPrice = getNumberOrNull(formData.applied_day_price) ?? getNumberOrNull(editingItem?.applied_day_price);
            const savedSessionPrice = getNumberOrNull(formData.unit_price_session) ?? getNumberOrNull(editingItem?.unit_price_session);
            const savedDiscountDayPrice = getNumberOrNull(formData.discount_day_price) ?? getNumberOrNull(editingItem?.discount_day_price);
            const savedDiscountThreshold = getNumberOrNull(formData.discount_day_threshold_snapshot) ?? getNumberOrNull(editingItem?.discount_day_threshold_snapshot);
            const usedSavedDiscountDayPrice = Boolean(formData.used_discount_day_price ?? editingItem?.used_discount_day_price);
            const isUsingSavedRentalPrice = isEditingSameEquipment && (savedDayPrice !== null || savedSessionPrice !== null);

            // Mỗi buổi lẻ được tính riêng, không gộp thành ngày
            let pricingDays = fullDays;
            let pricingSessions = sessions;

            // Ap dung gia uu dai neu du nguong
            const threshold = selectedEq?.discount_day_threshold ? Number(selectedEq.discount_day_threshold) : null;
            const discountDayPrice = selectedEq?.price_per_day_discount ? Number(selectedEq.price_per_day_discount) : null;
            const recalculatedDayPrice = (threshold && discountDayPrice && pricingDays >= threshold)
              ? discountDayPrice
              : Number(selectedEq?.price_per_day || 0);
            const savedDiscountApplies = Boolean(
              isEditingSameEquipment &&
              savedDiscountDayPrice !== null &&
              (usedSavedDiscountDayPrice || (savedDiscountThreshold && pricingDays >= savedDiscountThreshold))
            );
            const savedBaseDayPrice = savedDiscountApplies
              ? savedDiscountDayPrice
              : savedDayPrice;
            const effectiveDayPrice = isEditingSameEquipment && savedAppliedDayPrice !== null
              ? savedAppliedDayPrice
              : (isEditingSameEquipment && savedBaseDayPrice !== null ? savedBaseDayPrice : recalculatedDayPrice);
            const effectiveUsesDiscount = isEditingSameEquipment && (usedSavedDiscountDayPrice || savedDiscountApplies)
              ? true
              : Boolean(threshold && discountDayPrice && pricingDays >= threshold);
            const effectiveSessionPrice = isEditingSameEquipment && savedSessionPrice !== null
              ? savedSessionPrice
              : Number(selectedEq?.price_per_session || 0);
            const currentDayPrice = Number(selectedEq?.price_per_day || 0);
            const currentSessionPrice = Number(selectedEq?.price_per_session || 0);
            const currentUsesDiscount = Boolean(threshold && discountDayPrice && pricingDays >= threshold);

            const calculateItemTotal = (dayPrice, sessionPrice) => {
              return (Number(dayPrice || 0) * pricingDays) + (Number(sessionPrice || 0) * pricingSessions);
            };

            const eqTotal = (effectiveDayPrice * pricingDays) + (effectiveSessionPrice * pricingSessions);
            const accessoriesTotal = (formData.accessories || []).reduce((sum, acc) =>
              sum + calculateItemTotal(acc.price_per_day, acc.price_per_session), 0);

            const totalBeforeDiscount = eqTotal + accessoriesTotal;
            let discountAmountVal = 0;
            if (formData.discount_type === 'percentage') {
              discountAmountVal = Math.round(totalBeforeDiscount * (Number(formData.discount_amount || 0) / 100));
            } else {
              discountAmountVal = Number(formData.discount_amount || 0);
            }
            discountAmountVal = Math.min(discountAmountVal, MAX_DISCOUNT_AMOUNT);
            const calculatedGrandTotal = Math.max(0, totalBeforeDiscount - discountAmountVal);
            const grandTotal = formData.custom_total !== undefined && formData.custom_total !== null && formData.custom_total !== ''
              ? Number(formData.custom_total)
              : calculatedGrandTotal;
            const isDiscounted = effectiveUsesDiscount;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
                <div className="space-y-4 sm:space-y-5">
                  <div className="bg-white rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-5 border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2.5 sm:pb-3 border-b border-gray-50">
                        <h3 className="text-[10px] sm:text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Chi phí</h3>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 rounded-lg sm:rounded-xl border border-gray-100">
                          <CalendarIcon size={12} className="text-primary" />
                          <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-tight text-gray-700">
                            {renderTotalTime({ fullDays, sessions })}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3 sm:space-y-4">
                        {selectedEq && (
                          <div className="group">
                            <div className="flex justify-between items-start gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm sm:text-base font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">{selectedEq.name}</h4>
                                  {isUsingSavedRentalPrice && (
                                    <span
                                      className="inline-flex items-center rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-amber-700"
                                      title="Giá được lưu tại thời điểm tạo đơn thuê"
                                    >
                                      Giá lúc tạo đơn
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                  <div className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-relaxed">
                                    {pricingDays > 0 && <span>{pricingDays}N x {isDiscounted ? <span className="text-amber-600">{formatPrice(effectiveDayPrice)} ★</span> : formatPrice(effectiveDayPrice)}</span>}
                                    {pricingDays > 0 && pricingSessions > 0 && <span className="mx-1.5 opacity-30">|</span>}
                                    {pricingSessions > 0 && <span>{pricingSessions}B x {formatPrice(effectiveSessionPrice)}</span>}
                                  </div>
                                </div>
                                {isUsingSavedRentalPrice && (
                                  <div className="mt-1 text-[9px] sm:text-[10px] font-semibold text-gray-900 uppercase tracking-widest leading-relaxed">
                                    <span>Giá hiện tại:</span>
                                    {currentUsesDiscount ? (
                                      <span className="ml-1 text-amber-600">{formatPrice(discountDayPrice)}/N ★</span>
                                    ) : (
                                      <>
                                        <span className="ml-1">{formatPrice(currentDayPrice)}/N</span>
                                        <span className="mx-1.5 opacity-30">|</span>
                                        <span>{formatPrice(currentSessionPrice)}/B</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[8px] font-semibold uppercase tracking-widest text-gray-300 mb-0.5">Thành tiền</p>
                                <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatPrice(eqTotal)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {(formData.accessories || []).length > 0 && (
                          <div className="pt-3 border-t border-gray-50 space-y-3">
                            <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.2em]">Phụ kiện đi kèm</p>
                            <div className="space-y-2">
                              {formData.accessories.map((acc, idx) => {
                                const accTotal = calculateItemTotal(acc.price_per_day, acc.price_per_session);
                                return (
                                  <div key={idx} className="group">
                                    <div className="flex justify-between items-start text-xs">
                                      <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                          <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
                                          <span className="text-gray-600 font-semibold">{acc.name}</span>
                                        </div>
                                        <div className="pl-3.5 text-[8px] font-semibold text-gray-400 uppercase tracking-widest">
                                          {pricingDays > 0 && <span>{pricingDays}N x {formatPrice(acc.price_per_day)}</span>}
                                          {pricingDays > 0 && pricingSessions > 0 && <span className="mx-1 opacity-30">|</span>}
                                          {pricingSessions > 0 && <span>{pricingSessions}B x {formatPrice(acc.price_per_session)}</span>}
                                        </div>
                                      </div>
                                      <span className="text-gray-900 font-semibold tabular-nums">
                                        {formatPrice(accTotal)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {discountAmountVal > 0 && (
                          <div className="pt-3 border-t border-gray-50 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500/30" />
                                <span className="text-red-600 font-semibold">Khuyến mãi {formData.discount_type === 'percentage' ? `(${formData.discount_amount}%)` : ''}</span>
                              </div>
                              <span className="text-red-600 font-semibold tabular-nums">
                                - {formatPrice(discountAmountVal)}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="pt-3 sm:pt-4 mt-3 sm:mt-4 border-t-2 border-gray-900/5">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
                            <div>
                              <p className="text-[9px] sm:text-[10px] font-semibold text-gray-400 uppercase tracking-[0.2em] mb-1">Tổng đơn thuê</p>
                              <div className={`relative group flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-xl border border-transparent transition-all ${isSaler ? 'cursor-default' : 'hover:border-orange-200 hover:bg-orange-50/50 focus-within:border-orange-200 focus-within:bg-orange-50/50 cursor-text'}`}
                                onClick={(e) => {
                                  if (isSaler) return;
                                  const input = e.currentTarget.querySelector('input');
                                  if (input) input.focus();
                                }}
                              >
                                <input
                                  type="text"
                                  value={formatCurrencyInput(grandTotal)}
                                  onChange={(e) => {
                                    if (isSaler) return;
                                    if (e.target.value === '') {
                                      setFormData({ ...formData, custom_total: null });
                                      return;
                                    }
                                    const targetTotal = parseCurrencyInput(e.target.value);
                                    if (isNaN(targetTotal)) return;
                                    setFormData({ ...formData, custom_total: targetTotal });
                                  }}
                                  readOnly={isSaler}
                                  className="w-[120px] sm:w-[150px] bg-transparent focus:outline-none focus:ring-0 border-none p-0 m-0 text-lg sm:text-2xl font-semibold text-primary tracking-tighter"
                                  placeholder="0"
                                />
                                <span className="text-xs sm:text-sm font-bold text-primary">VND</span>
                                {!isSaler && <Edit2 size={14} className="text-gray-300 group-hover:text-orange-400 focus-within:text-orange-400 transition-colors ml-0.5" />}
                              </div>
                            </div>
                            <div className="flex sm:block">
                              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-600 rounded-lg border border-orange-100 animate-pulse">
                                <AlertTriangle size={10} />
                                <span className="text-[8px] sm:text-[9px] font-semibold uppercase tracking-widest">Chưa tính cọc</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {canViewCommissionPreview && (
                  <>
                  <div className="mt-6">
                    <SectionHeader icon={<Percent size={20} />} title="Preview hoa hồng" />
                  </div>
                  <div className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">Mô phỏng trực tiếp theo cấu hình hiện tại</p>
                        <p className="text-[11px] text-emerald-700/80 mt-1">Bao gồm hoa hồng trực tiếp và chia sẻ cấp trên theo hệ thống cộng tác.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handlePreviewCommission}
                        disabled={previewLoading}
                        className={`h-[35px] px-4 rounded-xl text-sm font-semibold text-white whitespace-nowrap ${previewLoading ? 'bg-emerald-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                        {previewLoading ? 'Đang tính...' : 'Tính preview'}
                      </button>
                    </div>

                    {previewError && (
                      <div className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                        {previewError}
                      </div>
                    )}

                    {commissionPreview && (
                      <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-gray-400 uppercase tracking-wider font-semibold">Nguồn rule</p>
                            <p className="text-gray-900 font-semibold">
                              {commissionPreview.source === 'rule_set' ? 'Bộ quy tắc' : 'Kế thừa'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-400 uppercase tracking-wider font-semibold">Số tiền gốc</p>
                            <p className="text-gray-900 font-semibold">{formatPrice(commissionPreview.base_amount || 0)}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 uppercase tracking-wider font-semibold">Tổng hoa hồng</p>
                            <p className="text-emerald-700 font-bold">{formatPrice(commissionPreview.grand_total_commission || 0)}</p>
                          </div>
                        </div>

                        {(commissionPreview.lines || []).length > 0 ? (
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-100">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-2.5 py-2 font-semibold text-gray-500 uppercase tracking-wider">Nhân viên</th>
                                  <th className="px-2.5 py-2 font-semibold text-gray-500 uppercase tracking-wider">Vai trò</th>
                                  <th className="px-2.5 py-2 font-semibold text-gray-500 uppercase tracking-wider">Loại</th>
                                  <th className="px-2.5 py-2 font-semibold text-gray-500 uppercase tracking-wider text-right">Tiền HH</th>
                                </tr>
                              </thead>
                              <tbody>
                                {commissionPreview.lines.map((line, index) => (
                                  <tr key={`${line.user_id}-${line.source_role}-${line.line_type}-${index}`} className="border-t border-gray-100">
                                    <td className="px-2.5 py-2 text-gray-700 font-medium">{line.full_name || `#${line.user_id}`}</td>
                                    <td className="px-2.5 py-2 text-gray-600">{getRoleLabel(line.source_role)}</td>
                                    <td className="px-2.5 py-2 text-gray-600">{line.line_type === 'uplink_share' ? 'Chia sẻ cấp trên' : 'Trực tiếp'}</td>
                                    <td className="px-2.5 py-2 text-right text-gray-900 font-semibold">{formatPrice(line.commission_amount || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">Chưa có dòng hoa hồng (kiểm tra lại người tạo đơn/driver hoặc rule hiện tại).</div>
                        )}
                      </div>
                    )}
                  </div>
                  </>
                  )}

                  <div className="mt-6">
                    <SectionHeader icon={<CircleDollarSign size={20} />} title="Thanh toán & Trạng thái" />
                  </div>
                  <div className="space-y-3">
                    {/* TÌNH TRẠNG THANH TOÁN */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative group">
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Khách đã thanh toán (VND)</label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><CircleDollarSign size={14} /></div>
                          <input
                            type="text"
                            value={formatCurrencyInput(formData.paid_amount)}
                            onChange={(e) => setFormData({ ...formData, paid_amount: parseCurrencyInput(e.target.value) })}
                            className="w-full h-[35px] pl-9 pr-4 py-1 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-sm font-semibold text-primary"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="relative group">
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Còn thiếu (VND)</label>
                        <div className="relative">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"><CircleDollarSign size={14} /></div>
                          <input
                            type="text"
                            value={formatCurrencyInput(Math.max(0, grandTotal - (Number(formData.paid_amount) || 0)))}
                            disabled
                            className="w-full h-[35px] pl-9 pr-4 py-1 bg-gray-100 border border-gray-100 rounded-xl text-sm font-semibold text-gray-500 cursor-not-allowed"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* TRẠNG THÁI ĐƠN HÀNG */}
                    <div className="pt-2.5 border-t border-gray-50">
                      <div className="relative group flex flex-col justify-end w-full">
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Trạng thái đơn</label>
                        <CustomSelect
                          options={[
                            { value: 'pending', label: 'Chờ giao' },
                            { value: 'active', label: 'Đang thuê' },
                            { value: 'completed', label: 'Hoàn thành' },
                            { value: 'cancelled', label: 'Đã hủy' }
                          ]}
                          value={formData.status || 'pending'}
                          onChange={(val) => setFormData({ ...formData, status: val })}
                          labelField="label"
                          valueField="value"
                          disabled={!isAdmin && !isCameraManager && !isDriver}
                          className="h-[35px]"
                          buttonClassName="rounded-xl px-4 py-1 text-sm"
                        />
                      </div>
                    </div>

                    {/* GHI CHÚ */}
                    <div className="relative group pt-3 border-t border-gray-50">
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Ghi chú thêm</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-colors text-sm font-semibold min-h-[88px]"
                        placeholder="Yêu cầu đặc biệt, tình trạng máy..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-5">
                    <SectionHeader icon={<Tag size={20} />} title="Khuyến mãi" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Loại giảm giá</label>
                        <div className="flex h-[35px] bg-gray-50 p-0.5 rounded-xl border border-gray-100">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, discount_type: 'fixed', custom_total: null })}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-semibold uppercase transition-all ${formData.discount_type === 'fixed' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            Số tiền (đ)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              let newAmount = formData.discount_amount;
                              if (newAmount > 100) newAmount = 100;
                              setFormData({ ...formData, discount_type: 'percentage', discount_amount: newAmount, custom_total: null });
                            }}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-semibold uppercase transition-all ${formData.discount_type === 'percentage' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            Phần trăm (%)
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Mức giảm</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formatCurrencyInput(formData.discount_amount)}
                            onChange={(e) => {
                              let val = parseCurrencyInput(e.target.value);
                              if (formData.discount_type === 'percentage' && val > 100) val = 100;
                              if (formData.discount_type === 'fixed' && val > MAX_DISCOUNT_AMOUNT) val = MAX_DISCOUNT_AMOUNT;
                              setFormData({ ...formData, discount_amount: val, custom_total: null });
                            }}
                            className="w-full h-[35px] pl-4 pr-10 py-1 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-sm font-semibold text-primary"
                            placeholder="0"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400 uppercase">
                            {formData.discount_type === 'percentage' ? '%' : 'đ'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <SectionHeader icon={<ImageIcon2 size={20} />} title="Minh chứng & Ảnh đính kèm" />
                  <div className="space-y-4">
                    <div
                      className="min-h-[150px] lg:min-h-[174px] border-2 border-dashed border-gray-100 rounded-[1.5rem] p-5 sm:p-6 flex flex-col items-center justify-center hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer group relative"
                      onClick={() => document.getElementById('image-upload').click()}
                    >
                      <input
                        id="image-upload"
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                      <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                        <Upload size={20} />
                      </div>
                      <p className="text-xs font-semibold text-gray-900 uppercase tracking-widest">Tải ảnh lên</p>
                      <p className="text-[11px] text-gray-400 mt-1">PNG, JPG, JPEG (Tối đa 5MB/ảnh)</p>
                    </div>

                    {isFetchingImages ? (
                      <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="aspect-square bg-gray-50 rounded-2xl border border-gray-100 animate-pulse flex items-center justify-center">
                            <ImageIcon size={24} className="text-gray-200" />
                          </div>
                        ))}
                      </div>
                    ) : imagePreviews.length > 0 ? (
                      <div className="grid grid-cols-3 gap-4">
                        {imagePreviews.map((url, index) => (
                          <div key={index} className="relative aspect-square group animate-in zoom-in-95 duration-300">
                            <img src={url} className="w-full h-full object-cover rounded-2xl shadow-sm border border-gray-100" alt="Preview" />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute -top-2 -right-2 p-1.5 bg-white shadow-lg text-red-500 rounded-full hover:scale-110 transition-all border border-red-50"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : editingItem ? (
                      <div className="bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 py-20 flex flex-col items-center justify-center text-center">
                        <ImageIcon className="text-gray-300 mb-2" size={32} />
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Không có ảnh đính kèm</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Modal Footer: Controls */}
        <div
          className="px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center gap-3 shrink-0"
        >
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-3 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-semibold text-gray-400 hover:text-gray-900 transition-all uppercase tracking-wider sm:tracking-widest text-[10px] sm:text-xs whitespace-nowrap"
          >
            {step === 1 ? 'Hủy bỏ' : 'Quay lại'}
          </button>

          <div className="flex min-w-0 justify-end gap-3 sm:gap-4">
            {step < 3 ? (
              <button
                onClick={() => {
                  if (step === 1) {
                    if (isCreatingCustomer) {
                      if (!newCustomerData.name?.trim()) {
                        toast.error("Vui lòng nhập tên khách hàng");
                        return;
                      }
                      const duplicate = customers.find(c =>
                        c.name.trim().toLowerCase() === newCustomerData.name.trim().toLowerCase() &&
                        c.phone?.trim() === newCustomerData.phone?.trim()
                      );
                      if (duplicate) {
                        toast.error(`Khách hàng "${duplicate.name}" với số điện thoại này đã tồn tại.`);
                        return;
                      }
                    }
                    if (!formData.handover_user_id) {
                      toast.error("Vui lòng chọn người giao nhận máy");
                      return;
                    }
                  }
                  setStep(step + 1);
                }}
                disabled={
                  (step === 1 && (
                    (!isCreatingCustomer && !formData.customer_id) ||
                    (isCreatingCustomer && !newCustomerData?.name) ||
                    !!duplicateError ||
                    !formData.start_date || !formData.end_date || !formData.pickup_branch_id || !formData.return_branch_id ||
                    !formData.handover_user_id
                  )) ||
                  (step === 2 && !formData.equipment_id)
                }
                className="px-4 sm:px-8 py-2.5 sm:py-3 bg-secondary text-white rounded-xl sm:rounded-2xl font-semibold uppercase tracking-wider sm:tracking-widest text-[10px] sm:text-xs shadow-lg shadow-secondary/20 hover:shadow-secondary/30 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale whitespace-nowrap"
              >
                Tiếp tục <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={editingItem ? () => setShowConfirmUpdate(true) : handleSubmit}
                disabled={saving || (formData.deposit_type === 'item' && imagePreviews.length === 0)}
                className="px-4 sm:px-10 py-2.5 sm:py-3 bg-primary text-white rounded-xl sm:rounded-2xl font-semibold uppercase tracking-wider sm:tracking-widest text-[10px] sm:text-xs shadow-lg shadow-primary/30 hover:shadow-primary/40 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none flex items-center gap-2 whitespace-nowrap"
              >
                {saving ? 'Đang xử lý...' : (editingItem ? 'Cập nhật đơn' : 'Hoàn tất & Tạo đơn')}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        show={showConfirmUpdate}
        onClose={() => setShowConfirmUpdate(false)}
        onConfirm={handleSubmit}
        title="Cập nhật đơn thuê?"
        message="Bạn có chắc chắn muốn lưu các thay đổi cho đơn thuê này không?"
        confirmLabel="Đồng ý cập nhật"
        type="primary"
      />
    </div>
  );
};

// Internal Sub-components for cleaner code
const StepItem = ({ current, target, icon, label }) => {
  const active = current === target;
  const completed = current > target;
  return (
    <div className={`flex flex-col items-center gap-1.5 sm:gap-2 transition-all duration-500 ${active || completed ? 'opacity-100' : 'opacity-30'}`}>
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-500 ${completed ? 'bg-green-500 text-white' : active ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-110' : 'bg-white border border-gray-200 text-gray-400'}`}>
        {completed ? <CheckCircle2 size={20} /> : icon}
      </div>
      <span className={`text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-center leading-tight ${active ? 'text-primary' : 'text-gray-400'}`}>{label}</span>
    </div>
  );
};

const StepDivider = ({ active }) => (
  <div className="w-8 sm:w-16 h-px bg-gray-200 mx-2 sm:mx-4 relative overflow-hidden">
    {active && <div className="absolute inset-0 bg-primary animate-in slide-in-from-left duration-700" />}
  </div>
);

// Helper for section grouping
const SectionHeader = ({ icon, title }) => (
  <div className="flex items-center gap-3">
    <div className="p-2 sm:p-2.5 bg-primary/10 text-primary rounded-xl">{icon}</div>
    <h3 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight">{title}</h3>
  </div>
);

export default RentalModal;
