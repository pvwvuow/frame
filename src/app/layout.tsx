import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import QuickViewProvider from "@/components/quickview/QuickViewProvider";
import LibraryProvider from "@/components/library/LibraryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "نما | سینمای آنلاین", template: "%s | نما" },
  description: "تماشای آنلاین جدیدترین فیلم‌ها و سریال‌ها با کیفیت 4K در نما",
  applicationName: "نما",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#070709",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <LibraryProvider>
          <QuickViewProvider>
            <Navbar />
            <div className="min-h-screen">{children}</div>
            <Footer />
          </QuickViewProvider>
        </LibraryProvider>
        <Toaster
          position="bottom-center"
          dir="rtl"
          theme="dark"
          richColors
          closeButton
          toastOptions={{
            className: "font-body",
            style: { fontFamily: "var(--font-sans)", background: "#16161c", border: "1px solid rgba(255,255,255,0.1)", color: "#f4f4f5" },
          }}
        />
      </body>
    </html>
  );
}
