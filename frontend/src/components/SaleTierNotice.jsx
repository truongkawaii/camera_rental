import React, { useEffect, useState } from 'react';
import { getSaleTiers } from '../api/client';

const fmt = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')}đ`;

// Bảng mốc doanh số - hoa hồng - thưởng (chính sách thi đua), dùng thay cho % cố định của bộ quy tắc sales.
const SaleTierTable = () => {
  const [tiers, setTiers] = useState([]);

  useEffect(() => {
    getSaleTiers().then((res) => setTiers(res.data?.tiers || [])).catch(() => {});
  }, []);

  if (tiers.length === 0) return null;

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="text-gray-400">
          <tr>
            <th className="py-1 pr-3 font-semibold">Doanh số tháng</th>
            <th className="py-1 pr-3 font-semibold">Hoa hồng</th>
            <th className="py-1 font-semibold">Thưởng</th>
          </tr>
        </thead>
        <tbody className="text-gray-700">
          {tiers.map((t) => (
            <tr key={t.key} className="border-t border-blue-100">
              <td className="py-1 pr-3">{t.label}</td>
              <td className="py-1 pr-3 font-semibold">{t.rate_percent}%</td>
              <td className="py-1 font-semibold">{t.bonus_amount ? fmt(t.bonus_amount) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SaleTierTable;
