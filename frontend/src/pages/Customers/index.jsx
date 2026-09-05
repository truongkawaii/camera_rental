import React, { useState, useEffect } from 'react';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, uploadCustomerImage, blacklistCustomer, unblacklistCustomer } from '../../api/client';
import { Plus, Mail, Phone, User, Trash2, X, AlertTriangle, Upload, Edit2, Search, ShieldBan, ShieldCheck } from 'lucide-react';
import LazyImage from '../../components/LazyImage';
import { getFirstImage } from '../../utils/formatters';

import Pagination from '../../components/Pagination';
import { useToast, ToastContainer } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = { name: '', email: '', phone: '' };
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Add / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [imagePreview, setImagePreview] = useState(null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Blacklist
  const [blacklistTarget, setBlacklistTarget] = useState(null); // customer to blacklist
  const [unblacklistTarget, setUnblacklistTarget] = useState(null); // customer to unblacklist
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklisting, setBlacklisting] = useState(false);

  const { toasts, toast, removeToast } = useToast();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!showModal) return;

    const mainScrollArea = document.getElementById('main-scroll-area');
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousMainOverflow = mainScrollArea?.style.overflow;
    const previousMainOverscroll = mainScrollArea?.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    if (mainScrollArea) {
      mainScrollArea.style.overflow = 'hidden';
      mainScrollArea.style.overscrollBehavior = 'none';
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;

      if (mainScrollArea) {
        mainScrollArea.style.overflow = previousMainOverflow || '';
        mainScrollArea.style.overscrollBehavior = previousMainOverscroll || '';
      }
    };
  }, [showModal]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadCustomers();
  }, [currentPage, debouncedSearch, filterStatus]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await getCustomers(currentPage, 9, debouncedSearch, filterStatus);
      setCustomers(response.data.data);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData(EMPTY_FORM);
    setImagePreview(null);
    setSelectedImageFile(null);
    setShowModal(true);
  };

  const openEditModal = async (customer) => {
    setEditingItem(customer);
    setFormData({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    });
    setImagePreview(getFirstImage(customer.images));
    setSelectedImageFile(null);
    setShowModal(true);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Kích thước ảnh không được vượt quá 2MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn một tệp ảnh hợp lệ");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result;
      setImagePreview(base64);
      setSelectedImageFile(file);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async () => {
    if (!editingItem || !selectedImageFile) return;

    setUploadingImage(true);
    try {
      if (imagePreview && imagePreview.startsWith("data:")) {
        await uploadCustomerImage(editingItem.id, imagePreview, selectedImageFile?.name);
        toast.success("Tải ảnh lên thành công");
        setSelectedImageFile(null);
        loadCustomers();
      }
    } catch (error) {
      console.error("Failed to upload image:", error);
      toast.error("Tải ảnh thất bại. Vui lòng thử lại.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingItem) {
        await updateCustomer(editingItem.id, formData);
        toast.success('Cập nhật khách hàng thành công');
      } else {
        await createCustomer(formData);
        toast.success('Thêm khách hàng thành công');
      }
      setFormData(EMPTY_FORM);
      setShowModal(false);
      loadCustomers();
    } catch (error) {
      console.error('Failed to save customer:', error);
      toast.error(error.response?.data?.error || 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Đã xóa khách hàng');
      loadCustomers();
    } catch (error) {
      console.error('Failed to delete customer:', error);
      toast.error('Xóa khách hàng thất bại.');
    } finally {
      setDeleting(false);
    }
  };

  const handleBlacklist = async () => {
    if (!blacklistTarget) return;
    setBlacklisting(true);
    try {
      await blacklistCustomer(blacklistTarget.id, blacklistReason);
      setBlacklistTarget(null);
      setBlacklistReason('');
      toast.success(`Đã đưa "${blacklistTarget.name}" vào danh sách hạn chế`);
      loadCustomers();
    } catch (error) {
      console.error('Failed to blacklist customer:', error);
      toast.error(error.response?.data?.error || 'Đưa vào danh sách hạn chế thất bại.');
    } finally {
      setBlacklisting(false);
    }
  };

  const handleUnblacklist = async () => {
    if (!unblacklistTarget) return;
    setBlacklisting(true);
    try {
      await unblacklistCustomer(unblacklistTarget.blacklist_id);
      setUnblacklistTarget(null);
      toast.success(`Đã gỡ "${unblacklistTarget.name}" khỏi danh sách hạn chế`);
      loadCustomers();
    } catch (error) {
      console.error('Failed to unblacklist customer:', error);
      toast.error(error.response?.data?.error || 'Gỡ khỏi danh sách hạn chế thất bại.');
    } finally {
      setBlacklisting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">Khách Hàng</h1>
            <p className="text-gray-500">Quản lý danh sách khách hàng và thông tin liên hệ</p>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:w-auto">
            <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100">
              <button
                onClick={() => { setFilterStatus('all'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterStatus === 'all' ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => { setFilterStatus('normal'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterStatus === 'normal' ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                Khách hàng
              </button>
              <button
                onClick={() => { setFilterStatus('restricted'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filterStatus === 'restricted' ? 'bg-red-50 text-red-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                Hạn chế
              </button>
            </div>
            
            <div className="relative w-full md:flex-1 xl:w-80 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={18} />
              <input
                type="text"
                placeholder="Tìm tên, số điện thoại..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="box-border h-[35px] min-h-[35px] max-h-[35px] w-full py-0 pl-11 pr-4 leading-none bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full text-gray-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={openAddModal}
              className="h-[35px] w-full md:w-auto bg-primary text-white px-6 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all font-semibold shadow-lg shadow-primary/20 whitespace-nowrap"
            >
              <Plus size={20} />
              Thêm Khách Hàng
            </button>
          </div>
        </div>

        {/* Customers Grid */}
        {loading ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-4">
            <div className='w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin'></div>
            Đang tải...
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            <User size={48} className='mx-auto mb-4 opacity-20' />
            Chưa có khách hàng nào. Nhấn "+ Thêm Khách Hàng" để bắt đầu.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {customers.map((customer) => (
              <div key={customer.id} className={`bg-white rounded-2xl shadow-sm border p-6 hover:shadow-xl transition-all relative group overflow-hidden ${customer.is_blacklisted ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-100'}`}>
                {customer.is_blacklisted && (
                  <div className="absolute top-3 right-3 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                    <ShieldBan size={12} />
                    Hạn chế
                  </div>
                )}
                <div className="flex items-start gap-4">


                  <div className="shrink-0">
                    <LazyImage 
                      entity="customers" 
                      id={customer.id} 
                      src={getFirstImage(customer.images)}
                      alt={customer.name} 
                      className={`h-20 w-20 rounded-2xl object-cover border-2 shadow-sm ${customer.is_blacklisted ? 'border-red-200' : 'border-white'}`}
                      fallback={User}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-lg truncate mb-2">{customer.name}</h3>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500 flex items-center gap-2 truncate bg-gray-50 p-1.5 rounded-lg">
                        <Mail size={14} className="text-gray-400 shrink-0" />
                        {customer.email}
                      </p>
                      <p className="text-sm text-gray-500 flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg">
                        <Phone size={14} className="text-gray-400 shrink-0" />
                        {customer.phone}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${customer.is_blacklisted ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {customer.total_rentals || 0} đơn thuê
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      customer.is_blacklisted ? (
                        <button
                          onClick={() => setUnblacklistTarget(customer)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors border border-transparent hover:border-amber-100"
                          title="Gỡ khỏi danh sách hạn chế"
                        >
                          <ShieldCheck size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => { setBlacklistTarget(customer); setBlacklistReason(''); }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
                          title="Đưa vào danh sách hạn chế"
                        >
                          <ShieldBan size={18} />
                        </button>
                      )
                    )}
                    <button
                      onClick={() => openEditModal(customer)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
                      title="Sửa khách hàng / Tải ảnh"
                    >
                      <Edit2 size={18} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteTarget(customer)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
                        title="Xóa khách hàng"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />

        {/* Add / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overscroll-none touch-none">
            <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden touch-auto">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {editingItem ? 'Chỉnh Sửa Khách Hàng' : 'Thêm Khách Hàng Mới'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-full hover:bg-white hover:shadow-md text-gray-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Left: Form */}
                  <div className='space-y-6'>
                    <h3 className='text-lg font-semibold text-gray-800 flex items-center gap-2'>
                      <User size={18} className='text-primary' />
                      Thông tin khách hàng
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên khách hàng</label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Anh Hà"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                        <input
                          type="text"
                          placeholder="example@gmail.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Số điện thoại</label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0123 456 789"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: digitsOnly(e.target.value) })}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"             
                        />
                      </div>

                      <div className="flex gap-3 pt-6">
                        <button
                          type="submit"
                          disabled={saving}
                          className="flex-1 bg-primary text-white py-3 rounded-xl hover:opacity-90 font-semibold shadow-lg shadow-primary/20 disabled:opacity-60 transition-all transform active:scale-[0.98]"
                        >
                          {saving ? 'Đang lưu...' : editingItem ? 'Lưu Thông Tin' : 'Thêm'}
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

                  {/* Right: Image Upload */}
                  <div className="space-y-6">
                    <h3 className='text-lg font-semibold text-gray-800 flex items-center gap-2'>
                      <Upload size={18} className='text-orange-600' />
                      Ảnh chân dung / ID
                    </h3>

                    <div className='relative group'>
                      <div className={`aspect-square max-w-[280px] mx-auto rounded-full border-2 border-dashed transition-all flex flex-col items-center justify-center p-4 overflow-hidden bg-gray-50
                        ${imagePreview ? 'border-primary/30 bg-primary/5' : 'border-gray-200 group-hover:border-primary/50 group-hover:bg-primary/5'}`}>

                        {imagePreview ? (
                          <div className='relative w-full h-full'>
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                            <div className='absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'>
                              <p className='text-white text-sm font-medium'>Thay đổi ảnh</p>
                            </div>
                          </div>
                        ) : (
                          <div className='text-center'>
                            <div className='bg-white p-4 rounded-full shadow-sm mb-4 inline-block group-hover:scale-110 transition-transform'>
                              <User size={48} className="text-gray-400" />
                            </div>
                            <p className="text-gray-500 font-medium">Chưa có ảnh</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className='space-y-4'>
                      <div className='relative'>
                        <input
                          type="file"
                          id='customer-image'
                          accept="image/*"
                          onChange={handleImageSelect}
                          className="hidden"
                          disabled={!editingItem}
                        />
                        <label
                          htmlFor='customer-image'
                          className={`w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold cursor-pointer transition-all
                            ${!editingItem ? 'bg-gray-50 cursor-not-allowed opacity-50' : 'hover:border-primary hover:bg-primary/5 active:scale-[0.99]'}`}
                        >
                          <Edit2 size={16} />
                          {imagePreview ? 'Chọn ảnh khác' : 'Chọn ảnh từ máy'}
                        </label>
                        {!editingItem && (
                          <p className='text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded-lg border border-amber-100 flex items-center gap-1.5'>
                            <AlertTriangle size={12} />
                            Lưu khách hàng trước khi tải ảnh lên
                          </p>
                        )}
                      </div>

                      <button
                        onClick={handleImageUpload}
                        disabled={uploadingImage || !editingItem || !selectedImageFile}
                        className="w-full bg-orange-600 text-white py-3 rounded-xl hover:bg-orange-700 font-semibold shadow-lg shadow-orange-600/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
                      >
                        {uploadingImage ? (
                          <>
                            <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin'></div>
                            Đang tải...
                          </>
                        ) : (
                          <>
                            <Upload size={18} />
                            Tải Ảnh Lên
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle size={28} className="text-red-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Xác nhận xóa</h2>
              <p className="text-gray-600 mb-6">
                Bạn có chắc muốn xóa khách hàng <span className="font-semibold text-gray-900">"{deleteTarget.name}"</span>?
                Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 font-semibold disabled:opacity-60 transition-colors"
                >
                  {deleting ? 'Đang xóa...' : 'Xóa'}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Blacklist Confirmation Modal */}
        {blacklistTarget && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <ShieldBan size={28} className="text-red-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2 text-center">Đưa vào danh sách hạn chế</h2>
              <p className="text-gray-600 mb-4 text-center">
                Bạn có chắc muốn đưa <span className="font-semibold text-gray-900">"{blacklistTarget.name}"</span> vào danh sách hạn chế?
              </p>
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg mb-4 border border-amber-100">
                <AlertTriangle size={14} className="inline mr-1" />
                Khách hàng trong danh sách hạn chế sẽ hiển thị cảnh báo khi tạo đơn thuê.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Lý do (tùy chọn)</label>
                <textarea
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder="Nhập lý do đưa vào danh sách hạn chế..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-all resize-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleBlacklist}
                  disabled={blacklisting}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {blacklisting ? 'Đang xử lý...' : <><ShieldBan size={16} /> Xác nhận</>}
                </button>
                <button
                  onClick={() => { setBlacklistTarget(null); setBlacklistReason(''); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unblacklist Confirmation Modal */}
        {unblacklistTarget && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <ShieldCheck size={28} className="text-green-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Gỡ khỏi danh sách hạn chế</h2>
              <p className="text-gray-600 mb-3">
                Bạn có chắc muốn gỡ <span className="font-semibold text-gray-900">"{unblacklistTarget.name}"</span> khỏi danh sách hạn chế?
              </p>
              {unblacklistTarget.blacklist_reason && (
                <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg mb-4">
                  Lý do trước đó: <span className="text-gray-700 italic">"{unblacklistTarget.blacklist_reason}"</span>
                </p>
              )}
              <p className="text-sm text-green-600 bg-green-50 p-3 rounded-lg mb-4 border border-green-100">
                <ShieldCheck size={14} className="inline mr-1" />
                Cảnh báo sẽ được gỡ bỏ sau khi xác nhận.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleUnblacklist}
                  disabled={blacklisting}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {blacklisting ? 'Đang xử lý...' : <><ShieldCheck size={16} /> Gỡ bỏ</>}
                </button>
                <button
                  onClick={() => setUnblacklistTarget(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

export default Customers;
