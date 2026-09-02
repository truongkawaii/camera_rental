const brands = [
  { name: 'Canon', src: '/brands/canon.svg', className: 'w-[112px]' },
  { name: 'FUJIFILM', src: '/brands/fujifilm.svg', className: 'w-[128px]' },
  { name: 'SONY', src: '/brands/sony.svg', className: 'w-[104px]' },
  { name: 'DJI', src: '/brands/dji.svg', className: 'w-[62px]' },
  { name: 'instax', src: '/brands/instax.svg', className: 'w-[130px]' },
  { name: 'RØDE', src: '/brands/rode.svg', className: 'w-[82px]' },
];

export function BrandStrip() {
  return (
    <section className='border-b border-[#e8dfd5] bg-[#f7f3ee]'>
      <div className='mx-auto grid max-w-7xl grid-cols-2 items-center gap-6 px-5 py-10 sm:grid-cols-3 lg:grid-cols-6 lg:px-8'>
        {brands.map((brand) => (
          <div
            key={brand.name}
            className='flex h-12 items-center justify-center'
          >
            <img
              className={`block h-auto object-contain brightness-0 ${brand.className}`}
              src={brand.src}
              alt={`${brand.name} logo`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
