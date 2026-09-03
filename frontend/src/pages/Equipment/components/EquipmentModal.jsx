import React, { useEffect } from 'react';
import { Edit2, Trash2, Package, X, Upload, Loader2, Copy } from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';

const CATEGORIES = ['Camera', 'Lens', 'Lighting', 'Phụ kiện', 'Other'];
const CONDITION_OPTIONS = [
  { id: 'good', name: 'Tốt' },
  { id: 'fair', name: 'Trung bình' },
  { id: 'poor', name: 'Kém' },
  { id: 'maintenance', name: 'Bảo dưỡng' },
];

const EquipmentModal = ({
  editingItem,
  isDuplicating = false,
  formData,
  setFormData,
  saving,
  onSubmit,
  onClose,
  branches,
  owners = [],
  canEditOwner = false,
  existingEquipment = [],
  onSelectTemplate,
  // image props
  imagePreviews,
  imagesLoading = false,
  onImageSelect,
  onRemoveImage,
  onSetPrimary,
}) => {
  const [selectedTemplateId, setSelectedTemplateId] = React.useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    setSelectedTemplateId('');
    return () => {
      document.body.style.overflow = '';
    };
  }, [editingItem]);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingItem ? 'Chỉnh Sửa Thiết Bị' : isDuplicating ? 'Nhân Bản Thiết Bị' : 'Thêm Thiết Bị Mới'}
              </h2>
              {isDuplicating && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  Tạo từ mẫu
                </span>
              )}
            </div>
            {isDuplicating ? (
              <p className="text-xs text-emerald-600 font-medium mt-1">
                Đã sao chép thông tin từ thiết bị mẫu. Bạn có thể sửa nhanh các thông tin và mã thiết bị trước khi lưu.
              </p>
            ) : null}
            {imagesLoading && editingItem && (
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Loader2 size={13} className="animate-spin" />
                <span>Đang tải dữ liệu...</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white hover:shadow-md text-gray-500 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {/* Template Selector for New Equipment */}
          {!editingItem && existingEquipment?.length > 0 && (
            <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-slate-50 border border-emerald-200/80 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-emerald-800">
                <Copy size={15} className="text-emerald-600" />
                <span>Sao chép thông tin từ thiết bị có sẵn (Tùy chọn)</span>
              </div>
              <CustomSelect
                options={existingEquipment.map((eq) => ({
                  id: String(eq.id),
                  name: `${eq.name} (${eq.code || 'Chưa có mã'})${eq.branch_name ? ` - ${eq.branch_name}` : ''}`
                }))}
                value={selectedTemplateId}
                onChange={(val) => {
                  setSelectedTemplateId(val);
                  if (!val) return;
                  const template = existingEquipment.find((eq) => String(eq.id) === String(val));
                  if (template && onSelectTemplate) {
                    onSelectTemplate(template);
                  }
                }}
                placeholder="-- Chọn thiết bị mẫu để sao chép thông tin --"
                showSearch={true}
                labelField="name"
                valueField="id"
                className="h-[38px]"
                buttonClassName="bg-white rounded-xl px-3 py-1 text-xs font-medium border-emerald-200 text-slate-700 shadow-sm"
              />
              <p className="text-[11px] text-emerald-600/90 mt-1.5 font-medium">
                Tip: Chọn một thiết bị để tự động điền tên, model, danh mục, giá thuê và hình ảnh.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

            {/* ── Left: Form ── */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Edit2 size={18} className="text-primary" />
                Thông tin cơ bản
              </h3>

              <form onSubmit={onSubmit} className="space-y-4">
                {/* Tên */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên thiết bị</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Canon EOS R5"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full h-[35px] px-4 py-1 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    required
                  />
                </div>

                {/* Thương hiệu + Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Thương hiệu</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Canon, Sony, Nikon..."
                      value={formData.brand}
                      onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full h-[35px] px-4 py-1 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Model</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: EOS R5, A7 IV, Z9..."
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full h-[35px] px-4 py-1 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>

                {/* Danh mục + Cơ sở */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Danh mục</label>
                    <CustomSelect
                      options={CATEGORIES}
                      value={formData.category}
                      onChange={(val) => setFormData({ ...formData, category: val })}
                      showSearch={false}
                      className="h-[35px]"
                      buttonClassName="rounded-xl px-4 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Cơ sở</label>
                    <CustomSelect
                      options={branches}
                      value={formData.branch_id}
                      onChange={(val) => setFormData({ ...formData, branch_id: val })}
                      placeholder="Chọn cơ sở"
                      className="h-[35px]"
                      buttonClassName="rounded-xl px-4 py-1 text-sm"
                    />
                  </div>
                </div>

                {canEditOwner && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Chủ sở hữu</label>
                    <CustomSelect
                      options={owners.map((owner) => ({
                        id: owner.id,
                        name: owner.full_name || owner.username,
                      }))}
                      value={formData.owner_id}
                      onChange={(val) => setFormData({ ...formData, owner_id: val })}
                      placeholder="Chọn nhà đầu tư"
                      className="h-[35px]"
                      buttonClassName="rounded-xl px-4 py-1 text-sm"
                    />
                  </div>
                )}

                {/* Giá ngày + buổi */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá mỗi ngày (VND)</label>
                    <input
                      type="text"
                      placeholder="500.000"
                      value={Number(formData.price_per_day).toLocaleString('vi-VN')}
                      onChange={(e) => setFormData({ ...formData, price_per_day: e.target.value.replace(/\D/g, '') })}
                      className="w-full h-[35px] px-4 py-1 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all tabular-nums font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá mỗi buổi (VND)</label>
                    <input
                      type="text"
                      placeholder="200.000"
                      value={Number(formData.price_per_session).toLocaleString('vi-VN')}
                      onChange={(e) => setFormData({ ...formData, price_per_session: e.target.value.replace(/\D/g, '') })}
                      className="w-full h-[35px] px-4 py-1 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all tabular-nums font-bold"
                    />
                  </div>
                </div>

                {/* Giá ưu đãi */}
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                    ⭐ Giá ưu đãi dài ngày
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Giá ưu đãi/ngày (VND)
                        {formData.discount_day_threshold && !formData.price_per_day_discount && (
                          <span className="ml-1 text-xs text-red-500">*</span>
                        )}
                      </label>
                      <input
                        type="text"
                        placeholder="Để trống nếu không có"
                        value={formData.price_per_day_discount ? Number(formData.price_per_day_discount).toLocaleString('vi-VN') : ''}
                        onChange={(e) => setFormData({ ...formData, price_per_day_discount: e.target.value.replace(/\D/g, '') })}
                        className={`w-full h-[35px] px-4 py-1 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400 transition-all tabular-nums font-bold bg-white
                          ${formData.discount_day_threshold && !formData.price_per_day_discount ? 'border-red-300 ring-2 ring-red-200/30' : 'border-amber-200'}
                        `}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Áp dụng từ (số ngày)
                        {formData.price_per_day_discount && !formData.discount_day_threshold && (
                          <span className="ml-1 text-xs text-red-500">*</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="VD: 3"
                        value={formData.discount_day_threshold}
                        onChange={(e) => setFormData({ ...formData, discount_day_threshold: e.target.value })}
                        className={`w-full h-[35px] px-4 py-1 border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300/30 focus:border-amber-400 transition-all font-bold bg-white
                          ${formData.price_per_day_discount && !formData.discount_day_threshold ? 'border-red-300 ring-2 ring-red-200/30' : 'border-amber-200'}
                        `}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-amber-600">Ví dụ: nhập 3 ngày → áp dụng khi thuê từ 3 ngày trở lên</p>
                </div>

                {/* Mã + Tình trạng */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Mã thiết bị (S/N)</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: CAM-001"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="w-full h-[35px] px-4 py-1 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Tình trạng</label>
                    <CustomSelect
                      options={CONDITION_OPTIONS}
                      value={formData.condition}
                      onChange={(val) => setFormData({ ...formData, condition: val })}
                      showSearch={false}
                      className="h-[35px]"
                      buttonClassName="rounded-xl px-4 py-1 text-sm"
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-6">
                  {(() => {
                    const hasDiscountPrice = Boolean(formData.price_per_day_discount);
                    const hasThreshold = Boolean(formData.discount_day_threshold);
                    const discountMismatch = (hasDiscountPrice && !hasThreshold) || (!hasDiscountPrice && hasThreshold);
                    return (
                      <button
                        type="submit"
                        disabled={saving || discountMismatch}
                        className="flex-1 h-[35px] bg-primary text-white rounded-xl hover:opacity-90 font-bold shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                      >
                        {saving ? 'Đang lưu...' : editingItem ? 'Cập Nhật' : 'Thêm'}
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-[35px] bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold transition-all active:scale-[0.98]"
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>

            {/* ── Right: Image Upload ── */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Upload size={18} className="text-orange-600" />
                Hình ảnh thiết bị
              </h3>

              {/* Gallery */}
              <div className="relative group">
                <div className={`rounded-2xl border-2 border-dashed transition-all p-4 bg-gray-50
                  ${imagePreviews.length > 0 ? 'border-primary/30' : 'border-gray-200 group-hover:border-primary/50'}`}
                >
                  {imagesLoading ? (
                    <div className="min-h-[160px] flex flex-col items-center justify-center text-center">
                      <Loader2 size={30} className="text-primary animate-spin mb-3" />
                      <p className="text-sm font-semibold text-gray-600">Đang tải hình ảnh...</p>
                    </div>
                  ) : imagePreviews.length > 0 ? (
                    <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
                      {imagePreviews.map((preview, index) => (
                        <div key={index} className="relative shrink-0 w-40 h-40 snap-start group/item">
                          <img
                            src={preview}
                            alt={`Preview ${index}`}
                            className={`w-full h-full object-cover rounded-xl border-2 ${index === 0 ? 'border-amber-400' : 'border-transparent'}`}
                          />
                          {index === 0 && (
                            <div className="absolute top-2 left-2 bg-amber-400 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
                              ★ Primary
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/item:opacity-100 transition-opacity rounded-xl flex flex-col items-center justify-center gap-2">
                            {index !== 0 && (
                              <button
                                onClick={() => onSetPrimary(index)}
                                className="text-xs bg-white/20 hover:bg-amber-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors border border-white/30"
                              >
                                Đặt làm ảnh bìa
                              </button>
                            )}
                            <button
                              onClick={() => onRemoveImage(index)}
                              className="text-xs bg-red-500/80 hover:bg-red-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors border border-red-500/50 flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Xóa ảnh
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="bg-white p-4 rounded-full shadow-sm mb-4 inline-block group-hover:scale-110 transition-transform">
                        <Package size={32} className="text-gray-400" />
                      </div>
                      <p className="text-gray-500 font-medium">Chưa có ảnh</p>
                      <p className="text-xs text-gray-400 mt-1">Định dạng JPG, PNG (Tối đa 2MB)</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="file"
                    id="equipment-image"
                    accept="image/*"
                    multiple
                    onChange={onImageSelect}
                    className="hidden"
                    disabled={imagesLoading}
                  />
                  <label
                    htmlFor="equipment-image"
                    className={`w-full h-[35px] flex items-center justify-center gap-2 px-4 border-2 border-gray-200 rounded-xl font-semibold cursor-pointer transition-all
                      ${imagesLoading ? 'bg-gray-50 cursor-not-allowed opacity-50' : 'hover:border-primary hover:bg-primary/5 active:scale-[0.99]'}`}
                  >
                    <Edit2 size={16} />
                    {imagePreviews.length > 0 ? 'Thêm ảnh khác' : 'Chọn ảnh từ máy'}
                  </label>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentModal;
