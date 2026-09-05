import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import {
  getAllRentalsCalendar, getCalendarEquipment, getEquipmentModels, getCustomers, getBranches,
  createRental, getRental, updateRental, uploadRentalImages, createCustomer,
  getUsers, updateCustomer,
} from '../../api/client';
import { useToast, ToastContainer } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';
import RentalModal from '../Rentals/components/RentalModal';
import CalendarGrid from './components/CalendarGrid';
import CalendarRow from './components/CalendarRow';
import CalendarStyles from './components/CalendarStyles';
import CalendarToolbar from './components/CalendarToolbar';
import EquipTooltip from './components/EquipTooltip';
import RentalTooltip from './components/RentalTooltip';

// ── Constants ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  customer_id: '', equipment_id: '',
  start_date: '', start_period: 'sáng',
  end_date: '', end_period: 'chiều',
  status: 'pending', notes: '', deposit_amount: 0, accessories: [],
  pickup_time: '', return_time: '',
  discount_amount: 0, discount_type: 'fixed',
  code: '', pickup_branch_id: '', return_branch_id: '', branch_id: '',
  paid_amount: 0, deposit_type: 'money', user_id: '', handover_user_id: '',
  applied_day_price: null, used_discount_day_price: false, discount_day_price: null, discount_day_threshold_snapshot: null
};
const EMPTY_CUSTOMER = { name: '', phone: '', email: '', address: '' };
const isNewImagePreview = (image) => typeof image === 'string' && image.startsWith('data:image/');
const getNewImageIndex = (previews, index) => previews.slice(0, index + 1).filter(isNewImagePreview).length - 1;
const VIEW_MONTH = 'Tháng';
const VIEW_WEEK = 'Tuần';
const PERIODS = ['sáng', 'chiều', 'tối'];
const PERIOD_INDEX = { 'sáng': 0, 'chiều': 1, 'tối': 2 };
const CALENDAR_HEADER_HEIGHT = 56;
const CALENDAR_ROW_HEIGHT = 78;
const DEFAULT_MONTH_DAY_WINDOW_SIZE = 15;
const DEFAULT_MONTH_DAY_WINDOW_STEP = 5;
const RENTAL_TOUCH_TOOLTIP_DELAY = 300;
const TOUCH_MOUSE_GUARD_MS = 1600;
const PERIOD_TIME_RANGE = {
  'sáng': { start: '22:30', end: '12:00', startDayOffset: -1 },
  'chiều': { start: '12:00', end: '18:00', startDayOffset: 0 },
  'tối': { start: '18:00', end: '22:30', startDayOffset: 0 }
};
const EQUIP_TOOLTIP_SELECTOR = '[data-equip-tooltip="true"]';

// ── Helpers ───────────────────────────────────────────────────────────────────
const toYMD = (d) => {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const getRentalStartYMD = (r) => (r.start_date || r.pickup_time || '').split('T')[0];
const getRentalEndYMD = (r) => (r.end_date || r.return_time || '').split('T')[0] || getRentalStartYMD(r);
const parseYMDDate = (ymd) => {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const getRentalPeriodRangeForDay = (r, ymd) => {
  const startYMD = getRentalStartYMD(r);
  const endYMD = getRentalEndYMD(r);
  const startPeriod = PERIOD_INDEX[r.start_period] ?? 0;
  const endPeriod = PERIOD_INDEX[r.end_period] ?? 2;

  let from = 0;
  let to = 2;
  if (ymd === startYMD) from = startPeriod;
  if (ymd === endYMD) to = endPeriod;
  if (from > to) to = from;
  return { from, to };
};

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getEventPoint = (e) => {
  const point = e?.touches?.[0] || e?.changedTouches?.[0] || e;
  const clientX = point?.clientX;
  const clientY = point?.clientY;
  if (clientX == null || clientY == null) return null;
  return { clientX, clientY };
};

const isPointInBounds = ({ clientX, clientY }, bounds) => (
  bounds &&
  clientX >= bounds.left &&
  clientX <= bounds.right &&
  clientY >= bounds.top &&
  clientY <= bounds.bottom
);

const isPointInEquipTooltip = (point) => {
  const tooltip = document.querySelector(EQUIP_TOOLTIP_SELECTOR);
  return tooltip ? isPointInBounds(point, tooltip.getBoundingClientRect()) : false;
};

const normalizeImageSrc = (image) => {
  if (typeof image === 'string') return image;
  if (!image || typeof image !== 'object') return '';
  return image.url || image.src || image.imageData || image.image_data || '';
};

const parseImageList = (imageData) => {
  if (!imageData) return [];

  try {
    const parsed = typeof imageData === 'string' && imageData.trim().startsWith('[')
      ? JSON.parse(imageData)
      : imageData;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map(normalizeImageSrc).filter(Boolean);
  } catch (err) {
    const fallback = normalizeImageSrc(imageData);
    return fallback ? [fallback] : [];
  }
};

// --- DATE LOGIC ---
const DAY_LABELS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const getMonday = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

const getWeekDays = (baseDate, todayDate) => {
  const monday = getMonday(baseDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dateObj: d,
      id: DAY_LABELS_SHORT[d.getDay()],
      dateStr: d.getDate().toString(),
      dateYMD: toYMD(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: d.toDateString() === todayDate.toDateString()
    };
  });
};

const getDisplayDayKeysWithAdjacentDays = (days) => {
  const keys = new Set(days.map(day => day.dateYMD));
  if (days.length === 0) return keys;

  keys.add(toYMD(addDays(days[0].dateObj, -1)));
  keys.add(toYMD(addDays(days[days.length - 1].dateObj, 1)));
  return keys;
};

const getMonthDays = (baseDate, todayDate) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return {
      dateObj: d,
      id: DAY_LABELS_SHORT[d.getDay()],
      dateStr: d.getDate().toString(),
      dateYMD: toYMD(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isToday: d.toDateString() === todayDate.toDateString()
    };
  });
};

const getResponsiveMonthDayWindowConfig = (width) => {
  if (width < 640) return { size: 7, step: 3 };
  if (width < 1024) return { size: 10, step: 4 };
  if (width < 1440) return { size: 12, step: 5 };
  return { size: DEFAULT_MONTH_DAY_WINDOW_SIZE, step: DEFAULT_MONTH_DAY_WINDOW_STEP };
};

export default function CalendarPage() {
  const { isAdmin, isCameraManager, isInvestor, isSaler, isDriver, user } = useAuth();
  const canManageRentals = isCameraManager || isInvestor;
  const { toast, toasts, removeToast } = useToast();

  const [rentals, setRentals] = useState([]);
  const [allEquipment, setAllEquipment] = useState([]);
  const [equipmentTotalCount, setEquipmentTotalCount] = useState(0);
  const [allModels, setAllModels] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const todayRef = useRef(null);
  const shouldScrollRef = useRef(true);

  useEffect(() => {
    const mainScrollArea = document.getElementById('main-scroll-area');
    if (!mainScrollArea) return undefined;

    const previousOverflowY = mainScrollArea.style.overflowY;
    const previousOverflowX = mainScrollArea.style.overflowX;
    const previousOverscrollY = mainScrollArea.style.overscrollBehaviorY;
    mainScrollArea.style.overflowY = 'hidden';
    mainScrollArea.style.overflowX = 'hidden';
    mainScrollArea.style.overscrollBehaviorY = 'auto';

    return () => {
      mainScrollArea.style.overflowY = previousOverflowY;
      mainScrollArea.style.overflowX = previousOverflowX;
      mainScrollArea.style.overscrollBehaviorY = previousOverscrollY;
    };
  }, []);

  const [viewMode, setViewMode] = useState(VIEW_MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [fBr, setFBr] = useState(['ALL']);
  const [fSaler, setFSaler] = useState(['ALL']);
  const [fModel, setFModel] = useState(['ALL']);
  const [openDropdown, setOpenDropdown] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState(EMPTY_CUSTOMER);
  const [editCustomerData, setEditCustomerData] = useState(null);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [imagesDirty, setImagesDirty] = useState(false);
  const [isFetchingRental, setIsFetchingRental] = useState(false);

  // Tooltip State
  // Tooltip State
  const [hoveredEquip, setHoveredEquip] = useState(null);
  const [hoveredRental, setHoveredRental] = useState(null);
  const hoverTimerRef = useRef(null);
  const hoverPosRef = useRef(null);
  const hoverBoundsRef = useRef(null);
  const rentalHoverTimerRef = useRef(null);
  const rentalHoverPosRef = useRef(null);
  const rentalHoverBoundsRef = useRef(null);
  const ignoreHoverMouseUntilRef = useRef(0);
  const ignoreRentalHoverMouseUntilRef = useRef(0);

  // --- DATA LOGIC ---
  const today = useMemo(() => new Date(), []);

  const monthDisplayedDays = useMemo(() => getMonthDays(currentDate, today), [currentDate, today]);
  const weekDisplayedDays = useMemo(() => getWeekDays(currentDate, today), [currentDate, today]);
  const displayedDays = viewMode === VIEW_WEEK ? weekDisplayedDays : monthDisplayedDays;
  const isWeekView = viewMode === VIEW_WEEK;

  const monthDisplayedDayKeys = useMemo(() => getDisplayDayKeysWithAdjacentDays(monthDisplayedDays), [monthDisplayedDays]);
  const weekDisplayedDayKeys = useMemo(() => getDisplayDayKeysWithAdjacentDays(weekDisplayedDays), [weekDisplayedDays]);

  const monthDateRange = useMemo(() => {
    if (monthDisplayedDays.length === 0) return { start: null, end: null };

    const start = new Date(monthDisplayedDays[0].dateObj);
    start.setHours(0, 0, 0, 0);

    const end = new Date(monthDisplayedDays[monthDisplayedDays.length - 1].dateObj);
    end.setHours(0, 0, 0, 0);

    return { start, end };
  }, [monthDisplayedDays]);

  const weekDateRange = useMemo(() => {
    if (weekDisplayedDays.length === 0) return { start: null, end: null };

    const start = new Date(weekDisplayedDays[0].dateObj);
    start.setHours(0, 0, 0, 0);

    const end = new Date(weekDisplayedDays[weekDisplayedDays.length - 1].dateObj);
    end.setHours(0, 0, 0, 0);

    return { start, end };
  }, [weekDisplayedDays]);

  const createBusyMap = useCallback((dateRange, dayKeys) => {
    const map = {};
    if (!dateRange.start || !dateRange.end) return map;

    rentals.forEach(r => {
      if (r.status === 'cancelled') return;

      const start = parseYMDDate(getRentalStartYMD(r));
      const end = parseYMDDate(getRentalEndYMD(r));
      if (!start || !end || start > dateRange.end || end < dateRange.start) return;

      const eqId = r.equipment_id;
      if (!map[eqId]) map[eqId] = new Map();

      const rangeStart = addDays(dateRange.start, -1);
      const rangeEnd = addDays(dateRange.end, 1);
      const current = new Date(Math.max(start.getTime(), rangeStart.getTime()));
      const last = new Date(Math.min(end.getTime(), rangeEnd.getTime()));

      while (current <= last) {
        const ymd = toYMD(current);
        if (dayKeys.has(ymd)) {
          const periodsForDay = map[eqId].get(ymd) || Array(PERIODS.length).fill(null);
          const { from, to } = getRentalPeriodRangeForDay(r, ymd);
          for (let periodIdx = from; periodIdx <= to; periodIdx++) {
            periodsForDay[periodIdx] = r;
          }
          map[eqId].set(ymd, periodsForDay);
        }
        current.setDate(current.getDate() + 1);
      }
    });
    return map;
  }, [rentals]);

  const monthBusyMap = useMemo(() => createBusyMap(monthDateRange, monthDisplayedDayKeys), [createBusyMap, monthDateRange, monthDisplayedDayKeys]);
  const weekBusyMap = useMemo(() => createBusyMap(weekDateRange, weekDisplayedDayKeys), [createBusyMap, weekDateRange, weekDisplayedDayKeys]);

  const headerTitle = useMemo(() => {
    if (viewMode === VIEW_WEEK) {
      const start = displayedDays[0].dateObj;
      const end = displayedDays[6].dateObj;
      return `${start.getDate()} Th${start.getMonth() + 1} - ${end.getDate()} Th${end.getMonth() + 1} ${end.getFullYear()}`;
    }
    return `Tháng ${currentDate.getMonth() + 1}, ${currentDate.getFullYear()}`;
  }, [currentDate, displayedDays, viewMode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fBrParam = fBr.includes('ALL') ? '' : fBr.join(',');
      const fModelParam = fModel.includes('ALL') ? '' : fModel.join(',');
      const [rRes, eRes, bRes, cRes, mRes] = await Promise.all([
        getAllRentalsCalendar(),
        getCalendarEquipment(1, 1000, fBrParam, fModelParam, 'code', 'ASC'),
        getBranches(),
        getCustomers(1, 300),
        getEquipmentModels()
      ]);
      setRentals(rRes.data || []);
      setAllEquipment(eRes.data?.data || []);
      setEquipmentTotalCount(eRes.data?.totalCount || 0);
      setBranches(bRes.data || []);
      setCustomers(cRes.data?.data || []);
      setAllModels(mRes.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [fBr, fModel]);

  useEffect(() => { loadData(); }, [loadData]);

  const ensureUsersLoaded = useCallback(async () => {
    if ((!isAdmin && !canManageRentals && !isSaler && !isDriver) || usersLoaded) return;
    try {
      const usersRes = await getUsers(isAdmin ? 'admin' : null);
      setUsers(usersRes.data.data || usersRes.data || []);
      setUsersLoaded(true);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Không thể tải danh sách người tạo');
    }
  }, [isAdmin, canManageRentals, isSaler, isDriver, toast, usersLoaded]);

  useEffect(() => { ensureUsersLoaded(); }, [ensureUsersLoaded]);

  useEffect(() => {
    if (isSaler && user?.id && fSaler.includes('ALL')) {
      setFSaler([String(user.id)]);
    }
  }, [fSaler, isSaler, user?.id]);

  // --- SCROLL LOGIC ---
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [monthDayWindowStart, setMonthDayWindowStart] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const totalEquipmentCountRef = useRef(0);

  // ── Version counter — increment to trigger imperative DOM updates in rows ──
  const [rowDataVersion, setRowDataVersion] = useState(0);
  const bumpRowVersion = useCallback(() => setRowDataVersion(v => v + 1), []);

  // ── Refs holding all dynamic row data (rows read from these without re-rendering) ──
  const rowDataRef = useRef({
    displayedDays: [],
    busyMap: {},
    fSaler: ['ALL'],
    isWeekView: false,
    isDriver: false
  });

  useLayoutEffect(() => {
    if (loading) {
      setIsReady(false);
      return;
    }

    if (todayRef.current && shouldScrollRef.current) {
      todayRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center'
      });
      shouldScrollRef.current = false;
    }

    const handle = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(handle);
  }, [loading, displayedDays]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(typeof window !== 'undefined' ? window.innerWidth : 1280);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const monthDayWindowConfig = useMemo(() => getResponsiveMonthDayWindowConfig(viewportWidth), [viewportWidth]);
  const monthDayWindowSize = useMemo(() => {
    return Math.min(monthDisplayedDays.length, monthDayWindowConfig.size);
  }, [monthDisplayedDays.length, monthDayWindowConfig.size]);
  const monthDayWindowStep = useMemo(() => {
    return Math.min(monthDayWindowConfig.step, Math.max(1, monthDayWindowSize));
  }, [monthDayWindowConfig.step, monthDayWindowSize]);

  const clampMonthDayWindowStart = useCallback((start, windowSize = monthDayWindowSize) => {
    return Math.max(0, Math.min(start, Math.max(0, monthDisplayedDays.length - windowSize)));
  }, [monthDisplayedDays.length, monthDayWindowSize]);

  const getTodayMonthWindowStart = useCallback((windowSize = monthDayWindowSize) => {
    const todayIndex = monthDisplayedDays.findIndex(day => day.isToday);
    if (todayIndex < 0) return 0;
    return clampMonthDayWindowStart(todayIndex - Math.floor(windowSize / 2), windowSize);
  }, [clampMonthDayWindowStart, monthDisplayedDays, monthDayWindowSize]);

  useEffect(() => {
    setMonthDayWindowStart(getTodayMonthWindowStart());
  }, [getTodayMonthWindowStart]);

  const monthVisibleDays = useMemo(() => {
    const start = clampMonthDayWindowStart(monthDayWindowStart);
    const end = Math.min(monthDisplayedDays.length, start + monthDayWindowSize);
    return monthDisplayedDays.slice(start, end);
  }, [clampMonthDayWindowStart, monthDayWindowSize, monthDayWindowStart, monthDisplayedDays]);

  useEffect(() => {
    setCanScrollLeft(!isWeekView && monthDayWindowStart > 0);
    setCanScrollRight(!isWeekView && monthDayWindowStart + monthDayWindowSize < monthDisplayedDays.length);
  }, [isWeekView, monthDayWindowSize, monthDayWindowStart, monthDisplayedDays.length]);

  // ── Sync total equipment count ref (avoids stale closures) ──
  useEffect(() => {
    totalEquipmentCountRef.current = equipmentTotalCount;
  }, [equipmentTotalCount]);

  const handleScroll = useCallback((direction) => {
    setMonthDayWindowStart(prev => {
      const next = direction === 'left'
        ? prev - monthDayWindowStep
        : prev + monthDayWindowStep;
      return clampMonthDayWindowStart(next);
    });
  }, [clampMonthDayWindowStart, monthDayWindowStep]);

  // --- HOVER HANDLERS ---
  const handleHoverStart = useCallback((item, e) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const isTouch = e.pointerType === 'touch' || e.type === 'touchstart' || (e.touches && e.touches.length > 0);
    if (!isTouch && Date.now() < ignoreHoverMouseUntilRef.current) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    hoverPosRef.current = { x: clientX, y: clientY };
    hoverBoundsRef.current = e.currentTarget?.getBoundingClientRect?.() || null;

    if (isTouch) {
      ignoreHoverMouseUntilRef.current = Date.now() + TOUCH_MOUSE_GUARD_MS;
      setHoveredEquip(item);
    } else {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredEquip(item);
      }, 250);
    }
  }, []);

  const handleHoverEnd = useCallback((e) => {
    const isTouchEnd =
      e?.type === 'touchend' ||
      e?.type === 'touchcancel' ||
      ((e?.type === 'pointerup' || e?.type === 'pointercancel') && e?.pointerType === 'touch');
    if (isTouchEnd) {
      ignoreHoverMouseUntilRef.current = Date.now() + TOUCH_MOUSE_GUARD_MS;
    }
    const isSyntheticMouseAfterTouch = e?.type?.startsWith('mouse') && Date.now() < ignoreHoverMouseUntilRef.current;
    if (isSyntheticMouseAfterTouch) return;

    const point = getEventPoint(e);
    if (!isTouchEnd && point && isPointInEquipTooltip(point)) return;

    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredEquip(null);
    hoverPosRef.current = null;
    hoverBoundsRef.current = null;
  }, []);

  useEffect(() => {
    if (!hoveredEquip) return undefined;

    const closeWhenOutsideHoveredCell = (e) => {
      const bounds = hoverBoundsRef.current;
      if (!bounds) return;

      const point = getEventPoint(e);
      if (!point) return;

      if (
        !isPointInBounds(point, bounds) &&
        !isPointInEquipTooltip(point)
      ) {
        handleHoverEnd();
      }
    };

    window.addEventListener('mousemove', closeWhenOutsideHoveredCell);
    window.addEventListener('pointermove', closeWhenOutsideHoveredCell);
    window.addEventListener('pointerdown', closeWhenOutsideHoveredCell);
    window.addEventListener('touchmove', closeWhenOutsideHoveredCell, { passive: true });
    window.addEventListener('touchstart', closeWhenOutsideHoveredCell, { passive: true });
    return () => {
      window.removeEventListener('mousemove', closeWhenOutsideHoveredCell);
      window.removeEventListener('pointermove', closeWhenOutsideHoveredCell);
      window.removeEventListener('pointerdown', closeWhenOutsideHoveredCell);
      window.removeEventListener('touchmove', closeWhenOutsideHoveredCell);
      window.removeEventListener('touchstart', closeWhenOutsideHoveredCell);
    };
  }, [handleHoverEnd, hoveredEquip]);

  const handleRentalHoverStart = useCallback((rental, e, moveOnly = false) => {
    const isTouch = e?.pointerType === 'touch' || e?.type === 'touchstart' || (e?.touches && e.touches.length > 0);
    if (!isTouch && Date.now() < ignoreRentalHoverMouseUntilRef.current) return;

    const point = getEventPoint(e);
    if (!point) return;

    rentalHoverPosRef.current = { x: point.clientX, y: point.clientY };
    rentalHoverBoundsRef.current = e.currentTarget?.getBoundingClientRect?.() || rentalHoverBoundsRef.current;

    if (moveOnly) {
      return;
    }

    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (rentalHoverTimerRef.current) clearTimeout(rentalHoverTimerRef.current);
    setHoveredEquip(null);

    if (isTouch) {
      ignoreRentalHoverMouseUntilRef.current = Date.now() + TOUCH_MOUSE_GUARD_MS;
      rentalHoverTimerRef.current = setTimeout(() => {
        setHoveredRental(rental);
      }, RENTAL_TOUCH_TOOLTIP_DELAY);
      return;
    }

    rentalHoverTimerRef.current = setTimeout(() => {
      setHoveredRental(rental);
    }, 350);
  }, []);

  const handleRentalHoverEnd = useCallback((e) => {
    const isTouchEnd =
      e?.type === 'touchend' ||
      e?.type === 'touchcancel' ||
      ((e?.type === 'pointerup' || e?.type === 'pointercancel') && e?.pointerType === 'touch');
    if (isTouchEnd) {
      ignoreRentalHoverMouseUntilRef.current = Date.now() + TOUCH_MOUSE_GUARD_MS;
    }
    const isSyntheticMouseAfterTouch = e?.type?.startsWith('mouse') && Date.now() < ignoreRentalHoverMouseUntilRef.current;
    if (isSyntheticMouseAfterTouch) return;

    if (rentalHoverTimerRef.current) clearTimeout(rentalHoverTimerRef.current);
    rentalHoverTimerRef.current = null;
    rentalHoverPosRef.current = null;
    rentalHoverBoundsRef.current = null;
    setHoveredRental(null);
  }, []);

  useEffect(() => {
    if (!hoveredRental) return undefined;

    const closeWhenOutsideRentalCell = (e) => {
      const bounds = rentalHoverBoundsRef.current;
      if (!bounds) return;

      const point = getEventPoint(e);
      if (!point) return;

      if (!isPointInBounds(point, bounds)) {
        handleRentalHoverEnd();
      }
    };

    window.addEventListener('mousemove', closeWhenOutsideRentalCell);
    window.addEventListener('pointermove', closeWhenOutsideRentalCell);
    window.addEventListener('pointerdown', closeWhenOutsideRentalCell);
    window.addEventListener('touchmove', closeWhenOutsideRentalCell, { passive: true });
    window.addEventListener('touchstart', closeWhenOutsideRentalCell, { passive: true });
    return () => {
      window.removeEventListener('mousemove', closeWhenOutsideRentalCell);
      window.removeEventListener('pointermove', closeWhenOutsideRentalCell);
      window.removeEventListener('pointerdown', closeWhenOutsideRentalCell);
      window.removeEventListener('touchmove', closeWhenOutsideRentalCell);
      window.removeEventListener('touchstart', closeWhenOutsideRentalCell);
    };
  }, [handleRentalHoverEnd, hoveredRental]);

  // --- NAVIGATION ACTIONS ---
  const handlePrev = useCallback(() => {
    shouldScrollRef.current = true;
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      if (viewMode === VIEW_WEEK) newDate.setDate(newDate.getDate() - 7);
      else newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  }, [viewMode]);

  const handleNext = useCallback(() => {
    shouldScrollRef.current = true;
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      if (viewMode === VIEW_WEEK) newDate.setDate(newDate.getDate() + 7);
      else newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }, [viewMode]);

  const handleToday = useCallback(() => {
    shouldScrollRef.current = true;
    setCurrentDate(new Date());
    setMonthDayWindowStart(getTodayMonthWindowStart());
  }, [getTodayMonthWindowStart]);

  const handleMonthView = useCallback(() => {
    shouldScrollRef.current = true;
    setViewMode(VIEW_MONTH);
  }, []);

  const handleWeekView = useCallback(() => {
    shouldScrollRef.current = true;
    setViewMode(VIEW_WEEK);
  }, []);

  // --- MODAL ACTIONS ---
  const openCreateModal = useCallback((eq, date, period = 'sáng') => {
    const ymd = toYMD(date);
    const timeRange = PERIOD_TIME_RANGE[period] || PERIOD_TIME_RANGE['sáng'];
    const pickupYMD = toYMD(addDays(date, timeRange.startDayOffset || 0));
    setFormData({
      ...EMPTY_FORM,
      equipment_id: eq.id,
      start_date: ymd,
      start_period: period,
      end_date: ymd,
      end_period: period,
      pickup_time: `${pickupYMD}T${timeRange.start}`,
      return_time: `${ymd}T${timeRange.end}`,
      pickup_branch_id: eq.branch_id || '',
      return_branch_id: eq.branch_id || '',
      branch_id: eq.branch_id || '',
      user_id: user?.id || '',
      handover_user_id: ''
    });
    setIsCreatingCustomer(false);
    setNewCustomerData(EMPTY_CUSTOMER);
    setEditCustomerData(null);
    setImagePreviews([]);
    setSelectedImageFiles([]);
    setImagesDirty(false);
    setStep(1);
    setEditingItem(null);
    setShowModal(true);
    ensureUsersLoaded();
  }, [ensureUsersLoaded, user?.id]);

  const openEditModal = useCallback(async (rental) => {
    if (!rental) return;

    const start_date = (rental.start_date || rental.pickup_time || '').split('T')[0] || '';
    const end_date = (rental.end_date || rental.return_time || '').split('T')[0] || start_date;
    setFormData({
      ...EMPTY_FORM,
      equipment_id: rental.equipment_id,
      start_date,
      start_period: rental.start_period || 'sáng',
      end_date,
      end_period: rental.end_period || 'chiều',
      pickup_time: rental.pickup_time || (start_date ? `${start_date}T08:00` : ''),
      return_time: rental.return_time || (end_date ? `${end_date}T20:00` : ''),
      pickup_branch_id: rental.pickup_branch_id || rental.branch_id || '',
      return_branch_id: rental.return_branch_id || rental.pickup_branch_id || rental.branch_id || '',
      branch_id: rental.branch_id || rental.pickup_branch_id || '',
      applied_day_price: rental.applied_day_price ?? null,
      used_discount_day_price: Boolean(rental.used_discount_day_price),
      discount_day_price: rental.discount_day_price ?? null,
      discount_day_threshold_snapshot: rental.discount_day_threshold_snapshot ?? null,
      custom_total: toNumberOrNull(rental.total_price),
      handover_user_id: rental.handover_user_id || ''
    });
    setIsCreatingCustomer(false);
    setNewCustomerData(EMPTY_CUSTOMER);
    setEditCustomerData(null);
    setImagePreviews([]);
    setSelectedImageFiles([]);
    setImagesDirty(false);
    setStep(1);
    setEditingItem({ id: rental.id });
    setShowModal(true);
    setIsFetchingRental(true);
    ensureUsersLoaded();

    try {
      const res = await getRental(rental.id);
      const data = res.data;
      const loadedStartDate = (data.start_date || data.pickup_time || '').split('T')[0] || '';
      const loadedEndDate = (data.end_date || data.return_time || '').split('T')[0] || loadedStartDate;
      const imageList = parseImageList(data.images || data.image_data);
      setFormData({
        customer_id: data.customer_id,
        equipment_id: data.equipment_id,
        start_date: loadedStartDate,
        start_period: data.start_period || 'sáng',
        end_date: loadedEndDate,
        end_period: data.end_period || 'chiều',
        pickup_time: data.pickup_time || (loadedStartDate ? `${loadedStartDate}T08:00` : ''),
        return_time: data.return_time || (loadedEndDate ? `${loadedEndDate}T20:00` : ''),
        pickup_branch_id: data.pickup_branch_id || data.branch_id || '',
        return_branch_id: data.return_branch_id || data.pickup_branch_id || data.branch_id || '',
        branch_id: data.branch_id || data.pickup_branch_id || '',
        status: data.status || 'pending',
        notes: data.notes || '',
        deposit_amount: data.deposit_amount || 0,
        accessories: data.accessories || [],
        discount_amount: data.discount_amount || 0,
        discount_type: data.discount_type || 'fixed',
        applied_day_price: data.applied_day_price ?? null,
        used_discount_day_price: Boolean(data.used_discount_day_price),
        discount_day_price: data.discount_day_price ?? null,
        discount_day_threshold_snapshot: data.discount_day_threshold_snapshot ?? null,
        code: data.code || '',
        paid_amount: data.paid_amount || 0,
        deposit_type: data.deposit_type || 'money',
        custom_total: toNumberOrNull(data.total_price),
        user_id: data.user_id || '',
        handover_user_id: data.handover_user_id || ''
      });
      const customer = customers.find((c) => String(c.id) === String(data.customer_id));
      setEditCustomerData(customer ? {
        id: customer.id,
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || ''
      } : {
        id: data.customer_id,
        name: data.customer_name || '',
        phone: data.customer_phone || '',
        email: data.customer_email || ''
      });
      setImagePreviews(imageList);
      setImagesDirty(false);
      setEditingItem(data);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Không thể tải dữ liệu đơn thuê');
    } finally {
      setIsFetchingRental(false);
    }
  }, [customers, ensureUsersLoaded, toast]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!isCreatingCustomer && !formData.customer_id) { toast.error('Vui lòng chọn khách hàng'); return; }
    if (!formData.equipment_id) { toast.error('Vui lòng chọn thiết bị'); return; }
    if (!formData.start_date || !formData.end_date) { toast.error('Vui lòng chọn thời gian'); return; }
    if (formData.deposit_type === 'item' && imagePreviews.length === 0) {
      toast.error('Vui lòng tải lên ảnh minh chứng cọc vật dụng');
      return;
    }
    setSaving(true);
    try {
      let fd = { ...formData };
      if (isCreatingCustomer) {
        if (!newCustomerData.name) { toast.error('Nhập tên khách hàng'); setSaving(false); return; }
        const cr = await createCustomer(newCustomerData);
        fd.customer_id = cr.data.id;
      }
      let response;
      if (editingItem?.id) {
        if (editCustomerData && String(editCustomerData.id) === String(fd.customer_id)) {
          const original = customers.find((c) => String(c.id) === String(editCustomerData.id));
          const editedCustomer = {
            name: (editCustomerData.name || '').trim(),
            phone: (editCustomerData.phone || '').trim(),
            email: (editCustomerData.email || '').trim()
          };

          if (!editedCustomer.name) {
            toast.error('Vui lòng nhập tên khách hàng');
            setSaving(false);
            return;
          }

          const normalize = (value) => (value || '').trim().toLowerCase();
          const findDuplicateCustomer = (list = []) => list.find((customer) =>
            String(customer.id) !== String(editCustomerData.id) &&
            normalize(customer.name) === normalize(editedCustomer.name) &&
            normalize(customer.phone) === normalize(editedCustomer.phone)
          );

          let duplicateCustomer = editedCustomer.phone ? findDuplicateCustomer(customers) : null;
          if (!duplicateCustomer && editedCustomer.phone) {
            const duplicateRes = await getCustomers(1, 100, editedCustomer.phone);
            duplicateCustomer = findDuplicateCustomer(duplicateRes.data.data || []);
          }

          const changed =
            (original?.name ?? '') !== editedCustomer.name ||
            (original?.phone ?? '') !== editedCustomer.phone ||
            (original?.email ?? '') !== editedCustomer.email;

          if (duplicateCustomer) {
            fd.customer_id = duplicateCustomer.id;
          } else if (changed) {
            await updateCustomer(editCustomerData.id, {
              name: editedCustomer.name,
              phone: editedCustomer.phone,
              email: editedCustomer.email
            });
          }
        }

        response = await updateRental(editingItem.id, fd);
        setTimeout(() => {
          resetModal();
          // Đợi cả 2 modal (RentalModal + ConfirmModal) đóng hết rồi mới hiện toast
          setTimeout(() => {
            toast.success('Cập nhật đơn thành công');
          }, 250);
          const uploadPromise = imagesDirty
            ? uploadRentalImages(editingItem.id, imagePreviews, selectedImageFiles.map((file) => file.name))
            : Promise.resolve();
          uploadPromise.catch(() => {}).finally(() => loadData());
        }, 0);
      } else {
        response = await createRental(fd);
        setTimeout(() => {
          resetModal();
          // Đợi modal đóng hết rồi mới hiện toast
          setTimeout(() => {
            toast.success('Tạo đơn thành công');
          }, 250);
          const uploadPromise = imagePreviews.length
            ? uploadRentalImages(response.data.id, imagePreviews, selectedImageFiles.map((file) => file.name))
            : Promise.resolve();
          uploadPromise.catch(() => {}).finally(() => loadData());
        }, 0);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Lưu đơn thất bại');
    } finally { setSaving(false); }
  };

  const resetModal = () => {
    setFormData(EMPTY_FORM); setNewCustomerData(EMPTY_CUSTOMER);
    setIsCreatingCustomer(false); setEditCustomerData(null); setImagePreviews([]); setSelectedImageFiles([]);
    setImagesDirty(false);
    setShowModal(false); setStep(1); setEditingItem(null);
  };

  const calculateTotalDays = useCallback(() => {
    if (!formData.start_date || !formData.end_date) return { fullDays: 0, sessions: 0 };
    const d1 = new Date(formData.start_date.split('T')[0] + 'T00:00:00Z');
    const d2 = new Date(formData.end_date.split('T')[0] + 'T00:00:00Z');
    const daysDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    const pIdx = { 'sáng': 0, 'chiều': 1, 'tối': 2 };
    const p1 = pIdx[formData.start_period] ?? 0;
    const p2 = pIdx[formData.end_period] ?? 1;

    // Same day: ≥2 sessions = 1 day
    if (daysDiff === 0) {
      const sessionCount = Math.max(1, p2 - p1 + 1);
      if (sessionCount >= 2) return { fullDays: 1, sessions: 0 };
      return { fullDays: 0, sessions: sessionCount };
    }

    // Multi-day: count per calendar day
    let fullDays = 0;
    let sessions = 0;

    if (daysDiff > 1) fullDays += (daysDiff - 1);

    const startDaySessions = 3 - p1;
    if (startDaySessions >= 2) fullDays += 1;
    else sessions += startDaySessions;

    const endDaySessions = p2 + 1;
    if (endDaySessions >= 2) fullDays += 1;
    else sessions += endDaySessions;

    return { fullDays, sessions };
  }, [formData.end_date, formData.end_period, formData.start_date, formData.start_period]);

  const renderTotalTime = useCallback(({ fullDays, sessions } = {}) => {
    const parts = [];
    if (fullDays > 0) parts.push(`${fullDays} ngày`);
    if (sessions > 0) parts.push(`${sessions} buổi`);
    return parts.length > 0 ? parts.join(', ') : '0 buổi';
  }, []);

  // --- FILTERS ---
  const branchOptions = useMemo(() => [
    { value: 'ALL', label: 'Tất cả chi nhánh' },
    ...branches.map(b => ({ value: String(b.id), label: b.name }))
  ], [branches]);

  const modelOptions = useMemo(() => [
    { value: 'ALL', label: 'Tất cả model' },
    ...allModels.map(model => ({ value: model, label: model }))
  ], [allModels]);

  const salerOptions = useMemo(() => [
    { value: 'ALL', label: 'Tất cả sale' },
    ...users
      .filter((u) => Array.isArray(u.roles) && u.roles.some((role) => role?.name === 'saler'))
      .map((saleUser) => ({
        value: String(saleUser.id),
        label: saleUser.full_name || saleUser.username || `Sale #${saleUser.id}`
      }))
  ], [users]);

  const leftColClass = 'w-[5.5rem] md:w-48 lg:w-56 shrink-0';

  // Ensure editing item's customer and branches are always in the dropdown options,
  // even if not loaded due to pagination or soft-deleted.
  const augmentedCustomers = useMemo(() => {
    if (!editingItem?.customer_id) return customers;
    const exists = customers.some(c => String(c.id) === String(editingItem.customer_id));
    if (exists) return customers;
    const synthetic = {
      id: editingItem.customer_id,
      name: editingItem.customer_name || `Khách #${editingItem.customer_id}`,
      phone: editingItem.customer_phone || '',
      email: editingItem.customer_email || '',
      total_rentals: 0,
      is_blacklisted: false,
    };
    return [synthetic, ...customers];
  }, [customers, editingItem]);

  const augmentedBranches = useMemo(() => {
    if (!editingItem) return branches;
    const result = [...branches];
    const addIfMissing = (id, name) => {
      if (id && !result.some(b => String(b.id) === String(id))) {
        result.push({ id, name: name || `Chi nhánh #${id}` });
      }
    };
    addIfMissing(editingItem.pickup_branch_id, editingItem.pickup_branch_name);
    addIfMissing(editingItem.return_branch_id, editingItem.return_branch_name);
    addIfMissing(editingItem.branch_id, editingItem.original_branch_name);
    return result;
  }, [branches, editingItem]);

  const activeDisplayedDays = isWeekView ? weekDisplayedDays : monthVisibleDays;
  const activeBusyMap = isWeekView ? weekBusyMap : monthBusyMap;

  // ── Keep rowDataRef in sync with latest values (no re-render triggered) ──
  rowDataRef.current = {
    displayedDays: activeDisplayedDays,
    busyMap: activeBusyMap,
    fSaler,
    isWeekView,
    isDriver
  };

  // ── Bump version when data actually changes (new rentals loaded, month/week switch, filter change, day window scroll) ──
  useEffect(() => {
    bumpRowVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDisplayedDays, activeBusyMap, fSaler, isWeekView, isDriver]);

  // ── Stable handler bundle (ref avoids changing calendarRows identity on every render) ──
  const handlersRef = useRef({});
  handlersRef.current = {
    handleHoverStart, handleHoverEnd,
    handleRentalHoverStart, handleRentalHoverEnd,
    openCreateModal, openEditModal,
    fSaler,
    isDriver
  };

  // ── Row rendering — lazy loads equipment via scroll; container height reserves space for all ──
  const calendarRows = useMemo(() => {
    if (loading) return null;

    if (allEquipment.length === 0) {
      if (totalEquipmentCountRef.current > 0) return null;
      return (
        <div className="p-8 text-center text-gray-400 text-sm md:text-base sticky left-0 w-full max-w-[100vw]">Không tìm thấy thiết bị nào.</div>
      );
    }

    const h = handlersRef.current;
    const totalHeight = allEquipment.length * CALENDAR_ROW_HEIGHT;
    return (
      <div className="relative" style={{ height: totalHeight }}>
        {allEquipment.map((eq) => (
          <CalendarRow
            key={eq.id}
            eq={eq}
            leftColClass={leftColClass}
            handleHoverStart={h.handleHoverStart}
            handleHoverEnd={h.handleHoverEnd}
            handleRentalHoverStart={h.handleRentalHoverStart}
            handleRentalHoverEnd={h.handleRentalHoverEnd}
            openCreateModal={h.openCreateModal}
            openEditModal={h.openEditModal}
            dataRef={rowDataRef}
            dataVersion={rowDataVersion}
          />
        ))}
      </div>
    );
  }, [allEquipment, loading, rowDataVersion]);

  const handleRentalImagesSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`Tệp ${file.name} không phải ảnh hợp lệ`);
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`Tệp ${file.name} vượt quá 5MB`);
        return false;
      }
      return true;
    });

    setSelectedImageFiles(prev => [...prev, ...validFiles]);
    if (validFiles.length > 0) setImagesDirty(true);
    validFiles.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => setImagePreviews(prev => [...prev, ev.target.result]);
      reader.onerror = () => toast.error(`Không thể đọc tệp ${f.name}`);
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  }, [toast]);

  const removeRentalImage = useCallback((idx) => {
    if (isNewImagePreview(imagePreviews[idx])) {
      const fileIndex = getNewImageIndex(imagePreviews, idx);
      setSelectedImageFiles(prev => prev.filter((_, i) => i !== fileIndex));
    }
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
    setImagesDirty(true);
  }, [imagePreviews]);

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-slate-50 font-sans relative overflow-hidden">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {openDropdown && (
        <div className="fixed inset-0 z-[42] bg-transparent cursor-default" onClick={() => setOpenDropdown(null)}></div>
      )}

      <CalendarToolbar
        headerTitle={headerTitle}
        isWeekView={isWeekView}
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        fBr={fBr}
        setFBr={setFBr}
        fSaler={fSaler}
        setFSaler={setFSaler}
        fModel={fModel}
        setFModel={setFModel}
        isDriver={isDriver}
        branchOptions={branchOptions}
        salerOptions={salerOptions}
        modelOptions={modelOptions}
        handleMonthView={handleMonthView}
        handleWeekView={handleWeekView}
        handlePrev={handlePrev}
        handleToday={handleToday}
        handleNext={handleNext}
      />

      <CalendarGrid
        loading={loading}
        isReady={isReady}
        scrollRef={scrollRef}
        isWeekView={isWeekView}
        leftColClass={leftColClass}
        displayedDays={activeDisplayedDays}
        todayRef={todayRef}
        rows={calendarRows}
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        handleScroll={handleScroll}
      />
      {/* --- MODAL & TOOLTIP --- */}
      <RentalModal
        showModal={showModal} onClose={resetModal}
        step={step} setStep={setStep}
        editingItem={editingItem} saving={saving}
        formData={formData} setFormData={setFormData}
        editCustomerData={editCustomerData} setEditCustomerData={setEditCustomerData}
        isCreatingCustomer={isCreatingCustomer} setIsCreatingCustomer={setIsCreatingCustomer}
        newCustomerData={newCustomerData} setNewCustomerData={setNewCustomerData}
        customers={augmentedCustomers} equipment={allEquipment} branches={augmentedBranches}
        users={users}
        handleSubmit={handleSubmit}
        imagePreviews={imagePreviews}
        handleImageSelect={handleRentalImagesSelect}
        removeImage={removeRentalImage}
        calculateTotalDays={calculateTotalDays}
        renderTotalTime={renderTotalTime}
        isAdmin={isAdmin} isCameraManager={canManageRentals} isSaler={isSaler} isDriver={isDriver}
        loading={isFetchingRental}
        toast={toast}
      />

      {!showModal && <EquipTooltip eq={hoveredEquip} initialPos={hoverPosRef.current} />}
      {!showModal && <RentalTooltip rental={hoveredRental} initialPos={rentalHoverPosRef.current} />}

      <CalendarStyles />
    </div>
  );
}

