import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "قاب | GHAB — Liquid Cinema",
  description:
    "نرم‌افزار ویندوزی مبتنی بر الکترون برای تماشا و دانلود فیلم و سریال — ترکیب Liquid Glass و Field Kit: پنل‌های شیشه‌ای، عمق، جؤاله‌های اورورا، گرین فیلم و هالیشن.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#04060F",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* IBM Plex Mono — technical OSD/timecode labels · Space Grotesk — liquid display type */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-[#04060F]">{children}</body>
    </html>
  );
}
