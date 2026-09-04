import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "قاب | LUMINA — Cinema OS",
  description:
    "نرم‌افزار ویندوزی مبتنی بر الکترون برای تماشا و دانلود فیلم و سریال — پوستهٔ لومینا: مشکی اوبسیدین، میدان نور محیطی، شیشه‌های مات و گرادیان منشوری.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#05050A",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-[#05050A]">{children}</body>
    </html>
  );
}
