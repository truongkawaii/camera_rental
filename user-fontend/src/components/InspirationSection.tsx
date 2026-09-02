const photos = [
  '/images/unsplash/02-photo-1508214751196-bcfd4ca60f91.jpg',
  '/images/unsplash/02-photo-1508214751196-bcfd4ca60f91.jpg',
  '/images/unsplash/04-photo-1500530855697-b586d89ba3ee.jpg',
  '/images/unsplash/05-photo-1492691527719-9d1e07e534b4.jpg',
  '/images/unsplash/06-photo-1524504388940-b1c1722653e1.jpg',
  '/images/unsplash/07-photo-1519741497674-611481863552.jpg',
];

export function InspirationSection() {
  return (
    <section className='bg-white pb-16'>
      <div className='mx-auto max-w-7xl px-5 lg:px-8'>
        <p className='text-center text-xs font-bold uppercase tracking-[0.08em] text-[#b58a4a]'>
          Cảm hứng từ Snappro
        </p>
        <h2 className='mt-2 text-center text-3xl font-bold'>
          Những khoảnh khắc được ghi lại
        </h2>

        <div className='mt-8 grid grid-cols-2 gap-4 lg:grid-cols-6'>
          {photos.map((photo) => (
            <img
              key={photo}
              className='aspect-[4/3] rounded-lg object-cover'
              src={photo}
              alt='Khoảnh khắc khách hàng'
            />
          ))}
        </div>

        <div className='mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr]'>
          <div className='rounded-lg bg-[#f7f3ee] p-7'>
            <div className='flex items-start gap-4'>
              <span className='mt-1 grid size-8 shrink-0 place-items-center text-[#7c7167] [&_svg]:size-6 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round'>
                <svg viewBox='0 0 24 24' aria-hidden='true'>
                  <path d='M6 10.5V20h12v-9.5' />
                  <path d='M4 10.5 12 4l8 6.5' />
                  <path d='M9 20v-5a3 3 0 0 1 6 0v5' />
                  <path d='M8.5 11h7' />
                </svg>
              </span>
              <div>
                <p className='text-[11px] font-bold uppercase tracking-[0.08em] text-[#9b948c]'>
                  Ghé cửa hàng Snappro
                </p>
                <h3 className='mt-2 text-xl font-bold leading-snug'>
                  Trải nghiệm máy trực tiếp tại cửa hàng
                </h3>
                <p className='mt-3 text-sm text-[#6d6660]'>
                  Giờ mở cửa 08:30 - 20:30 tất cả các ngày.
                </p>
              </div>
            </div>
            <a
              className='group mt-5 inline-flex h-10 items-center rounded-md bg-black px-5 text-sm font-bold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#2b2927] hover:shadow-lg hover:shadow-black/20 active:translate-y-0 active:scale-[0.98]'
              href='#'
            >
              Xem đường đi <span className='ml-2 transition-transform duration-300 group-hover:translate-x-1'>→</span>
            </a>
          </div>

          <div className='min-h-[260px] overflow-hidden rounded-lg bg-[#f7f3ee] hidden md:block lg:block md:order-3 md:col-span-2 lg:order-none lg:col-span-1'>
            <iframe
              src='https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3724.8274215181054!2d105.8226519!3d20.9995539!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3135ac85e42ff225%3A0x77145625b331440!2zMjggTmcuIDEyIFAuIE5ndXnhu4VuIE5n4buNYyBO4bqhaSwgUGjGsMahbmcgTGnhu4d0LCBIw6AgTuG7mWksIFZp4buHdCBOYW0!5e0!3m2!1svi!2s!4v1780978881135!5m2!1svi!2s'
              className='block h-[280px] w-full md:h-[320px] lg:h-full lg:min-h-[260px]'
              style={{ border: 0 }}
              allowFullScreen
              loading='lazy'
              referrerPolicy='no-referrer-when-downgrade'
              title='Bản đồ cửa hàng Snappro'
            />
          </div>

          <div className='rounded-lg bg-[#f7f3ee] p-8'>
            <p className='text-xs font-bold uppercase text-[#8a8178]'>
              Thông tin liên hệ
            </p>
            <div className='mt-5 space-y-4 text-sm font-semibold text-[#1f1d1b]'>
              <p className='flex gap-4'>
                <span className='mt-0.5 grid size-5 shrink-0 place-items-center text-[#7c7167] [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round'>
                  <svg viewBox='0 0 24 24' aria-hidden='true'>
                    <path d='M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6A2 2 0 0 1 22 16.9Z' />
                  </svg>
                </span>
                <span>
                  0063 964 576
                  <span className='block text-xs font-normal text-[#7a736c]'>
                    Hotline / Zalo
                  </span>
                </span>
              </p>
              <p className='flex gap-4'>
                <span className='mt-0.5 grid size-5 shrink-0 place-items-center text-[#7c7167] [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round'>
                  <svg viewBox='0 0 24 24' aria-hidden='true'>
                    <path d='M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z' />
                    <circle cx='12' cy='10' r='2.5' />
                  </svg>
                </span>
                <span>56 28, ngõ 12 Nguyễn Ngọc Nại, Thanh Xuân, Hà Nội</span>
              </p>
              <p className='flex gap-4'>
                <span className='mt-0.5 grid size-5 shrink-0 place-items-center text-[#7c7167] [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round'>
                  <svg viewBox='0 0 24 24' aria-hidden='true'>
                    <rect x='3' y='3' width='18' height='18' rx='5' />
                    <circle cx='12' cy='12' r='3.2' />
                    <path d='M16.8 7.2h.01' />
                  </svg>
                </span>
                <a
                  className="transition hover:text-[#1877f2]"
                  href="https://www.facebook.com/tiemthuemayanh237"
                  target="_blank"
                  rel="noreferrer"
                >
                  fb.com/tiemthuemayanh237
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
