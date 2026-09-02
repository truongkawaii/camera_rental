import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  const getPages = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages || 1 }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const pages = getPages();

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 py-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-100 transition-colors"
      >
        <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
      </button>

      {pages.map((page, index) => (
        page === '...' ? (
          <span key={`ellipsis-${index}`} className="w-6 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-gray-500 text-xs sm:text-base">
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg border text-[11px] sm:text-sm ${
              currentPage === page
                ? 'bg-primary text-white border-primary font-medium'
                : 'border-gray-300 hover:bg-gray-100 text-gray-700'
            } transition-colors`}
          >
            {page}
          </button>
        )
      ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-100 transition-colors"
      >
        <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
      </button>
    </div>
  );
};

export default Pagination;
