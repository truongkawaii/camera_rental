const defaultSlots = [
  { key: 'morning', label: 'Ca sáng', start: '09:00', end: '13:00' },
  { key: 'afternoon', label: 'Ca chiều', start: '13:00', end: '17:00' },
  { key: 'evening', label: 'Ca tối', start: '17:00', end: '22:00' }
];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const validWeek = week => validDate(week) && new Date(`${week}T00:00:00Z`).getUTCDay() === 1;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function validateSlots(slots) {
  return Array.isArray(slots) && slots.length === 3 && slots.every((slot, index) => slot?.key === defaultSlots[index].key && slot.label === defaultSlots[index].label && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) && slot.start < slot.end && (!index || slots[index - 1].end <= slot.start));
}
function selectionSnapshot(week, selection, slots) {
  if (!validWeek(week) || !Array.isArray(selection) || selection.length > 21) throw new Error('Tuần hoặc danh sách ca không hợp lệ.');
  const seen = new Set();
  return selection.map(item => {
    const slot = slots.find(slot => slot.key === item?.slot);
    const key = `${item?.date}:${item?.slot}`;
    if (!slot || !validDate(item.date) || item.date < week || item.date > addDays(week, 6) || seen.has(key)) throw new Error('Ca bị trùng hoặc nằm ngoài tuần đã chọn.');
    seen.add(key);
    return { date: item.date, slot: slot.key, label: slot.label, start: slot.start, end: slot.end };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}
module.exports = { defaultSlots, validWeek, addDays, today, validateSlots, selectionSnapshot };
