"use client";

/* v0.35.5 (IMG-CACHE-6) — the artwork-rescue banner.
 *
 * The page's IMG_FALLBACK chain (layout.tsx) counts metahub failures and
 * fires 'frame-art-down' at the 6th failure. But 0.35.5 ALSO gives every
 * failure a second life: the heal swaps the <img> to the paced server relay
 * (/api/art), which succeeds whenever metahub is reachable at all — so a
 * plain burst-throttle episode self-repairs within seconds and must NOT
 * alarm the user (a handful of titles have NO metahub art at all and end
 * on the SVG placeholder on every session — by design, not an outage).
 *
 * This banner therefore judges the RELAY, not the placeholders: when the
 * event fires it probes /api/art with a real <img> decode. Only if the
 * relay ALSO fails (metahub unreachable from this network through every
 * path) does it appear, in plain Persian, offering a one-click re-paint
 * (router.refresh — remounts every <img> so the healed cache + relay serve
 * whatever recovered) and the concrete network advice. Shows at most once
 * per session. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type FailStat = { fails: number; down: boolean };

const RELAY_PROBE = `/api/art?u=${encodeURIComponent("https://images.metahub.space/poster/small/tt0898266/img")}`;

export default function ArtRescueBanner() {
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  const shownRef = useRef(false);

  const evaluate = useCallback(async () => {
    setChecking(true);
    const relayAlive = await new Promise<boolean>((resolve) => {
      const img = new Image();
      const t = window.setTimeout(() => resolve(false), 10000);
      img.onload = () => {
        window.clearTimeout(t);
        resolve(true);
      };
      img.onerror = () => {
        window.clearTimeout(t);
        resolve(false);
      };
      img.src = RELAY_PROBE;
    });
    setChecking(false);
    if (!relayAlive && !shownRef.current) {
      shownRef.current = true;
      setShow(true);
    }
  }, []);

  useEffect(() => {
    const stat = (window as unknown as { __artFailStat?: () => FailStat }).__artFailStat?.();
    if (stat?.down) void evaluate();
    const onDown = () => void evaluate();
    window.addEventListener("frame-art-down", onDown);
    return () => window.removeEventListener("frame-art-down", onDown);
  }, [evaluate]);

  if (!show) return null;

  return (
    <div
      dir="rtl"
      role="status"
      className="fixed inset-x-0 bottom-4 z-[90] mx-auto w-[min(92vw,560px)] rounded-2xl border border-amber-400/25 bg-ink-800/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur"
    >
      <p className="text-sm font-bold text-amber-200">تصاویر آنلاین از این شبکه در دسترس نیستند</p>
      <p className="mt-1 text-[12px] leading-6 text-zinc-300">
        مسیر جایگزین فریم هم نتوانست به سرور تصاویر برسد؛ یعنی شبکه‌ی فعلی به آن سرور راه ندارد.
        اتصال اینترنت را عوض کنید یا فیلترشکن را روشن/خاموش کنید و بعد دکمه‌ی زیر را بزنید تا همه‌ی
        تصاویر دوباره تلاش شوند.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setShow(false);
            router.refresh();
          }}
          className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand/85"
        >
          تلاش دوباره برای تصاویر
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/10"
        >
          بستن
        </button>
      </div>
    </div>
  );
}
