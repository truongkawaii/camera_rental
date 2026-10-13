import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { getPayroll, getSaleTiers } from '../api/client';

const fmt = (n) => `${Math.round(Number(n || 0)).toLocaleString('vi-VN')}đ`;

const SaleTierNotice = () => {
  const month = new Date().toISOString().slice(0, 7);
  const [tiers, setTiers] = useState([]);
  const [salers, setSalers] = useState([]);

  useEffect(() => {
    getSaleTiers().then((res) => setTiers(res.data?.tiers || [])).catch(() => {});
    getPayroll(month)
      .then((res) => setSalers((res.data?.payroll || []).filter((p) => p.is_tiered)))
      .catch(() => {});
  }, [month]);

  if (month < '2026-10') return null;

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
          <Trophy size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-gray-900">Chính sách thi đua doanh số (từ 01/10/2026)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Với nhân viên sales, hệ thống tự tính % hoa hồng và thưởng theo doanh số tháng, <b>không dùng % của các bộ quy tắc bên dưới</b>.
            Muốn sửa riêng một tháng, vào trang Payroll và bấm icon sửa ở cột hoa hồng của nhân viên.
          </p>

          {tiers.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead className="text-gray-400">
                  <tr><th className="py-1 pr-3">Doanh số tháng</th><th className="py-1 pr-3">Hoa hồng</th><th className="py-1">Thưởng</th></tr>
                </thead>
                <tbody className="text-gray-700">
                  {tiers.map((t) => (
                    <tr key={t.key} className="border-t border-amber-100">
                      <td className="py-1 pr-3">{t.label}</td>
                      <td className="py-1 pr-3 font-semibold">{t.rate_percent}%</td>
                      <td className="py-1 font-semibold">{t.bonus_amount ? fmt(t.bonus_amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {salers.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">Tháng {month} — mức đang áp dụng</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {salers.map((s) => (
                  <div key={s.id} className="rounded-xl border border-amber-100 bg-white p-3 text-xs">
                    <p className="font-semibold text-gray-900">{s.full_name}</p>
                    <p className="text-gray-500">Doanh số: {fmt(s.tier_revenue)}</p>
                    <p className="text-gray-700">
                      HH <b>{(Number(s.commission_rate) * 100).toFixed(1)}%</b>{s.rate_source === 'override' ? ' (chỉnh tay)' : ''}
                      {' · '}Thưởng <b>{fmt(s.bonus_amount)}</b>{s.bonus_source === 'override' ? ' (chỉnh tay)' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleTierNotice;
