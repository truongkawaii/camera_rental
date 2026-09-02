import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snappro - Thuê máy ảnh công nghệ",
  description: "Landing page thuê máy ảnh Snappro với form kiểm tra lịch trống.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
