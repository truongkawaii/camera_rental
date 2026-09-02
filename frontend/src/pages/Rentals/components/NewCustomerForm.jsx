import React from 'react';
import { UserPlus, User, Phone, AlertTriangle } from 'lucide-react';

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const NewCustomerForm = ({ data = {}, onChange, error }) => {
  return (
    <div className={`bg-gray-50/50 p-6 rounded-[2rem] border ${error ? 'border-red-200 bg-red-50/30' : 'border-gray-100'} space-y-4 animate-in fade-in slide-in-from-top-2 duration-300`}>
      <div className="flex justify-between items-center mb-1">
        <h4 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
          <UserPlus size={14} />
          Đăng ký khách hàng mới
        </h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative group">
          <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Tên khách hàng"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className="w-full h-[35px] pl-8 pr-3 bg-white border border-gray-100 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-[13px] font-bold"
            required
          />
        </div>
        <div className="relative group">
          <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Số điện thoại (Tùy chọn)"
            value={data.phone}
            onChange={(e) => onChange({ ...data, phone: digitsOnly(e.target.value) })}
            className="w-full h-[35px] pl-8 pr-3 bg-white border border-gray-100 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-[13px] font-bold"
          />
        </div>
      </div>
      {error && (
        <div className="mt-2 text-xs font-semibold text-red-500 bg-red-50 px-3 py-2 rounded-lg border border-red-100 flex items-center gap-1.5">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}
    </div>
  );
};

export default NewCustomerForm;
