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
import CloudAutoSync from "@/components/auth/CloudAutoSync";
import MobileUpdater from "@/components/mobile/MobileUpdater";
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
   same path with .webp (bundled), then fall back — v0.12.0: to a PER-TITLE
   branded placeholder (data-ph-title → inline SVG with the movie's name on
   a cinematic gradient) so the ~7.8k titles without a bundled cover read as
   intentional key-art instead of "missing poster". */
const IMG_FALLBACK_SCRIPT = String.raw`(function(){
  if (window.__namaImgFb) return; window.__namaImgFb = 1;
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function lines(t){
    if (t.length <= 20) return [t];
    var mid = Math.floor(t.length / 2), best = -1;
    for (var i = 0; i < t.length; i++) { if (t[i] === ' ') { if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i; } }
    if (best < 0) return [t];
    return [t.slice(0, best), t.slice(best + 1)];
  }
  function phSvg(t, wide){
    var w = wide ? 640 : 300, h = wide ? 360 : 450;
    var ls = lines(t), fs = ls.length > 1 ? 17 : (t.length > 14 ? 15 : 19);
    var ty = h * 0.60 - (ls.length - 1) * fs * 0.65;
    var txt = '';
    for (var i = 0; i < ls.length; i++) {
      txt += '<text x="' + (w/2) + '" y="' + (ty + i * fs * 1.3) + '" text-anchor="middle" font-family="Vazirmatn,Tahoma,sans-serif" font-size="' + fs + '" font-weight="700" fill="#cfc9bd" direction="rtl">' + esc(ls[i]) + '</text>';
    }
    var cy = h * 0.36, r = w * (wide ? 0.075 : 0.10);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#191320"/><stop offset="0.55" stop-color="#0d0b12"/><stop offset="1" stop-color="#231a10"/></linearGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#g)"/>' +
      '<circle cx="' + (w/2) + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#e5b84b" stroke-opacity="0.45" stroke-width="2"/>' +
      '<path d="M ' + (w/2 - r*0.55) + ' ' + (cy - r*0.8) + ' L ' + (w/2 + r*0.9) + ' ' + cy + ' L ' + (w/2 - r*0.55) + ' ' + (cy + r*0.8) + ' Z" fill="#e5b84b" fill-opacity="0.5"/>' +
      txt + '</svg>';
  }
  document.addEventListener('error', function(e){
    var el = e.target;
    if (!el || el.tagName !== 'IMG' || !el.dataset || el.dataset.fb) return;
    var src = el.currentSrc || el.src || '';
    if (!el.dataset.fb2 && /\.jpe?g$/i.test(src)) {
      el.dataset.fb2 = '1';
      el.src = src.replace(/\.jpe?g$/i, '.webp');
      return;
    }
    if (!el.dataset.mh) {
      el.dataset.mh = '1';
      var m = src.match(/\/covers\/(tt\d+)\//i);
      if (m) {
        var wide = /backdrop|-wide/i.test(src);
        el.src = 'https://images.metahub.space/' + (wide ? 'background/medium/' : 'poster/medium/') + m[1] + '/img';
        return;
      }
    }
    el.dataset.fb = '1';
    var t = el.getAttribute('data-ph-title') || '';
    if (t) { el.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(phSvg(t, /backdrop|-wide/.test(src))); return; }
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
              <CloudAutoSync />
              <MobileUpdater />
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
