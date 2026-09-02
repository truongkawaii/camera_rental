import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRentals, createRental, updateRental, updateRentalStatus, deleteRental, getEquipment, getCustomers, uploadRentalImages, createCustomer, getBranches, getUsers, updateCustomer } from '../../api/client';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import Pagination from '../../components/Pagination';
import { useToast, ToastContainer } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';

// Components
import RentalList from './components/RentalList';
import RentalModal from './components/RentalModal';
import StatusModal from './components/StatusModal';
import DeleteModal from './components/DeleteModal';

// Utils
import { formatDateTimeForInput, getAllImages } from '../../utils/formatters';

const EMPTY_FORM = {
  customer_id: '', equipment_id: '',
  start_date: '', start_period: 'sáng',
  end_date: '', end_period: 'chiều',
  status: 'pending', notes: '', deposit_amount: 0, accessories: [],
  pickup_time: '', return_time: '',
  discount_amount: 0, discount_type: 'fixed', code: '', pickup_branch_id: '', return_branch_id: '', branch_id: '',
  paid_amount: 0, deposit_type: 'money', user_id: '', handover_user_id: '',
  applied_day_price: null, used_discount_day_price: false, discount_day_price: null, discount_day_threshold_snapshot: null
};
const EMPTY_CUSTOMER = { name: '', phone: '', email: '', address: '' };
const isNewImagePreview = (image) => typeof image === 'string' && image.startsWith('data:image/');
const getNewImageIndex = (previews, index) => previews.slice(0, index + 1).filter(isNewImagePreview).length - 1;

const STATUS_MAP = {
  pending: { label: 'Chờ giao', cls: 'bg-amber-50 text-amber-600 border border-amber-100' },
  active: { label: 'Đang thuê', cls: 'bg-blue-50 text-blue-600 border border-blue-100' },
  completed: { label: 'Hoàn thành', cls: 'bg-emerald-50 text-emerald-600 border border-emerald-100' },
  cancelled: { label: 'Đã hủy', cls: 'bg-rose-50 text-rose-600 border border-rose-100' },
};

const Rentals = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rentals, setRentals] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState(searchParams.get('view') || '');
  const [sortKey, setSortKey] = useState('created_desc');
  const [pickupDateFilter, setPickupDateFilter] = useState('');
  const [returnDateFilter, setReturnDateFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [pickupBranchFilter, setPickupBranchFilter] = useState('');
  const [returnBranchFilter, setReturnBranchFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [createdDateFilter, setCreatedDateFilter] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  // New Customer state
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState(EMPTY_CUSTOMER);
  const [editCustomerData, setEditCustomerData] = useState(null); // { id, name, phone, email }

  // Images
  const [imagePreviews, setImagePreviews] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagesDirty, setImagesDirty] = useState(false);

  // Modals visibility
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [quickStatus, setQuickStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const { toast, toasts, removeToast } = useToast();
  const { isAdmin, isCameraManager, isInvestor, isSaler, isDriver, hasRole, user } = useAuth();
  const canManageRentals = isCameraManager || isInvestor;
  const canQuickStatusEdit = canManageRentals || hasRole('driver');

  // Handle search debouncing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(handler);
  }, [search]);

  const startParam = searchParams.get('startDate') || '';
  const endParam = searchParams.get('endDate') || '';

  useEffect(() => {
    const scrollArea = document.getElementById('main-scroll-area');
    if (scrollArea) {
      scrollArea.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }
    loadData();
  }, [currentPage, statusFilter, debouncedSearch, view, startParam, endParam, sortKey, pickupDateFilter, returnDateFilter, ownerFilter, pickupBranchFilter, returnBranchFilter, creatorFilter, createdDateFilter, user?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rentalsRes, equipRes, customersRes, branchesRes, usersRes] = await Promise.allSettled([
        getRentals(currentPage, 5, statusFilter, debouncedSearch, view, startParam, endParam, sortKey, pickupDateFilter, returnDateFilter, ownerFilter, pickupBranchFilter, returnBranchFilter, creatorFilter, createdDateFilter),
        getEquipment(1, 100),
        getCustomers(1, 100),
        getBranches(),
        getUsers(isAdmin ? 'admin' : null)
      ]);

      if (rentalsRes.status === 'fulfilled') {
        setRentals(rentalsRes.value.data.data || []);
        setTotalPages(rentalsRes.value.data.pagination?.totalPages || 1);
      } else {
        setRentals([]);
        setTotalPages(1);
      }

      setEquipment(equipRes.status === 'fulfilled' ? (equipRes.value.data.data || []) : []);
      setCustomers(customersRes.status === 'fulfilled' ? (customersRes.value.data.data || []) : []);
      setBranches(branchesRes.status === 'fulfilled' ? (branchesRes.value.data || []) : []);

      if (usersRes.status === 'fulfilled') {
        setUsers(usersRes.value.data.data || usersRes.value.data || []);
        setUsersLoaded(true);
      } else {
        setUsers([]);
        setUsersLoaded(false);
      }

      if (rentalsRes.status === 'rejected') {
        toast.error('Không thể tải danh sách đơn thuê');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Không thể tải dữ liệu đơn thuê');
    } finally {
      setLoading(false);
    }
  };

  const ensureUsersLoaded = async () => {
    if (usersLoaded) return;
    try {
      const usersRes = await getUsers(isAdmin ? 'admin' : null);
      setUsers(usersRes.data.data || usersRes.data || []);
      setUsersLoaded(true);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Không thể tải danh sách người tạo');
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    // Validation
    if (!isCreatingCustomer && !formData.customer_id) {
      toast.error("Vui lòng chọn khách hàng");
      setSaving(false);
      return;
    }
    if (!formData.equipment_id) {
      toast.error("Vui lòng chọn thiết bị chính");
      setSaving(false);
      return;
    }
    if (!formData.start_date || !formData.end_date) {
      toast.error("Vui lòng chọn thời gian thuê");
      setSaving(false);
      return;
    }
    if (formData.deposit_type === 'item' && imagePreviews.length === 0) {
      toast.error("Vui lòng tải lên ảnh minh chứng cọc vật dụng");
      setSaving(false);
      return;
    }

    setSaving(true);
    try {
      let currentFormData = { ...formData };

      // Handle new customer
      if (isCreatingCustomer) {
        if (!newCustomerData.name) {
          toast.error("Vui lòng nhập tên khách hàng");
          setSaving(false);
          return;
        }
        const custRes = await createCustomer(newCustomerData);
        currentFormData.customer_id = custRes.data.id;
      }

      if (editingItem) {
        if (editCustomerData && String(editCustomerData.id) === String(currentFormData.customer_id)) {
          const original = customers.find((c) => String(c.id) === String(editCustomerData.id));
          const editedCustomer = {
            name: (editCustomerData.name || '').trim(),
            phone: (editCustomerData.phone || '').trim(),
            email: (editCustomerData.email || '').trim()
          };

          if (!editedCustomer.name) {
            toast.error("Vui lòng nhập tên khách hàng");
            setSaving(false);
            return;
          }

          const normalize = (value) => (value || '').trim().toLowerCase();
          const findDuplicateCustomer = (list = []) => list.find((customer) =>
            String(customer.id) !== String(editCustomerData.id) &&
            normalize(customer.name) === normalize(editedCustomer.name) &&
            normalize(customer.phone) === normalize(editedCustomer.phone)
          );

          let duplicateCustomer = editedCustomer.phone ? findDuplicateCustomer(customers) : null;
          if (!duplicateCustomer && editedCustomer.phone) {
            const duplicateRes = await getCustomers(1, 100, editedCustomer.phone);
            duplicateCustomer = findDuplicateCustomer(duplicateRes.data.data || []);
          }

          const changed =
            (original?.name ?? '') !== editedCustomer.name ||
            (original?.phone ?? '') !== editedCustomer.phone ||
            (original?.email ?? '') !== editedCustomer.email;

          if (duplicateCustomer) {
            currentFormData.customer_id = duplicateCustomer.id;
          } else if (changed) {
            await updateCustomer(editCustomerData.id, {
              name: editedCustomer.name,
              phone: editedCustomer.phone,
              email: editedCustomer.email
            });
          }
        }

        await updateRental(editingItem.id, currentFormData);
        if (imagesDirty) {
          await uploadRentalImages(editingItem.id, imagePreviews, selectedImageFiles.map((file) => file.name));
        }
        toast.success('Cập nhật thành công');
      } else {
        const rentalRes = await createRental(currentFormData);
        if (imagePreviews.length > 0) {
          await uploadRentalImages(rentalRes.data.id, imagePreviews, selectedImageFiles.map((file) => file.name));
        }
        toast.success('Tạo đơn thuê mới thành công');
      }

      resetModal();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Lưu đơn thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRental(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Đã xóa đơn thuê');
      loadData();
    } catch (error) {
      toast.error('Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickStatusSave = async () => {
    if (!statusTarget) return;
    setSavingStatus(true);
    try {
      await updateRentalStatus(statusTarget.id, quickStatus);
      toast.success(`Cập nhật thành công`);
      setStatusTarget(null);
      loadData();
    } catch (error) {
      toast.error('Cập nhật thất bại');
    } finally {
      setSavingStatus(false);
    }
  };

  const resetModal = () => {
    setFormData(EMPTY_FORM);
    setNewCustomerData(EMPTY_CUSTOMER);
    setIsCreatingCustomer(false);
    setEditCustomerData(null);
    setImagePreviews([]);
    setSelectedImageFiles([]);
    setShowModal(false);
    setStep(1);
    setImagesDirty(false);
  };

  const openCreateModal = async () => {
    setEditingItem(null);
    setImagePreviews([]);
    setSelectedImageFiles([]);
    setImagesDirty(false);
    setFormData({ ...EMPTY_FORM, user_id: user?.id || '' });
    setShowModal(true);
    setIsCreatingCustomer(true);
    setEditCustomerData(null);
    await ensureUsersLoaded();
  };

  const openEditModal = async (item) => {
    setEditingItem(item);
    setImagePreviews(getAllImages(item.images));
    setSelectedImageFiles([]);
    setImagesDirty(false);
    const cust = customers.find((c) => String(c.id) === String(item.customer_id));
    setEditCustomerData(cust
      ? { id: cust.id, name: cust.name || '', phone: cust.phone || '', email: cust.email || '' }
      : (item.customer_id ? { id: item.customer_id, name: item.customer_name || '', phone: item.customer_phone || '', email: '' } : null)
    );
    setFormData({
      customer_id: item.customer_id,
      equipment_id: item.equipment_id,
      start_date: item.start_date?.split('T')[0] || '',
      start_period: item.start_period || 'sáng',
      end_date: item.end_date?.split('T')[0] || '',
      end_period: item.end_period || 'chiều',
      status: item.status,
      notes: item.notes || '',
      deposit_amount: item.deposit_amount || 0,
      accessories: Array.isArray(item.accessories) ? item.accessories : [],
      pickup_time: formatDateTimeForInput(item.pickup_time),
      return_time: formatDateTimeForInput(item.return_time),
      discount_amount: item.discount_amount || 0,
      discount_type: item.discount_type || 'fixed',
      applied_day_price: item.applied_day_price ?? null,
      used_discount_day_price: Boolean(item.used_discount_day_price),
      discount_day_price: item.discount_day_price ?? null,
      discount_day_threshold_snapshot: item.discount_day_threshold_snapshot ?? null,
      code: item.code || '',
      pickup_branch_id: item.pickup_branch_id || '',
      return_branch_id: item.return_branch_id || item.pickup_branch_id || '',
      branch_id: item.branch_id || '',
      custom_total: item.total_price != null ? Number(item.total_price) : null,
      paid_amount: item.paid_amount || 0,
      deposit_type: item.deposit_type || 'money',
      user_id: item.user_id || '',
      handover_user_id: item.handover_user_id || ''
    });

    setShowModal(true);
    await ensureUsersLoaded();
  };

  const calculateTotalDays = () => {
    if (!formData.start_date || !formData.end_date) return { fullDays: 0, sessions: 0 };
    const d1Str = formData.start_date.split('T')[0];
    const d2Str = formData.end_date.split('T')[0];
    const d1 = new Date(d1Str + 'T00:00:00Z');
    const d2 = new Date(d2Str + 'T00:00:00Z');
    const daysDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

    const pIdx = { 'sáng': 0, 'chiều': 1, 'tối': 2 };
    const p1 = pIdx[formData.start_period] ?? 0;
    const p2 = pIdx[formData.end_period] ?? 1;

    // Same day
    if (daysDiff === 0) {
      const sessionCount = Math.max(1, p2 - p1 + 1);
      if (sessionCount >= 2) return { fullDays: 1, sessions: 0 };
      return { fullDays: 0, sessions: sessionCount };
    }

    // Multi-day: count each calendar day separately
    let fullDays = 0;
    let sessions = 0;

    // Middle full days
    if (daysDiff > 1) {
      fullDays += (daysDiff - 1);
    }

    // Start day: 2+ sessions = 1 day
    const startDaySessions = 3 - p1;
    if (startDaySessions >= 2) {
      fullDays += 1;
    } else {
      sessions += startDaySessions;
    }

    // End day: 2+ sessions = 1 day
    const endDaySessions = p2 + 1;
    if (endDaySessions >= 2) {
      fullDays += 1;
    } else {
      sessions += endDaySessions;
    }

    return { fullDays, sessions };
  };

  const renderTotalTime = ({ fullDays, sessions } = {}) => {
    const parts = [];
    if (fullDays > 0) parts.push(`${fullDays} ngày`);
    if (sessions > 0) parts.push(`${sessions} buổi`);
    return parts.length > 0 ? parts.join(', ') : '0 buổi';
  };

  // Ensure editing item's customer and branches are always in the dropdown options,
  // even if not loaded in the first page (pagination) or soft-deleted.
  const augmentedCustomers = React.useMemo(() => {
    if (!editingItem?.customer_id) return customers;
    const exists = customers.some(c => String(c.id) === String(editingItem.customer_id));
    if (exists) return customers;
    const synthetic = {
      id: editingItem.customer_id,
      name: editingItem.customer_name || `Khách #${editingItem.customer_id}`,
      phone: editingItem.customer_phone || '',
      email: '',
      total_rentals: 0,
      is_blacklisted: false,
    };
    return [synthetic, ...customers];
  }, [customers, editingItem]);

  const augmentedBranches = React.useMemo(() => {
    if (!editingItem) return branches;
    const result = [...branches];
    const addIfMissing = (id, name) => {
      if (id && !result.some(b => String(b.id) === String(id))) {
        result.push({ id, name: name || `Chi nhánh #${id}` });
      }
    };
    addIfMissing(editingItem.pickup_branch_id, editingItem.pickup_branch_name);
    addIfMissing(editingItem.return_branch_id, editingItem.return_branch_name);
    addIfMissing(editingItem.branch_id, editingItem.original_branch_name);
    return result;
  }, [branches, editingItem]);

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <div className="max-w-[1600px] mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-xl md:text-3xl font-semibold text-gray-900 tracking-tight flex items-center gap-2.5 md:gap-3">
              <CalendarIcon className="text-primary w-7 h-7 md:w-9 md:h-9" />
              Quản Lý Đơn Thuê
            </h1>
            <p className="text-gray-500 mt-1 md:mt-1.5 font-medium text-[13px] md:text-sm">Theo dõi và vận hành đơn hàng camera</p>
          </div>
          <button
            onClick={openCreateModal}
            className="h-[35px] px-5 md:px-7 bg-primary text-white rounded-2xl font-semibold uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center gap-2 md:gap-2.5 w-full md:w-auto justify-center text-[11px] md:text-xs"
          >
            <Plus size={20} className="md:w-6 md:h-6" /> Tạo Đơn Mới
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <RentalList
            loading={loading}
            rentals={rentals}
            isAdmin={isAdmin}
            canQuickStatusEdit={canQuickStatusEdit}
            STATUS_MAP={STATUS_MAP}
            equipment={equipment}
            statusFilter={statusFilter}
            setStatusFilter={(val) => {
              setStatusFilter(val);
              setView('');
              setSearchParams({});
              setCurrentPage(1);
            }}
            view={view}
            setView={(val) => {
              setView(val);
              if (!val) setSearchParams({});
              setCurrentPage(1);
            }}
            search={search}
            setSearch={(val) => {
              setSearch(val);
              if (val) {
                setView('');
                setSearchParams({});
              }
            }}
            sortKey={sortKey}
            setSortKey={(val) => {
              setSortKey(val);
              setCurrentPage(1);
            }}
            pickupDateFilter={pickupDateFilter}
            setPickupDateFilter={(val) => {
              setPickupDateFilter(val);
              if (val) {
                setView('');
                setSearchParams({});
              }
              setCurrentPage(1);
            }}
            returnDateFilter={returnDateFilter}
            setReturnDateFilter={(val) => {
              setReturnDateFilter(val);
              if (val) {
                setView('');
                setSearchParams({});
              }
              setCurrentPage(1);
            }}
            ownerFilter={ownerFilter}
            setOwnerFilter={(val) => {
              setOwnerFilter(val);
              setCurrentPage(1);
            }}
            pickupBranchFilter={pickupBranchFilter}
            setPickupBranchFilter={(val) => {
              setPickupBranchFilter(val);
              setCurrentPage(1);
            }}
            returnBranchFilter={returnBranchFilter}
            setReturnBranchFilter={(val) => {
              setReturnBranchFilter(val);
              setCurrentPage(1);
            }}
            creatorFilter={creatorFilter}
            setCreatorFilter={(val) => {
              setCreatorFilter(val);
              setCurrentPage(1);
            }}
            createdDateFilter={createdDateFilter}
            setCreatedDateFilter={(val) => {
              setCreatedDateFilter(val);
              if (val) {
                setView('');
                setSearchParams({});
              }
              setCurrentPage(1);
            }}
            owners={(users || []).filter((item) =>
              (item.roles || []).some((role) => role.name === 'investor')
            )}
            creators={(users || []).filter((item) =>
              (item.roles || []).some((role) => ['admin', 'camera_manager', 'investor', 'saler'].includes(role.name))
            )}
            branches={branches}
            isSaler={isSaler}
            openStatusModal={(r) => { setStatusTarget(r); setQuickStatus(r.status); }}
            openEditModal={openEditModal}
            setDeleteTarget={setDeleteTarget}
            startDate={startParam}
            endDate={endParam}
          />

          <div className="px-6 py-4 border-t border-gray-100">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      <RentalModal
        showModal={showModal}
        onClose={resetModal}
        step={step}
        setStep={setStep}
        editingItem={editingItem}
        saving={saving}
        formData={formData}
        setFormData={setFormData}
        editCustomerData={editCustomerData}
        setEditCustomerData={setEditCustomerData}
        isCreatingCustomer={isCreatingCustomer}
        setIsCreatingCustomer={setIsCreatingCustomer}
        newCustomerData={newCustomerData}
        setNewCustomerData={setNewCustomerData}
        customers={augmentedCustomers}
        equipment={equipment}
        branches={augmentedBranches}
        users={users}
        handleSubmit={handleSubmit}
        imagePreviews={imagePreviews}
        handleImageSelect={(e) => {
          const files = Array.from(e.target.files || []);
          setSelectedImageFiles(prev => [...prev, ...files]);
          if (files.length > 0) setImagesDirty(true);
          files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => setImagePreviews(prev => [...prev, e.target.result]);
            reader.readAsDataURL(file);
          });
        }}
        removeImage={(index) => {
          if (isNewImagePreview(imagePreviews[index])) {
            const fileIndex = getNewImageIndex(imagePreviews, index);
            setSelectedImageFiles(prev => prev.filter((_, i) => i !== fileIndex));
          }
          setImagePreviews(prev => prev.filter((_, i) => i !== index));
          setImagesDirty(true);
        }}
        calculateTotalDays={calculateTotalDays}
        renderTotalTime={renderTotalTime}
        isAdmin={isAdmin}
        isCameraManager={canManageRentals}
        isSaler={isSaler}
        isDriver={isDriver}
        isFetchingImages={false}
        currentUserId={user?.id}
        toast={toast}
      />

      <StatusModal
        statusTarget={statusTarget}
        quickStatus={quickStatus}
        setQuickStatus={setQuickStatus}
        onSave={handleQuickStatusSave}
        onCancel={() => setStatusTarget(null)}
        savingStatus={savingStatus}
        STATUS_MAP={STATUS_MAP}
      />

      <DeleteModal
        target={deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        deleting={deleting}
      />
    </div>
  );
};

export default Rentals;
