// utils/dateHelpers.js
/**
 * Convert a date string and period to a full datetime string in GMT (UTC).
 * Periods: "sáng" -> 08:00:00, "chiều" -> 13:00:00, "tối" -> 18:00:00
 * Assumes the input period is in VN time (+07:00).
 */
const getDateTimeForPeriod = (dateStr, period) => {
  const dStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.substring(0, 10);
  let time = '08:00:00';
  if (period === 'chiều') time = '13:00:00';
  if (period === 'tối') time = '18:00:00';
  return new Date(`${dStr}T${time}+07:00`).toISOString();
};

/**
 * Calculate the number of full days and additional sessions between two dates/periods.
 * Rules (per calendar day):
 *   - 2‑3 sessions on the same day → 1 full day
 *   - 1 session on a day → 1 buổi
 *   - Sessions from different days are never merged into a day.
 * Returns { fullDays, sessions } where sessions is 0‑2.
 */
const calculateDaysSessions = (start_date, start_period, end_date, end_period) => {
  const d1Str = start_date.includes('T') ? start_date.split('T')[0] : start_date.substring(0, 10);
  const d2Str = end_date.includes('T') ? end_date.split('T')[0] : end_date.substring(0, 10);

  const d1 = new Date(d1Str + 'T00:00:00Z');
  const d2 = new Date(d2Str + 'T00:00:00Z');

  const daysDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

  const getIndex = (p) => (p === 'tối' ? 2 : p === 'chiều' ? 1 : 0);
  const p1 = getIndex(start_period);
  const p2 = getIndex(end_period);

  // Same day
  if (daysDiff === 0) {
    const sessionCount = Math.max(1, p2 - p1 + 1);
    if (sessionCount >= 2) return { fullDays: 1, sessions: 0 };
    return { fullDays: 0, sessions: sessionCount };
  }

  // Multi-day: count each calendar day separately
  let fullDays = 0;
  let sessions = 0;

  // Middle full days (days between start+1 and end-1) — always 3 sessions = 1 day each
  if (daysDiff > 1) {
    fullDays += (daysDiff - 1);
  }

  // Start day: from start_period to end of day
  const startDaySessions = 3 - p1;
  if (startDaySessions >= 2) {
    fullDays += 1;
  } else {
    sessions += startDaySessions;
  }

  // End day: from start of day to end_period
  const endDaySessions = p2 + 1;
  if (endDaySessions >= 2) {
    fullDays += 1;
  } else {
    sessions += endDaySessions;
  }

  return { fullDays, sessions };
};

/**
 * Format a local VN time string (from frontend) into GMT (UTC) ISO string.
 */
const formatLocalToGMT = (d) => {
  if (!d) return null;
  if (d.includes('+') || d.includes('Z')) return new Date(d).toISOString();
  if (d.length === 16 && d.includes('T')) return new Date(`${d}:00+07:00`).toISOString();
  if (d.length === 10) return new Date(`${d}T00:00:00+07:00`).toISOString();
  return new Date(`${d}+07:00`).toISOString();
};

module.exports = { getDateTimeForPeriod, calculateDaysSessions, formatLocalToGMT };
