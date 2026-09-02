export function Footer() {
  return (
    <footer className="bg-white pb-8">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="rounded-lg bg-black p-5 text-white lg:flex lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <span className="grid size-12 shrink-0 place-items-center text-[#d7a35d] [&_svg]:size-10 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:stroke-linecap-round [&_svg]:stroke-linejoin-round">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12v9H4v-9" />
                <path d="M2 7h20v5H2z" />
                <path d="M12 7v14" />
                <path d="M12 7H7.5A2.5 2.5 0 1 1 10 4.5C10 6 12 7 12 7Z" />
                <path d="M12 7h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7Z" />
              </svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-[#d7a35d]">
                Ưu đãi dành riêng cho bạn!
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Nhập email để nhận 10% khi thuê máy lần đầu tại Snappro.
              </p>
            </div>
          </div>

          <form className="mt-5 flex gap-2 lg:mt-0">
            <input
              className="h-12 min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-4 text-sm outline-none"
              placeholder="Nhập email của bạn"
            />
            <button
              className="h-12 rounded-md bg-[#e8d3b7] px-5 text-sm font-bold text-black transition duration-300 hover:-translate-y-0.5 hover:bg-[#f0ddc4] hover:shadow-lg hover:shadow-black/30 active:translate-y-0 active:scale-[0.98]"
              type="button"
            >
              Nhận ưu đãi
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 lg:px-10">
        <div className="mt-8 grid gap-8 border-t border-[#e6e0da] pt-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <img
              className="h-[62px] w-auto max-w-[240px] object-contain"
              src="/snapcamera-logo-new.png"
              alt="Snappro - Tiệm thuê máy ảnh"
            />
            <p className="mt-3 text-sm leading-6 text-[#6d6660]">
              Thuê máy ảnh dễ như đặt xe công nghệ.
            </p>
            <div className="mt-4 flex items-center gap-4 text-black [&_svg]:size-5 [&_svg]:fill-current">
              <a href="#" aria-label="Facebook">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 8.5h2.2V5.1c-.4-.1-1.7-.2-3.1-.2-3.1 0-5.1 1.9-5.1 5.4v3H4.6V17H8v7h4.1v-7h3.4l.5-3.7h-3.9v-2.6c0-1.1.3-2.2 1.9-2.2Z" />
                </svg>
              </a>
              <a href="#" aria-label="Instagram">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 2A3.8 3.8 0 0 0 4 7.8v8.4A3.8 3.8 0 0 0 7.8 20h8.4a3.8 3.8 0 0 0 3.8-3.8V7.8A3.8 3.8 0 0 0 16.2 4H7.8Zm4.2 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm5-2.3a1 1 0 1 1 0 2.1 1 1 0 0 1 0-2.1Z" />
                </svg>
              </a>
              <a href="#" aria-label="TikTok">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.4 3c.5 3 2.2 4.8 5.1 5v3.4c-1.7.2-3.2-.4-5-1.5v6.3c0 8-8.7 10.5-12.2 4.8-2.3-3.7-.9-10.1 6.4-10.4v3.6c-.6.1-1.2.2-1.7.4-1.7.6-2.6 2.2-2.1 3.7 1 2.9 5.8 2.4 5.8-1.9V3h3.7Z" />
                </svg>
              </a>
            </div>
          </div>
          {["Dịch vụ", "Hỗ trợ", "Thông tin"].map((title) => (
            <div key={title}>
              <h4 className="font-bold">{title}</h4>
              <div className="mt-3 grid gap-2 text-sm text-[#6d6660]">
                <a href="#">Thuê máy ảnh</a>
                <a href="#">Combo thuê</a>
                <a href="#">Hướng dẫn</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
