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

import { useEffect, useState } from "react";
import { installMobileShim } from "@/lib/mobile/shim";
import { initCatalog, type ImportProgress } from "@/lib/mobile/db";

installMobileShim();

const PHASE_TEXT: Record<ImportProgress["phase"], string> = {
  check: "بررسی آرشیو…",
  download: "دانلود و آماده‌سازی آرشیو…",
  index: "ایندکس‌گذاری…",
  done: "آماده است",
};

export default function CatalogGate({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const first = initCatalog((p) => {
      if (alive) setProgress(p);
    });
    first
      .then(() => {
        if (!alive) return;
        setReady(true);
        setProgress(null);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#070709] px-8 text-center" dir="rtl">
        <div className="text-4xl">🎞️</div>
        <p className="text-lg font-bold text-white">خطا در آماده‌سازی آرشیو</p>
        <p className="max-w-sm text-sm text-white/60">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-white/10 px-6 py-2 text-sm font-bold text-white hover:bg-white/20"
        >
          تلاش دوباره
        </button>
      </div>
    );
  }

  if (!ready) {
    const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-[#070709] px-10" dir="rtl">
        <div className="flex flex-col items-center gap-2">
          { }
          <img src="/app-icon.png" alt="فریم" className="h-20 w-20 rounded-2xl select-none" draggable={false} />
          <p className="mt-2 text-sm font-bold tracking-wide text-white/80">فریم — سینمای خانگی</p>
        </div>
        <div className="w-full max-w-xs">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-l from-amber-300 via-yellow-400 to-amber-500 transition-all duration-300"
              style={{ width: `${pct ?? 8}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-white/50">
            <span>{progress ? PHASE_TEXT[progress.phase] : "بررسی آرشیو…"}</span>
            {pct !== null && <span className="tabular-nums">{pct.toLocaleString("fa-IR")}٪</span>}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
