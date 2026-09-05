import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import QuickViewProvider from "@/components/quickview/QuickViewProvider";
import LibraryProvider from "@/components/library/LibraryProvider";
import ThemeProvider from "@/components/theme/ThemeProvider";
import CommandPalette from "@/components/CommandPalette";
import ElectronBridge from "@/components/electron/ElectronBridge";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "نما | سینمای آنلاین", template: "%s | نما" },
  description: "تماشای آنلاین جدیدترین فیلم‌ها و سریال‌ها با کیفیت 4K در نما",
  applicationName: "نما",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070709" },
    { media: "(prefers-color-scheme: light)", color: "#f3f3f7" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <ThemeProvider>
          <LibraryProvider>
            <QuickViewProvider>
              <Navbar />
              <div className="min-h-screen">{children}</div>
              <Footer />
              <CommandPalette />
              <ElectronBridge />
            </QuickViewProvider>
          </LibraryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
