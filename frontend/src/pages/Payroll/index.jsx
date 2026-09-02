import React, { useState, useEffect, useRef } from 'react';
import { getPayroll, lockPayroll, getPayrollTransfers, createPayrollTransfer, updatePayrollTransfer, deletePayrollTransfer, uploadPayrollTransferImage, getAdsCosts, createAdsCost, updateAdsCost, deleteAdsCost, getMiscCosts, createMiscCost, updateMiscCost, deleteMiscCost, getBranches, getRevenueByBranch, getCommissionReconciliation, getUsers } from '../../api/client';
import {
  Wallet, Calendar, Download, TrendingUp, ArrowUpRight,
  Lock, Unlock, AlertTriangle, CheckCircle2, ShieldCheck, RefreshCw,
  Plus, Edit, Trash2, Megaphone, X, ChevronDown, ChevronUp, ChevronRight, Building2, Receipt, HelpCircle, Upload, Eye, Send, Clock
} from 'lucide-react';
import { useToast, ToastContainer } from '../../components/Toast';
import ModernMonthPicker from '../../components/ModernMonthPicker';
import ModernDatePicker from '../../components/ModernDatePicker';
import ModernDateTimePicker from '../../components/ModernDateTimePicker';
import ConfirmationModal from '../../components/ConfirmationModal';
import CustomSelect from '../../components/CustomSelect';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/formatters';


// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';
const fmtDateVN = (ymd) => {
  if (!ymd) return '';
  const d = ymd instanceof Date ? ymd : new Date(ymd);
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
const fmtAdsCode = (id) => `ADS-${String(id).padStart(6, '0')}`;
const fmtMiscCode = (id) => `MISC-${String(id).padStart(6, '0')}`;
const toYMD = (value) => (value ? String(value).split('T')[0] : '');
const fmtAdsRange = (item) => {
  const start = toYMD(item.start_date || item.date);
  const end = toYMD(item.end_date || item.date);
  const format = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('vi-VN') : '';
  return start === end ? format(start) : `${format(start)} - ${format(end)}`;
};

// ─────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────
const StatusBadge = ({ meta }) => {
  if (meta.is_locked) {
    return (
      <div className="flex w-full flex-col items-stretch gap-0.5 md:items-end">
        <div className="flex h-[35px] w-full items-center justify-center gap-1.5 rounded-2xl border border-green-200 bg-green-50 px-4 text-sm font-bold text-green-700 md:w-52">
          <ShieldCheck size={13} />
          <span>Đã chốt chính thức</span>
        </div>
        {meta.locked_at && (
          <p className="text-[10px] text-gray-400 pr-1">
            {fmtDate(meta.locked_at)}
            {meta.locked_by_name ? ` · ${meta.locked_by_name}` : ''}
          </p>
        )}
      </div>
    );
  }
  if (meta.can_lock) {
    return (
      <div className="flex h-[35px] w-full items-center justify-center gap-1.5 rounded-2xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 md:w-52">
        <Unlock size={13} />
        <span>Sẵn sàng chốt báo cáo</span>
      </div>
    );
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────
// LockButton
// ─────────────────────────────────────────────────────────────────────
const LockButton = ({ meta, locking, onLock }) => {
  if (meta.is_locked) {
    return (
      <div className="w-full md:w-auto flex justify-center items-center gap-2 text-sm font-bold text-green-600 px-4 py-2 rounded-xl bg-green-50 border border-green-100">
        <CheckCircle2 size={16} />
        Đã chốt báo cáo
      </div>
    );
  }
  return (
    <button
      onClick={onLock}
      disabled={!meta.can_lock || locking}
      className={`w-full md:w-auto flex justify-center items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl transition-all border
        ${meta.can_lock && !locking
          ? 'bg-primary text-white border-primary hover:opacity-90 shadow-sm'
          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
        }`}
    >
      {locking ? (
        <><RefreshCw size={15} className="animate-spin" />Đang chốt...</>
      ) : (
        <><Lock size={15} />Chốt báo cáo tháng này</>
      )}
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────
const Payroll = () => {
  const [payrollData, setPayrollData] = useState([]);
  const [meta, setMeta] = useState({
    is_locked: false, can_lock: false, lock_day: 5,
    source: 'realtime', month: '', locked_at: null, locked_by_name: null,
  });
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const PAGE_SIZE = 5;
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  // -- Ads Costs States --
  const [adsCosts, setAdsCosts] = useState([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [performanceRevenue, setPerformanceRevenue] = useState(0);
  const [showAdsModal, setShowAdsModal] = useState(false);
  const [editingAds, setEditingAds] = useState(null);
  const [adsForm, setAdsForm] = useState({ date: '', start_date: '', end_date: '', amount: '', platform: '', branch_id: '', notes: '' });
  const [branches, setBranches] = useState([]);
  const [saleUsers, setSaleUsers] = useState([]);
  const [saleTransfers, setSaleTransfers] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [transferForm, setTransferForm] = useState({ sale_user_id: '', transfer_date: '', amount: '', notes: '' });
  // Image states for transfer
  const [transferImage, setTransferImage] = useState(null); // { dataUri, filename }
  const transferFileInputRef = useRef(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);
  const [reconciliation, setReconciliation] = useState(null);

  // -- User Transfer Detail Modal --
  const [showUserTransferModal, setShowUserTransferModal] = useState(false);
  const [userTransferDetailUser, setUserTransferDetailUser] = useState(null); // { id, full_name, username }

  // -- Misc Costs States --
  const [miscCosts, setMiscCosts] = useState([]);
  const [loadingMisc, setLoadingMisc] = useState(false);
  const [showMiscModal, setShowMiscModal] = useState(false);
  const [editingMisc, setEditingMisc] = useState(null);
  const [miscForm, setMiscForm] = useState({ date: '', start_date: '', end_date: '', amount: '', category: '', branch_id: '', notes: '' });

  // -- Confirmation Modal State --
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: () => {},
  });

  const { toasts, toast, removeToast } = useToast();

  const toggleExpand = (id) => {
    setExpandedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  useEffect(() => { 
    setDisplayCount(PAGE_SIZE);
    loadPayroll(); 
    loadAdsCosts();
    loadMiscCosts();
    loadPerformanceRevenue();
    loadCommissionSummary();
    loadSaleTransfers();
  }, [selectedMonth]);

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const res = await getBranches();
        setBranches(res.data || []);
      } catch (err) {
        console.error(err);
        toast.error('Không thể tải danh sách cơ sở');
      }
    };
    const loadSaleUsers = async () => {
      try {
        const res = await getUsers();
        const users = Array.isArray(res.data) ? res.data : [];
        setSaleUsers(users.filter(u => Array.isArray(u.roles) && u.roles.some(r => r.name === 'saler')));
      } catch (err) {
        console.error(err);
        toast.error('Không thể tải danh sách sale');
      }
    };
    loadBranches();
    loadSaleUsers();
  }, []);

  // Lock body scroll when user transfer detail modal is open
  useEffect(() => {
    if (showUserTransferModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showUserTransferModal]);

  const loadAdsCosts = async () => {
    setLoadingAds(true);
    try {
      const res = await getAdsCosts({ month: selectedMonth });
      setAdsCosts(res.data.ads_costs || []);
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu chi phí Ads');
    } finally {
      setLoadingAds(false);
    }
  };

  const loadMiscCosts = async () => {
    setLoadingMisc(true);
    try {
      const res = await getMiscCosts({ month: selectedMonth });
      setMiscCosts(res.data.misc_costs || []);
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu chi phí phát sinh');
    } finally {
      setLoadingMisc(false);
    }
  };

  const loadPerformanceRevenue = async () => {
    try {
      const [year, month] = selectedMonth.split('-');
      const firstDay = `${year}-${month}-01`;
      const d = new Date(Number(year), Number(month), 0); // day 0 of next month = last day of current month
      const lastDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await getRevenueByBranch(firstDay, lastDay);
      const totalRevenue = (res.data || []).reduce((sum, branch) => sum + parseFloat(branch.total_revenue || 0), 0);
      setPerformanceRevenue(totalRevenue);
    } catch (err) {
      console.error('Failed to load performance revenue:', err);
    }
  };

  const loadSaleTransfers = async () => {
    setLoadingTransfers(true);
    try {
      const res = await getPayrollTransfers(selectedMonth);
      setSaleTransfers(res.data.transfers || []);
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải sổ chuyển tiền');
    } finally {
      setLoadingTransfers(false);
    }
  };

  const loadCommissionSummary = async () => {
    try {
      const [year, month] = selectedMonth.split('-');
      const firstDay = `${year}-${month}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
      const res = await getCommissionReconciliation(firstDay, lastDay);
      const firstRow = Array.isArray(res.data) ? res.data[0] : null;
      setReconciliation(firstRow || null);
    } catch (err) {
      setReconciliation(null);
      console.error('Failed to load commission reconciliation:', err);
    }
  };

  const doSaveAds = async () => {
    const adsPayload = { ...adsForm, date: adsForm.start_date };
    try {
      if (editingAds) {
        await updateAdsCost(editingAds.id, adsPayload);
        toast.success('Đã cập nhật chi phí Ads');
      } else {
        await createAdsCost(adsPayload);
        toast.success('Đã thêm chi phí Ads');
      }
      setShowAdsModal(false);
      loadAdsCosts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Có lỗi xảy ra khi lưu chi phí Ads');
    }
  };

  const handleSaveAds = (e) => {
    e.preventDefault();
    if (!adsForm.branch_id) {
      toast.error('Vui lòng chọn cơ sở');
      return;
    }
    if (!adsForm.start_date || !adsForm.end_date) {
      toast.error('Vui long chon tu ngay va den ngay');
      return;
    }
    if (adsForm.end_date < adsForm.start_date) {
      toast.error('Den ngay phai lon hon hoac bang tu ngay');
      return;
    }

    if (editingAds) {
      // Build change summary
      const getBranchName = (id) => {
        const b = branches.find(br => String(br.id) === String(id));
        return b ? `"${b.name}"` : id || '-';
      };
      const fmtDateLocal = (ymd) => ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('vi-VN') : '-';
      const fmtRange = (start, end) => start === end ? fmtDateLocal(start) : `${fmtDateLocal(start)} - ${fmtDateLocal(end)}`;

      const oldStart = toYMD(editingAds.start_date || editingAds.date);
      const oldEnd = toYMD(editingAds.end_date || editingAds.date);
      const newStart = adsForm.start_date;
      const newEnd = adsForm.end_date;

      const changes = [];
      if (fmtRange(oldStart, oldEnd) !== fmtRange(newStart, newEnd)) {
        changes.push(`• Ngày: ${fmtRange(oldStart, oldEnd)} → ${fmtRange(newStart, newEnd)}`);
      }
      if (String(editingAds.branch_id) !== String(adsForm.branch_id)) {
        changes.push(`• Cơ sở: ${getBranchName(editingAds.branch_id)} → ${getBranchName(adsForm.branch_id)}`);
      }
      if (Number(editingAds.amount) !== Number(adsForm.amount)) {
        changes.push(`• Số tiền: ${fmtVND(editingAds.amount)} → ${fmtVND(adsForm.amount)}`);
      }
      if ((editingAds.platform || '') !== (adsForm.platform || '')) {
        changes.push(`• Nền tảng: ${editingAds.platform || '-'} → ${adsForm.platform || '-'}`);
      }
      if ((editingAds.notes || '') !== (adsForm.notes || '')) {
        changes.push(`• Ghi chú: ${editingAds.notes || '-'} → ${adsForm.notes || '-'}`);
      }

      const changeMsg = changes.length > 0
        ? `Bạn có chắc muốn cập nhật chi phí ${fmtAdsCode(editingAds.id)}?\n\n${changes.join('\n')}`
        : `Bạn có chắc muốn cập nhật chi phí ${fmtAdsCode(editingAds.id)}?\n\n(Không có thay đổi nào)`;

      setConfirmModal({
        show: true,
        title: 'Cập nhật chi phí Ads?',
        message: changeMsg,
        type: 'warning',
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, show: false }));
          await doSaveAds();
        },
      });
    } else {
      doSaveAds();
    }
  };

  const handleDeleteAds = (id) => {
    setConfirmModal({
      show: true,
      title: 'Xóa chi phí?',
      message: 'Bạn có chắc muốn xóa chi phí này? Hành động này không thể hoàn tác.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteAdsCost(id);
          toast.success('Đã xóa chi phí Ads');
          loadAdsCosts();
        } catch (err) {
          toast.error('Có lỗi xảy ra khi xóa');
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const openAdsModal = (cost = null) => {
    if (cost) {
      setEditingAds(cost);
      const startDate = toYMD(cost.start_date || cost.date);
      const endDate = toYMD(cost.end_date || cost.date);
      setAdsForm({
        date: startDate,
        start_date: startDate,
        end_date: endDate,
        amount: cost.amount,
        platform: cost.platform || '',
        branch_id: cost.branch_id || '',
        notes: cost.notes || ''
      });
    } else {
      setEditingAds(null);
      const today = new Date().toISOString().split('T')[0];
      const dateToUse = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;
      setAdsForm({ date: dateToUse, start_date: dateToUse, end_date: dateToUse, amount: '', platform: 'Facebook', branch_id: branches[0]?.id || '', notes: '' });
    }
    setShowAdsModal(true);
  };

  const doSaveMisc = async () => {
    const miscPayload = { ...miscForm, date: miscForm.start_date };
    try {
      if (editingMisc) {
        await updateMiscCost(editingMisc.id, miscPayload);
        toast.success('Đã cập nhật chi phí phát sinh');
      } else {
        await createMiscCost(miscPayload);
        toast.success('Đã thêm chi phí phát sinh');
      }
      setShowMiscModal(false);
      loadMiscCosts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Có lỗi xảy ra khi lưu chi phí phát sinh');
    }
  };

  const handleSaveMisc = (e) => {
    e.preventDefault();
    if (!miscForm.branch_id) {
      toast.error('Vui lòng chọn cơ sở');
      return;
    }
    if (!miscForm.start_date || !miscForm.end_date) {
      toast.error('Vui lòng chọn từ ngày và đến ngày');
      return;
    }
    if (miscForm.end_date < miscForm.start_date) {
      toast.error('Đến ngày phải lớn hơn hoặc bằng từ ngày');
      return;
    }

    if (editingMisc) {
      // Build change summary
      const getBranchName = (id) => {
        const b = branches.find(br => String(br.id) === String(id));
        return b ? `"${b.name}"` : id || '-';
      };
      const fmtDateLocal = (ymd) => ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('vi-VN') : '-';
      const fmtRange = (start, end) => start === end ? fmtDateLocal(start) : `${fmtDateLocal(start)} - ${fmtDateLocal(end)}`;

      const oldStart = toYMD(editingMisc.start_date || editingMisc.date);
      const oldEnd = toYMD(editingMisc.end_date || editingMisc.date);
      const newStart = miscForm.start_date;
      const newEnd = miscForm.end_date;

      const changes = [];
      if (fmtRange(oldStart, oldEnd) !== fmtRange(newStart, newEnd)) {
        changes.push(`• Ngày: ${fmtRange(oldStart, oldEnd)} → ${fmtRange(newStart, newEnd)}`);
      }
      if (String(editingMisc.branch_id) !== String(miscForm.branch_id)) {
        changes.push(`• Cơ sở: ${getBranchName(editingMisc.branch_id)} → ${getBranchName(miscForm.branch_id)}`);
      }
      if (Number(editingMisc.amount) !== Number(miscForm.amount)) {
        changes.push(`• Số tiền: ${fmtVND(editingMisc.amount)} → ${fmtVND(miscForm.amount)}`);
      }
      if ((editingMisc.category || '') !== (miscForm.category || '')) {
        changes.push(`• Danh mục: ${editingMisc.category || '-'} → ${miscForm.category || '-'}`);
      }
      if ((editingMisc.notes || '') !== (miscForm.notes || '')) {
        changes.push(`• Ghi chú: ${editingMisc.notes || '-'} → ${miscForm.notes || '-'}`);
      }

      const changeMsg = changes.length > 0
        ? `Bạn có chắc muốn cập nhật chi phí ${fmtMiscCode(editingMisc.id)}?\n\n${changes.join('\n')}`
        : `Bạn có chắc muốn cập nhật chi phí ${fmtMiscCode(editingMisc.id)}?\n\n(Không có thay đổi nào)`;

      setConfirmModal({
        show: true,
        title: 'Cập nhật chi phí phát sinh?',
        message: changeMsg,
        type: 'warning',
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, show: false }));
          await doSaveMisc();
        },
      });
    } else {
      doSaveMisc();
    }
  };

  const handleDeleteMisc = (id) => {
    setConfirmModal({
      show: true,
      title: 'Xóa chi phí phát sinh?',
      message: 'Bạn có chắc muốn xóa chi phí này? Hành động này không thể hoàn tác.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteMiscCost(id);
          toast.success('Đã xóa chi phí phát sinh');
          loadMiscCosts();
        } catch (err) {
          toast.error('Có lỗi xảy ra khi xóa');
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const openMiscModal = (cost = null) => {
    if (cost) {
      setEditingMisc(cost);
      const startDate = toYMD(cost.start_date || cost.date);
      const endDate = toYMD(cost.end_date || cost.date);
      setMiscForm({
        date: startDate,
        start_date: startDate,
        end_date: endDate,
        amount: cost.amount,
        category: cost.category || '',
        branch_id: cost.branch_id || '',
        notes: cost.notes || ''
      });
    } else {
      setEditingMisc(null);
      const today = new Date().toISOString().split('T')[0];
      const dateToUse = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;
      setMiscForm({ date: dateToUse, start_date: dateToUse, end_date: dateToUse, amount: '', category: '', branch_id: branches[0]?.id || '', notes: '' });
    }
    setShowMiscModal(true);
  };

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const res = await getPayroll(selectedMonth);
      const { payroll, is_locked, can_lock, lock_day, source, month, locked_at, locked_by_name } = res.data;
      setPayrollData(payroll || []);
      setMeta({ is_locked, can_lock, lock_day, source, month, locked_at, locked_by_name });
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu lương');
    } finally {
      setLoading(false);
    }
  };

  const handleLock = () => {
    const [year, month] = selectedMonth.split('-');
    const monthLabel = `${month}/${year}`;
    
    setConfirmModal({
      show: true,
      title: 'Chốt báo cáo tháng?',
      message: `Bạn có chắc chắn muốn chốt báo cáo cho tháng ${monthLabel}? Sau khi chốt, toàn bộ số liệu sẽ được lưu trữ cố định và không thể thay đổi.`,
      type: 'lock',
      confirmText: 'Chốt báo cáo',
      onConfirm: async () => {
        setLocking(true);
        setConfirmModal(prev => ({ ...prev, show: false }));
        try {
          const res = await lockPayroll(selectedMonth);
          toast.success(res.data.message || 'Đã chốt báo cáo thành công!');
          await loadPayroll(); // reload để hiển thị snapshot
        } catch (err) {
          const msg = err?.response?.data?.error || 'Không thể chốt lương';
          toast.error(msg);
        } finally {
          setLocking(false);
        }
      }
    });
  };

  const doSaveTransfer = async () => {
    const payload = {
      month: selectedMonth,
      sale_user_id: transferForm.sale_user_id,
      transfer_date: transferForm.transfer_date,
      amount: Number(transferForm.amount),
      notes: transferForm.notes,
    };

    try {
      let savedTransferId = editingTransfer?.id;
      if (editingTransfer) {
        await updatePayrollTransfer(editingTransfer.id, payload);
        toast.success('Đã cập nhật lệnh chuyển tiền');
      } else {
        const res = await createPayrollTransfer(payload);
        savedTransferId = res.data?.transfer?.id;
        toast.success('Đã lưu lệnh chuyển tiền');
      }

      // Upload ảnh giao dịch nếu có
      if (transferImage && savedTransferId) {
        try {
          await uploadPayrollTransferImage(
            savedTransferId,
            transferImage.dataUri,
            transferImage.filename
          );
        } catch (imgErr) {
          console.error('Image upload failed:', imgErr);
          toast.error('Đã lưu lệnh chuyển tiền nhưng không tải được ảnh giao dịch');
        }
      }

      setShowTransferModal(false);
      setTransferImage(null);
      loadSaleTransfers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Không thể lưu lệnh chuyển tiền');
    }
  };

  const handleSaveTransfer = (e) => {
    e.preventDefault();

    if (!transferForm.sale_user_id) {
      toast.error('Vui lòng chọn sale');
      return;
    }
    if (!transferForm.amount || Number(transferForm.amount) <= 0) {
      toast.error('Số tiền phải lớn hơn 0');
      return;
    }
    if (!transferForm.transfer_date) {
      toast.error('Vui lòng chọn ngày giờ chuyển');
      return;
    }

    const dateObj = new Date(transferForm.transfer_date);
    const formattedDate = dateObj.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    const saleName = saleUsers.find(u => String(u.id) === String(transferForm.sale_user_id))?.full_name || '';

    setConfirmModal({
      show: true,
      title: editingTransfer ? 'Xác nhận cập nhật' : 'Xác nhận chuyển tiền',
      message: editingTransfer
        ? `Bạn có chắc muốn cập nhật lệnh chuyển ${fmtVND(transferForm.amount)} của ${saleName}?`
        : `Bạn có chắc muốn ghi nhận chuyển ${fmtVND(transferForm.amount)} từ ${saleName} vào ${formattedDate}?`,
      type: 'warning',
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, show: false }));
        doSaveTransfer();
      },
    });
  };

  const handleDeleteTransfer = (id) => {
    setConfirmModal({
      show: true,
      title: 'Xóa lệnh chuyển tiền?',
      message: 'Bạn có chắc chắn muốn xóa lệnh chuyển tiền này? Hành động này không thể hoàn tác.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deletePayrollTransfer(id);
          toast.success('Đã xóa lệnh chuyển tiền');
          loadSaleTransfers();
        } catch (err) {
          toast.error('Không thể xóa lệnh chuyển tiền');
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  };

  const openTransferModal = (transfer = null) => {
    if (transfer) {
      setEditingTransfer(transfer);
      setTransferForm({
        sale_user_id: transfer.sale_user_id,
        transfer_date: transfer.transfer_date || new Date().toISOString(),
        amount: transfer.amount,
        notes: transfer.notes || '',
      });
    } else {
      const now = new Date().toISOString();
      setEditingTransfer(null);
      setTransferForm({ sale_user_id: saleUsers[0]?.id || '', transfer_date: now, amount: '', notes: '' });
    }
    setTransferImage(null);
    setShowTransferModal(true);
  };

  // Mở modal xem chi tiết chuyển tiền của 1 user cụ thể
  const openUserTransferModal = (user) => {
    setUserTransferDetailUser(user);
    setShowUserTransferModal(true);
  };

  // Lọc các giao dịch của user đang xem
  const userTransfers = userTransferDetailUser
    ? saleTransfers.filter(t => String(t.sale_user_id) === String(userTransferDetailUser.id))
    : [];

  // Mở form sửa transfer từ trong user detail modal
  const handleEditFromUserModal = (transfer) => {
    setShowUserTransferModal(false);
    // Dùng setTimeout để đảm bảo modal cũ đóng xong trước khi mở modal mới
    setTimeout(() => openTransferModal(transfer), 150);
  };

  // Xóa transfer từ trong user detail modal
  const handleDeleteFromUserModal = (transferId) => {
    handleDeleteTransfer(transferId);
  };

  const totalPayrollCost = payrollData.reduce((s, i) => s + Number(i.total_payable), 0);
  const totalCommission = payrollData.reduce((s, i) => s + Number(i.commission_amount), 0);
  const totalAdsCost = adsCosts.reduce((s, i) => s + Number(i.amount), 0);
  const totalMiscCost = miscCosts.reduce((s, i) => s + Number(i.amount), 0);
  const totalPayable = totalPayrollCost + totalAdsCost + totalMiscCost;
  const totalManagedRevenue = payrollData.reduce((s, i) => s + Number(i.managed_revenue), 0);
  const totalTransferAmount = saleTransfers.reduce((s, i) => s + Number(i.amount), 0);
  // Lợi nhuận = Doanh thu (từ performance, giống bên Performance page) - Tổng chi phí (lương + hoa hồng + ads + misc)
  const totalProfit = performanceRevenue - totalPayrollCost - totalAdsCost - totalMiscCost;

  // Map số tiền đã chuyển theo từng sale (gộp tất cả lần chuyển trong tháng)
  const transfersByUser = {};
  saleTransfers.forEach(t => {
    transfersByUser[t.sale_user_id] = (transfersByUser[t.sale_user_id] || 0) + Number(t.amount);
  });

  const visiblePayroll = payrollData.slice(0, displayCount);
  const hasMore = displayCount < payrollData.length;

  return (
    <div className="p-4 md:p-6 xl:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">Báo cáo chi phí</h1>
            <p className="text-sm text-gray-500 mt-1">Quản lý lương, hoa hồng & chi phí vận hành tháng {selectedMonth}</p>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 w-full md:w-auto">
            <ModernMonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              className="w-full md:w-48"
            />
            <LockButton meta={meta} locking={locking} onLock={handleLock} />
            {!loading && <StatusBadge meta={meta} />}
          </div>
        </div>

        {/* ── Realtime warning banner ── */}
        {false && (
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-bold">Dữ liệu tạm thời (Realtime).</span>{' '}
              {meta.can_lock
                ? 'Đã đến ngày 5, bạn có thể chốt lương để lưu số liệu chính thức.'
                : `Số liệu sẽ thay đổi theo thời gian thực cho đến khi Admin chốt lương vào ngày ${meta.lock_day}.`}
            </p>
          </div>
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
          {/* Card 1: Tổng chi trả */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group cursor-default">
            <div className="h-1 bg-primary" />
            <div className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div>
                  <p className="text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider">Tổng chi trả</p>
                  <p className="text-base sm:text-lg lg:text-2xl font-extrabold text-gray-900 mt-0.5">{fmtVND(totalPayable)}</p>
                </div>
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <Wallet size={20} className="text-primary md:w-[22px] md:h-[22px]" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-medium text-green-600 bg-green-50/80 w-fit px-2.5 py-1 rounded-lg">
                <TrendingUp size={12} /> Đã gồm hoa hồng
              </div>
            </div>
          </div>

          {/* Card 2: Tổng hoa hồng */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group cursor-default">
            <div className="h-1 bg-purple-500" />
            <div className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div>
                  <p className="text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider">Tổng hoa hồng</p>
                  <p className="text-base sm:text-lg lg:text-2xl font-extrabold text-purple-600 mt-0.5">{fmtVND(totalCommission)}</p>
                </div>
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <ArrowUpRight size={20} className="text-purple-600 md:w-[22px] md:h-[22px]" />
                </div>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400">Từ doanh thu đơn hàng</p>
            </div>
          </div>

          {/* Card 3: Tổng lợi nhuận */}
          <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group cursor-default`}>
            <div className={`h-1 ${totalProfit >= 0 ? 'bg-blue-500' : 'bg-rose-500'}`} />
            <div className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div>
                  <p className="text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider">Tổng lợi nhuận</p>
                  <p className={`text-base sm:text-lg lg:text-2xl font-extrabold mt-0.5 ${totalProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>{fmtVND(totalProfit)}</p>
                </div>
                <div className={`w-10 h-10 md:w-11 md:h-11 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 ${totalProfit >= 0 ? 'bg-blue-100' : 'bg-rose-100'}`}>
                  <TrendingUp size={20} className={`md:w-[22px] md:h-[22px] ${totalProfit >= 0 ? 'text-blue-600' : 'text-rose-600'}`} />
                </div>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400">Doanh thu trừ chi phí</p>
            </div>
          </div>

          {/* Card 4: Tổng chi phí Ads */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group cursor-default">
            <div className="h-1 bg-pink-500" />
            <div className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div>
                  <p className="text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider">Chi phí Ads</p>
                  <p className="text-base sm:text-lg lg:text-2xl font-extrabold text-pink-600 mt-0.5">{fmtVND(totalAdsCost)}</p>
                </div>
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-pink-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <Megaphone size={20} className="text-pink-600 md:w-[22px] md:h-[22px]" />
                </div>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400">Chi tiêu quảng cáo</p>
            </div>
          </div>

          {/* Card 5: Tổng chi phí phát sinh */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group cursor-default">
            <div className="h-1 bg-amber-500" />
            <div className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div>
                  <p className="text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider">Chi phí phát sinh</p>
                  <p className="text-base sm:text-lg lg:text-2xl font-extrabold text-amber-600 mt-0.5">{fmtVND(totalMiscCost)}</p>
                </div>
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <Receipt size={20} className="text-amber-600 md:w-[22px] md:h-[22px]" />
                </div>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400">Điện, nước, mặt bằng,...</p>
            </div>
          </div>

          {/* Card 6: Tổng chuyển tiền sale → admin */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group cursor-default">
            <div className="h-1 bg-slate-600" />
            <div className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-2 md:mb-3">
                <div>
                  <p className="text-[11px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider">Sale → Admin</p>
                  <p className="text-base sm:text-lg lg:text-2xl font-extrabold text-slate-900 mt-0.5">{fmtVND(totalTransferAmount)}</p>
                </div>
                <div className="w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                  <Wallet size={20} className="text-slate-500 md:w-[22px] md:h-[22px]" />
                </div>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400">Sổ ghi nhận chuyển tiền</p>
            </div>
          </div>
        </div>

        {reconciliation && (
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <ShieldCheck size={14} className="text-emerald-700" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Đối soát hoa hồng</p>
                </div>
                <p className="text-sm text-emerald-800">
                  Tỉ lệ đối soát: <span className="font-bold">{Number(reconciliation.coverage_ratio || 0).toFixed(2)}%</span> đơn đã hoàn thành
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs md:text-sm">
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-center">
                  <p className="text-gray-400 text-[10px] uppercase font-semibold mb-0.5">Legacy</p>
                  <p className="font-bold text-gray-900">{fmtVND(reconciliation.legacy_commission || 0)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-center">
                  <p className="text-gray-400 text-[10px] uppercase font-semibold mb-0.5">Ledger</p>
                  <p className="font-bold text-gray-900">{fmtVND(reconciliation.ledger_commission || 0)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-center">
                  <p className="text-gray-400 text-[10px] uppercase font-semibold mb-0.5">Chênh lệch</p>
                  <p className={`font-bold ${Number(reconciliation.diff_amount || 0) >= 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    {fmtVND(reconciliation.diff_amount || 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 md:px-6 py-4 md:py-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Wallet size={16} className="text-primary" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900">Chi tiết bảng lương</h3>
                {meta.source === 'snapshot' && (
                  <p className="text-[11px] text-green-600 font-medium flex items-center gap-1">
                    <ShieldCheck size={11} /> Nguồn: Snapshot chính thức đã chốt
                  </p>
                )}
                {meta.source === 'realtime' && (
                  <p className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                    <RefreshCw size={11} /> Nguồn: Realtime (chưa chốt)
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
              <button className="h-10 md:h-[38px] w-full md:w-auto flex justify-center items-center gap-2 text-sm font-semibold text-primary bg-primary/5 hover:bg-primary/10 px-5 rounded-xl transition-all border border-primary/20 hover:border-primary/40 shadow-sm" disabled title="Tính năng đang phát triển">
                <Download size={16} />
                Xuất báo cáo
              </button>
            </div>
          </div>

          {/* Mobile view */}
          <div className="block xl:hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Đang tính toán...</div>
            ) : payrollData.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Không có dữ liệu cho tháng này</div>
            ) : (
              visiblePayroll.map((item) => {
                const isExpanded = expandedIds.includes(item.id);
                return (
                  <div key={item.id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => toggleExpand(item.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold">
                          {(item.full_name || item.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 leading-none">{item.full_name}</p>
                          <p className="text-xs text-gray-400 mt-1">@{item.username}</p>
                          {!isExpanded && (
                            <p className="text-sm font-bold text-primary mt-1.5">{fmtVND(item.total_payable)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter ${
                          item.role_name === 'admin' ? 'bg-orange-100 text-orange-600' :
                          item.role_name === 'camera_manager' ? 'bg-purple-100 text-purple-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {item.role_name === 'admin' ? 'Quản trị' :
                          item.role_name === 'camera_manager' ? 'Quản lý' : 'Saler'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={18} className="text-gray-400" />
                        ) : (
                          <ChevronDown size={18} className="text-gray-400" />
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-4 space-y-3 bg-gray-50/50 p-4 rounded-xl border border-gray-50 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Lương cứng + Hoa hồng */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[11px] text-gray-400 font-medium mb-0.5">Lương cứng</p>
                            <p className="text-sm font-semibold text-gray-900">{fmtVND(item.base_salary)}</p>
                          </div>
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[11px] text-gray-400 font-medium mb-0.5">Hoa hồng</p>
                            <p className="text-sm font-semibold text-purple-600">{fmtVND(item.commission_amount)}</p>
                          </div>
                        </div>

                        {/* Doanh thu xử lý - full width */}
                        <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
                          <div className="p-3 pb-2">
                            <p className="text-[11px] text-gray-400 font-medium mb-0.5">Doanh thu xử lý</p>
                            <p className="text-lg font-bold text-gray-900">{fmtVND(item.managed_revenue)}</p>
                          </div>
                          {(() => {
                            const total = item.managed_orders_count || 0;
                            const created = item.created_orders_count || 0;
                            const processed = total - created;
                            const createdRev = Number(item.created_revenue || 0);
                            const processedRev = Number(item.managed_revenue || 0) - createdRev;

                            if (total === 0) {
                              return (
                                <div className="px-3 pb-3">
                                  <p className="text-[12px] text-gray-400 font-medium">0 đơn</p>
                                </div>
                              );
                            }

                            return (
                              <div className={`grid gap-2 px-3 pb-3 ${created > 0 && processed > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {created > 0 && (
                                  <div className="bg-emerald-50/60 rounded-xl p-2.5">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      <p className="text-[11px] font-semibold text-emerald-700">Tạo</p>
                                    </div>
                                    <p className="text-[13px] font-bold text-gray-800">{created} đơn</p>
                                    <p className="text-[12px] font-semibold text-emerald-600 mt-0.5">{fmtVND(createdRev)}</p>
                                  </div>
                                )}
                                {processed > 0 && (
                                  <div className="bg-blue-50/60 rounded-xl p-2.5">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                      <p className="text-[11px] font-semibold text-blue-700">Xử lý</p>
                                    </div>
                                    <p className="text-[13px] font-bold text-gray-800">{processed} đơn</p>
                                    <p className="text-[12px] font-semibold text-blue-600 mt-0.5">{fmtVND(processedRev)}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Chi tiết hoa hồng (nếu có ledger) */}
                        {item.has_ledger_breakdown && (
                          <div className="bg-white rounded-xl p-3">
                            <p className="text-[11px] text-gray-400 font-medium mb-2">Chi tiết hoa hồng</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[11px] text-gray-400">Bán hàng</p>
                                <p className="text-[13px] font-semibold text-emerald-600">{fmtVND(item.saler_commission_amount)}</p>
                              </div>
                              <div>
                                <p className="text-[11px] text-gray-400">Giao nhận</p>
                                <p className="text-[13px] font-semibold text-blue-600">{fmtVND(item.driver_commission_amount)}</p>
                              </div>
                              {Number(item.paid_to_upline) > 0 && (
                                <div>
                                  <p className="text-[11px] text-gray-400">Chia cấp trên</p>
                                  <p className="text-[13px] font-semibold text-rose-500">-{fmtVND(item.paid_to_upline)}</p>
                                </div>
                              )}
                              {Number(item.received_from_downline) > 0 && (
                                <div>
                                  <p className="text-[11px] text-gray-400">Nhận từ cấp dưới</p>
                                  <p className="text-[13px] font-semibold text-amber-600">+{fmtVND(item.received_from_downline)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tổng thực lĩnh */}
                        <div className="bg-primary/5 rounded-xl p-3 flex items-center justify-between">
                          <p className="text-[12px] font-semibold text-gray-700">Tổng thực lĩnh</p>
                          <p className="text-base font-bold text-primary">{fmtVND(item.total_payable)}</p>
                        </div>

                        {/* Chuyển tiền — chỉ hiển thị nếu sale đã chuyển ít nhất 1 lần hoặc có doanh thu tạo > 0 */}
                        {(() => {
                          const transferred = transfersByUser[item.id] || 0;
                          const createdRev = Number(item.created_revenue || 0);
                          const commission = Number(item.commission_amount || 0);
                          const driverCommission = Number(item.driver_commission_amount || 0);
                          const remaining = createdRev - commission - transferred;
                          if (transferred === 0 && createdRev === 0) return null;
                          return (
                            <div
                              className="bg-white rounded-xl p-3 border border-gray-100 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all group/transfer"
                              onClick={() => openUserTransferModal({ id: item.id, full_name: item.full_name, username: item.username })}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] text-gray-400 font-medium">Chuyển tiền cho admin</p>
                                <span className="text-[10px] text-primary/60 font-medium opacity-0 group-hover/transfer:opacity-100 transition-opacity flex items-center gap-1">
                                  Xem chi tiết <ChevronRight size={12} />
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[11px] text-gray-400">Đã chuyển</p>
                                  <p className="text-[13px] font-semibold text-emerald-600">
                                    {transferred > 0 ? fmtVND(transferred) : '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[11px] text-gray-400">Còn lại</p>
                                  <p className={`text-[13px] font-bold ${remaining > 0 ? 'text-rose-600' : 'text-green-600'}`}>
                                    {remaining > 0 ? fmtVND(remaining) : remaining === 0 && createdRev > 0 ? 'Đã đủ ✓' : '—'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Nhân viên</th>
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Vai trò</th>
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Lương cứng</th>
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right group/th relative">
                    <div className="inline-flex items-center gap-1 justify-end cursor-help">
                      Doanh thu xử lý
                      <HelpCircle size={12} className="text-gray-300 group-hover/th:text-primary transition-colors" />
                    </div>
                    <div className="absolute right-0 top-full mt-1 w-56 bg-gray-800 text-white text-[10px] font-normal normal-case rounded-lg px-3 py-2 shadow-xl opacity-0 invisible group-hover/th:opacity-100 group-hover/th:visible transition-all z-20 pointer-events-none text-left leading-relaxed">
                      Tổng giá trị các đơn hàng <strong>đã hoàn thành</strong> trong tháng mà nhân viên tham gia (tạo đơn / quản lý / bàn giao). Đây là cơ sở để tính hoa hồng.
                    </div>
                  </th>
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Hoa hồng</th>
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Đã chuyển</th>
                  <th className="px-3 lg:px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Còn lại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-gray-400">Đang tính toán...</td>
                  </tr>
                ) : payrollData.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-gray-400">Không có dữ liệu cho tháng này</td>
                  </tr>
                ) : (
                  visiblePayroll.map((item) => {
                    const isExpanded = expandedIds.includes(item.id);
                    const hasBreakdown = item.has_ledger_breakdown;
                    return (
                    <React.Fragment key={item.id}>
                    <tr
                      className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                      onClick={() => toggleExpand(item.id)}
                    >
                      <td className="px-3 lg:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                            <ChevronRight size={16} className="text-slate-400 group-hover:text-primary" />
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            {(item.full_name || item.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 leading-none truncate">{item.full_name}</p>
                            <p className="text-xs text-gray-400 mt-1 truncate">@{item.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 lg:px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap ${
                          item.role_name === 'admin' ? 'bg-orange-100 text-orange-600' :
                          item.role_name === 'camera_manager' ? 'bg-purple-100 text-purple-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {item.role_name === 'admin' ? 'Quản trị' :
                           item.role_name === 'camera_manager' ? 'Quản lý' : 'Saler'}
                        </span>
                      </td>
                      <td className="px-3 lg:px-6 py-4 text-right font-medium text-gray-900 whitespace-nowrap">
                        {fmtVND(item.base_salary)}
                      </td>
                      <td className="px-3 lg:px-6 py-4 text-right whitespace-nowrap">
                        <p className="text-sm font-semibold text-gray-900" title="Tổng giá trị đơn hàng đã hoàn thành có sự tham gia của nhân viên">{fmtVND(item.managed_revenue)}</p>
                        <p className="text-[11px] text-gray-500 font-medium">
                          {(() => {
                            const total = item.managed_orders_count || 0;
                            const created = item.created_orders_count || 0;
                            const processed = total - created;
                            if (total === 0) return '0 đơn';
                            if (processed === 0) return `${total} đơn (${created} tạo)`;
                            if (created === 0) return `${total} đơn (${processed} xử lý)`;
                            return `${total} đơn (${created} tạo, ${processed} xử lý)`;
                          })()}
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                          {(() => {
                            const createdRev = Number(item.created_revenue || 0);
                            const processedRev = Number(item.managed_revenue || 0) - createdRev;
                            if (createdRev > 0 && processedRev > 0) {
                              return (
                                <>
                                  <span className="block">Tạo: {fmtVND(createdRev)}</span>
                                  <span className="block">Xử lý: {fmtVND(processedRev)}</span>
                                </>
                              );
                            }
                            if (createdRev > 0) return <>Tạo: {fmtVND(createdRev)}</>;
                            if (processedRev > 0) return <>Xử lý: {fmtVND(processedRev)}</>;
                            return '';
                          })()}
                        </p>
                      </td>
                      <td className="px-3 lg:px-6 py-4 text-right whitespace-nowrap">
                        <p className="text-sm font-semibold text-purple-600">{fmtVND(item.commission_amount)}</p>
                        <p className="text-[11px] text-purple-400 font-medium">
                          Mức {(Number(item.commission_rate) * 100).toFixed(1)}%
                        </p>
                      </td>
                      <td className="px-3 lg:px-6 py-4 text-right whitespace-nowrap">
                        {(() => {
                          const transferred = transfersByUser[item.id] || 0;
                          return transferred > 0
                            ? <button
                                onClick={(e) => { e.stopPropagation(); openUserTransferModal({ id: item.id, full_name: item.full_name, username: item.username }); }}
                                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                                title="Xem chi tiết các lần chuyển"
                              >
                                {fmtVND(transferred)}
                              </button>
                            : <span className="text-xs text-gray-300">—</span>;
                        })()}
                      </td>
                      <td className="px-3 lg:px-6 py-4 text-right whitespace-nowrap">
                        {(() => {
                          const transferred = transfersByUser[item.id] || 0;
                          const createdRev = Number(item.created_revenue || 0);
                          const commission = Number(item.commission_amount || 0);
                          const driverCommission = Number(item.driver_commission_amount || 0);
                          const remaining = createdRev - commission - transferred;
                          return remaining > 0
                            ? <span className="text-sm font-bold text-rose-600">{fmtVND(remaining)}</span>
                            : remaining === 0
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-green-50 text-[11px] font-bold text-green-600"><CheckCircle2 size={11} />Đã đủ</span>
                              : <span className="text-xs text-gray-300">—</span>;
                        })()}
                      </td>
                    </tr>
                    {isExpanded && hasBreakdown && (
                      <tr>
                        <td colSpan={7} className="px-6 py-0 border-b border-gray-50 bg-purple-50/30">
                          <div className="py-3 px-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-2">Chi tiết hoa hồng</p>
                            <div className="grid grid-cols-4 gap-4">
                              <div className="bg-white rounded-xl p-3 border border-purple-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Bán hàng</p>
                                <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmtVND(item.saler_commission_amount)}</p>
                              </div>
                              <div className="bg-white rounded-xl p-3 border border-purple-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase">Giao nhận</p>
                                <p className="text-sm font-bold text-blue-600 mt-0.5">{fmtVND(item.driver_commission_amount)}</p>
                              </div>
                              {Number(item.paid_to_upline) > 0 && (
                                <div className="bg-white rounded-xl p-3 border border-rose-100">
                                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Chia cấp trên</p>
                                  <p className="text-sm font-bold text-rose-500 mt-0.5">-{fmtVND(item.paid_to_upline)}</p>
                                </div>
                              )}
                              {Number(item.received_from_downline) > 0 && (
                                <div className="bg-white rounded-xl p-3 border border-amber-100">
                                  <p className="text-[10px] text-gray-400 font-semibold uppercase">Nhận cấp dưới</p>
                                  <p className="text-sm font-bold text-amber-600 mt-0.5">+{fmtVND(item.received_from_downline)}</p>
                                </div>
                              )}
                              <div className="bg-purple-100 rounded-xl p-3 border border-purple-200">
                                <p className="text-[10px] text-gray-500 font-semibold uppercase">Tổng thực nhận</p>
                                <p className="text-sm font-black text-purple-700 mt-0.5">{fmtVND(item.commission_amount)}</p>
                              </div>
                              {/* Chuyển tiền — gộp chung vào grid 4 cột */}
                              {(() => {
                                const transferred = transfersByUser[item.id] || 0;
                                const createdRev = Number(item.created_revenue || 0);
                                const commission = Number(item.commission_amount || 0);
                                const driverCommission = Number(item.driver_commission_amount || 0);
                                const remaining = createdRev - commission - transferred;
                                const isSurplus = transferred > commission;
                                if (transferred === 0 && createdRev === 0) return null;
                                return (
                                  <>
                                    <div
                                      className="bg-white rounded-xl p-3 border border-emerald-100 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group/clickable"
                                      onClick={() => openUserTransferModal({ id: item.id, full_name: item.full_name, username: item.username })}
                                    >
                                      <div className="flex items-center justify-between">
                                        <p className="text-[10px] text-gray-400 font-semibold uppercase">Đã chuyển admin</p>
                                        <span className="text-[9px] text-emerald-500 opacity-0 group-hover/clickable:opacity-100 transition-opacity flex items-center gap-0.5">
                                          Xem <ChevronRight size={10} />
                                        </span>
                                      </div>
                                      <p className={`text-sm font-bold text-emerald-600 mt-0.5 ${transferred > 0 ? 'group-hover/clickable:underline' : ''}`}>
                                        {transferred > 0 ? fmtVND(transferred) : '—'}
                                      </p>
                                    </div>
                                    <div className={`bg-white rounded-xl p-3 border ${isSurplus ? 'border-amber-100' : 'border-rose-100'}`}>
                                      <p className="text-[10px] text-gray-400 font-semibold uppercase">{isSurplus ? 'Tiền thừa' : 'Tiền thiếu'}</p>
                                      <p className={`text-sm font-bold mt-0.5 ${remaining > 0 ? 'text-rose-600' : isSurplus ? 'text-amber-600' : 'text-green-600'}`}>
                                        {remaining > 0 ? fmtVND(remaining) : isSurplus ? fmtVND(Math.abs(remaining)) : remaining === 0 && createdRev > 0 ? 'Đã đủ ✓' : '—'}
                                      </p>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && !hasBreakdown && (
                      <tr>
                        <td colSpan={7} className="px-6 py-3 border-b border-gray-50 bg-gray-50/30">
                          <div className="text-center text-xs text-gray-400 mb-2">
                            Dữ liệu đã chốt — không có chi tiết hoa hồng theo vai trò
                          </div>
                          {(() => {
                            const transferred = transfersByUser[item.id] || 0;
                            const createdRev = Number(item.created_revenue || 0);
                            const commission = Number(item.commission_amount || 0);
                            const driverCommission = Number(item.driver_commission_amount || 0);
                            const remaining = createdRev - commission - transferred;
                            const isSurplus = transferred > commission;
                            if (transferred === 0 && createdRev === 0) return null;
                            return (
                              <div className="flex items-center justify-center gap-6">
                                <div
                                  className="text-center cursor-pointer hover:bg-gray-100 rounded-xl px-3 py-1.5 transition-colors group/clickable"
                                  onClick={() => openUserTransferModal({ id: item.id, full_name: item.full_name, username: item.username })}
                                >
                                  <div className="flex items-center gap-1">
                                    <p className="text-[10px] text-gray-400 uppercase">Đã chuyển</p>
                                    <span className="text-[9px] text-emerald-500 opacity-0 group-hover/clickable:opacity-100 transition-opacity">
                                      <ChevronRight size={10} />
                                    </span>
                                  </div>
                                  <p className="text-sm font-bold text-emerald-600 group-hover/clickable:underline">{transferred > 0 ? fmtVND(transferred) : '—'}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] text-gray-400 uppercase">{isSurplus ? 'Tiền thừa' : 'Tiền thiếu'}</p>
                                  <p className={`text-sm font-bold ${remaining > 0 ? 'text-rose-600' : isSurplus ? 'text-amber-600' : 'text-green-600'}`}>
                                    {remaining > 0 ? fmtVND(remaining) : isSurplus ? fmtVND(Math.abs(remaining)) : remaining === 0 && createdRev > 0 ? 'Đã đủ ✓' : '—'}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Load More Button ── */}
          {hasMore && (
            <div className="px-6 pb-6 pt-2 flex justify-center">
              <button
                onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
                className="flex items-center gap-2 text-sm font-semibold text-primary hover:bg-primary/5 px-6 py-2.5 rounded-xl transition-all border border-primary/20 hover:border-primary/40"
              >
                <ChevronDown size={16} />
                Xem thêm ({payrollData.length - displayCount} người còn lại)
              </button>
            </div>
          )}
        </div>

        {/* ── Sales Transfer Ledger ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
          <div className="px-5 md:px-6 py-4 md:py-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Wallet size={16} className="text-slate-600" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900">Sổ chuyển tiền Sale → Admin</h3>
                <p className="text-[11px] text-gray-500">Theo dõi lần chuyển tiền của sale cho admin trong tháng</p>
              </div>
            </div>
            <button
              onClick={() => openTransferModal()}
              className="w-full md:w-auto flex justify-center items-center gap-2 text-sm font-semibold bg-slate-800 text-white hover:bg-slate-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <Plus size={16} /> Ghi nhận chuyển tiền
            </button>
          </div>

          {/* ── Desktop: Premium card layout (text left, image right) ── */}
          <div className="hidden xl:block">
            {loadingTransfers ? (
              <div className="p-12 text-center text-gray-400">Đang tải sổ chuyển tiền...</div>
            ) : saleTransfers.length === 0 ? (
              <div className="p-12 text-center text-gray-400">Chưa có lệnh chuyển tiền trong tháng này</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {saleTransfers.map((item) => (
                  <div key={item.id} className="flex items-stretch gap-6 px-6 py-5 hover:bg-gray-50/40 transition-colors group">
                    {/* ── Left: Info ── */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-extrabold text-gray-900 tracking-tight">{fmtVND(item.amount)}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                        <span className="text-[13px] text-gray-500 font-medium">{fmtDateVN(item.transfer_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-bold text-slate-500">
                            {(item.sale_full_name || item.sale_username).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 leading-tight">{item.sale_full_name || item.sale_username}</p>
                          <p className="text-[11px] text-gray-400">@{item.sale_username}</p>
                        </div>
                      </div>
                      <p className="text-[13px] text-gray-500 truncate max-w-md">
                        {item.notes || 'Không có ghi chú'}
                      </p>
                    </div>

                    {/* ── Right: Image + Actions ── */}
                    <div className="flex items-center gap-4 shrink-0">
                      {item.images && item.images.length > 0 ? (
                        <div className="flex gap-2">
                          {item.images.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-gray-100 cursor-pointer shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 group/img"
                              onClick={() => setImagePreview(imgUrl)}
                            >
                              <img
                                src={imgUrl}
                                alt={`Ảnh GD ${idx + 1}`}
                                className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/5 transition-colors duration-300 flex items-center justify-center">
                                <Eye size={18} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 drop-shadow-lg" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50/50">
                          <Upload size={20} className="text-gray-300" />
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => openTransferModal(item)}
                          className="p-2.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                          title="Chỉnh sửa"
                        >
                          <Edit size={17} />
                        </button>
                        <button
                          onClick={() => handleDeleteTransfer(item.id)}
                          className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Xóa"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Mobile: Premium card layout (text left, image right) ── */}
          <div className="block xl:hidden">
            {loadingTransfers ? (
              <div className="p-8 text-center text-gray-400">Đang tải sổ chuyển tiền...</div>
            ) : saleTransfers.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Chưa có lệnh chuyển tiền trong tháng này</div>
            ) : (
              saleTransfers.map((item) => (
                <div key={item.id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <div className="flex gap-4">
                    {/* ── Left: Text info ── */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <p className="text-base font-extrabold text-gray-900 tracking-tight">{fmtVND(item.amount)}</p>
                      <p className="text-[11px] text-gray-400 font-medium">{fmtDateVN(item.transfer_date)}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-slate-500">
                            {(item.sale_full_name || item.sale_username).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-700 leading-tight">{item.sale_full_name || item.sale_username}</p>
                          <p className="text-[11px] text-gray-400">@{item.sale_username}</p>
                        </div>
                      </div>
                      <p className="text-[13px] text-gray-500 truncate">{item.notes || 'Không có ghi chú'}</p>
                    </div>

                    {/* ── Right: Image + Actions ── */}
                    <div className="flex items-start gap-2 shrink-0">
                      {item.images && item.images.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {item.images.map((imgUrl, idx) => (
                            <div
                              key={idx}
                              className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-100 cursor-pointer shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 active:scale-95 group/img"
                              onClick={() => setImagePreview(imgUrl)}
                            >
                              <img
                                src={imgUrl}
                                alt={`Ảnh GD ${idx + 1}`}
                                className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/5 transition-colors duration-300 flex items-center justify-center">
                                <Eye size={16} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 drop-shadow-lg" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50/50 shrink-0">
                          <Upload size={18} className="text-gray-300" />
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => openTransferModal(item)}
                          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteTransfer(item.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Ads Costs Table ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
          <div className="px-5 md:px-6 py-4 md:py-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
                <Megaphone size={16} className="text-pink-600" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900">Chi phí Quảng cáo (Ads)</h3>
                <p className="text-[11px] text-gray-500">Chi tiêu cho các chiến dịch marketing trong tháng</p>
              </div>
            </div>
            <button
              onClick={() => openAdsModal()}
              className="w-full md:w-auto flex justify-center items-center gap-2 text-sm font-semibold bg-pink-600 text-white hover:bg-pink-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <Plus size={16} /> Thêm chi phí Ads
            </button>
          </div>

          {/* Mobile view */}
          <div className="block xl:hidden">
            {loadingAds ? (
              <div className="p-8 text-center text-gray-400">Đang tải chi phí Ads...</div>
            ) : adsCosts.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Không có chi phí Ads trong tháng này</div>
            ) : (
              adsCosts.map((item) => (
                <div key={item.id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600">
                        {fmtAdsCode(item.id)}
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                        item.platform.toLowerCase().includes('face') ? 'bg-blue-50 text-blue-600' :
                        item.platform.toLowerCase().includes('goog') ? 'bg-red-50 text-red-600' :
                        item.platform.toLowerCase().includes('tik') ? 'bg-black text-white' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {item.platform}
                      </span>
                    </div>
                    <span className="font-medium text-gray-500 text-xs flex items-center gap-1">
                      <Calendar size={12} />
                      {fmtAdsRange(item)}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-2 bg-gray-50/50 p-3 rounded-xl border border-gray-50">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <Building2 size={13} className="text-primary" />
                      <span>{item.branch_name || 'Chưa chọn cơ sở'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-gray-600 text-sm italic flex-1">{item.notes || 'Không có ghi chú'}</span>
                      <span className="font-bold text-pink-600 text-lg whitespace-nowrap">{fmtVND(item.amount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button onClick={() => openAdsModal(item)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-all">
                      <Edit size={14} /> Sửa
                    </button>
                    <button onClick={() => handleDeleteAds(item.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-lg shadow-sm hover:bg-red-50 transition-all">
                      <Trash2 size={14} /> Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mã</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ngày</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cơ sở</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Nền tảng</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Số tiền</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ghi chú</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingAds ? (
                  <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400">Đang tải chi phí Ads...</td></tr>
                ) : adsCosts.length === 0 ? (
                  <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400">Không có chi phí Ads trong tháng này</td></tr>
                ) : (
                  adsCosts.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                          {fmtAdsCode(item.id)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fmtAdsRange(item)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <Building2 size={14} className="text-primary" />
                          <span className="max-w-[140px] truncate">{item.branch_name || 'Chưa chọn'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          item.platform.toLowerCase().includes('face') ? 'bg-blue-50 text-blue-600' :
                          item.platform.toLowerCase().includes('goog') ? 'bg-red-50 text-red-600' :
                          item.platform.toLowerCase().includes('tik') ? 'bg-black text-white' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {item.platform}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-pink-600">{fmtVND(item.amount)}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm max-w-xs truncate">{item.notes || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openAdsModal(item)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDeleteAds(item.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Misc Costs Table ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
          <div className="px-5 md:px-6 py-4 md:py-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Receipt size={16} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900">Chi phí Phát sinh</h3>
                <p className="text-[11px] text-gray-500">Điện, nước, mặt bằng, sửa chữa và chi phí vận hành khác</p>
              </div>
            </div>
            <button
              onClick={() => openMiscModal()}
              className="w-full md:w-auto flex justify-center items-center gap-2 text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <Plus size={16} /> Thêm chi phí
            </button>
          </div>

          {/* Mobile view */}
          <div className="block xl:hidden">
            {loadingMisc ? (
              <div className="p-8 text-center text-gray-400">Đang tải chi phí phát sinh...</div>
            ) : miscCosts.length === 0 ? (
              <div className="p-8 text-center text-gray-400">Không có chi phí phát sinh trong tháng này</div>
            ) : (
              miscCosts.map((item) => (
                <div key={item.id} className="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gray-100 text-gray-600">
                        {fmtMiscCode(item.id)}
                      </span>
                      {item.category && (
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600">
                          {item.category}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-gray-500 text-xs flex items-center gap-1">
                      <Calendar size={12} />
                      {fmtAdsRange(item)}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-2 bg-gray-50/50 p-3 rounded-xl border border-gray-50">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <Building2 size={13} className="text-primary" />
                      <span>{item.branch_name || 'Chưa chọn cơ sở'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-gray-600 text-sm italic flex-1">{item.notes || 'Không có ghi chú'}</span>
                      <span className="font-bold text-amber-600 text-lg whitespace-nowrap">{fmtVND(item.amount)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button onClick={() => openMiscModal(item)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-all">
                      <Edit size={14} /> Sửa
                    </button>
                    <button onClick={() => handleDeleteMisc(item.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-200 rounded-lg shadow-sm hover:bg-red-50 transition-all">
                      <Trash2 size={14} /> Xóa
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Mã</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ngày</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cơ sở</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Danh mục</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Số tiền</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ghi chú</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingMisc ? (
                  <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400">Đang tải chi phí phát sinh...</td></tr>
                ) : miscCosts.length === 0 ? (
                  <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-400">Không có chi phí phát sinh trong tháng này</td></tr>
                ) : (
                  miscCosts.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                          {fmtMiscCode(item.id)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fmtAdsRange(item)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <Building2 size={14} className="text-primary" />
                          <span className="max-w-[140px] truncate">{item.branch_name || 'Chưa chọn'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {item.category ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-600">
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-amber-600">{fmtVND(item.amount)}</td>
                      <td className="px-6 py-4 text-gray-500 text-sm max-w-xs truncate">{item.notes || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openMiscModal(item)} className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDeleteMisc(item.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── Transfer Modal ── */}
      {showTransferModal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{editingTransfer ? 'Chỉnh sửa lệnh chuyển tiền' : 'Ghi nhận lệnh chuyển tiền'}</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale</label>
                <CustomSelect
                  options={saleUsers}
                  value={transferForm.sale_user_id}
                  onChange={(value) => setTransferForm({ ...transferForm, sale_user_id: value })}
                  placeholder="Chọn sale"
                  labelField="full_name"
                  valueField="id"
                  className="w-full"
                  buttonClassName="!h-[35px] !py-0.5 rounded-xl bg-gray-50 hover:bg-white focus:bg-white px-4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày & Giờ chuyển</label>
                <ModernDateTimePicker
                  value={transferForm.transfer_date}
                  onChange={(date) => setTransferForm({ ...transferForm, transfer_date: date })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="text" placeholder="VD: 1.500.000"
                  value={formatCurrencyInput(transferForm.amount)}
                  onChange={(e) => {
                    const val = parseCurrencyInput(e.target.value);
                    setTransferForm({ ...transferForm, amount: val });
                  }}
                  className="w-full h-[35px] px-4 py-0.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú (Tùy chọn)</label>
                <textarea
                  rows="2"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                />
              </div>

              {/* Ảnh giao dịch */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ảnh giao dịch <span className="text-gray-400 font-normal text-xs">(Tùy chọn)</span>
                </label>
                {transferImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img
                      src={transferImage.dataUri}
                      alt="Ảnh giao dịch"
                      className="w-full h-40 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setTransferImage(null);
                        if (transferFileInputRef.current) transferFileInputRef.current.value = '';
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow"
                    >
                      <X size={14} />
                    </button>
                    <div className="px-3 py-2 text-xs text-gray-500 truncate">
                      {transferImage.filename}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => transferFileInputRef.current?.click()}
                    className="w-full flex flex-col items-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
                  >
                    <Upload size={24} className="text-gray-400" />
                    <span className="text-sm text-gray-500 font-medium">Tải ảnh giao dịch</span>
                    <span className="text-xs text-gray-400">JPG, PNG, WebP (tối đa 10MB)</span>
                  </button>
                )}
                <input
                  ref={transferFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
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
                      setTransferImage({
                        dataUri: reader.result,
                        filename: file.name,
                      });
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowTransferModal(false)} className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Hủy
                </button>
                <button type="submit" className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-primary hover:opacity-90 shadow-sm transition-all">
                  Lưu lệnh chuyển tiền
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Ads Modal ── */}
      {showAdsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{editingAds ? 'Sửa chi phí Ads' : 'Thêm chi phí Ads'}</h3>
              <button onClick={() => setShowAdsModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveAds} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
                  <ModernDatePicker
                    value={adsForm.start_date}
                    onChange={(date) => setAdsForm({ ...adsForm, date, start_date: date, end_date: adsForm.end_date || date })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                  <ModernDatePicker
                    value={adsForm.end_date}
                    onChange={(date) => setAdsForm({ ...adsForm, end_date: date })}
                    min={adsForm.start_date}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="hidden">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày</label>
                <ModernDatePicker
                  value={adsForm.date}
                  onChange={(date) => setAdsForm({ ...adsForm, date })}
                  className="hidden"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cơ sở</label>
                <CustomSelect
                  options={branches}
                  value={adsForm.branch_id}
                  onChange={value => setAdsForm({ ...adsForm, branch_id: value })}
                  placeholder="Chọn cơ sở"
                  className="h-[35px]"
                  buttonClassName="!h-[35px] !py-0.5 rounded-xl bg-gray-50 hover:bg-white focus:bg-white px-4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nền tảng</label>
                <input
                  type="text" required placeholder="VD: Facebook, Google, Tiktok"
                  value={adsForm.platform} onChange={e => setAdsForm({...adsForm, platform: e.target.value})}
                  className="w-full h-[35px] px-4 py-0.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="text" required placeholder="VD: 500.000"
                  value={formatCurrencyInput(adsForm.amount)}
                  onChange={e => {
                    const val = parseCurrencyInput(e.target.value);
                    setAdsForm({ ...adsForm, amount: val });
                  }}
                  className="w-full h-[35px] px-4 py-0.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú (Tùy chọn)</label>
                <textarea
                  rows="2"
                  value={adsForm.notes} onChange={e => setAdsForm({...adsForm, notes: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowAdsModal(false)} className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Hủy
                </button>
                <button type="submit" className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-primary hover:opacity-90 shadow-sm transition-all">
                  Lưu chi phí
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Misc Costs Modal ── */}
      {showMiscModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{editingMisc ? 'Sửa chi phí phát sinh' : 'Thêm chi phí phát sinh'}</h3>
              <button onClick={() => setShowMiscModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSaveMisc} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ ngày</label>
                  <ModernDatePicker
                    value={miscForm.start_date}
                    onChange={(date) => setMiscForm({ ...miscForm, date, start_date: date, end_date: miscForm.end_date || date })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến ngày</label>
                  <ModernDatePicker
                    value={miscForm.end_date}
                    onChange={(date) => setMiscForm({ ...miscForm, end_date: date })}
                    min={miscForm.start_date}
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cơ sở</label>
                <CustomSelect
                  options={branches}
                  value={miscForm.branch_id}
                  onChange={value => setMiscForm({ ...miscForm, branch_id: value })}
                  placeholder="Chọn cơ sở"
                  className="h-[35px]"
                  buttonClassName="!h-[35px] !py-0.5 rounded-xl bg-gray-50 hover:bg-white focus:bg-white px-4"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
                <input
                  type="text" placeholder="VD: Điện, Nước, Mặt bằng, Sửa chữa..."
                  value={miscForm.category} onChange={e => setMiscForm({...miscForm, category: e.target.value})}
                  className="w-full h-[35px] px-4 py-0.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="text" required placeholder="VD: 500.000"
                  value={formatCurrencyInput(miscForm.amount)}
                  onChange={e => {
                    const val = parseCurrencyInput(e.target.value);
                    setMiscForm({ ...miscForm, amount: val });
                  }}
                  className="w-full h-[35px] px-4 py-0.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú (Tùy chọn)</label>
                <textarea
                  rows="2"
                  value={miscForm.notes} onChange={e => setMiscForm({...miscForm, notes: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-colors"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowMiscModal(false)} className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Hủy
                </button>
                <button type="submit" className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-primary hover:opacity-90 shadow-sm transition-all">
                  Lưu chi phí
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── User Transfer Detail Modal ── */}
      {showUserTransferModal && userTransferDetailUser && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
            {/* ── Drag handle for mobile ── */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full sm:hidden" />

            {/* ── Header ── */}
            <div className="relative px-5 py-4 sm:px-6 sm:py-5 border-b border-gray-100/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center ring-1 ring-primary/10 shrink-0">
                  <span className="text-sm font-extrabold text-primary">
                    {(userTransferDetailUser.full_name || userTransferDetailUser.username || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight truncate">
                    Chi tiết chuyển tiền: {userTransferDetailUser.full_name}
                  </h3>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    @{userTransferDetailUser.username} · Tháng {selectedMonth}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUserTransferModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors shrink-0 ml-2"
              >
                <X size={20} strokeWidth={1.8} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain">
              {userTransfers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-gray-50 to-gray-100 rounded-[24px] flex items-center justify-center mb-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-gray-100">
                    <Send size={28} className="text-gray-300 sm:size-8" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-bold text-gray-500">Chưa có giao dịch chuyển tiền</p>
                  <p className="text-xs text-gray-400 mt-1.5 text-center max-w-xs">Nhân viên này chưa chuyển tiền lần nào trong tháng.</p>
                </div>
              ) : (
                <>
                  {/* ── Summary Cards ── */}
                  {(() => {
                    const totalTransferred = userTransfers.reduce((s, t) => s + Number(t.amount), 0);
                    const userPayroll = payrollData.find(p => String(p.id) === String(userTransferDetailUser.id));
                    const createdRev = userPayroll ? Number(userPayroll.created_revenue || 0) : 0;
                    const commission = userPayroll ? Number(userPayroll.commission_amount || 0) : 0;
                    const driverCommission = userPayroll ? Number(userPayroll.driver_commission_amount || 0) : 0;
                    const remaining = createdRev - commission - totalTransferred;
                    return (
                      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-5">
                        {/* Đã chuyển */}
                        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50/80 to-green-50/60 border border-emerald-200/60 p-3 sm:p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <p className="text-[10px] sm:text-[11px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Đã chuyển</p>
                          <p className="text-sm sm:text-base lg:text-lg font-extrabold text-emerald-700 tracking-tight">
                            {fmtVND(totalTransferred)}
                          </p>
                        </div>

                        {/* Còn lại */}
                        <div className={`group relative overflow-hidden rounded-2xl border p-3 sm:p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${
                          remaining > 0
                            ? 'bg-gradient-to-br from-rose-50/80 to-red-50/60 border-rose-200/60'
                            : 'bg-gradient-to-br from-emerald-50/80 to-green-50/60 border-emerald-200/60'
                        }`}>
                          <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${
                            remaining > 0 ? 'from-rose-400 to-rose-300' : 'from-emerald-400 to-emerald-300'
                          } opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                          <p className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1 ${
                            remaining > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}>Còn lại</p>
                          <p className={`text-sm sm:text-base lg:text-lg font-extrabold tracking-tight ${
                            remaining > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}>
                            {remaining > 0 ? fmtVND(remaining) : remaining === 0 && createdRev > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] sm:text-xs font-bold shadow-sm shadow-emerald-200">
                                <CheckCircle2 size={11} strokeWidth={2.5} /> Đã đủ
                              </span>
                            ) : '—'}
                          </p>
                        </div>

                        {/* Doanh thu tạo */}
                        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/60 border border-blue-200/60 p-3 sm:p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-blue-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <p className="text-[10px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1">Doanh thu tạo</p>
                          <p className="text-sm sm:text-base lg:text-lg font-extrabold text-blue-700 tracking-tight">
                            {fmtVND(createdRev)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Transaction List ── */}
                  <div className="space-y-3 sm:space-y-3">
                    {userTransfers.map((transfer) => (
                      <div
                        key={transfer.id}
                        className="group/item relative overflow-hidden rounded-2xl bg-white border border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-300"
                      >
                        <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
                          {/* ── Left: Image ── */}
                          {transfer.images && transfer.images.length > 0 ? (
                            <div className="flex gap-1.5 sm:gap-2 shrink-0">
                              {transfer.images.map((imgUrl, idx) => (
                                <div
                                  key={idx}
                                  className="relative w-[88px] h-[88px] sm:w-[120px] sm:h-[120px] rounded-2xl overflow-hidden border-2 border-gray-100 cursor-pointer shadow-sm hover:shadow-lg hover:border-primary/40 hover:scale-[1.03] transition-all duration-300 group/img"
                                  onClick={() => setImagePreview(imgUrl)}
                                >
                                  <img
                                    src={imgUrl}
                                    alt={`Ảnh GD ${idx + 1}`}
                                    className="w-full h-full object-cover group-hover/img:scale-110 transition-transform duration-500"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-300" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="p-2 rounded-xl bg-black/30 opacity-0 group-hover/img:opacity-100 transition-all duration-300 backdrop-blur-sm">
                                      <Eye size={18} className="text-white drop-shadow-lg" strokeWidth={2} />
                                    </div>
                                  </div>
                                  {/* Image count badge */}
                                  {transfer.images.length > 1 && idx === 0 && (
                                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold">
                                      +{transfer.images.length - 1}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="w-[88px] h-[88px] sm:w-[120px] sm:h-[120px] rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50/50 shrink-0">
                              <Upload size={22} className="text-gray-300 sm:size-6" strokeWidth={1.5} />
                            </div>
                          )}

                          {/* ── Right: Content ── */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                            {/* Info section */}
                            <div>
                              {/* Meta row: date + recipient */}
                              <div className="flex items-center gap-2 flex-wrap mb-1.5 sm:mb-2">
                                <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs text-gray-400 font-medium">
                                  <Clock size={12} strokeWidth={2} />
                                  {fmtDateVN(transfer.transfer_date) || '—'}
                                </span>
                                {transfer.admin_full_name && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0 hidden sm:block" />
                                    <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-gray-500 font-medium">
                                      Người nhận: <span className="text-gray-700 font-semibold">{transfer.admin_full_name}</span>
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Amount */}
                              <p className="text-sm sm:text-base font-bold text-gray-900 tracking-tight leading-none">
                                {fmtVND(transfer.amount)}
                              </p>

                              {/* Notes */}
                              {transfer.notes && (
                                <p className="text-[12px] sm:text-[13px] text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
                                  {transfer.notes}
                                </p>
                              )}
                            </div>

                            {/* Action buttons - visible on mobile, hover on desktop */}
                            <div className="flex items-center gap-1 mt-2 sm:opacity-0 sm:group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                              <button
                                onClick={() => handleEditFromUserModal(transfer)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Sửa"
                              >
                                <Edit size={13} strokeWidth={2} />
                                <span className="sm:hidden">Sửa</span>
                              </button>
                              <button
                                onClick={() => handleDeleteFromUserModal(transfer.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] sm:text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Xóa"
                              >
                                <Trash2 size={13} strokeWidth={2} />
                                <span className="sm:hidden">Xóa</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="p-4 sm:p-5 border-t border-gray-100/80 shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => setShowUserTransferModal(false)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-700 active:scale-[0.97] transition-all duration-200"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUserTransferModal(false);
                  const now = new Date().toISOString();
                  setEditingTransfer(null);
                  setTransferForm({
                    sale_user_id: userTransferDetailUser.id,
                    transfer_date: now,
                    amount: '',
                    notes: '',
                  });
                  setTransferImage(null);
                  setShowTransferModal(true);
                }}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white bg-gradient-to-br from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 active:scale-[0.97] shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 flex items-center justify-center gap-1.5"
              >
                <Plus size={16} strokeWidth={2.5} />
                Thêm chuyển tiền
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Preview Modal ── */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          onClick={() => setImagePreview(null)}
        >
          <button
            onClick={() => setImagePreview(null)}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X size={24} />
          </button>
          <img
            src={imagePreview}
            alt="Ảnh giao dịch"
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />

      <ConfirmationModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, show: false }))}
      />
    </div>
  );
};

export default Payroll;
