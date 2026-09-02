const reasons = [
  "Máy ảnh chính hãng, chất lượng, bảo dưỡng định kỳ",
  "Giá thuê minh bạch, không phát sinh chi phí ẩn",
  "Hỗ trợ setup & hướng dẫn sử dụng tận tình",
  "Thủ tục nhanh gọn, hỗ trợ online 24/7",
  "Linh hoạt đổi máy nếu không phù hợp",
];

const stats = [
  {
    value: "500+",
    label: "Khách hàng tin tưởng",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M3 20a5.5 5.5 0 0 1 11 0" />
        <path d="M16.5 11.5a3 3 0 1 0-1.3-5.7" />
        <path d="M15.5 15.2A5 5 0 0 1 21 20" />
      </svg>
    ),
  },
  {
    value: "50+",
    label: "Dòng máy & phụ kiện",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h3l1.3-2h7.4L17 9h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="14.5" r="3.3" />
      </svg>
    ),
  },
  {
    value: "100%",
    label: "Máy chính hãng",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.5V6a5 5 0 0 1 10 0v2.5" />
        <path d="M5 8.5h14l-1 12H6L5 8.5Z" />
        <path d="m9 14 2 2 4-4" />
      </svg>
    ),
  },
];

export function StoreSection() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-2 lg:px-8">
        <img
          className="aspect-[4/3] rounded-lg object-cover"
          src="/images/unsplash/15-photo-1512790182412-b19e6d62bc39.jpg"
          alt="Cửa hàng máy ảnh"
        />

        <div>
          <span className="inline-flex rounded-sm bg-[#f1dfc8] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6b4b25]">
            Vì sao chọn Snappro?
          </span>
          <h2 className="mt-3 max-w-xl text-3xl font-bold leading-tight lg:text-4xl">
            Tiệm thuê máy ảnh có cửa hàng chính thức
          </h2>

          <ul className="mt-6 space-y-3">
            {reasons.map((reason) => (
              <li key={reason} className="flex gap-3 text-[#4f4943]">
                <span className="mt-0.5 text-[#8b8176]">✓</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.value} className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center text-[#b58a4a] [&_svg]:size-8 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
                  {stat.icon}
                </span>
                <span>
                  <strong className="block text-xl font-bold text-black">
                    {stat.value}
                  </strong>
                  <span className="text-xs font-semibold text-[#746d66]">
                    {stat.label}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
