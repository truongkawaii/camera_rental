'use client';

import { useRef } from 'react';
import type { PublicEquipment } from './ProductSection';

const conditionStyles: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  fair: 'bg-amber-50 text-amber-600 ring-amber-100',
  poor: 'bg-red-50 text-red-600 ring-red-100',
};

const conditionLabels: Record<string, string> = {
  good: 'T\u1ed1t',
  fair: 'Trung b\u00ecnh',
  poor: 'K\u00e9m',
};

function formatCurrency(value: PublicEquipment['price_per_day']) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function getTag(product: PublicEquipment) {
  if (product.brand && product.model) return `${product.brand} ${product.model}`;
  return product.category || 'May anh';
}

type ProductCarouselProps = {
  products: PublicEquipment[];
};

export function ProductCarousel({ products }: ProductCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollProducts = (direction: 'prev' | 'next') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const firstCard = scroller.querySelector('article');
    const cardWidth =
      firstCard instanceof HTMLElement ? firstCard.offsetWidth : 236;
    const gap = 20;
    const visibleCards = Math.max(1, Math.floor(scroller.clientWidth / (cardWidth + gap)));
    const distance = (cardWidth + gap) * Math.min(visibleCards, 3);

    scroller.scrollBy({
      left: direction === 'next' ? distance : -distance,
      behavior: 'smooth',
    });
  };

  return (
    <div className='relative'>
      <button
        className='absolute -left-3 top-[42%] z-10 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-[#e3d9cf] bg-white text-lg shadow-sm transition hover:bg-[#f7f3ee] active:scale-95 lg:grid'
        type='button'
        aria-label='San pham truoc'
        onClick={() => scrollProducts('prev')}
      >
        &lt;
      </button>

      <div
        ref={scrollerRef}
        className='flex snap-x gap-5 overflow-x-auto scroll-smooth pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {products.map((product) => {
          const condition = product.condition || 'good';
          const label = conditionLabels[condition] || condition;

          return (
            <article
              key={product.id}
              className='group w-[236px] shrink-0 snap-start cursor-pointer rounded-lg border border-[#e6e0da] bg-white p-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#d8cfc5] hover:shadow-lg'
            >
              <div className='relative aspect-[4/3] overflow-hidden rounded-md bg-[#f7f4f1]'>
                <img
                  className='h-full w-full object-contain p-3 transition duration-500 group-hover:scale-105'
                  src={
                    product.image ||
                    '/images/unsplash/10-photo-1502920917128-1aa500764cbd.jpg'
                  }
                  alt={product.name}
                />
                <span
                  className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold ring-1 ${conditionStyles[condition] || conditionStyles.good}`}
                >
                  {label}
                </span>
              </div>

              <p className='mt-4 truncate text-xs font-semibold text-[#8a8178]'>
                {getTag(product)}
              </p>
              <h3 className='mt-1 min-h-8 font-bold leading-5'>
                {product.name}
              </h3>

              <div className='mt-0 flex items-center gap-2 text-sm'>
                <span className='text-base leading-none text-[#f1b540]'>★</span>
                <span>4.9/5</span>
                <span className='text-[#8a8178]'>
                  [{product.rental_count || 0} l&#432;&#7907;t]
                </span>
              </div>

              <p className='mt-2 text-lg font-bold'>
                {formatCurrency(product.price_per_day)}&#273;
                <span className='text-xs font-semibold text-[#7a736c]'>
                  {' '}
                  /ng&agrave;y
                </span>
              </p>

              <button className='group/btn mt-4 flex h-10 w-full items-center justify-center rounded-md border border-[#d6cec5] text-sm font-bold transition duration-300 hover:-translate-y-0.5 hover:border-black hover:bg-black hover:text-white hover:shadow-md active:translate-y-0 active:scale-[0.98]'>
                Thu&ecirc; ngay
                <span className='ml-2 transition-transform duration-300 group-hover/btn:translate-x-1'>
                  -&gt;
                </span>
              </button>
            </article>
          );
        })}
      </div>

      <button
        className='absolute -right-3 top-[42%] z-10 hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-[#e3d9cf] bg-white text-lg shadow-sm transition hover:bg-[#f7f3ee] active:scale-95 lg:grid'
        type='button'
        aria-label='San pham tiep theo'
        onClick={() => scrollProducts('next')}
      >
        &gt;
      </button>
    </div>
  );
}
