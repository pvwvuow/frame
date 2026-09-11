"use client";

/* CatalogGate — mounts once in the root layout on the Android build.
 *
 * - installs the /api/* fetch shim (module side effect, before any component
 *   fetches)
 * - waits for the catalog to be ready (fast path: lite index from IndexedDB;
 *   first launch: shard-by-shard import) behind a branded splash with a
 *   Persian progress bar
 * - renders the app only when queries can be answered
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { installMobileShim } from "@/lib/mobile/shim";
import { initCatalog, isDesktopRuntime, type ImportProgress } from "@/lib/mobile/db";

installMobileShim();

const PHASE_TEXT: Record<ImportProgress["phase"], string> = {
  check: "بررسی آرشیو…",
  /* v0.25.0 — the import is a LOCAL lite-shard read (~7MB, seconds); the old
   * «دانلود و آماده‌سازی» wording described the full-record era */
  download: "آماده‌سازی آرشیو…",
  index: "ایندکس‌گذاری…",
  done: "آماده است",
};

/* B-7: initCatalog failures used to be swallowed on desktop (raw initCatalog
 * error text on mobile). Now: the error is stored, retried ONCE after 3s
 * (transient offline blips self-heal), and if the gate truly ends in the
 * error screen the user gets a friendly Persian message — never exception
 * text. On desktop the gate stays non-blocking (queries degrade + surface
 * their own error cards via useAsyncData pages). */
export default function CatalogGate({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* v0.10.31: the desktop (Electron) build ships NO shard catalog — the gate
   * must NOT block there (initCatalog used to fetch /catalog/mobile/*.json,
   * got the 404 HTML page back and bricked the app with "Unexpected token '<'").
   * On desktop we pass through immediately and let initCatalog warm the lite
   * index from the local API in the background; queries await it transparently
   * (see ensureReady in lib/mobile/db). */
  const [desktop, setDesktop] = useState(false);
  const retriedRef = useRef(false);

  const run = useCallback(() => {
    setError(null);
    const p = isDesktopRuntime()
      ? initCatalog()
      : initCatalog((prog) => setProgress(prog));
    p.then(() => {
      setReady(true);
      setProgress(null);
      setError(null);
    }).catch(() => {
      setError("catalog-init-failed");
      if (!retriedRef.current) {
        retriedRef.current = true;
        setTimeout(() => {
          void run();
        }, 3000);
      }
    });
  }, []);

  useEffect(() => {
    if (isDesktopRuntime()) setDesktop(true);
    void run();
  }, [run]);

  if (desktop) return <>{children}</>;

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#070709] px-8 text-center" dir="rtl">
        <img src="/app-icon.png" alt="فریم" className="h-14 w-14 select-none rounded-2xl opacity-80" draggable={false} />
        <p className="text-base font-bold text-white">خطا در آماده‌سازی آرشیو</p>
        <p className="max-w-sm text-sm leading-7 text-white/50">بارگیری کاتالوگ ممکن نشد؛ اتصال اینترنت را بررسی کنید.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 rounded-full border border-white/15 px-6 py-2 text-sm font-bold text-white/90 transition hover:bg-white/10"
        >
          تلاش دوباره
        </button>
      </div>
    );
  }

  if (!ready) {
    /* v0.12.0 — minimal splash (user request: «طراحیش زیبا نیس، مینیمالش کن»):
       breathing icon + hairline progress + whisper-quiet phase text */
    const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070709] px-10" dir="rtl">
        <img
          src="/app-icon.png"
          alt="فریم"
          draggable={false}
          className="h-16 w-16 select-none rounded-2xl opacity-95 nama-splash-breathe"
        />
        <div className="mt-9 h-px w-44 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/60 transition-all duration-300"
            style={{ width: `${pct ?? 6}%` }}
          />
        </div>
        <p className="mt-4 text-[11px] tracking-wide text-white/35">
          {progress ? PHASE_TEXT[progress.phase] : "بررسی آرشیو…"}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
