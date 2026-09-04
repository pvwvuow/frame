import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نواپلی | NovaPlay — دانلود و تماشای فیلم و سریال",
  description:
    "نرم‌افزار ویندوزی مبتنی بر الکترون برای دانلود و تماشای فیلم و سریال با طراحی Liquid Glass",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#06060a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
