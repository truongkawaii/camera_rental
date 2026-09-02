export function BookingCard() {
  return (
    <form id="booking" className="animate-gentle-shake rounded-xl bg-white p-5 text-[#151312] shadow-2xl shadow-black/25 sm:p-7">
      <h2 className="text-xl font-bold">Tìm máy & kiểm tra lịch trống</h2>
      <p className="mt-1 text-sm text-[#77706b]">Chọn ngày, ngày thuê và nhận báo giá ngay</p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold">Chọn dòng máy</span>
          <select className="mt-2 h-12 w-full rounded-md border border-[#ded8d2] bg-white px-4 text-sm outline-none focus:border-black">
            <option>Canon R50</option>
            <option>Fujifilm X-T30</option>
            <option>DJI Pocket 3</option>
            <option>Instax Mini Evo</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Ngày nhận</span>
            <input className="mt-2 h-12 w-full rounded-md border border-[#ded8d2] px-4 text-sm outline-none focus:border-black" type="date" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Ngày trả</span>
            <input className="mt-2 h-12 w-full rounded-md border border-[#ded8d2] px-4 text-sm outline-none focus:border-black" type="date" />
          </label>
        </div>

        <button className="h-12 w-full rounded-md bg-black text-sm font-bold text-white transition duration-300 hover:-translate-y-0.5 hover:bg-[#2b2927] hover:shadow-lg hover:shadow-black/20 active:translate-y-0 active:scale-[0.98]" type="button">
          Kiểm tra lịch trống
        </button>
      </div>

      <a className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-[#6b625a]" href="#products">
        Xem tất cả máy ảnh <span aria-hidden>→</span>
      </a>
    </form>
  );
}
