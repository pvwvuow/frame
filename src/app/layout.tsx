import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "قاب | GHAB — Cinema OS",
  description:
    "نرم‌افزار ویندوزی مبتنی بر الکترون برای تماشا و دانلود فیلم و سریال — طراحی اتاق تاریک سینما: گرین فیلم، هالیشن، نورسوختگی و تایم‌کد.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0B0906",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-[#0B0906]">{children}</body>
    </html>
  );
}
