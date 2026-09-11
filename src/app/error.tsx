"use client";

/* Route-level error boundary (B-1): a branded RTL screen instead of a blank
 * page whenever rendering or data loading throws inside a route segment. */

import { useEffect } from "react";
import { HomeIcon, RefreshIcon } from "@/components/Icons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // surfacing to the console keeps electron/devtools diagnosable
    console.error("[nama] route error:", error);
  }, [error]);

  return (
    <main dir="rtl" lang="fa" className="relative grid min-h-screen place-items-center overflow-hidden px-4 text-center">
      {/* same dark-cinematic atmosphere as the 404 (globals.css palette) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(229,9,20,0.16),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:repeating-linear-gradient(0deg,#fff_0_2px,transparent_2px_6px)]" />
      <div className="relative animate-fade-up">
        <p className="outline-num text-[110px] font-black leading-none text-transparent sm:text-[150px]" aria-hidden>
          !
        </p>
        <span className="mx-auto -mt-6 block w-fit rounded-md bg-brand px-3 py-1 text-xs font-black text-white shadow-[0_0_30px_var(--color-brand-glow)]">
          نمایش متوقف شد
        </span>
        <h1 className="mt-6 text-3xl font-black text-white">مشکلی پیش آمد</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-zinc-400">
          نمایش این صفحه با خطا متوقف شد. معمولاً یک بار تلاش دوباره کافی است؛ اگر تکرار شد، اتصال اینترنت را بررسی کنید یا اپ را باز و بسته کنید.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            <RefreshIcon width={16} height={16} /> تلاش دوباره
          </button>
          <button
            type="button"
            onClick={() => {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a hard reload is intentional: it also clears the failed client tree
              window.location.href = "/";
            }}
            className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <HomeIcon width={16} height={16} /> بازگشت به خانه
          </button>
        </div>
      </div>
    </main>
  );
}
