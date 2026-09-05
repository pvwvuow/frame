import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import QuickViewProvider from "@/components/quickview/QuickViewProvider";
import LibraryProvider from "@/components/library/LibraryProvider";
import ThemeProvider from "@/components/theme/ThemeProvider";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import CommandPalette from "@/components/CommandPalette";
import ElectronBridge from "@/components/electron/ElectronBridge";
import { getT } from "@/lib/i18n/server";
import { LOCALE_META, dirOf } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: t("app.metaTitle"), template: `%s | ${t("app.name")}` },
    description: t("app.metaDesc"),
    applicationName: t("app.name"),
    icons: { icon: "/favicon.svg" },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070709" },
    { media: "(prefers-color-scheme: light)", color: "#f3f3f7" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getT();
  return (
    <html lang={LOCALE_META[locale].htmlLang} dir={dirOf(locale)} data-locale={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <ThemeProvider>
          <LocaleProvider initial={locale}>
            <LibraryProvider>
              <QuickViewProvider>
                <Navbar />
                <div className="min-h-screen">{children}</div>
                <Footer />
                <CommandPalette />
                <ElectronBridge />
              </QuickViewProvider>
            </LibraryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
