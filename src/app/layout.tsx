import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "قاب | GHAB — سینمای شخصی شما",
  description:
    "نرم‌افزار ویندوزی مبتنی بر الکترون برای تماشا و دانلود فیلم و سریال — طراحی مبتنی بر زبان بصری Field Kit (لایک‌فیلد، هالیشن، گرین فیلم، تایم‌کد).",
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* IBM Plex Mono — technical OSD/timecode labels */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-coal text-ink">{children}</body>
    </html>
  );
}
