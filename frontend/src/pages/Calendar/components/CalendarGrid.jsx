import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CalendarGridView = React.memo(({
  leftColClass,
  displayedDays,
  todayRef,
  rows,
  viewRef,
  headerRef
}) => (
  <div ref={viewRef} className="min-w-full block">
    <div ref={headerRef} className="flex sticky top-0 z-30 bg-white border-b border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className={`${leftColClass} sticky left-0 z-40 bg-slate-50/95 flex items-center justify-center border-r border-slate-200/70`}>
        <span className="text-[11px] md:text-xs lg:text-sm font-semibold text-slate-400">Thiết bị</span>
      </div>
      <div className="flex flex-1">
        {displayedDays.map((day, idx) => (
          <div
            key={`header-${idx}`}
            ref={day.isToday ? todayRef : null}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center py-1.5 md:py-2 lg:py-2.5 border-r border-slate-100/80 ${day.isWeekend ? 'bg-slate-50/75' : 'bg-white/95'}`}
          >
            <span className={`text-[10px] md:text-xs lg:text-sm font-semibold mb-1 ${day.isToday ? 'text-white bg-violet-600 px-1.5 md:px-2 rounded-full shadow-sm' : 'text-slate-400'}`}>{day.id}</span>
            <span className={`font-semibold ${day.isToday ? 'text-violet-700' : 'text-slate-800'} text-xs md:text-sm lg:text-base`}>{day.dateStr}</span>
          </div>
        ))}
      </div>
    </div>

    {rows}
  </div>
));

const CalendarGrid = ({
  loading,
  isReady,
  scrollRef,
  isWeekView,
  leftColClass,
  displayedDays,
  todayRef,
  rows,
  canScrollLeft,
  canScrollRight,
  handleScroll,
  loadingMore,
  loadedCount,
  totalCount,
  sentinelRef,
}) => {
  const viewRef = React.useRef(null);
  const headerRef = React.useRef(null);
  const [arrowTop, setArrowTop] = React.useState(null);

  // Simple ref callback for the scroll container (no scroll listener needed — browser virtualizes via CSS)
  const setScrollRef = React.useCallback((node) => {
    scrollRef.current = node;
  }, [scrollRef]);

  React.useLayoutEffect(() => {
    const viewElement = viewRef.current;
    if (!viewElement) return undefined;

    const updateArrowTop = () => {
      const viewHeight = viewElement.getBoundingClientRect().height;
      const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
      const rowsHeight = Math.max(0, viewHeight - headerHeight);
      const viewportHeight = window.innerHeight;

      setArrowTop(
        viewHeight > viewportHeight
          ? null
          : `${headerHeight + (rowsHeight / 2)}px`
      );
    };

    let animationFrame = window.requestAnimationFrame(updateArrowTop);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateArrowTop);
      resizeObserver.observe(viewElement);
      if (headerRef.current) {
        resizeObserver.observe(headerRef.current);
      }
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [displayedDays, scrollRef]);

  const arrowStyle = arrowTop !== null ? { top: arrowTop } : undefined;
  const arrowPositionClass = arrowTop !== null ? 'absolute -translate-y-1/2' : 'absolute top-1/2 -translate-y-1/2';

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-white relative z-10 flex flex-col">
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white text-gray-400">
          <div className="w-10 h-10 border-4 border-gray-100 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-sm">Đang tải dữ liệu...</p>
        </div>
      )}
      <div
        ref={setScrollRef}
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-auto no-scrollbar calendar-scroll-container relative transition-opacity duration-150 ${(loading || !isReady) ? 'opacity-0' : 'opacity-100'}`}
      >
        <CalendarGridView
          leftColClass={leftColClass}
          displayedDays={displayedDays}
          todayRef={todayRef}
          rows={rows}
          viewRef={viewRef}
          headerRef={headerRef}
        />
        {/* Sentinel for IntersectionObserver — rendered OUTSIDE row memo to stay in sync with real allEquipment.length */}
        {loadedCount < totalCount && (
          <div
            ref={sentinelRef}
            className="absolute left-0 right-0"
            style={{ top: loadedCount * 78, height: '1px' }}
          />
        )}
        {/* Loading spinner — rendered outside row memo to avoid full list rebuild on loading state toggle */}
        {loadingMore && (
          <div className="flex items-center justify-center py-3 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-slate-200 border-t-purple-500 rounded-full animate-spin" />
              Đang tải thêm...
            </div>
          </div>
        )}
      </div>

      {!isWeekView && (
        <>
          {canScrollLeft && (
            <button
              onClick={() => handleScroll('left')}
              style={arrowStyle}
              className={`${arrowPositionClass} left-[6rem] md:left-[13rem] lg:left-[15rem] z-[45] w-10 h-10 bg-white border border-gray-100 rounded-full flex items-center justify-center text-purple-600 opacity-40 hover:opacity-100 hover:scale-110 active:scale-95 transition-[opacity,transform] duration-200 group/btn shadow-md`}
              title="Cuộn sang trái"
            >
              <ChevronLeft className="w-5 h-5 group-hover/btn:-translate-x-0.5 transition-transform" />
            </button>
          )}
          {canScrollRight && (
            <button
              onClick={() => handleScroll('right')}
              style={arrowStyle}
              className={`${arrowPositionClass} right-4 md:right-8 z-[45] w-10 h-10 bg-white shadow-md border border-gray-100 rounded-full flex items-center justify-center text-purple-600 opacity-40 hover:opacity-100 hover:scale-110 active:scale-95 transition-[opacity,transform] duration-200 group/btn`}
              title="Cuộn sang phải"
            >
              <ChevronRight className="w-5 h-5 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(CalendarGrid);
