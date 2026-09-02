const steps = [
  {
    title: "Chọn máy và ngày thuê",
    description: "Chọn máy phù hợp và kiểm tra lịch trống.",
  },
  {
    title: "Đặt cọc online",
    description: "Thanh toán cọc nhanh chóng, xác nhận đơn.",
  },
  {
    title: "Nhận máy",
    description: "Nhận tại cửa hàng hoặc ship tận nơi.",
  },
  {
    title: "Trả máy",
    description: "Trả máy đúng hẹn, hoàn tất đơn thuê.",
  },
];

export function ProcessSection() {
  return (
    <section className="bg-black py-16 text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 lg:grid-cols-[1fr_420px] lg:px-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase text-white/55">
            Quy trình thuê máy ảnh
          </p>
          <h2 className="mt-2 text-3xl font-bold lg:text-4xl">
            4 bước thuê máy siêu đơn giản
          </h2>

          <div className="mt-10 grid gap-5 sm:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.title} className="text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-white text-lg font-bold text-black">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          <a
            className="group mx-auto mt-10 flex h-12 w-fit items-center rounded-md border border-white/20 px-6 text-sm font-bold transition duration-300 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/10 hover:shadow-lg hover:shadow-black/30 active:translate-y-0 active:scale-[0.98]"
            href="#"
          >
            Hướng dẫn chi tiết <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">→</span>
          </a>
        </div>

        <img
          className="aspect-[5/3] rounded-lg object-cover"
          src="/images/unsplash/09-photo-1500634245200-e5245c7574ef.jpg"
          alt="Máy ảnh đặt trong studio"
        />
      </div>
    </section>
  );
}
