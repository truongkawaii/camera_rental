import React from 'react';
import { AlertTriangle } from 'lucide-react';

const DeleteModal = ({ target, deleting, onConfirm, onCancel }) => {
  if (!target) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-white rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-red-100 rounded-full">
            <AlertTriangle size={28} className="text-red-600" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Xác nhận xóa</h2>
        <p className="text-gray-600 mb-6">
          Bạn có chắc muốn xóa{' '}
          <span className="font-semibold text-gray-900">"{target.name}"</span>?{' '}
          Hành động này không thể hoàn tác.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 font-medium disabled:opacity-60 transition-colors"
          >
            {deleting ? 'Đang xóa...' : 'Xóa'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg hover:bg-gray-200 font-medium transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
