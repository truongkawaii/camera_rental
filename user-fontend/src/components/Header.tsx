const navItems = ["Trang chủ", "Thuê máy ảnh", "Combo", "Hướng dẫn", "Blog", "Liên hệ"];

export function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-30 border-b border-white/10 bg-black/45 text-white backdrop-blur">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <a className="flex items-center" href="#">
          <img
            className="h-[40px] w-auto max-w-[190px] object-contain"
            src="/snapcamera-logo-white-header.png"
            alt="Snapcamera - Tiệm thuê máy ảnh"
          />
        </a>

        <nav className="hidden items-center gap-8 text-sm font-medium text-white/80 lg:flex">
          {navItems.map((item) => (
            <a
              key={item}
              className="relative py-2 transition hover:text-white after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-center after:scale-x-0 after:bg-white after:transition-transform after:duration-200 hover:after:scale-x-100"
              href="#"
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white" href="tel:00639645676">
            0063 964 576
          </a>
          <a className="rounded-md bg-[#e8d3b7] px-5 py-3 text-sm font-bold text-black transition duration-300 hover:-translate-y-0.5 hover:bg-[#f0ddc4] hover:shadow-lg hover:shadow-black/20 active:translate-y-0 active:scale-[0.98]" href="#booking">
            Đặt thuê ngay
          </a>
        </div>

        <button className="grid size-11 place-items-center rounded-md border border-white/20 text-2xl transition duration-300 hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0 active:scale-95 lg:hidden" aria-label="Mở menu">
          =
        </button>
      </div>
    </header>
  );
}
