import React, { useState, useEffect, useRef } from 'react';
import { getSaleTransfers, createSaleTransfer, updateSaleTransfer, deleteSaleTransfer, uploadSaleTransferImage } from '../../api/client';
import { Wallet, Send, Trash2, Plus, X, ArrowUpCircle, Clock, CheckCircle2, Upload, Eye, Pencil, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import ModernDateTimePicker from '../../components/ModernDateTimePicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import { formatCurrencyInput, parseCurrencyInput, formatVNDateTime } from '../../utils/formatters';

const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + 'đ';

const SaleTransfer = () => {
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [summary, setSummary] = useState({ total_payable: 0, total_transferred: 0, remaining: 0 });
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [form, setForm] = useState({ transfer_date: '', amount: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  // Image states
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', type: 'warning', onConfirm: () => {} });

  const { toasts, toast, removeToast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getSaleTransfers(selectedMonth);
      setTransfers(res.data.transfers || []);
      setSummary({
        total_payable: Number(res.data.total_payable || 0),
        total_transferred: Number(res.data.total_transferred || 0),
        remaining: Number(res.data.remaining || 0),
      });
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu chuyển tiền');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const openModal = () => {
    setEditingTransfer(null);
    // Cùng format với ModernDateTimePicker: "YYYY-MM-DDTHH:mm" (giờ VN, không timezone)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    setForm({ transfer_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`, amount: '', notes: '' });
    setSelectedImage(null);
    setShowModal(true);
  };

  const openEditModal = (transfer) => {
    setEditingTransfer(transfer);
    // Cùng format với ModernDateTimePicker: "YYYY-MM-DDTHH:mm" (giờ VN, không timezone)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fallback = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setForm({
      transfer_date: transfer.transfer_date || fallback,
      amount: String(transfer.amount),
      notes: transfer.notes || '',
    });
    setSelectedImage(null);
    setShowModal(true);
  };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingTransfer) {
        await updateSaleTransfer(editingTransfer.id, {
          transfer_date: form.transfer_date,
          amount: Number(form.amount),
          notes: form.notes,
        });
        toast.success('Đã cập nhật lệnh chuyển tiền!');
        setShowModal(false);
        setSubmitting(false);
        loadData();

        if (selectedImage) {
          uploadSaleTransferImage(
            editingTransfer.id,
            selectedImage.dataUri,
            selectedImage.filename
          )
            .then(() => loadData())
            .catch((imgErr) => {
              console.error('Image upload failed:', imgErr);
              toast.error('Đã cập nhật nhưng không tải được ảnh giao dịch');
            });
        }
      } else {
        const res = await createSaleTransfer({
          month: selectedMonth,
          transfer_date: form.transfer_date,
          amount: Number(form.amount),
          notes: form.notes,
        });

        toast.success('Đã ghi nhận chuyển tiền thành công!');
        setShowModal(false);
        setSubmitting(false);
        loadData();

        if (selectedImage && res.data?.transfer?.id) {
          uploadSaleTransferImage(
            res.data.transfer.id,
            selectedImage.dataUri,
            selectedImage.filename
          )
            .then(() => loadData())
            .catch((imgErr) => {
              console.error('Image upload failed:', imgErr);
              toast.error('Đã ghi nhận chuyển tiền nhưng không tải được ảnh giao dịch');
            });
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Không thể ghi nhận chuyển tiền');
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    if (!form.transfer_date) {
      toast.error('Vui lòng chọn ngày chuyển');
      return;
    }

    const dateObj = new Date(form.transfer_date);
    const formattedDate = dateObj.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    setConfirmModal({
      show: true,
      title: 'Xác nhận chuyển tiền',
      message: `Bạn có chắc muốn ghi nhận chuyển ${fmtVND(form.amount)} vào ${formattedDate}?`,
      type: 'warning',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        doSubmit();
      },
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh (JPG, PNG, WebP...)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ảnh quá lớn. Vui lòng chọn ảnh dưới 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage({
        dataUri: reader.result,
        filename: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = (id) => {
    setConfirmModal({
      show: true,
      title: 'Xóa lệnh chuyển tiền?',
      message: 'Bạn có chắc muốn xóa lệnh chuyển tiền này?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteSaleTransfer(id);
          toast.success('Đã xóa lệnh chuyển tiền');
          loadData();
        } catch (err) {
          toast.error('Không thể xóa lệnh chuyển tiền');
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      },
    });
  };

  const isNegativePayable = summary.total_payable < 0;
  const isPositivePayable = summary.total_payable > 0;

  const progressPercent = isPositivePayable
    ? Math.min(100, Math.round((summary.total_transferred / summary.total_payable) * 100))
    : 0;

  const isComplete = summary.remaining <= 0 && isPositivePayable;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-4 sm:py-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">

        {/* ═══════ Header Card ═══════ */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-[26px] bg-white border border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] p-5 sm:p-6 lg:p-7">
          {/* Subtle gradient accent at top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-[28px] font-extrabold text-gray-900 tracking-tight leading-tight">
                {isNegativePayable ? 'Quyết Toán Tiền Doanh Thu' : 'Chuyển Tiền Cho Admin'}
              </h1>
              <p className="text-[13px] sm:text-sm text-gray-400 mt-1.5 max-w-lg leading-relaxed">
                {isNegativePayable
                  ? 'Theo dõi doanh thu, hoa hồng được nhận và các lần chuyển nộp trong tháng'
                  : 'Ghi nhận các lần bạn đã chuyển tiền doanh thu cho admin trong tháng'}
              </p>
            </div>
            <div className="sm:w-48 lg:w-56 shrink-0">
              <ModernMonthPicker value={selectedMonth} onChange={setSelectedMonth} className="w-full" />
            </div>
          </div>
        </div>

        {/* ═══════ Summary Cards ═══════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Card 1: Tổng phải nộp / Cần được thanh toán */}
          <div className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300">
            <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${
              isNegativePayable ? 'from-purple-400 to-indigo-300' : 'from-blue-400 to-blue-300'
            } opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className={`w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] shrink-0 ring-1 ${
                isNegativePayable
                  ? 'bg-gradient-to-br from-purple-50 to-indigo-100/50 text-purple-600 ring-purple-100/50'
                  : 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-600 ring-blue-100/50'
              }`}>
                <Wallet size={22} className="sm:size-[23px]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] sm:text-xs font-semibold tracking-wide uppercase mb-0.5 ${
                  isNegativePayable ? 'text-purple-600' : 'text-gray-400'
                }`}>
                  {isNegativePayable ? 'Tiền cần được thanh toán' : 'Tiền cần thanh toán cho admin'}
                </p>
                <p className={`text-lg sm:text-xl lg:text-[22px] font-extrabold tracking-tight truncate ${
                  isNegativePayable ? 'text-purple-700' : 'text-gray-900'
                }`}>
                  {fmtVND(Math.abs(summary.total_payable))}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 truncate">
                  {isNegativePayable ? 'Admin thanh toán cho nhân viên' : 'Nhân viên nộp cho admin'}
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Đã chuyển */}
          <div className="group relative overflow-hidden rounded-2xl bg-white border border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] shrink-0 ring-1 ring-emerald-100/50">
                <ArrowUpCircle size={22} className="text-emerald-600 sm:size-[23px]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] sm:text-xs font-semibold text-gray-400 tracking-wide uppercase mb-0.5">Đã chuyển</p>
                <p className="text-lg sm:text-xl lg:text-[22px] font-extrabold text-emerald-600 tracking-tight truncate">
                  {fmtVND(summary.total_transferred)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 truncate">
                  Đã ghi nhận trong tháng
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Còn phải nộp / Admin cần chi trả */}
          {isNegativePayable ? (
            <div className="group relative overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 bg-gradient-to-br from-indigo-50/80 to-purple-50/60 border-indigo-200/60">
              <div className="p-4 sm:p-5 flex items-center gap-4">
                <div className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] shrink-0 ring-1 bg-white text-indigo-600 ring-indigo-100">
                  <TrendingUp size={22} className="sm:size-[23px]" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-semibold text-indigo-600 tracking-wide uppercase mb-0.5">Admin cần chi trả</p>
                  <p className="text-lg sm:text-xl lg:text-[22px] font-extrabold text-indigo-700 tracking-tight truncate">
                    {fmtVND(Math.abs(summary.total_payable))}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-indigo-500 mt-0.5 truncate">
                    Hoa hồng chờ admin thanh toán
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className={`group relative overflow-hidden rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 ${
              isComplete
                ? 'bg-gradient-to-br from-emerald-50/80 to-green-50/60 border-emerald-200/60'
                : 'bg-gradient-to-br from-rose-50/80 to-red-50/60 border-rose-200/60'
            }`}>
              <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${
                isComplete ? 'from-emerald-400 to-emerald-300' : 'from-rose-400 to-rose-300'
              } opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              <div className="p-4 sm:p-5 flex items-center gap-4">
                <div className={`w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-2xl flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] shrink-0 ring-1 ${
                  isComplete
                    ? 'bg-white text-emerald-600 ring-emerald-100'
                    : 'bg-white text-rose-500 ring-rose-100'
                }`}>
                  {isComplete ? <CheckCircle2 size={22} className="sm:size-[23px]" strokeWidth={1.8} /> : <Send size={22} className="sm:size-[23px]" strokeWidth={1.8} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] sm:text-xs font-semibold text-gray-400 tracking-wide uppercase mb-0.5">Còn phải nộp</p>
                  <p className={`text-lg sm:text-xl lg:text-[22px] font-extrabold tracking-tight truncate ${
                    isComplete ? 'text-emerald-700' : 'text-rose-600'
                  }`}>
                    {isComplete ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500 text-white text-xs sm:text-sm font-semibold tracking-normal shadow-sm shadow-emerald-200">
                        <CheckCircle2 size={14} strokeWidth={2.5} /> Đã nộp đủ
                      </span>
                    ) : fmtVND(summary.remaining)}
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 truncate">
                    {isComplete ? 'Hoàn thành nộp doanh thu' : 'Số dư cần chuyển nộp tiếp'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══════ Banner thông báo khi nhân viên được nhận tiền ═══════ */}
        {isNegativePayable && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-purple-50/80 border border-indigo-100 text-indigo-900 text-xs sm:text-sm font-medium shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
            <span>Tháng này hoa hồng của bạn vượt doanh thu thu hộ. Bạn <strong>không cần chuyển nộp tiền</strong>, Admin sẽ quyết toán và thanh toán <strong>{fmtVND(Math.abs(summary.total_payable))}</strong> cho bạn.</span>
          </div>
        )}

        {/* ═══════ Progress Bar ═══════ */}
        {isPositivePayable && (
          <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] p-4 sm:p-5">
            {/* Decorative dots */}
            <div className="absolute top-3 right-3 flex gap-1">
              <div className="w-1 h-1 rounded-full bg-gray-200" />
              <div className="w-1 h-1 rounded-full bg-gray-200" />
              <div className="w-1 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                  progressPercent >= 100
                    ? 'bg-emerald-400 shadow-emerald-200'
                    : 'bg-primary shadow-primary/30'
                }`} />
                <p className="text-xs sm:text-sm font-bold text-gray-700 tracking-wide">Tiến độ nộp tiền</p>
              </div>
              <span className={`text-xs sm:text-sm font-extrabold px-3 py-1.5 rounded-full tracking-tight ${
                progressPercent >= 100
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50'
                  : 'bg-blue-50 text-primary ring-1 ring-blue-200/50'
              }`}>
                {progressPercent}%
              </span>
            </div>
            <div className="relative w-full h-3 sm:h-3.5 bg-gray-100 rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
              {/* Shimmer effect */}
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <div className="absolute inset-0 translate-x-[-100%] animate-[shimmer_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{animation: 'shimmer 2.5s ease-in-out infinite'}} />
              </div>
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out relative ${
                  progressPercent >= 100
                    ? 'bg-gradient-to-r from-emerald-400 to-green-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                    : 'bg-gradient-to-r from-blue-500 to-primary shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                }`}
                style={{ width: `${progressPercent}%` }}
              >
                {/* Inner glow */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent" />
              </div>
            </div>
            <div className="flex justify-between mt-2.5 text-[10px] sm:text-xs text-gray-400 font-medium">
              <span>{fmtVND(summary.total_transferred)} đã chuyển</span>
              <span>{fmtVND(summary.total_payable)} tổng</span>
            </div>
          </div>
        )}

        {/* ═══════ Transfer History ═══════ */}
        <div className="rounded-2xl sm:rounded-[26px] bg-white border border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_12px_rgba(0,0,0,0.03)] overflow-hidden">
          {/* Section Header */}
          <div className="relative px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight">Lịch sử chuyển tiền</h3>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5 font-medium">
                {transfers.length} lệnh chuyển trong tháng
              </p>
            </div>
            <button
              onClick={openModal}
              className="group/btn flex items-center gap-2 justify-center text-sm font-bold bg-primary text-white hover:bg-primary/90 active:scale-[0.97] px-5 py-3 sm:py-2.5 rounded-xl transition-all duration-200 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 w-full sm:w-auto"
            >
              <Plus size={18} className="group-hover/btn:rotate-90 transition-transform duration-300" />
              <span>Ghi nhận chuyển tiền</span>
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 sm:py-24">
              <div className="relative">
                <div className="w-10 h-10 border-[3px] border-gray-200 border-t-primary rounded-full animate-spin" />
                <div className="absolute inset-0 w-10 h-10 border-[3px] border-transparent border-t-primary/30 rounded-full animate-[spin_2s_linear_infinite]" style={{animation: 'spin 2s linear infinite'}} />
              </div>
              <p className="text-sm text-gray-400 mt-4 font-medium">Đang tải dữ liệu...</p>
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 sm:py-24 px-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-[28px] flex items-center justify-center mb-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-gray-100">
                <Send size={32} className="text-gray-300 sm:size-9" strokeWidth={1.5} />
              </div>
              <p className="text-gray-500 font-bold text-sm sm:text-base">
                Chưa có lệnh chuyển tiền nào
              </p>
              <p className="text-gray-400 text-xs sm:text-sm mt-2 text-center max-w-xs">
                Nhấn <span className="font-semibold text-gray-500">"Ghi nhận chuyển tiền"</span> để thêm lệnh chuyển đầu tiên
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100/80">
              {transfers.map((item, idx) => (
                <div
                  key={item.id}
                  className="group/item relative p-4 sm:px-6 sm:py-5 hover:bg-gradient-to-r hover:from-gray-50/80 hover:to-transparent transition-all duration-200"
                >
                  <div className="flex items-stretch gap-3 sm:gap-5">
                    {/* ── Left: Icon badge ── */}
                    <div className="hidden sm:flex items-center shrink-0">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center ring-1 ring-primary/10">
                        <TrendingUp size={18} className="text-primary/60" strokeWidth={1.8} />
                      </div>
                    </div>

                    {/* ── Center: Text info ── */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight">
                          {fmtVND(item.amount)}
                        </span>
                        <span className="hidden sm:inline w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                        <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-400 font-medium">
                          <Clock size={11} strokeWidth={2} />
                          {formatVNDateTime(item.transfer_date)}
                        </span>
                      </div>
                      {item.notes ? (
                        <p className="text-[12px] sm:text-[13px] text-gray-500 truncate max-w-md leading-relaxed">
                          {item.notes}
                        </p>
                      ) : (
                        <p className="text-[12px] sm:text-[13px] text-gray-300 italic">Không có ghi chú</p>
                      )}
                    </div>

                    {/* ── Right: Image + Actions ── */}
                    <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                      {item.images && item.images.length > 0 ? (
                        <div className="flex gap-2">
                          {item.images.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-gray-100 cursor-pointer shadow-sm hover:shadow-md hover:border-primary/30 hover:scale-105 transition-all duration-300 group/img"
                              onClick={() => setImagePreview(imgUrl)}
                            >
                              <img
                                src={imgUrl}
                                alt={`Ảnh giao dịch ${idx + 1}`}
                                className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                                <Eye size={16} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 drop-shadow-lg" strokeWidth={2} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50/50 shrink-0">
                          <Upload size={16} className="text-gray-300 sm:size-[18px]" strokeWidth={1.5} />
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-col sm:flex-row gap-1 sm:gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                          className="p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all opacity-0 group-hover/item:opacity-100 sm:opacity-0 focus:opacity-100 shrink-0"
                          title="Sửa lệnh chuyển"
                        >
                          <Pencil size={16} strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover/item:opacity-100 sm:opacity-0 focus:opacity-100 shrink-0"
                          title="Xóa lệnh chuyển"
                        >
                          <Trash2 size={16} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ Add/Edit Modal ═══════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 sm:slide-in-from-bottom-0">
            {/* Modal Header */}
            <div className="relative px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100/80 flex items-center justify-between shrink-0">
              {/* Drag handle for mobile */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full sm:hidden" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                  <Send size={20} className="text-primary" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-900 tracking-tight">
                    {editingTransfer ? 'Sửa lệnh chuyển tiền' : 'Ghi nhận chuyển tiền'}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium">
                    {editingTransfer ? `Sửa lệnh chuyển tiền tháng ${selectedMonth}` : `Thêm lệnh chuyển tiền cho tháng ${selectedMonth}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={20} strokeWidth={1.8} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Ngày & Giờ chuyển */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 tracking-wide">
                    Ngày & Giờ chuyển <span className="text-red-400">*</span>
                  </label>
                  <ModernDateTimePicker
                    value={form.transfer_date}
                    onChange={(date) => setForm({ ...form, transfer_date: date })}
                    className="w-full"
                  />
                </div>

                {/* Số tiền */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 tracking-wide">
                    Số tiền (VNĐ) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative group/input">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-focus-within/input:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="VD: 1.500.000"
                      value={formatCurrencyInput(form.amount)}
                      onChange={(e) => {
                        const val = parseCurrencyInput(e.target.value);
                        setForm({ ...form, amount: val });
                      }}
                      className="relative w-full h-[52px] px-4 rounded-2xl bg-gray-50 border-2 border-gray-100 placeholder:text-gray-300 text-sm font-semibold focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                      VNĐ
                    </span>
                  </div>
                  {form.amount && Number(form.amount) > 0 && (
                    <p className="text-xs text-gray-400 mt-1.5 ml-1 font-medium">
                      = {fmtVND(Number(form.amount))}
                    </p>
                  )}
                </div>

                {/* Ghi chú */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 tracking-wide">
                    Ghi chú <span className="text-gray-400 font-medium text-xs">(Tùy chọn)</span>
                  </label>
                  <textarea
                    rows="2"
                    placeholder="VD: Chuyển khoản Vietcombank..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-gray-50 border-2 border-gray-100 placeholder:text-gray-300 text-sm font-medium focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all resize-none"
                  />
                </div>

                {/* Ảnh giao dịch */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 tracking-wide">
                    Ảnh giao dịch <span className="text-gray-400 font-medium text-xs">(Tùy chọn)</span>
                  </label>
                  {selectedImage ? (
                    <div className="relative rounded-2xl overflow-hidden border-2 border-gray-100 bg-gray-50 shadow-sm">
                      <img
                        src={selectedImage.dataUri}
                        alt="Ảnh giao dịch"
                        className="w-full h-44 object-cover"
                      />
                      <button
                        type="button"
                        onClick={removeSelectedImage}
                        className="absolute top-3 right-3 p-2 bg-red-500/90 backdrop-blur-sm text-white rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
                      <div className="px-4 py-2.5 text-xs text-gray-500 font-medium truncate bg-gray-50/80 backdrop-blur-sm">
                        {selectedImage.filename}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-2.5 py-7 px-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-primary/40 hover:bg-primary/[0.02] transition-all cursor-pointer group/upload"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover/upload:bg-primary/10 flex items-center justify-center transition-colors duration-300">
                        <Upload size={22} className="text-gray-400 group-hover/upload:text-primary transition-colors duration-300" strokeWidth={1.8} />
                      </div>
                      <span className="text-sm text-gray-500 font-semibold">Tải ảnh giao dịch</span>
                      <span className="text-xs text-gray-400">JPG, PNG, WebP (tối đa 10MB)</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-[0.45] py-3 rounded-2xl font-bold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 active:scale-[0.97] transition-all duration-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm text-white bg-gradient-to-br from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 active:scale-[0.97] shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-1.5"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Đang lưu...
                      </>
                    ) : editingTransfer ? (
                      <>
                        <Pencil size={16} strokeWidth={2} />
                        Cập nhật
                      </>
                    ) : (
                      <>
                        <Send size={16} strokeWidth={2} />
                        Ghi nhận
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Image Preview Modal ═══════ */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
          onClick={() => setImagePreview(null)}
        >
          <button
            onClick={() => setImagePreview(null)}
            className="absolute top-4 right-4 p-2.5 text-white/60 hover:text-white hover:bg-white/10 rounded-2xl transition-all"
          >
            <X size={24} strokeWidth={1.5} />
          </button>
          <img
            src={imagePreview}
            alt="Ảnh giao dịch"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
      <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal(prev => ({ ...prev, show: false }))} />
    </div>
  );
};

export default SaleTransfer;
