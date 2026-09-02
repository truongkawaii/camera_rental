import { BookingCard } from './BookingCard';

const benefits = [
  {
    label: 'Nhiều dòng máy cao cấp',
    icon: (
      <svg viewBox='0 0 24 24' aria-hidden='true'>
        <path d='M4 8.5h3.1l1.4-2h7l1.4 2H20a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z' />
        <circle cx='12' cy='14' r='3.6' />
        <path d='M18.5 11.2h.01' />
      </svg>
    ),
  },
  {
    label: 'Giá thuê cạnh tranh',
    icon: (
      <svg viewBox='0 0 24 24' aria-hidden='true'>
        <circle cx='12' cy='12' r='9' />
        <path d='M12 6.8v10.4M15.2 9.2c-.5-1-1.6-1.6-3-1.6-1.7 0-3 .9-3 2.3 0 1.5 1.4 2 3.1 2.4 1.8.4 3 .9 3 2.4 0 1.4-1.3 2.3-3.2 2.3-1.6 0-2.9-.7-3.4-1.9' />
      </svg>
    ),
  },
  {
    label: 'Hỗ trợ setup tận tình',
    icon: (
      <svg viewBox='0 0 24 24' aria-hidden='true'>
        <path d='m14.6 6.4 3-3a3.2 3.2 0 0 1 2.1 4.2l-3.1.6-.6 3.1a3.2 3.2 0 0 1-4.2-2.1l-8 8a2.1 2.1 0 0 0 3 3l8-8' />
        <path d='m5 15 4 4' />
      </svg>
    ),
  },
  {
    label: 'Nhận tại cửa hàng hoặc ship tận nơi',
    icon: (
      <svg viewBox='0 0 24 24' aria-hidden='true'>
        <path d='M5 9h14l-1 11H6L5 9Z' />
        <path d='M9 9V7a3 3 0 0 1 6 0v2' />
        <path d='M3.5 9h17' />
        <path d='M8.5 13.5h7' />
      </svg>
    ),
  },
];

export function HeroSection() {
  return (
    <section className='relative overflow-hidden bg-black text-white'>
      <img
        className='absolute inset-0 h-full w-full object-cover opacity-50'
        src='/images/unsplash/02-photo-1508214751196-bcfd4ca60f91.jpg'
        alt='Nhiếp ảnh gia cầm máy ảnh'
      />
      <div className='absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/25' />

      <div className='relative mx-auto grid min-h-[760px] max-w-7xl items-center gap-10 px-5 pb-16 pt-32 lg:grid-cols-[1fr_390px] lg:px-8'>
        <div className='max-w-2xl'>
          <h1 className='max-w-[640px] text-[42px] font-bold leading-[0.98] tracking-normal sm:text-[56px] lg:text-[64px]'>
            <span className='block'>Thuê máy ảnh</span>
            <span className='block'>
              <span className="font-['Georgia','Times_New_Roman',serif] text-[1.12em] font-normal italic leading-none text-[#f1dcc0]">
                dễ
              </span>{' '}
              <span>như đặt xe</span>
            </span>
            <span className='block'>công nghệ</span>
          </h1>
          <p className='mt-6 max-w-md text-lg font-medium leading-8 text-white/82'>
            Máy ảnh xịn - Giá dễ thuê
            <span className='block'>Có cửa hàng chính thức</span>
          </p>

          <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {benefits.map((benefit) => (
              <div
                key={benefit.label}
                className='flex items-center gap-3 text-sm font-semibold text-white/85'
              >
                <span className='grid size-10 shrink-0 place-items-center text-white [&_svg]:size-7 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.9] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round'>
                  {benefit.icon}
                </span>
                {benefit.label}
              </div>
            ))}
          </div>

          <div className='mt-10 flex items-center gap-4'>
            <div className='flex -space-x-3'>
              {['TH', 'MD', 'NA', 'QA'].map((name) => (
                <span
                  key={name}
                  className='grid size-11 place-items-center rounded-full border-2 border-black bg-[#ead9c3] text-xs font-bold text-black'
                >
                  {name}
                </span>
              ))}
            </div>
            <div>
              <div className='text-[#f5c665]'>
                ★★★★★{' '}
                <span className='text-sm font-boldclassName="h-full antialiased mdl-js"'>
                  4.9/5
                </span>
              </div>
              <p className='text-sm text-white/68'>
                500+ khách hàng đã trải nghiệm
              </p>
            </div>
          </div>
        </div>

        <BookingCard />
      </div>
    </section>
  );
}
