import React, { useMemo } from 'react';
import { Home, Wrench } from 'lucide-react';

const PERIODS = ['sáng', 'chiều', 'tối'];
const PERIOD_LABELS = { 'sáng': 'S', 'chiều': 'C', 'tối': 'T' };
const PERIOD_LINE_COLORS = ['#0057ff', '#e0004d', '#008c45'];
const EMPTY_PERIOD_RENTALS = Object.freeze([]);

const STATUS_STYLES = {
  pending:  { bg: 'bg-amber-100',  pattern: 'pending-pattern',   border: '#d97706' },
  active:   { bg: 'bg-red-100',    pattern: 'active-pattern',    border: '#dc2626' },
  completed:{ bg: 'bg-emerald-100',pattern: 'completed-pattern', border: '#059669' },
  cancelled:{ bg: 'bg-red-100',    pattern: 'cancelled-pattern', border: '#be123c' }
};

const getStatusStyle = (status) => STATUS_STYLES[status] || STATUS_STYLES.pending;
const isSameRental = (first, second) => {
  if (!first || !second) return false;
  if (first.id != null && second.id != null) return String(first.id) === String(second.id);
  return first === second;
};
const toYMD = (date) => {
  const pad = (value) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const addDays = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const getPeriodSegments = (rentalsByPeriod) => PERIODS.reduce((segments, period, periodIdx) => {
  const rental = rentalsByPeriod[periodIdx];
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && isSameRental(lastSegment.rental, rental)) {
    lastSegment.periods.push({ period, periodIdx });
    return segments;
  }
  segments.push({ rental, periods: [{ period, periodIdx }] });
  return segments;
}, []);

const buildRentalTitle = (period, rental) => {
  const rentalLabel = rental.code || rental.customer_name || 'Da dat';
  const creatorLabel = rental.creator_name || 'Khong ro';
  return `${period}: ${rentalLabel}\nNguoi tao: ${creatorLabel}`;
};
const preventContextMenu = (e) => e.preventDefault();

const CELL_INTERACTION_STYLE = { WebkitTapHighlightColor: 'transparent' };
const ROW_STYLE = { height: 78 };

// ── Pure cell data computation (extracted for reuse & testability) ──
const computeCellData = (displayedDays, busyMapForEq) => {
  return displayedDays.map((day) => {
    const rentalsByPeriod = busyMapForEq?.get(day.dateYMD) || EMPTY_PERIOD_RENTALS;
    const periodSegments = getPeriodSegments(rentalsByPeriod);
    const rentalSegmentCount = periodSegments.filter(s => s.rental).length;

    const prevDayKey = toYMD(addDays(day.dateObj, -1));
    const nextDayKey = toYMD(addDays(day.dateObj, 1));
    const prevRentals = busyMapForEq?.get(prevDayKey);
    const nextRentals = busyMapForEq?.get(nextDayKey);

    const segments = periodSegments.map((segment) => {
      const { rental, periods } = segment;
      return {
        rental,
        periods: periods.map(({ period, periodIdx }) => ({
          period, periodIdx,
          lineColor: PERIOD_LINE_COLORS[periodIdx] || PERIOD_LINE_COLORS[0],
          connectsLeft: rental ? isSameRental(prevRentals?.[periodIdx] || null, rental) : false,
          connectsRight: rental ? isSameRental(nextRentals?.[periodIdx] || null, rental) : false,
        })),
        startRow: periods[0].periodIdx + 1,
        rowSpan: periods.length,
        isSessionRental: periods.length < PERIODS.length,
        statusStyle: rental ? getStatusStyle(rental.status) : null,
        rentalId: rental?.id,
        rentalCode: rental?.code,
        rentalUserId: rental ? String(rental.user_id || '') : '',
        rentalHandoverUserId: rental ? String(rental.handover_user_id || '') : '',
      };
    });

    return { day, isWeekend: day.isWeekend, segments, rentalSegmentCount };
  });
};

// ═══════════════════════════════════════════════════════════════════
// CalendarRowCells — inner component that re-renders when cell data changes
// ═══════════════════════════════════════════════════════════════════
const CalendarRowCells = React.memo(({
  eq, displayedDays, busyMapForEq, activeCreatorIds, isDriver,
  handleRentalHoverStart, handleRentalHoverEnd, openCreateModal, openEditModal,
}) => {
  const isMaintenance = eq.condition === 'maintenance';

  const cellData = useMemo(
    () => computeCellData(displayedDays, busyMapForEq),
    [displayedDays, busyMapForEq]
  );

  const activeCreatorList = useMemo(
    () => Array.isArray(activeCreatorIds) ? activeCreatorIds : [activeCreatorIds],
    [activeCreatorIds]
  );

  return (
    <div className="flex flex-1">
      {cellData.map((cell, idx) => {
        const { day, segments, rentalSegmentCount } = cell;
        return (
          <div
            key={`cell-${eq.id}-${idx}`}
            className={`calendar-day-cell flex-1 min-w-0 border-r border-slate-100/70 px-1 py-1 md:px-1.5 md:py-1.5 lg:px-2 lg:py-2 ${day.isWeekend ? 'bg-slate-50/45' : ''}`}
          >
            <div className="w-full min-h-[32px] md:min-h-[42px] lg:min-h-[48px] h-full grid grid-rows-3 gap-y-0.5 overflow-visible rounded-lg border border-transparent bg-transparent">
              {segments.map((segment) => {
                const { rental, periods, startRow, rowSpan, isSessionRental, statusStyle, rentalId, rentalCode, rentalUserId, rentalHandoverUserId } = segment;
                const isOtherSalerRental = Boolean(
                  activeCreatorList.length > 0 &&
                  !activeCreatorList.includes('ALL') &&
                  !activeCreatorList.includes(rentalUserId) &&
                  !activeCreatorList.includes(rentalHandoverUserId)
                );
                const disableForDriver = isDriver && isOtherSalerRental;
                return rental ? (
                  <button
                    key={`${rentalId || rentalCode || 'rental'}-${periods[0].period}`}
                    type="button"
                    aria-label={buildRentalTitle(periods.map(p => p.period).join(', '), rental)}
                    disabled={disableForDriver}
                    style={{
                      gridRow: `${startRow} / span ${rowSpan}`,
                      '--rental-status-border': statusStyle.border,
                      '--rental-session-line': periods[0].lineColor,
                      ...CELL_INTERACTION_STYLE
                    }}
                    className={`calendar-rental-segment min-h-0 w-full select-none ${statusStyle.bg} ${disableForDriver ? 'cursor-not-allowed' : 'cursor-pointer'} overflow-visible rounded-md active:scale-95 ${statusStyle.pattern} ${isSessionRental ? 'session-rental' : ''} ${isOtherSalerRental ? 'other-saler-rental' : ''} flex flex-col items-stretch justify-center`}
                    onMouseEnter={e => { if (!disableForDriver) handleRentalHoverStart?.(rental, e); }}
                    onMouseMove={e => { if (!disableForDriver) handleRentalHoverStart?.(rental, e, true); }}
                    onMouseLeave={handleRentalHoverEnd}
                    onPointerCancel={handleRentalHoverEnd}
                    onTouchStart={e => { if (!disableForDriver) handleRentalHoverStart?.(rental, e); }}
                    onTouchEnd={handleRentalHoverEnd}
                    onTouchCancel={handleRentalHoverEnd}
                    onContextMenu={preventContextMenu}
                    onClick={() => { if (!disableForDriver) { handleRentalHoverEnd?.(); openEditModal(rental); } }}
                    onDoubleClick={() => { if (!disableForDriver) { handleRentalHoverEnd?.(); openEditModal(rental); } }}
                  >
                    {periods.map(({ period, lineColor, connectsLeft, connectsRight }) => (
                      <span
                        key={period}
                        style={{ '--rental-session-line': lineColor }}
                        className={`calendar-rental-period ${rowSpan === 1 && rentalSegmentCount > 1 ? 'session-marker' : ''} select-none flex-1 min-h-0 flex items-center justify-center text-[8px] md:text-[9px] lg:text-[10px] font-bold leading-none ${connectsLeft ? 'connect-left' : 'order-start'} ${connectsRight ? 'connect-right' : 'order-end'} ${isOtherSalerRental ? 'text-slate-600/80' : 'text-slate-800/90'}`}
                      >
                        {PERIOD_LABELS[period]}
                        {connectsRight && <span className="calendar-rental-link" aria-hidden="true" />}
                      </span>
                    ))}
                  </button>
                ) : (
                  <button
                    key={`empty-${periods[0].period}`}
                    type="button"
                    title={isMaintenance ? 'Thiết bị đang bảo dưỡng' : periods.map(p => `${p.period}: trống`).join('\n')}
                    style={{ gridRow: `${startRow} / span ${rowSpan}`, ...CELL_INTERACTION_STYLE }}
                    disabled={isMaintenance}
                    className={`min-h-0 w-full rounded-md active:scale-95 select-none flex flex-col items-stretch justify-center ${isMaintenance ? 'cursor-not-allowed border border-sky-100 bg-sky-50/70 text-sky-700' : 'calendar-empty-segment cursor-pointer'}`}
                    onContextMenu={preventContextMenu}
                    onClick={() => { if (!isMaintenance) openCreateModal(eq, day.dateObj, periods[0].period); }}
                  >
                    {periods.map(({ period }) => (
                      <span key={period} className="select-none flex-1 min-h-0 flex items-center justify-center text-[8px] md:text-[9px] lg:text-[10px] font-bold text-slate-500 leading-none">
                        {PERIOD_LABELS[period]}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// CalendarRow — outer wrapper
// ★ Only re-renders when dataVersion changes (data change) or eq changes
// ★ VERTICAL SCROLL → NO re-render (dataVersion stable, no virtual list deps)
// ═══════════════════════════════════════════════════════════════════
const CalendarRow = React.memo(({
  eq, leftColClass,
  handleHoverStart, handleHoverEnd,
  handleRentalHoverStart, handleRentalHoverEnd,
  openCreateModal, openEditModal,
  dataRef, dataVersion,
}) => {
  const isMaintenance = eq.condition === 'maintenance';

  // Read live data from ref (ref is always up‑to‑date, updated by parent)
  const data = dataRef.current;
  const displayedDays = data.displayedDays || [];
  const busyMapForEq = data.busyMap?.[eq.id];
  const activeCreatorIds = data.fSaler || ['ALL'];
  const isDriver = data.isDriver || false;

  return (
    <div className="flex border-b border-slate-100/80 group calendar-row" style={ROW_STYLE}>
      {/* ── Left column: equipment info — renders EVERY time, but it's cheap ── */}
      <div
        onMouseEnter={e => handleHoverStart(eq, e)}
        onMouseLeave={e => handleHoverEnd(e)}
        onPointerLeave={e => handleHoverEnd(e)}
        onPointerCancel={e => handleHoverEnd(e)}
        onTouchStart={e => handleHoverStart(eq, e)}
        onTouchCancel={e => handleHoverEnd(e)}
        onContextMenu={e => e.preventDefault()}
        className={`${leftColClass} select-none sticky left-0 z-20 bg-white border-r border-slate-100 flex flex-col justify-center px-2 md:px-4 py-1.5 md:py-2 shadow-[2px_0_10px_-8px_rgba(15,23,42,0.3)] cursor-pointer`}
      >
        <span className="font-semibold text-slate-800 truncate text-[11px] md:text-sm lg:text-base" title={eq.name}>{eq.name}</span>
        <div className="mt-0.5 md:mt-1 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[10px] md:text-xs font-medium text-violet-500/80" title={eq.code}>{eq.code}</span>
          {isMaintenance && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-sky-200 bg-sky-50 px-1 py-0.5 text-[7.5px] md:text-[9px] font-bold leading-none text-sky-700">
              <Wrench size={8} className="shrink-0" /><span>Bảo dưỡng</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] md:text-xs font-semibold text-slate-500 mt-0.5 md:mt-1 truncate" title={eq.branch_name || 'Hệ thống'}>
          <Home size={10} className="text-slate-400 shrink-0" /><span>{eq.branch_name || 'Hệ thống'}</span>
        </div>
      </div>

      {/* ── Day cells — this IS the part that re‑renders when data changes ── */}
      <CalendarRowCells
        eq={eq}
        displayedDays={displayedDays}
        busyMapForEq={busyMapForEq}
        activeCreatorIds={activeCreatorIds}
        isDriver={isDriver}
        handleRentalHoverStart={handleRentalHoverStart}
        handleRentalHoverEnd={handleRentalHoverEnd}
        openCreateModal={openCreateModal}
        openEditModal={openEditModal}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // ★ Only re‑render when dataVersion or eq actually changes
  //    All other props are stable (handlers via refs, leftColClass constant)
  return prevProps.dataVersion === nextProps.dataVersion && prevProps.eq === nextProps.eq;
});

export default CalendarRow;
