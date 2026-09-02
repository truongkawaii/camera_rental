import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

const DeleteModal = ({ target, onConfirm, onCancel, deleting }) => {
  if (!target) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 border border-red-100">
            <Trash2 size={32} />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Xác nhận xóa?</h3>
          <p className="text-gray-500 mb-8 font-medium px-4">
            Bạn có chắc chắn muốn xóa đơn thuê của <span className="text-gray-900 font-semibold">{target.customer_name}</span>? Hành động này không thể hoàn tác.
          </p>
          <div className="flex gap-4">
            <button
              onClick={onCancel}
              className="flex-1 py-4 bg-gray-50 text-gray-400 rounded-2xl font-bold uppercase tracking-widest hover:bg-gray-100 hover:text-gray-900 transition-all"
            >
              Hủy bỏ
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-red-200 hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {deleting ? 'Đang xóa...' : 'Đồng ý xóa'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
