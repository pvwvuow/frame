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

/* Global cover fallback: when a poster/backdrop image fails to load (offline
   cover-light installs, missing remote file, …) swap it to the app-local SVG
   generator (/api/cover/<slug>.svg) so cards never show broken images. Runs
   as the first <body> element so it is installed before any <img> parses. */
const IMG_FALLBACK_SCRIPT = String.raw`(function(){
  if (window.__namaImgFb) return; window.__namaImgFb = 1;
  document.addEventListener('error', function(e){
    var el = e.target;
    if (!el || el.tagName !== 'IMG' || !el.dataset || el.dataset.fb) return;
    el.dataset.fb = '1';
    var src = el.currentSrc || el.src || '';
    var slug = '';
    var wide = /backdrop|-wide/.test(src);
    var i = src.indexOf('/covers/');
    if (i > -1) { slug = src.slice(i + 8).split('/')[0].split('?')[0]; }
    else {
      i = src.indexOf('/posters/');
      if (i > -1) { slug = src.slice(i + 9).split('?')[0].replace(/\.(jpg|jpeg|png|webp)$/i, ''); }
      else {
        i = src.indexOf('/api/cover/');
        if (i > -1) { slug = src.slice(i + 11).split('?')[0].replace(/\.svg$/i, '').replace(/-wide$/i, ''); }
      }
    }
    if (slug && /^[A-Za-z0-9_-]+$/.test(slug)) {
      el.src = '/api/cover/' + slug + (wide ? '-wide.svg' : '.svg');
    }
  }, true);
})();`;

/* Audio unlock (v0.10.4): the first media element played right after launch
   sometimes starts with no sound on Windows/Electron because Chromium's audio
   pipeline is still initializing. Priming it with a silent WebAudio blip on
   the first user gesture eliminates the race. */
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getT();
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
                  {/* v0.10.10: first-launch popup — sign in / sign up (once,
                      signed-out only, hidden in the PiP window) */}
                  <WelcomeAuth />
                  <ElectronBridge />
                  {/* the <video> element lives here — outside the routed tree —
                      so playback survives navigation (theater ↔ floating window) */}
                  <GlobalPlayer />
                </HideOnPip>
                <div className="min-h-screen">{children}</div>
                {/* v0.10.8 fix: the footer MUST come after the routed content.
                    It used to sit BEFORE {children} in the DOM, and being a
                    static (in-flow) block it pushed the ENTIRE page ~400px down
                    — the home hero never reached the top nav, no matter what
                    scrim/titlebar tweaks were applied («پوستر باید بره بالاتر
                    و کامل زیر نوشته‌های نوار بیفته»). Content first, footer
                    last, exactly like the reference template. */}
                <HideOnPip>
                  <Footer />
                </HideOnPip>
              </QuickViewProvider>
            </LibraryProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
