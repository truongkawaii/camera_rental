import React, { useLayoutEffect, useRef } from 'react';
import { CheckCircle, ClipboardCheck, DollarSign, MapPin, Package, Phone, Truck, UserCheck } from 'lucide-react';

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

const getPersonName = (value) => value || 'Chưa có';

const STATUS_CONFIG = {
  pending: { label: 'Chờ giao', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  active: { label: 'Đang thuê', className: 'border-red-200 bg-red-50 text-red-700' },
  completed: { label: 'Hoàn thành', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Đã hủy', className: 'border-rose-200 bg-rose-50 text-rose-700' }
};

const TooltipRow = ({ icon: Icon, label, children, accent = 'text-slate-400' }) => (
  <div className="flex min-w-0 items-start gap-2">
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
      <Icon size={13} className={accent} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 min-w-0 text-[12px] font-semibold leading-snug text-slate-700">
        {children}
      </div>
    </div>
  </div>
);

const RentalTooltip = ({ rental, initialPos }) => {
  const tooltipRef = useRef(null);

  useLayoutEffect(() => {
    if (!rental || !tooltipRef.current || !initialPos) return;

    const isMobile = window.innerWidth < 768;
    const tooltipWidth = isMobile ? 260 : 320;
    const gap = 14;
    let x = initialPos.x + gap;
    let y = initialPos.y + 12;

    if (x + tooltipWidth > window.innerWidth - 8) x = initialPos.x - tooltipWidth - gap;
    if (x < 8) x = 8;

    const tooltipHeight = tooltipRef.current.offsetHeight || 210;
    if (y + tooltipHeight > window.innerHeight - 8) {
      y = Math.max(8, window.innerHeight - tooltipHeight - 8);
    }

    tooltipRef.current.style.left = `${x}px`;
    tooltipRef.current.style.top = `${y}px`;
  }, [rental, initialPos]);

  if (!rental) return null;

  const customerLine = [
    rental.customer_name,
    rental.equipment_name || rental.equipment_code
  ].filter(Boolean).join(' + ');
  const branchLine = rental.pickup_branch_name || rental.original_branch_name || rental.return_branch_name;
  const managerName = getPersonName(rental.manager_name || rental.creator_name);
  const creatorName = getPersonName(rental.creator_name);
  const status = STATUS_CONFIG[rental.status] || { label: rental.status || 'Không rõ', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  const orderCode = rental.code || `#${rental.id}`;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[10000] w-[260px] md:w-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-xl pointer-events-none animate-[fadeInScale_0.14s_ease-out]"
      style={{ left: '-9999px', top: '-9999px' }}
      role="tooltip"
    >
      <div className="border-b border-slate-100 bg-slate-50/80 px-3.5 py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Mã đơn</p>
            <p className="mt-0.5 truncate font-mono text-[14px] font-bold text-violet-700">{orderCode}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${status.className}`}>
            {status.label}
          </span>
        </div>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        <TooltipRow icon={DollarSign} label="Giá trị" accent="text-emerald-500">
          <span className="font-bold text-emerald-700">{formatMoney(rental.total_price)}</span>
        </TooltipRow>

        <TooltipRow icon={Package} label="Đơn hàng" accent="text-violet-500">
          <span className="block truncate text-slate-800">{customerLine || 'Chưa có thông tin'}</span>
          {rental.customer_phone && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <Phone size={11} /> {rental.customer_phone}
            </span>
          )}
        </TooltipRow>

        <TooltipRow icon={ClipboardCheck} label="Người tạo" accent="text-orange-500">
          <span className="truncate">{creatorName}</span>
        </TooltipRow>

        <TooltipRow icon={MapPin} label="Chi nhánh" accent="text-sky-500">
          <span className="block truncate">Nhận: {branchLine || 'Chưa chọn'}</span>
          <span className="mt-0.5 block truncate">
            Trả: {rental.return_branch_name || branchLine || 'Chưa chọn'}
          </span>
        </TooltipRow>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5">
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <Truck size={11} />
              Giao khách
            </div>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{managerName}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <CheckCircle size={11} />
              Nhận
            </div>
            <p className="mt-1 truncate text-[11px] font-semibold text-slate-700">{managerName}</p>
          </div>
        </div>

        {rental.order_number && (
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <UserCheck size={12} className="shrink-0" />
            <span className="truncate">Thứ tự đơn: {rental.order_number}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RentalTooltip;
