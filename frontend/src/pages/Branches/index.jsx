import React, { useState, useEffect } from 'react';
import { getBranches, createBranch, updateBranch, deleteBranch, uploadBranchImage } from '../../api/client';
import { Plus, Building2, Phone, MapPin, Edit2, Trash2, X, AlertTriangle, ExternalLink, Globe, Upload, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import { getFirstImage } from '../../utils/formatters';
import LazyImage from '../../components/LazyImage';


const EMPTY_FORM = { name: '', code: '', address: '', address_detail: '', phone: '', map_url: '' };

const Branches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Image upload states
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { toasts, toast, removeToast } = useToast();
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const response = await getBranches();
      setBranches(response.data);
    } catch (error) {
      console.error('Failed to load branches:', error);
      toast.error('Không thể tải danh sách cơ sở');
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

  const openEditModal = async (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code || '',
      address: item.address || '',
      address_detail: item.address_detail || '',
      phone: item.phone || '',
      map_url: item.map_url || '',
    });
    setImagePreview(getFirstImage(item.images));
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

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result);
      setSelectedImageFile(file);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async (branchId) => {
    if (!imagePreview || !imagePreview.startsWith('data:')) return;
    setUploadingImage(true);
    try {
      await uploadBranchImage(branchId, imagePreview, selectedImageFile?.name);
      toast.success('Tải ảnh lên thành công');
      loadBranches();
      setSelectedImageFile(null);
    } catch (error) {
      console.error('Upload image error:', error);
      toast.error('Không thể tải ảnh lên');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let result;
      if (editingItem) {
        result = await updateBranch(editingItem.id, formData);
        toast.success('Cập nhật cơ sở thành công');
      } else {
        result = await createBranch(formData);
        toast.success('Thêm cơ sở thành công');
      }
      
      // If there's an image to upload, do it now
      if (selectedImageFile && imagePreview) {
        await handleImageUpload(editingItem?.id || result.data.id);
      }

      setShowModal(false);
      loadBranches();
    } catch (error) {
      console.error('Failed to save branch:', error);
      toast.error('Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBranch(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('Đã xóa cơ sở');
      loadBranches();
    } catch (error) {
      console.error('Failed to delete branch:', error);
      toast.error('Xóa thất bại. Có thể vẫn còn thiết bị thuộc cơ sở này.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleHidden = async (branch) => {
    try {
      await updateBranch(branch.id, { ...branch, is_hidden: !branch.is_hidden });
      toast.success(branch.is_hidden ? 'Đã hiện cơ sở trên báo cáo' : 'Đã ẩn cơ sở khỏi báo cáo');
      loadBranches();
    } catch (error) {
      console.error('Failed to toggle branch visibility:', error);
      toast.error('Thao tác thất bại');
    }
  };

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 flex items-center gap-3">
              <Building2 className="text-primary" size={32} />
              Hệ Thống Cơ Sở
            </h1>
            <p className="text-gray-500 mt-1">Quản lý mạng lưới chi nhánh và kho thiết bị</p>
          </div>
          {isAdmin && (
            <button
              onClick={openAddModal}
              className="h-[35px] w-full md:w-auto bg-primary text-white px-6 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20 font-semibold"
            >
              <Plus size={20} />
              Thêm Cơ Sở
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-4">
            <div className='w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin'></div>
            Đang tải dữ liệu cơ sở...
          </div>
        ) : branches.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            <Building2 size={48} className='mx-auto mb-4 opacity-20' />
            Chưa có cơ sở nào. Nhấn "+ Thêm Cơ Sở" để bắt đầu.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {branches.map((branch) => (
              <div key={branch.id} className={`bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-2xl hover:shadow-primary/5 transition-all relative group overflow-hidden flex flex-col ${branch.is_hidden ? 'opacity-60 grayscale-[30%]' : ''}`}>
                {/* Branch Image Header */}
                <div className="h-48 w-full bg-gray-100 relative overflow-hidden shrink-0">
                  <LazyImage 
                    entity="branches" 
                    id={branch.id} 
                    src={getFirstImage(branch.images)}
                    alt={branch.name} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    fallback={Building2}
                  />
                  <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full shadow-sm">
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider">{`Cơ sở ${branch.order_number || branch.id}`}</span>
                  </div>
                  {branch.is_hidden && (
                    <div className="absolute top-4 right-4 bg-amber-100/90 backdrop-blur-md px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5">
                      <EyeOff size={12} className="text-amber-600" />
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Đã ẩn</span>
                    </div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-semibold text-gray-900 text-xl mb-4 line-clamp-1">{branch.name}</h3>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <MapPin size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{branch.address}</p>
                        {branch.address_detail && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{branch.address_detail}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                        <Phone size={16} />
                      </div>
                      <p className="text-sm text-gray-700 font-medium">{branch.phone || 'Chưa cập nhật SĐT'}</p>
                    </div>

                    {branch.map_url && (
                      <a 
                        href={branch.map_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 group/link"
                      >
                        <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 group-hover/link:bg-orange-600 group-hover/link:text-white transition-colors">
                          <Globe size={16} />
                        </div>
                        <span className="text-xs font-semibold text-orange-600 uppercase tracking-tight group-hover/link:underline flex items-center gap-1">
                          Xem trên Google Maps
                          <ExternalLink size={12} />
                        </span>
                      </a>
                    )}
                  </div>

                  <div className="mt-auto pt-6 border-t border-gray-50 flex justify-between items-center">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      Cơ sở {branch.order_number || branch.id}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleHidden(branch)}
                          className={`p-2.5 rounded-xl transition-all border border-transparent active:scale-95 ${branch.is_hidden ? 'text-gray-400 hover:bg-gray-50 hover:border-gray-100' : 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-100'}`}
                          title={branch.is_hidden ? 'Hiện cơ sở trên báo cáo' : 'Ẩn cơ sở khỏi báo cáo'}
                        >
                          {branch.is_hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                        <button 
                          onClick={() => openEditModal(branch)}
                          className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100 active:scale-95"
                          title="Chỉnh sửa thông tin"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => setDeleteTarget(branch)}
                          className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 active:scale-95"
                          title="Xóa cơ sở"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[32px] max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
              {/* Left: Image Upload Section */}
              <div className="w-full md:w-5/12 bg-gray-50 p-8 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col">
                <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <ImageIcon size={20} className="text-primary" />
                  Ảnh Cơ Sở
                </h3>
                
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-200 bg-white overflow-hidden relative group">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                        <Building2 size={48} className="opacity-10 mb-2" />
                        <p className="text-xs font-medium">Chưa có ảnh</p>
                      </div>
                    )}
                    <label className="absolute inset-0 cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-sm font-semibold gap-2">
                      <Upload size={24} />
                      {imagePreview ? "Thay đổi ảnh" : "Tải ảnh lên"}
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageSelect} />
                    </label>
                  </div>
                  <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest text-center px-4">
                    Kích thước đề xuất: 800x600px. Dung lượng tối đa 2MB.
                  </p>
                </div>
              </div>

              {/* Right: Form Section */}
              <div className="w-full md:w-7/12 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                    {editingItem ? 'Chỉnh Sửa Cơ Sở' : 'Thêm Cơ Sở Mới'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 ml-1">Tên cơ sở <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          placeholder="Ví dụ: SnapPro Quận 1"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-medium"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 ml-1">Số điện thoại</label>
                          <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                              type="tel"
                              placeholder="0123 456 789"
                              value={formData.phone}
                              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                              className="w-full pl-12 pr-5 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-medium"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 ml-1">Google Maps URL</label>
                          <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                              type="url"
                              placeholder="https://maps.app.goo.gl/..."
                              value={formData.map_url}
                              onChange={(e) => setFormData({ ...formData, map_url: e.target.value })}
                              className="w-full pl-12 pr-5 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-medium"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 ml-1">Khu vực / Quận</label>
                        <input
                          type="text"
                          placeholder="Ví dụ: Quận 1, TP. Hồ Chí Minh"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 ml-1">Địa chỉ cụ thể</label>
                        <textarea
                          placeholder="Số nhà, tên đường, phường..."
                          value={formData.address_detail}
                          onChange={(e) => setFormData({ ...formData, address_detail: e.target.value })}
                          className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-colors font-medium"
                          rows="3"
                        />
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button
                        type="submit"
                        disabled={saving || uploadingImage}
                        className="flex-1 bg-primary text-white py-4 rounded-2xl hover:opacity-90 font-semibold shadow-xl shadow-primary/20 disabled:opacity-60 transition-all transform active:scale-[0.98]"
                      >
                        {(saving || uploadingImage) ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Đang lưu...
                          </div>
                        ) : editingItem ? 'Cập Nhật Cơ Sở' : 'Thêm Cơ Sở Mới'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        className="px-8 bg-gray-100 text-gray-700 py-4 rounded-2xl hover:bg-gray-200 font-semibold transition-all transform active:scale-[0.98]"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className='bg-white rounded-[32px] p-10 max-w-sm w-full shadow-2xl text-center border border-gray-100'>
              <div className='flex justify-center mb-6'>
                <div className='p-4 bg-red-50 rounded-full text-red-500'>
                  <AlertTriangle size={32} />
                </div>
              </div>
              <h2 className='text-2xl font-bold text-gray-900 mb-2 tracking-tight'>Xác nhận xóa</h2>
              <p className='text-gray-500 mb-8 leading-relaxed'>
                Bạn có chắc muốn xóa cơ sở <span className='font-semibold text-gray-900'>"{deleteTarget.name}"</span>? 
                Hành động này có thể gây lỗi cho các dữ liệu thiết bị đang thuộc cơ sở này.
              </p>
              <div className='flex gap-3'>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className='flex-1 bg-red-600 text-white py-4 rounded-2xl hover:bg-red-700 font-semibold shadow-xl shadow-red-600/20 disabled:opacity-60 transition-all active:scale-95'
                >
                  {deleting ? "Đang xóa..." : "Xác nhận xóa"}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className='flex-1 bg-gray-100 text-gray-700 py-4 rounded-2xl hover:bg-gray-200 font-semibold transition-all active:scale-95'
                >
                  Quay lại
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

export default Branches;
