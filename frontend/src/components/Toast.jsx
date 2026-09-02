import React, { useState, useCallback, useMemo } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

/* ── Individual Toast ──────────────────────────────────────────── */
const Toast = ({ id, type, message, onClose }) => {
  const isError = type === 'error';
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border max-w-sm w-full
        animate-slideIn
        ${isError
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}
    >
      <div className="shrink-0 mt-0.5">
        {isError
          ? <XCircle size={18} className="text-red-500" />
          : <CheckCircle2 size={18} className="text-emerald-500" />
        }
      </div>
      <p className="flex-1 text-sm font-medium leading-snug">{message}</p>
      <button
        onClick={() => onClose(id)}
        className={`shrink-0 p-0.5 rounded-md transition-colors
          ${isError ? 'hover:bg-red-100' : 'hover:bg-emerald-100'}`}
      >
        <X size={14} />
      </button>
    </div>
  );
};

/* ── Toast Container ───────────────────────────────────────────── */
export const ToastContainer = ({ toasts, onClose }) => (
  <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
    {toasts.map((t) => (
      <div key={t.id} className="pointer-events-auto">
        <Toast {...t} onClose={onClose} />
      </div>
    ))}
  </div>
);

/* ── Hook ──────────────────────────────────────────────────────── */
export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  const toast = useMemo(() => ({
    error:   (msg) => addToast('error', msg),
    success: (msg) => addToast('success', msg),
  }), [addToast]);

  return { toasts, removeToast, toast };
};

export default Toast;
