import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

const ConfirmModal = ({ 
  show, 
  onClose, 
  onConfirm, 
  title = "Xác nhận", 
  message = "Bạn có chắc chắn muốn thực hiện hành động này?",
  confirmLabel = "Đồng ý",
  cancelLabel = "Hủy bỏ",
  type = "primary", // primary, danger, warning
  icon = <AlertTriangle size={32} />
}) => {
  if (!show) return null;

  const typeStyles = {
    primary: "bg-primary shadow-primary/20 hover:bg-primary/90 text-white",
    danger: "bg-red-500 shadow-red-200 hover:bg-red-600 text-white",
    warning: "bg-orange-500 shadow-orange-200 hover:bg-orange-600 text-white"
  };

  const iconColors = {
    primary: "text-blue-500 bg-blue-50 border-blue-100",
    danger: "text-red-500 bg-red-50 border-red-100",
    warning: "text-orange-500 bg-orange-50 border-orange-100"
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[210] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div 
        className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border shadow-inner ${iconColors[type] || iconColors.primary}`}>
            {icon}
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-500 mb-8 font-medium px-4">
            {message}
          </p>
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-gray-50 text-gray-400 rounded-2xl font-bold uppercase tracking-widest hover:bg-gray-100 hover:text-gray-900 transition-all text-xs"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 py-4 rounded-2xl font-bold uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all text-xs ${typeStyles[type] || typeStyles.primary}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
