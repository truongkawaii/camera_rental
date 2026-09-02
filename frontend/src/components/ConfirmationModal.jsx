import React from 'react';
import { X, AlertTriangle, Info, Trash2, Lock, HelpCircle } from 'lucide-react';

const ConfirmationModal = ({ 
  show, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = 'Xác nhận', 
  cancelText = 'Hủy',
  type = 'warning', // 'warning', 'danger', 'info', 'success', 'lock'
  loading = false
}) => {
  if (!show) return null;

  const icons = {
    warning: <AlertTriangle className="text-amber-500" size={32} />,
    danger: <Trash2 className="text-red-500" size={32} />,
    info: <Info className="text-blue-500" size={32} />,
    lock: <Lock className="text-primary" size={32} />,
    question: <HelpCircle className="text-gray-500" size={32} />
  };

  const buttonColors = {
    warning: 'bg-amber-500 hover:bg-amber-600',
    danger: 'bg-red-500 hover:bg-red-600',
    info: 'bg-blue-500 hover:bg-blue-600',
    lock: 'bg-primary hover:opacity-90',
    question: 'bg-gray-600 hover:bg-gray-700'
  };

  const bgColors = {
    warning: 'bg-amber-50',
    danger: 'bg-red-50',
    info: 'bg-blue-50',
    lock: 'bg-primary/10',
    question: 'bg-gray-50'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className={`mx-auto w-16 h-16 ${bgColors[type] || bgColors.warning} rounded-2xl flex items-center justify-center mb-4`}>
            {icons[type] || icons.warning}
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-gray-500 text-sm leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold text-white shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${buttonColors[type] || buttonColors.warning}`}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
