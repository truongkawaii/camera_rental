const testimonials = [
  [
    "Thanh Huyền",
    "Máy đẹp, dễ dùng, nhân viên nhiệt tình. Mình thuê R50 đi Đà Lạt, ảnh chụp rất ổn.",
    "/images/unsplash/16-photo-1524250502761-1ac6f2e30d43.jpg",
  ],
  [
    "Minh Đức",
    "Thủ tục nhanh gọn, đặt cọc online xong là nhận máy luôn. Sẽ ủng hộ Snappro dài dài.",
    "/images/unsplash/17-photo-1500648767791-00dcc994a43e.jpg",
  ],
  [
    "Ngọc Anh",
    "Thuê Pocket 3 quay vlog siêu mượt, pin trâu. Giá hợp lý, dịch vụ quá ổn.",
    "/images/unsplash/18-photo-1494790108377-be9c29b29330.jpg",
  ],
];

export function TestimonialsSection() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-[0.08em] text-[#b58a4a]">
          Khách hàng nói gì về chúng tôi?
        </p>
        <h2 className="mt-2 text-center text-3xl font-bold lg:text-4xl">
          Đánh giá từ khách hàng
        </h2>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {testimonials.map(([name, quote, image]) => (
            <article
              key={name}
              className="rounded-lg border border-[#e6e0da] p-6"
            >
              <div className="flex items-center gap-3">
                <img
                  className="size-12 rounded-full object-cover"
                  src={image}
                  alt={name}
                />
                <div>
                  <h3 className="font-bold">{name}</h3>
                  <p className="text-sm text-[#f1b540]">★★★★★</p>
                </div>
              </div>
              <p className="mt-5 leading-7 text-[#514b45]">“{quote}”</p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((item) => (
                  <img
                    key={item}
                    className="aspect-square rounded-md object-cover"
                    src={image}
                    alt=""
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
