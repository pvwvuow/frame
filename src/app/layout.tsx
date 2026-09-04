import type { Metadata } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "نما | سینمای آنلاین",
  description: "تماشای آنلاین جدیدترین فیلم‌ها و سریال‌ها با کیفیت 4K در نما",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <Navbar />
        <div className="min-h-screen">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
