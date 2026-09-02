import React from 'react';

/** Parse the JSON-or-string image_data field into an array of URLs */
export const parseImages = (image_data) => {
  if (!image_data) return [];
  if (image_data.startsWith('[')) {
    try { return JSON.parse(image_data); } catch { return [image_data]; }
  }
  return [image_data];
};

export const EMPTY_FORM = {
  name: '',
  category: 'Camera',
  brand: '',
  model: '',
  price_per_day: '',
  price_per_session: '',
  price_per_day_discount: '',
  discount_day_threshold: '',
  code: '',
  condition: 'good',
  branch_id: '',
  owner_id: '',
};

export const CONDITION_CFG = {
  good: { label: 'Tốt',       badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  fair: { label: 'Trung bình', badge: 'bg-amber-50  text-amber-700  border-amber-200',    dot: 'bg-amber-400'  },
  poor: { label: 'Kém',       badge: 'bg-rose-50   text-rose-600   border-rose-200',     dot: 'bg-rose-500'   },
  maintenance: { label: 'Bảo dưỡng', badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
};

export const ConditionBadge = ({ condition }) => {
  const cfg = CONDITION_CFG[condition] || CONDITION_CFG.poor;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10.5px] font-extrabold uppercase tracking-wide whitespace-nowrap ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};
