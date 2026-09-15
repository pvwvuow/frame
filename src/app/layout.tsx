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
import RegisterImageSW from "@/components/sw/RegisterImageSW";
import NotificationActionsHost from "@/components/NotificationActionsHost";
import HideOnPip from "@/components/HideOnPip";
import GlobalPlayer from "@/components/GlobalPlayer";
import CatalogGate from "@/components/mobile/CatalogGate";
import { makeT, LOCALE_META, dirOf, DEFAULT_LOCALE } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

/* Metadata stays module-scope (static default); the per-request locale that
 * now drives <html lang/dir> + LocaleProvider is resolved in RootLayout. */
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
  /* v0.35.3 (IMG-CACHE-4) — the fallback chain is now SELF-HEALING. The
   * image SW caches metahub art as OPAQUE responses, and an opaque response
   * hides its HTTP status — a metahub 404/429/503 error page gets cached
   * exactly like a real image, then cache-first serves that garbage forever
   * («تصاویر دیگر اصلاً لود نمی‌شوند»). Heal protocol (worker half in
   * public/sw.js): 1) on the first <img> error for a metahub url, DELETE
   * the cached entry and retry once with ?_rw=<ts>; 2) the worker treats
   * ?_rw as network-first and stores the fresh copy under the CLEAN url;
   * 3) if the retry also fails, the old chain runs: webp → metahub →
   * background→poster swap (NEW) → SVG placeholder. One heal per element
   * (dataset.rw) — no loops, no unbounded retries. */
  var MH_RE = /(^|\.)metahub\.space$/i;
  function heal(el, src){
    if (el.dataset.rw) return false;
    try {
      var u = new URL(src, location.href);
      if (!MH_RE.test(u.hostname)) return false;
      el.dataset.rw = '1';
      u.searchParams.delete('_rw');
      var clean = u.toString();
      if ('caches' in window) {
        caches.open('frame-img-v3').then(function(c){ return c.delete(clean); }).catch(function(){});
      }
      u.searchParams.set('_rw', String(Date.now()));
      el.src = u.toString();
      return true;
    } catch(e) { return false; }
  }
  document.addEventListener('error', function(e){
    var el = e.target;
    if (!el || el.tagName !== 'IMG' || !el.dataset || el.dataset.fb) return;
    var src = el.currentSrc || el.src || '';
    if (heal(el, src)) return;
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
    if (!el.dataset.mhp) {
      var m2 = src.match(/metahub\.space\/background\/(?:medium|large)\/(tt\d+)\//i);
      if (m2) {
        el.dataset.mhp = '1';
        el.src = 'https://images.metahub.space/poster/medium/' + m2[1] + '/img';
        return;
      }
    }
    el.dataset.fb = '1';
    var t = el.getAttribute('data-ph-title') || '';
    if (t) { el.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(phSvg(t, /backdrop|-wide/.test(src))); return; }
    el.src = '/covers/_fallback' + (/backdrop|-wide/.test(src) ? '-wide' : '') + '.svg';
  }, true);
})();`;

/* v0.35.2/3 (IMG-CACHE-3 + IMG-CACHE-4) — renderer-memory art warmer (the
 * LAST cache layer, independent of the service worker and the HTTP cache):
 * every artwork <img> that finishes loading gets pinned as a live Image
 * element in a module-level LRU (800 entries ≈ tens of MB of encoded art).
 * A referenced element keeps its resource inside the renderer for the whole
 * session, so if an <img> with the same src ever remounts (stale router
 * window passed, filter change, view switch) Chromium paints it from RAM on
 * the very first frame — no network, no SW round-trip, no decode flash.
 * Works everywhere: Electron, Android WebView, browsers, with or without
 * service-worker support. Capture-phase 'load' listener covers every <img>
 * the app ever renders, server-rendered or client-mounted.
 *
 * IMG-CACHE-4: heal-retry urls (?_rw=<ts>) are never pinned (they would
 * pollute the LRU under a key nothing re-requests); instead the CLEAN url
 * is warmed, so the RAM layer holds the healed copy too. __warmArtStat()
 * exposes the LRU size to the settings artwork-health probe. */
const ART_WARMER_SCRIPT = String.raw`(function(){
  if (window.__namaArtWarm) return; window.__namaArtWarm = 1;
  var MAX = 800, m = new Map();
  function ok(u){
    if (typeof u !== 'string') return false;
    if (u.indexOf('data:') === 0 || u.indexOf('blob:') === 0) return false;
    if (u.indexOf('_rw=') !== -1) return false;
    return /^https?:\/\//i.test(u) || u.charAt(0) === '/';
  }
  function warm(u){
    if (!ok(u)) return;
    var hit = m.get(u);
    if (hit) { m.delete(u); m.set(u, hit); return; }
    try {
      var img = new Image();
      img.decoding = 'async';
      img.src = u;
      m.set(u, img);
      if (m.size > MAX) { var first = m.keys().next().value; if (first) m.delete(first); }
    } catch (e) {}
  }
  window.__warmArt = warm;
  window.__warmArtStat = function(){ return { size: m.size, max: MAX }; };
  /* IMG-CACHE-5: lets client components ask "has THIS session already
   * loaded this artwork once?" — remounted cards drop loading="lazy" for
   * warm srcs (see src/lib/art-warm.ts) so back-navigation paints them
   * from renderer RAM on the first frame. */
  window.__warmHas = function(u){ return m.has(u); };
  document.addEventListener('load', function(e){
    var t = e.target;
    if (t && t.tagName === 'IMG') {
      var u = t.currentSrc || t.src;
      if (typeof u === 'string' && u.indexOf('_rw=') > -1) {
        try { var c = new URL(u); c.searchParams.delete('_rw'); u = c.toString(); }
        catch(err) { u = u.split('?')[0]; }
      }
      warm(u);
    }
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

/* B-3: the locale was pinned to the default forever — the persisted choice
 * never reached the server render. getLocale() reads the nama_locale cookie
 * (validate + fallback to fa; on the ANDROID static export cookies() is
 * outside request scope and the try/catch inside getLocale falls back to fa,
 * exactly as before). This makes the root layout dynamic — accepted. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={LOCALE_META[locale].htmlLang} dir={dirOf(locale)} data-locale={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-screen bg-ink text-zinc-100 antialiased">
        <script id="nama-img-fallback" dangerouslySetInnerHTML={{ __html: IMG_FALLBACK_SCRIPT }} />
        <script id="nama-art-warmer" dangerouslySetInnerHTML={{ __html: ART_WARMER_SCRIPT }} />
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
                  <RegisterImageSW />
                  <NotificationActionsHost />
                  <GlobalPlayer />
                </HideOnPip>
                <CatalogGate>
                  {/* inside the gate: first-launch auth waits for the catalog import */}
                  <WelcomeAuth />
                  {/* v0.30.12: the nama-shell PUSH class is gone — the user
                      withdrew the push; the drawer is a merged veil now */}
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
