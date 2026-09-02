export const formatPrice = (price) =>
  (Number(price) || 0).toLocaleString('vi-VN') + ' VND';

export const formatCurrencyInput = (val) => {
  if (val === undefined || val === null || val === '') return '';
  let str = val.toString();
  
  const isNegative = str.startsWith('-');
  
  // Handle DB decimal strings like "50000.00" 
  // If there's exactly one dot and it's followed by 1 or 2 digits, treat as decimal
  const parts = str.split('.');
  if (parts.length === 2 && parts[1].length <= 2) {
    str = Math.floor(Number(str)).toString();
  }

  // Remove non-digits
  const num = str.replace(/\D/g, '');
  // Add dots as thousands separators
  const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return isNegative && num !== '' && num !== '0' ? '-' + formatted : formatted;
};

export const parseCurrencyInput = (str) => {
  if (!str) return 0;
  // Remove all dots and parse as number
  const num = Number(str.toString().replace(/\./g, ''));
  return isNaN(num) ? 0 : num;
};

export const formatTime = (timeStr) => {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

export const formatVN = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

export const formatVNDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatPeriodDate = (dateStr, period) => {
  if (!dateStr) return '—';
  const pName = period === 'sáng' ? 'Sáng' : period === 'chiều' ? 'Chiều' : 'Tối';
  return `${pName}, ${formatVN(dateStr)}`;
};

export const formatDateTimeForInput = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const renderTotalTime = (daysValue) => {
  const fullDays = Math.floor(daysValue);
  const sessions = Math.round((daysValue - fullDays) * 3);
  
  const parts = [];
  if (fullDays > 0) parts.push(`${fullDays} ngày`);
  if (sessions > 0) parts.push(`${sessions} buổi`);
  
  return parts.length > 0 ? parts.join(', ') : '0 buổi';
};

export const normalizeImageSrc = (image) => {
  if (typeof image === 'string') return image.trim();
  if (!image || typeof image !== 'object') return '';

  const source = (
    image.url ||
    image.src ||
    image.imageUrl ||
    image.image_url ||
    image.secureUrl ||
    image.secure_url ||
    image.imageData ||
    image.image_data ||
    image.data ||
    ''
  );

  return typeof source === 'string' ? source.trim() : '';
};

export const getAllImages = (imageData) => {
  if (!imageData) return [];

  try {
    const parsed = typeof imageData === 'string' && imageData.trim().startsWith('[')
      ? JSON.parse(imageData)
      : imageData;
    const images = Array.isArray(parsed) ? parsed : [parsed];
    return images.map(normalizeImageSrc).filter(Boolean);
  } catch (e) {
    const fallback = normalizeImageSrc(imageData);
    return fallback ? [fallback] : [];
  }
};

export const getFirstImage = (imageData) => getAllImages(imageData)[0] || null;
