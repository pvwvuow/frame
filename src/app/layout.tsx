import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import QuickViewProvider from "@/components/quickview/QuickViewProvider";
import LibraryProvider from "@/components/library/LibraryProvider";
import ThemeProvider from "@/components/theme/ThemeProvider";
import LocaleProvider from "@/components/i18n/LocaleProvider";
import CommandPalette from "@/components/CommandPalette";
import WelcomeAuth from "@/components/auth/WelcomeAuth";
import ElectronBridge from "@/components/electron/ElectronBridge";
import HideOnPip from "@/components/HideOnPip";
import GlobalPlayer from "@/components/GlobalPlayer";
import CatalogGate from "@/components/mobile/CatalogGate";
import { makeT, LOCALE_META, dirOf, DEFAULT_LOCALE } from "@/lib/i18n";
import "./globals.css";

/* ANDROID BUILD (static export): no request-scope APIs here. Locale is
   pinned to the default (fa) — LocaleProvider still lets the user switch,
   it just hydrates from localStorage on the client. */
const t = makeT(DEFAULT_LOCALE);

export const metadata: Metadata = {
  title: { default: t("app.metaTitle"), template: `%s | ${t("app.name")}` },
  description: t("app.metaDesc"),
  applicationName: t("app.name"),
  icons: { icon: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070709" },
    { media: "(prefers-color-scheme: light)", color: "#f3f3f7" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Global cover fallback (ANDROID variant): posters/backdrops ship as compact
   WebP files next to the originals. When an <img> fails, first retry the
   same path with .webp (bundled), then fall back to the static SVG generator
   copy (/covers/_fallback.svg) so cards never show broken images. */
const IMG_FALLBACK_SCRIPT = String.raw`(function(){
  if (window.__namaImgFb) return; window.__namaImgFb = 1;
  document.addEventListener('error', function(e){
    var el = e.target;
    if (!el || el.tagName !== 'IMG' || !el.dataset || el.dataset.fb) return;
    var src = el.currentSrc || el.src || '';
    if (!el.dataset.fb2 && /\.jpe?g$/i.test(src)) {
      el.dataset.fb2 = '1';
      el.src = src.replace(/\.jpe?g$/i, '.webp');
      return;
    }
    el.dataset.fb = '1';
    el.src = '/covers/_fallback' + (/backdrop|-wide/.test(src) ? '-wide' : '') + '.svg';
  }, true);
})();`;

/* Audio unlock: prime the audio pipeline on the first user gesture. */
const AUDIO_UNLOCK_SCRIPT = String.raw`(function(){
  if (window.__namaAudioUnlock) return; window.__namaAudioUnlock = 1;
  var unlocked = false;
  function unlock(){
    if (unlocked) return; unlocked = true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      var buf = ctx.createBuffer(1, 256, ctx.sampleRate);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      src.onended = function(){ try { ctx.close(); } catch(e){} };
    } catch(e){}
  }
  ['pointerdown','keydown','touchstart'].forEach(function(ev){
    document.addEventListener(ev, unlock, { once: true, capture: true });
  });
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  const locale = DEFAULT_LOCALE;
  return (
    <html lang={LOCALE_META[locale].htmlLang} dir={dirOf(locale)} data-locale={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <script id="nama-img-fallback" dangerouslySetInnerHTML={{ __html: IMG_FALLBACK_SCRIPT }} />
        <script id="nama-audio-unlock" dangerouslySetInnerHTML={{ __html: AUDIO_UNLOCK_SCRIPT }} />
        <ThemeProvider>
          <LocaleProvider initial={locale}>
            <LibraryProvider>
              <QuickViewProvider>
                <HideOnPip>
                  <Navbar />
                  <CommandPalette />
                  <ElectronBridge />
                  <GlobalPlayer />
                </HideOnPip>
                <CatalogGate>
                  {/* inside the gate: first-launch auth waits for the catalog import */}
                  <WelcomeAuth />
                  <div className="min-h-screen">{children}</div>
                  <HideOnPip>
                    <Footer />
                  </HideOnPip>
                </CatalogGate>
              </QuickViewProvider>
            </LibraryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
