"use client";

/* Download button (v0.10.19) — sits next to the play button on the movie
 * page and on every episode row. Clicking opens a small quality menu built
 * from the catalog's REAL sources; picking one queues a download in the
 * desktop app (Electron only — hidden on the web build). The user's saved
 * quality preference is pre-highlighted. Gated behind the VIP subscription
 * exactly like playback. */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CloseIcon, DownloadIcon } from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";
import { SUBSCRIPTION_REQUIRED, useSubscription } from "@/lib/subscription";
import { dlEnqueue, dlSupported } from "@/lib/downloads";
import { getQualityPref } from "@/lib/quality-pref";
import { variantShort } from "@/lib/variant";
import type { PlayerSource } from "@/lib/player-store";

export type DownloadSourceInput = { q: string; v: string; url: string; mb?: number };

export default function DownloadButton({
  name,
  year,
  kind = "movie",
  season,
  episode,
  label,
  sources,
  compact = false,
}: {
  name: string;
  year?: number;
  kind?: "movie" | "series";
  season?: number;
  episode?: number;
  label?: string;
  sources: DownloadSourceInput[];
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const sub = useSubscription();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [electronOk, setElectronOk] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setElectronOk(dlSupported());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = useMemo(() => {
    const clean = (sources || []).filter((s) => s && s.url && /^https?:\/\//i.test(s.url));
    return clean as PlayerSource[];
  }, [sources]);

  if (!electronOk || list.length === 0) return null;

  const allowed = !SUBSCRIPTION_REQUIRED || (sub.ready ? sub.signedIn && sub.active : false);

  const pref = () => {
    try {
      return getQualityPref();
    } catch {
      return "best";
    }
  };

  const enqueue = async (s: PlayerSource) => {
    if (!allowed) {
      setOpen(false);
      toast.error(locale === "en" ? "An active subscription is required to download." : "برای دانلود باید اشتراک فعال داشته باشید.", {
        action: { label: locale === "en" ? "VIP" : "اشتراک ویژه", onClick: () => (window.location.href = "/vip") },
      });
      return;
    }
    setBusy(true);
    try {
      const r = await dlEnqueue({
        url: s.url,
        name,
        year,
        kind,
        season,
        episode,
        quality: s.q,
        variant: s.v,
        mb: s.mb,
        label,
      });
      setOpen(false);
      if (r.ok) {
        if (r.dup) toast.info(locale === "en" ? "Already in the download queue." : "این فایل از قبل در صف دانلود است.");
        else
          toast.success(locale === "en" ? "Added to the download queue." : "به صف دانلود اضافه شد.", {
            action: { label: locale === "en" ? "Downloads" : "دانلودها", onClick: () => (window.location.href = "/downloads") },
          });
      } else if (r.needDir) {
        toast.info(locale === "en" ? "Pick a download folder first — opening the Downloads page." : "اول پوشه‌ی دانلود را انتخاب کنید — صفحه‌ی دانلودها باز می‌شود.");
        window.location.href = "/downloads";
      } else {
        toast.error(r.error || (locale === "en" ? "Download failed to start." : "شروع دانلود ناموفق بود."));
      }
    } finally {
      setBusy(false);
    }
  };

  const p = pref();
  const sorted = [...list].sort((a, b) => {
    const rank = (s: PlayerSource) => {
      const q = (s.q || "").toLowerCase();
      if (p !== "best" && q === p) return -1;
      return 0;
    };
    return rank(a) - rank(b);
  });

  if (compact) {
    return (
      <div ref={boxRef} className="relative">
        <button
          type="button"
          aria-label={t("dl.short")}
          title={t("dl.short")}
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
          className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-zinc-300 transition hover:bg-brand/20 hover:text-white"
        >
          <DownloadIcon width={15} height={15} />
        </button>
        {open && <Menu sources={sorted} onPick={enqueue} />}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
      >
        <DownloadIcon width={17} height={17} />
        {t("dl.short")}
      </button>
      {open && <Menu sources={sorted} onPick={enqueue} />}
    </div>
  );
}

function Menu({ sources, onPick }: { sources: PlayerSource[]; onPick: (s: PlayerSource) => void }) {
  const { t } = useI18n();
  return (
    <div className="absolute end-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 p-1.5 shadow-2xl backdrop-blur-xl">
      <p className="px-3 pb-1.5 pt-2 text-[11px] font-extrabold text-zinc-400">{t("dl.pickQuality")}</p>
      <ul className="max-h-72 overflow-y-auto">
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs transition hover:bg-white/5"
            >
              <span className="w-12 shrink-0 font-black text-white">{s.q || "عادی"}</span>
              <span className={`flex-1 text-start text-[11px] ${s.v?.includes("دوبله") ? "text-emerald-300" : s.v?.includes("زیرنویس") ? "text-sky-300" : "text-zinc-500"}`}>
                {variantShort(s.v) || "اصلی"}
              </span>
              {s.mb ? <span className="text-[10px] text-zinc-500 num">{s.mb}MB</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <Link href="/downloads" className="mt-1 block rounded-xl bg-white/5 px-3 py-2 text-center text-[11px] font-bold text-zinc-300 transition hover:bg-white/10">
        {t("dl.page")}
      </Link>
    </div>
  );
}
