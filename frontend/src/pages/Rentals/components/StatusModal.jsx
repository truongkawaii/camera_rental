import React from 'react';
import { X, Edit2 } from 'lucide-react';

const StatusModal = ({ statusTarget, quickStatus, setQuickStatus, onSave, onCancel, savingStatus, STATUS_MAP }) => {
  if (!statusTarget) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Edit2 size={18} className="text-primary" />
            Cập nhật trạng thái
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400">
            <X size={20} />
          </button>
        </div>
        <div className="p-8">
          <p className="text-sm text-gray-500 mb-6 font-medium">
            Thay đổi trạng thái cho đơn thuê của <span className="text-gray-900 font-semibold">{statusTarget.customer_name}</span>
          </p>
          <div className="grid grid-cols-1 gap-3">
            {Object.entries(STATUS_MAP).map(([key, info]) => (
              <button
                key={key}
                onClick={() => setQuickStatus(key)}
                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                  quickStatus === key
                    ? 'border-primary bg-primary/5 ring-4 ring-primary/10'
                    : 'border-gray-100 hover:border-gray-200 bg-white'
                }`}
              >
                <span className="font-semibold text-gray-700">{info.label}</span>
                {quickStatus === key && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={onSave}
            disabled={savingStatus}
            className="w-full mt-8 py-4 bg-primary text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-primary/30 hover:shadow-primary/40 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {savingStatus ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatusModal;
