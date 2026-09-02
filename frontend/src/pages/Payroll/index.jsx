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

        </div>

      <ConfirmationModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, show: false }))}
      />
    </div>
  );
};

export default Payroll;
