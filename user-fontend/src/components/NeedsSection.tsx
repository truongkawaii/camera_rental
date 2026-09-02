const needs = [
  ["Đi du lịch", "Gọn nhẹ, bền bỉ", "/images/unsplash/04-photo-1500530855697-b586d89ba3ee.jpg"],
  ["Chụp couple", "Ảnh đẹp, màu mịn", "/images/unsplash/07-photo-1519741497674-611481863552.jpg"],
  ["Quay vlog", "Video mượt, nét", "/images/unsplash/05-photo-1492691527719-9d1e07e534b4.jpg"],
  ["Người mới bắt đầu", "Dễ dùng, dễ làm quen", "/images/unsplash/06-photo-1524504388940-b1c1722653e1.jpg"],
  ["Retro sống ảo", "Style vintage, độc lạ", "/images/unsplash/08-photo-1519638399535-1b036603ac77.jpg"],
];

export function NeedsSection() {
  return (
    <section className="bg-white pb-16">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <span className="text-xs font-bold uppercase text-[#8a8178]">Chọn máy theo nhu cầu</span>
        <h2 className="mt-2 text-3xl font-bold">Bạn cần máy cho mục đích gì?</h2>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          {needs.map(([title, desc, image]) => (
            <article key={title} className="rounded-lg bg-[#f7f3ee] p-3">
              <img className="aspect-square w-full rounded-md object-cover" src={image} alt={title} />
              <h3 className="mt-4 text-center font-bold">{title}</h3>
              <p className="mt-1 text-center text-sm text-[#766f68]">{desc}</p>
            </article>
          ))}
          <a className="grid min-h-44 place-items-center rounded-lg bg-[#f7f3ee] p-6 text-center font-bold" href="#">
            Xem thêm nhu cầu khác <span className="block text-3xl">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
