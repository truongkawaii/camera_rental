import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Share, PlusSquare, CheckCircle2, Laptop, Info } from 'lucide-react';

export default function PWAInstallButton({ sidebarOpen, mobileMenuOpen }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
    }

    // Check for iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    // Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isInstalled) {
      setShowModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else {
      // If prompt is not available (iOS, or desktop manual install)
      setShowModal(true);
    }
  };

  const isOpen = sidebarOpen || mobileMenuOpen;

  return (
    <>
      <div className="px-3 py-2">
        {isOpen ? (
          <button
            onClick={handleInstallClick}
            type="button"
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group relative overflow-hidden ${
              isInstalled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-gradient-to-r from-orange-500/20 via-amber-500/15 to-orange-500/20 border-orange-500/40 hover:border-orange-400 hover:from-orange-500/30 text-white shadow-lg shadow-orange-950/20'
            }`}
          >
            {/* Ambient glow accent */}
            <div className={`absolute -right-6 -bottom-6 w-20 h-20 rounded-full blur-xl pointer-events-none ${
              isInstalled ? 'bg-emerald-500/20' : 'bg-orange-500/20'
            }`} />

            <div className={`p-2 rounded-lg shrink-0 transition-transform group-hover:scale-105 shadow-sm ${
              isInstalled 
                ? 'bg-emerald-500 text-white shadow-emerald-500/30' 
                : 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-500/30 animate-pulse'
            }`}>
              {isInstalled ? <CheckCircle2 size={18} /> : <Download size={18} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold truncate">
                  {isInstalled ? 'SnapPro Đã Cài Đặt' : 'Cài Đặt Ứng Dụng'}
                </span>
                {!isInstalled && (
                  <span className="px-1.5 py-0.2 text-[9px] font-bold bg-orange-500 text-white rounded-full uppercase tracking-tighter shrink-0">
                    PWA
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-gray-400 truncate mt-0.5">
                {isInstalled ? 'Mở trực tiếp từ máy' : 'Dùng mượt như App điện thoại'}
              </p>
            </div>
          </button>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleInstallClick}
              type="button"
              className={`p-2.5 rounded-xl border transition-all relative group ${
                isInstalled
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                  : 'bg-orange-500/20 border-orange-500/40 text-orange-400 hover:bg-orange-500/30 hover:border-orange-400'
              }`}
              title={isInstalled ? 'SnapPro Đã Cài Đặt' : 'Cài đặt ứng dụng SnapPro'}
            >
              {isInstalled ? <CheckCircle2 size={18} /> : <Download size={18} />}
              <span className="sr-only">Cài đặt ứng dụng</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Instruction Modal ─────────────────────────────────────── */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/70 z-[300] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                  <Smartphone size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-[16px] leading-tight">Cài Đặt SnapPro App</h3>
                  <p className="text-xs text-orange-100 mt-0.5">Trải nghiệm ứng dụng toàn màn hình</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white/90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {isInstalled ? (
                <div className="text-center py-4 space-y-3">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 size={36} />
                  </div>
                  <h4 className="font-bold text-slate-800 text-lg">Ứng Dụng Đã Được Cài Đặt!</h4>
                  <p className="text-sm text-slate-500 leading-relaxed px-4">
                    SnapPro đã có mặt trên thiết bị của bạn. Bạn có thể mở ứng dụng trực tiếp từ màn hình chính hoặc thanh tác vụ mà không cần mở trình duyệt.
                  </p>
                </div>
              ) : isIOS ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 font-medium">
                    Để cài đặt SnapPro trên thiết bị iOS (iPhone / iPad), vui lòng làm theo 3 bước:
                  </p>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="text-xs text-slate-700 leading-snug">
                        Nhấn vào nút <strong className="text-slate-900 inline-flex items-center gap-1 font-bold">Chia sẻ <Share size={13} className="text-blue-500 inline" /></strong> trên thanh công cụ của Safari (ở dưới cùng màn hình iPhone hoặc trên cùng của iPad).
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="text-xs text-slate-700 leading-snug">
                        Cuộn xuống danh sách tùy chọn và chọn <strong className="text-slate-900 inline-flex items-center gap-1 font-bold">"Thêm vào MH chính" <PlusSquare size={13} className="text-slate-700 inline" /></strong> (Add to Home Screen).
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="text-xs text-slate-700 leading-snug">
                        Nhấn nút <strong className="text-orange-600 font-bold">"Thêm" (Add)</strong> ở góc trên bên phải màn hình để hoàn tất.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 font-medium">
                    Để cài đặt SnapPro làm ứng dụng độc lập trên máy tính hoặc điện thoại Android:
                  </p>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="text-xs text-slate-700 leading-snug">
                        Nhìn lên thanh địa chỉ trình duyệt (Chrome / Edge), tìm biểu tượng <strong className="text-orange-600 font-bold">Cài đặt ứng dụng 📥</strong> hoặc <strong className="text-slate-900 font-bold">⊕</strong>.
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="text-xs text-slate-700 leading-snug">
                        Hoặc nhấn vào Menu trình duyệt <strong className="text-slate-900 font-bold">(⋮)</strong> -&gt; chọn <strong className="text-orange-600 font-bold">"Cài đặt SnapPro..."</strong> hoặc <strong className="text-slate-900 font-bold">"Thêm vào màn hình chính"</strong>.
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="text-xs text-slate-700 leading-snug">
                        Xác nhận <strong className="text-orange-600 font-bold">"Cài đặt"</strong>. Biểu tượng SnapPro sẽ xuất hiện trên Desktop hoặc màn hình ứng dụng của bạn!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action button */}
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full py-3 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-lg active:scale-[0.98]"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
