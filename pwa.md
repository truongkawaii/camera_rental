Hướng dẫn hoàn thiện PWA
Hệ thống đã được cài đặt sẵn Vite PWA Plugin (vite-plugin-pwa) để hỗ trợ cài đặt ứng dụng web (Progressive Web App - PWA) và lưu trữ ngoại tuyến (offline caching).

Tuy nhiên, để PWA hoạt động hoàn hảo và có thể cài đặt được trên mọi thiết bị (iOS, Android, Desktop), bạn cần bổ sung các tài nguyên đồ họa (icons) sau:

1. Chuẩn bị ảnh Icon
   Bạn cần tạo các file ảnh định dạng .png cho logo của hệ thống và đặt chúng vào thư mục frontend/public/.

Các file cần thiết (đúng tên và kích thước):

pwa-192x192.png (Kích thước 192x192 px)
pwa-512x512.png (Kích thước 512x512 px)
apple-touch-icon.png (Kích thước 180x180 px - Dành cho thiết bị iOS)
favicon.ico hoặc favicon.svg (Nếu bạn muốn đổi favicon) 2. Cập nhật index.html (Tuỳ chọn cho iOS)
Trong file frontend/index.html, bạn có thể bổ sung thẻ meta để tối ưu hiển thị trên iOS (nằm trong thẻ <head>):

html

<meta name="theme-color" content="#ffffff">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
3. Kiểm tra
Chạy npm run build để đảm bảo PWA manifest và service worker được sinh ra (các file sw.js và manifest.webmanifest).
Dùng npm run preview hoặc deploy lên hosting có hỗ trợ HTTPS để kiểm tra tính năng "Install App" trên trình duyệt.
