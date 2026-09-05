import React from 'react';

const CalendarStyles = () => (
  <style dangerouslySetInnerHTML={{
    __html: `
      @keyframes fadeInScale {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* ── Scrollbar hiding ── */
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

      /* ── Rental status patterns ── */
      .pending-pattern {
        background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%);
      }
      .active-pattern {
        background: linear-gradient(180deg, #fecaca 0%, #fca5a5 100%);
      }
      .completed-pattern {
        background: linear-gradient(180deg, #bbf7d0 0%, #6ee7b7 100%);
      }
      .cancelled-pattern {
        background: linear-gradient(180deg, #fecaca 0%, #fca5a5 100%);
      }
      .maintenance-pattern {
        background: linear-gradient(180deg, #dbeafe 0%, #bfdbfe 100%);
      }

      /* ── Rental segment base ── */
      .calendar-rental-segment {
        position: relative;
        box-shadow:
          inset 0 1px 0 color-mix(in srgb, var(--rental-status-border, #d97706) 34%, transparent),
          inset 0 -1px 0 color-mix(in srgb, var(--rental-status-border, #d97706) 34%, transparent),
          inset 0 1px 0 rgba(255, 255, 255, 0.28);
        z-index: 1;
        /* Touch: allow tap but let browser handle vertical scroll */
        touch-action: manipulation;
      }

      /* ── Day cell spacing vars ── */
      .calendar-day-cell {
        --calendar-day-x-pad: 0.2rem;
        --calendar-day-link-span: calc((var(--calendar-day-x-pad) * 2) + 1px);
      }
      @media (min-width: 640px) {
        .calendar-day-cell {
          --calendar-day-x-pad: 0.25rem;
        }
      }
      @media (min-width: 768px) {
        .calendar-day-cell {
          --calendar-day-x-pad: 0.375rem;
        }
      }
      @media (min-width: 1024px) {
        .calendar-day-cell {
          --calendar-day-x-pad: 0.5rem;
        }
      }

      /* ── Period labels ── */
      .calendar-rental-period {
        position: relative;
        isolation: isolate;
        background: inherit;
        overflow: visible;
        z-index: 1;
        touch-action: manipulation;
      }

      .calendar-rental-period.session-marker::after {
        content: '';
        position: absolute;
        left: 50%;
        top: calc(50% + 0.38em);
        width: 18px;
        height: 2px;
        border-radius: 9999px;
        background: var(--rental-session-line, #ef4444);
        opacity: 0.9;
        pointer-events: none;
        transform: translateX(-50%);
        z-index: 2;
      }

      /* ── Rental link connector ── */
      .calendar-rental-link {
        position: absolute;
        top: 50%;
        left: calc(100% + 3px);
        width: max(0px, calc(var(--calendar-day-link-span) - 6px));
        height: 2px;
        background: var(--rental-status-border, #d97706);
        border-radius: 9999px;
        opacity: 0.58;
        pointer-events: none;
        transform: translateY(-1px);
        z-index: 0;
      }

      /* ── Period border indicators ── */
      .calendar-rental-period.order-start {
        box-shadow: inset 2px 0 0 color-mix(in srgb, var(--rental-status-border, #d97706) 88%, transparent);
      }
      .calendar-rental-period.order-end {
        box-shadow: inset -2px 0 0 color-mix(in srgb, var(--rental-status-border, #d97706) 88%, transparent);
      }
      .calendar-rental-period.order-start.order-end {
        box-shadow:
          inset 2px 0 0 color-mix(in srgb, var(--rental-status-border, #d97706) 88%, transparent),
          inset -2px 0 0 color-mix(in srgb, var(--rental-status-border, #d97706) 88%, transparent);
      }

      /* ── Other-saler dimming ── */
      .other-saler-rental {
        opacity: 0.62;
        filter: saturate(0.82) brightness(1.03);
      }

      /* ── Empty segment ── */
      .calendar-empty-segment {
        position: relative;
        border: 1px solid rgba(203, 213, 225, 0.98);
        background:
          linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(226, 232, 240, 0.96));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.82),
          inset 0 0 0 1px rgba(255, 255, 255, 0.24);
        touch-action: manipulation;
      }

      /* ══ SCROLL PERFORMANCE ══════════════════════════════ */

      /* Main calendar scroll container — vertical momentum scroll */
      .calendar-scroll-container {
        /* GPU acceleration */
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        transform: translateZ(0);
        will-change: scroll-position;

        /* iOS momentum scroll */
        -webkit-overflow-scrolling: touch;

        /* Contain overscroll to this element (prevent page bounce) */
        overscroll-behavior-y: contain;
        overscroll-behavior-x: none;

        /* Tell browser this scrolls vertically → optimise touch handling */
        touch-action: pan-y;
      }

      /* Calendar row — allow row to participate in vertical scroll without capturing */
      .calendar-row {
        touch-action: pan-y;
        /* Prevent text selection on long press */
        -webkit-user-select: none;
        user-select: none;
      }

      /* Calendar row left column (equipment info) — allow horizontal detection for swipe */
      .calendar-equip-col {
        touch-action: manipulation;
      }

      /* ══ MOBILE: larger tap areas for period cells ════════ */
      @media (max-width: 639px) {
        .calendar-day-cell {
          padding-left: 1px;
          padding-right: 1px;
          padding-top: 2px;
          padding-bottom: 2px;
        }

        /* Period buttons: slightly larger hit area */
        .calendar-rental-period {
          min-height: 14px;
        }
      }

      /* ══ BOTTOM SHEET: smooth native feel ════════════════ */
      .calendar-filter-sheet {
        /* Hardware composite layer for smooth animation */
        will-change: transform;
        /* Contain children scroll */
        overscroll-behavior: contain;
      }

      /* ══ Swipe hint animation on mobile (first load) ════ */
      @keyframes swipeHint {
        0%   { transform: translateX(0); opacity: 1; }
        30%  { transform: translateX(-12px); opacity: 0.7; }
        60%  { transform: translateX(12px); opacity: 0.7; }
        100% { transform: translateX(0); opacity: 1; }
      }
    `
  }} />
);

export default CalendarStyles;
