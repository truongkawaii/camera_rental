import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getEquipment, createEquipment, updateEquipment, deleteEquipment, uploadEquipmentImages, getBranches, getUsers, getEquipmentModels, getEquipmentBrands, getEquipmentRanking } from '../../api/client';
import { Plus, FilterX, Search, X, SlidersHorizontal, ChevronDown, BarChart3 } from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { getAllImages } from '../../utils/formatters';
import { EMPTY_FORM } from './utils';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import CustomSelect from '../../components/CustomSelect';
import EquipmentList from './components/EquipmentList';
import EquipmentModal from './components/EquipmentModal';
import DeleteModal from './components/DeleteModal';
import EquipmentRankingModal from './components/EquipmentRankingModal';

const isNewImagePreview = (image) => typeof image === 'string' && image.startsWith('data:image/');
const getNewImageIndex = (previews, index) => previews.slice(0, index + 1).filter(isNewImagePreview).length - 1;

const Equipment = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [branches, setBranches] = useState([]);
  const [owners, setOwners] = useState([]);
  const [models, setModels] = useState([]);
  const [brands, setBrands] = useState([]);
  
  // Model & Brand filters
  const [modelFilter, setModelFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Owner & Branch filters
  const [ownerFilter, setOwnerFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  const activeFilterCount = [branchFilter, modelFilter, brandFilter, ownerFilter].filter(Boolean).length;
  
  // Filtering and Sorting
  const [month, setMonth] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const availabilityStatus = searchParams.get('availabilityStatus') || '';
  const asOf = searchParams.get('asOf') || '';
  const availabilityLabel = availabilityStatus === 'active'
    ? 'Đang thuê'
    : availabilityStatus === 'available'
      ? 'Thiết bị trống'
      : '';

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagesDirty, setImagesDirty] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Ranking modal
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [rankingData, setRankingData] = useState([]);
  const [rankingLoading, setRankingLoading] = useState(false);

  const { toasts, toast, removeToast } = useToast();
  const { isAdmin, isSaler, isCameraManager, isInvestor, activeRole, user } = useAuth();
  const canManage = isAdmin || isCameraManager || isInvestor;
  const canEditOwner = isAdmin || isCameraManager;
  const equipmentStatsVisibility = ['sale', 'saler', 'manager', 'camera_manager'].includes(activeRole)
    || (!activeRole && (isSaler || isCameraManager) && !isAdmin)
    ? 'sensitive'
    : activeRole === 'driver'
      ? 'metrics-only'
      : 'full';

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => {
    if (canEditOwner) loadOwners();
  }, [canEditOwner]);
  useEffect(() => { loadModels(); }, []);
  useEffect(() => { loadBrands(); }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { loadEquipment(); }, [currentPage, month, sortBy, sortOrder, debouncedSearch, availabilityStatus, asOf, ownerFilter, branchFilter, modelFilter, brandFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [availabilityStatus, asOf]);

  const loadBranches = useCallback(async () => {
    try {
      const res = await getBranches();
      setBranches(res.data);
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  }, []);

  const loadOwners = useCallback(async () => {
    try {
      const res = await getUsers();
      const investorUsers = (res.data || []).filter((item) =>
        (item.roles || []).some((role) => role.name === 'investor')
      );
      setOwners(investorUsers);
    } catch (err) {
      console.error('Failed to load owners:', err);
    }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const res = await getEquipmentModels();
      setModels(res.data.data || []);
    } catch (err) {
      console.error('Failed to load models:', err);
    }
  }, []);

  const loadBrands = useCallback(async () => {
    try {
      const res = await getEquipmentBrands();
      setBrands(res.data.data || []);
    } catch (err) {
      console.error('Failed to load brands:', err);
    }
  }, []);

  const loadEquipment = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEquipment(
        currentPage,
        5,
        month,
        sortBy,
        sortOrder,
        debouncedSearch,
        availabilityStatus,
        asOf,
        ownerFilter,
        branchFilter,
        modelFilter,
        brandFilter
      );
      setEquipment(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
      setTotalItems(res.data.pagination.total || 0);
    } catch (err) {
      console.error('Failed to load equipment:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, month, sortBy, sortOrder, debouncedSearch, availabilityStatus, asOf, ownerFilter, branchFilter, modelFilter, brandFilter]);

  const clearAvailabilityFilter = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('availabilityStatus');
    nextParams.delete('asOf');
    setSearchParams(nextParams);
  };

  const openAddModal = () => {
    setEditingItem(null);
    setIsDuplicating(false);
    setFormData({ ...EMPTY_FORM, owner_id: isInvestor ? user?.id || '' : '' });
    setImagePreviews([]);
    setSelectedImageFiles([]);
    setImagesDirty(false);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setIsDuplicating(false);
    setFormData({
      name: item.name, category: item.category,
      brand: item.brand || '',
      model: item.model || '',
      price_per_day: item.price_per_day,
      price_per_session: item.price_per_session || '',
      price_per_day_discount: item.price_per_day_discount || '',
      discount_day_threshold: item.discount_day_threshold || '',
      code: item.code, condition: item.condition,
      branch_id: item.branch_id || '',
      owner_id: item.owner_id || '',
    });
    setImagePreviews(getAllImages(item.images));
    setSelectedImageFiles([]);
    setImagesDirty(false);
    setShowModal(true);
  };

  const openDuplicateModal = (item) => {
    setEditingItem(null);
    setIsDuplicating(true);
    const suggestedCode = item.code ? `${item.code}-copy` : '';
    setFormData({
      name: item.name,
      category: item.category,
      brand: item.brand || '',
      model: item.model || '',
      price_per_day: item.price_per_day,
      price_per_session: item.price_per_session || '',
      price_per_day_discount: item.price_per_day_discount || '',
      discount_day_threshold: item.discount_day_threshold || '',
      code: suggestedCode,
      condition: item.condition || 'good',
      branch_id: item.branch_id || '',
      owner_id: item.owner_id || '',
    });
    setImagePreviews(getAllImages(item.images));
    setSelectedImageFiles([]);
    setImagesDirty(true);
    setShowModal(true);
  };

  const handleSelectTemplate = (item) => {
    setIsDuplicating(true);
    const suggestedCode = item.code ? `${item.code}-copy` : '';
    setFormData((prev) => ({
      ...prev,
      name: item.name,
      category: item.category,
      brand: item.brand || '',
      model: item.model || '',
      price_per_day: item.price_per_day,
      price_per_session: item.price_per_session || '',
      price_per_day_discount: item.price_per_day_discount || '',
      discount_day_threshold: item.discount_day_threshold || '',
      code: prev.code ? prev.code : suggestedCode,
      condition: item.condition || 'good',
      branch_id: prev.branch_id || item.branch_id || '',
      owner_id: prev.owner_id || item.owner_id || '',
    }));
    const imgs = getAllImages(item.images);
    if (imgs.length > 0) {
      setImagePreviews(imgs);
      setSelectedImageFiles([]);
      setImagesDirty(true);
    }
    toast.success(`Đã sao chép thông tin từ "${item.name}"`);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsDuplicating(false);
  };

  const openRankingModal = async () => {
    setShowRankingModal(true);
    setRankingLoading(true);
    try {
      const res = await getEquipmentRanking(month);
      setRankingData(res.data.data || []);
    } catch (err) {
      console.error('Failed to load equipment ranking:', err);
      toast.error('Không thể tải dữ liệu xếp hạng');
    } finally {
      setRankingLoading(false);
    }
  };

  const closeRankingModal = () => {
    setShowRankingModal(false);
  };

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (f.size > 2 * 1024 * 1024) { toast.error(`Ảnh ${f.name} vượt quá 2MB`); return false; }
      if (!f.type.startsWith('image/')) { toast.error(`Tệp ${f.name} không phải ảnh hợp lệ`); return false; }
      return true;
    });
    const toBase64 = (f) => new Promise((res) => {
      const r = new FileReader();
      r.onload = (ev) => res(ev.target?.result);
      r.readAsDataURL(f);
    });
    const b64 = await Promise.all(valid.map(toBase64));
    setSelectedImageFiles((prev) => [...prev, ...valid]);
    setImagePreviews((prev) => [...prev, ...b64]);
    if (valid.length > 0) setImagesDirty(true);
  };

  const removeImage = (i) => {
    if (isNewImagePreview(imagePreviews[i])) {
      const fileIndex = getNewImageIndex(imagePreviews, i);
      setSelectedImageFiles((files) => files.filter((_, idx) => idx !== fileIndex));
    }
    setImagePreviews((p) => p.filter((_, idx) => idx !== i));
    setImagesDirty(true);
  };

  const setPrimaryImage = (i) => {
    if (i === 0) return;
    setImagePreviews((p) => { const a = [...p]; a.unshift(a.splice(i, 1)[0]); return a; });
    setImagesDirty(true);
    if (isNewImagePreview(imagePreviews[i])) {
      const fileIndex = getNewImageIndex(imagePreviews, i);
      setSelectedImageFiles((files) => {
        const a = [...files];
        const [file] = a.splice(fileIndex, 1);
        if (file) a.unshift(file);
        return a;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate discount price & threshold
    if (formData.price_per_day_discount && !formData.discount_day_threshold) {
      toast.error('Vui lòng nhập "Áp dụng từ (số ngày)" khi có giá ưu đãi');
      return;
    }
    if (formData.discount_day_threshold && !formData.price_per_day_discount) {
      toast.error('Vui lòng nhập "Giá ưu đãi/ngày" khi có ngày áp dụng');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await updateEquipment(editingItem.id, formData);
        if (imagesDirty) await uploadEquipmentImages(editingItem.id, imagePreviews, selectedImageFiles.map((file) => file.name));
        toast.success('Cập nhật thiết bị thành công');
      } else {
        const res = await createEquipment(formData);
        if (imagePreviews.length > 0) await uploadEquipmentImages(res.data.id, imagePreviews, selectedImageFiles.map((file) => file.name));
        toast.success('Thêm thiết bị thành công');
      }
      setShowModal(false);
      loadEquipment();
    } catch (err) {
      toast.error('Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEquipment(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Đã xóa thiết bị');
      loadEquipment();
    } catch (err) {
      toast.error('Xóa thất bại. Thiết bị này có thể đang trong một đơn thuê.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4">
          <h1 className="text-3xl font-semibold text-gray-900">Thiết Bị</h1>
          <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:flex-1 xl:justify-end">
            {/* Search Input */}
            <div className="relative w-full md:flex-1 xl:max-w-2xl group">
              <Search 
                size={18} 
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors" 
              />
              <input
                type="text"
                placeholder="Tìm tên, mã, danh mục..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="box-border h-[35px] min-h-[35px] max-h-[35px] w-full py-0 pl-11 pr-10 leading-none bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all shadow-sm text-[14px] font-medium"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Xóa tìm kiếm"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {canManage && (
              <button
                onClick={openAddModal}
                className="h-[35px] w-full md:w-auto bg-primary text-white px-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all font-bold shadow-lg shadow-primary/20"
              >
                <Plus size={20} />
                Thêm Thiết Bị
              </button>
            )}

            {isAdmin && (
              <button
                onClick={openRankingModal}
                className="h-[35px] w-full md:w-auto bg-white text-slate-700 border border-slate-200 px-4 rounded-xl flex items-center justify-center gap-2 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-all font-semibold shadow-sm"
                title="Xem xếp hạng thiết bị"
              >
                <BarChart3 size={18} />
                Xếp Hạng
              </button>
            )}
          </div>
        </div>

        {/* Filters Row: Cơ sở, Model, Brand & Chủ sở hữu */}
        {equipmentStatsVisibility !== 'sensitive' && (
          <div className="mb-3">
            {/* ── Mobile: Collapsible filter bar ── */}
            <div className="flex lg:hidden items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="h-[35px] flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition-all hover:border-primary/30 hover:text-primary shadow-sm"
              >
                <SlidersHorizontal size={16} />
                Bộ lọc
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary text-white text-[11px] font-bold px-1">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`}
                />
              </button>

              <div className="h-[35px] flex-1 flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/60 px-3 shadow-sm">
                <span className="text-[13px] font-bold text-orange-600">{totalItems.toLocaleString('vi-VN')}</span>
                <span className="text-[13px] text-orange-400 font-semibold">thiết bị</span>
                {loading && (
                  <span className="ml-1 inline-block w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setOwnerFilter(''); setBranchFilter(''); setModelFilter(''); setBrandFilter(''); setCurrentPage(1); }}
                  className="h-[35px] inline-flex items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50/60 px-2.5 text-[13px] font-semibold text-orange-600 transition-colors hover:bg-orange-100 shrink-0"
                >
                  <FilterX size={16} />
                </button>
              )}
            </div>

            {/* ── Mobile & Tablet: Expandable filter panel ── */}
            <div
              className={`lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${
                showFilters ? 'max-h-[600px] opacity-100 mb-2' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="flex flex-col gap-2 p-3 rounded-xl border border-slate-200 bg-white shadow-sm">
                <CustomSelect
                  options={[{ value: '', label: 'Tất cả Cơ sở' }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]}
                  value={branchFilter}
                  onChange={(val) => { setBranchFilter(val); setCurrentPage(1); }}
                  placeholder="Tất cả Cơ sở"
                  labelField="label"
                  valueField="value"
                  showSearch={true}
                  autoFocusSearch={false}
                  accent="slate"
                  buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                />
                <CustomSelect
                  options={[{ value: '', label: 'Tất cả Model' }, ...models.map((m) => ({ value: m, label: m }))]}
                  value={modelFilter}
                  onChange={(val) => { setModelFilter(val); setCurrentPage(1); }}
                  placeholder="Tất cả Model"
                  labelField="label"
                  valueField="value"
                  showSearch={true}
                  autoFocusSearch={false}
                  accent="slate"
                  buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                />
                <CustomSelect
                  options={[{ value: '', label: 'Tất cả Brand' }, ...brands.map((b) => ({ value: b, label: b }))]}
                  value={brandFilter}
                  onChange={(val) => { setBrandFilter(val); setCurrentPage(1); }}
                  placeholder="Tất cả Brand"
                  labelField="label"
                  valueField="value"
                  showSearch={true}
                  autoFocusSearch={false}
                  accent="slate"
                  buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                />
                <CustomSelect
                  options={[{ value: '', label: 'Tất cả Chủ sở hữu' }, ...owners.map((o) => ({ value: String(o.id), label: o.full_name || o.username }))]}
                  value={ownerFilter}
                  onChange={(val) => { setOwnerFilter(val); setCurrentPage(1); }}
                  placeholder="Tất cả Chủ sở hữu"
                  labelField="label"
                  valueField="value"
                  showSearch={true}
                  autoFocusSearch={false}
                  accent="slate"
                  buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                />
              </div>
            </div>

            {/* ── Desktop (lg+): Inline filters ── */}
            <div className="hidden lg:flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-3">
              <div className="flex-1 w-full lg:w-auto flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-3">
                <div className="w-full lg:w-48">
                  <CustomSelect
                    options={[{ value: '', label: 'Tất cả Cơ sở' }, ...branches.map((b) => ({ value: String(b.id), label: b.name }))]}
                    value={branchFilter}
                    onChange={(val) => { setBranchFilter(val); setCurrentPage(1); }}
                    placeholder="Tất cả Cơ sở"
                    labelField="label"
                    valueField="value"
                    showSearch={true}
                    autoFocusSearch={false}
                    accent="slate"
                    buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                  />
                </div>
                <div className="w-full lg:w-48">
                  <CustomSelect
                    options={[{ value: '', label: 'Tất cả Model' }, ...models.map((m) => ({ value: m, label: m }))]}
                    value={modelFilter}
                    onChange={(val) => { setModelFilter(val); setCurrentPage(1); }}
                    placeholder="Tất cả Model"
                    labelField="label"
                    valueField="value"
                    showSearch={true}
                    autoFocusSearch={false}
                    accent="slate"
                    buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                  />
                </div>
                <div className="w-full lg:w-48">
                  <CustomSelect
                    options={[{ value: '', label: 'Tất cả Brand' }, ...brands.map((b) => ({ value: b, label: b }))]}
                    value={brandFilter}
                    onChange={(val) => { setBrandFilter(val); setCurrentPage(1); }}
                    placeholder="Tất cả Brand"
                    labelField="label"
                    valueField="value"
                    showSearch={true}
                    autoFocusSearch={false}
                    accent="slate"
                    buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                  />
                </div>
                <div className="w-full lg:w-48">
                  <CustomSelect
                    options={[{ value: '', label: 'Tất cả Chủ sở hữu' }, ...owners.map((o) => ({ value: String(o.id), label: o.full_name || o.username }))]}
                    value={ownerFilter}
                    onChange={(val) => { setOwnerFilter(val); setCurrentPage(1); }}
                    placeholder="Tất cả Chủ sở hữu"
                    labelField="label"
                    valueField="value"
                    showSearch={true}
                    autoFocusSearch={false}
                    accent="slate"
                    buttonClassName="!h-[35px] !rounded-xl !py-0 !shadow-sm [&>span]:text-[13px] [&>span]:font-medium"
                  />
                </div>

                {/* Total count + Bỏ lọc – full width by default, split when filter active */}
                <div className="flex items-center gap-2 w-full lg:w-auto">
                  <div className="h-[35px] flex-1 lg:flex-initial flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50/60 px-3 shadow-sm">
                    <span className="text-[13px] font-bold text-orange-600">{totalItems.toLocaleString('vi-VN')}</span>
                    <span className="text-[13px] text-orange-400 font-semibold">thiết bị</span>
                    {loading && (
                      <span className="ml-1 inline-block w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {(ownerFilter || branchFilter || modelFilter || brandFilter) && (
                    <button
                      type="button"
                      onClick={() => { setOwnerFilter(''); setBranchFilter(''); setModelFilter(''); setBrandFilter(''); setCurrentPage(1); }}
                      className="h-[35px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:border-orange-200 hover:text-orange-600"
                    >
                      <FilterX size={16} />
                      Bỏ lọc
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {availabilityLabel && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 px-4 py-3">
            <span className="text-sm font-semibold text-slate-700">Đang lọc theo trạng thái:</span>
            <span className="inline-flex items-center rounded-full border border-orange-200 bg-white px-3 py-1 text-sm font-bold text-orange-600">
              {availabilityLabel}
            </span>
            <button
              type="button"
              onClick={clearAvailabilityFilter}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-orange-200 hover:text-orange-600"
            >
              <FilterX size={16} />
              Bỏ lọc
            </button>
          </div>
        )}

        {/* List */}
        <EquipmentList
          equipment={equipment}
          loading={loading}
          canManage={canManage}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onEdit={openEditModal}
          onDelete={setDeleteTarget}
          onDuplicate={openDuplicateModal}
          month={month}
          sortBy={sortBy}
          sortOrder={sortOrder}
          statsVisibility={equipmentStatsVisibility}
          onSort={(col) => {
            setCurrentPage(1);
            if (sortBy === col) {
              setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
            } else {
              setSortBy(col);
              setSortOrder('DESC'); // Default to DESC for most metrics
            }
          }}
        />
      </div>

      {/* Modals */}
      {showModal && (
        <EquipmentModal
          editingItem={editingItem}
          isDuplicating={isDuplicating}
          formData={formData}
          setFormData={setFormData}
          saving={saving}
          onSubmit={handleSubmit}
          onClose={closeModal}
          branches={branches}
          owners={owners}
          canEditOwner={canEditOwner}
          existingEquipment={equipment}
          onSelectTemplate={handleSelectTemplate}
          imagePreviews={imagePreviews}
          imagesLoading={false}
          onImageSelect={handleImageSelect}
          onRemoveImage={removeImage}
          onSetPrimary={setPrimaryImage}
        />
      )}

      <DeleteModal
        target={deleteTarget}
        deleting={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {showRankingModal && (
        <EquipmentRankingModal
          data={rankingData}
          loading={rankingLoading}
          month={month}
          onClose={closeRankingModal}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default Equipment;
