"use client";

/* v0.12.0 — offline downloads UI for the Android app.
 *
 *  MobileDownloadButton — icon button in the title modal (movie: the action
 *    row; series: one per episode teaser). Renders NOTHING outside the
 *    native Android app.
 *  MobileDownloadsList — the /downloads page body on Android: live queue,
 *    pause/resume/cancel, completed files play offline.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  CloseIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "../Icons";
import {
  cancelDownload,
  dlSupported,
  enqueueDownload,
  fmtBytes,
  fmtSpeed,
  getDownloadFor,
  listDownloads,
  pauseDownload,
  removeDownload,
  resumeDownload,
  type DownloadRecord,
} from "@/lib/mobile-downloads";
import { fa } from "@/lib/format";
import Link from "next/link";
import { watchHref } from "@/lib/mobile-links";

type BtnProps = {
  titleId: number;
  slug: string;
  title: string;
  poster: string;
  type: "movie" | "series";
  episodeId?: number | null;
  episodeLabel?: string | null;
  size?: number;
};

export function MobileDownloadButton({ titleId, slug, title, poster, type, episodeId = null, episodeLabel = null, size = 44 }: BtnProps) {
  const [rec, setRec] = useState<DownloadRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dlSupported()) return;
    let alive = true;
    const load = () => void getDownloadFor(titleId, episodeId ?? null).then((r) => alive && setRec(r));
    load();
    const iv = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [titleId, episodeId]);

  if (!dlSupported()) return null;

  const start = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/title/${slug}`, { cache: "no-store" });
      const d = (await r.json()) as {
        videoUrl?: string;
        sources?: { q?: string; v?: string; url: string }[];
        episodes?: { id: number; videoUrl?: string; sources?: string; season?: number; number?: number; name?: string }[];
      };
      let url = "";
      let quality = "";
      let variant = "";
      if (episodeId) {
        const ep = (d.episodes ?? []).find((e) => e.id === episodeId);
        url = ep?.videoUrl ?? "";
      } else if (type === "series") {
        const ep = (d.episodes ?? []).find((e) => e.videoUrl);
        url = ep?.videoUrl ?? "";
      } else {
        url = d.videoUrl ?? "";
      }
      if (!url) {
        toast.error("منبعی برای دانلود پیدا نشد");
        return;
      }
      const first = (d.sources ?? []).find((s) => s.url === url);
      quality = first?.q ?? "";
      variant = first?.v ?? "";
      const res = await enqueueDownload({ titleId, title, slug, poster, type, episodeId, episodeLabel, url, quality, variant });
      if (res.ok && !res.dup) toast.success(type === "series" && !episodeId ? "دانلود قسمت اول شروع شد" : "دانلود شروع شد");
      else if (res.dup) toast.message("این مورد از قبل در فهرست دانلود است");
      else toast.error("شروع دانلود ممکن نشد");
    } catch {
      toast.error("شروع دانلود ممکن نشد");
    } finally {
      setBusy(false);
    }
  };

  const onClick = async (e: React.MouseEvent) => {
    // lives inside episode-row <Link>s — never let the tap navigate
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!rec) return void start();
    if (rec.status === "downloading" || rec.status === "queued") return void pauseDownload(rec.id);
    if (rec.status === "paused" || rec.status === "failed") return void resumeDownload(rec.id);
    if (rec.status === "completed") toast.success("روی گوشی ذخیره شده — آفلاین پخش می‌شود");
  };

  const pct = rec && rec.total > 0 ? Math.min(100, Math.round((rec.received / rec.total) * 100)) : 0;
  const downloading = rec?.status === "downloading" || rec?.status === "queued";
  const iconSize = Math.round(size * 0.45);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="دانلود آفلاین"
      title={rec ? statusLabel(rec.status) : "دانلود برای تماشای آفلاین"}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border transition ${
        rec?.status === "completed"
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
          : downloading
            ? "border-white/15 bg-white/5 text-white"
            : rec?.status === "failed"
              ? "border-red-400/40 bg-red-400/10 text-red-300"
              : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
      }`}
      style={{ width: size, height: size }}
    >
      {downloading && pct > 0 && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
          <span className="block h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </span>
      )}
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : !rec ? (
        <DownloadIcon width={iconSize} height={iconSize} />
      ) : downloading ? (
        <PauseIcon width={iconSize} height={iconSize} />
      ) : rec.status === "paused" ? (
        <PlayIcon width={iconSize} height={iconSize} />
      ) : rec.status === "failed" ? (
        <DownloadIcon width={iconSize} height={iconSize} />
      ) : (
        <CheckCircleIcon width={iconSize} height={iconSize} />
      )}
      {downloading && pct > 0 && (
        <span className="absolute -top-0.5 text-[8px] font-bold tabular-nums text-white/80">{fa(pct)}٪</span>
      )}
    </button>
  );
}

function statusLabel(s: DownloadRecord["status"]): string {
  switch (s) {
    case "downloading":
    case "queued":
      return "در حال دانلود — توقف";
    case "paused":
      return "متوقف شده — ادامه";
    case "completed":
      return "ذخیره شد — آمادهٔ پخش آفلاین";
    case "failed":
      return "ناموفق — تلاش دوباره";
    default:
      return "دانلود";
  }
}

/* ------------------------------------------------------------------ */
/* /downloads page body (Android)                                      */
/* ------------------------------------------------------------------ */

export function MobileDownloadsList() {
  const [rows, setRows] = useState<DownloadRecord[]>([]);
  /* v0.27.0 (UI-3) — canceling an active transfer asks first on Android too */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!dlSupported()) return;
    void listDownloads().then(setRows);
    const iv = setInterval(() => void listDownloads().then(setRows), 1200);
    return () => clearInterval(iv);
  }, []);

  if (!dlSupported()) return null;

  const active = rows.filter((r) => r.status === "downloading" || r.status === "queued" || r.status === "paused" || r.status === "failed");
  const done = rows.filter((r) => r.status === "completed");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6" dir="rtl">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-24 text-center">
          <DownloadIcon width={40} height={40} className="text-zinc-600" />
          <p className="text-sm font-bold text-zinc-300">هنوز چیزی دانلود نکرده‌اید</p>
          <p className="max-w-xs text-xs leading-6 text-zinc-500">
            از پنجرهٔ هر فیلم یا قسمت، دکمهٔ دانلود را بزنید تا برای تماشای آفلاین روی گوشی ذخیره شود.
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h2 className="mb-3 text-xs font-black text-zinc-400">در حال دانلود</h2>
              <ul className="space-y-2">
                {active.map((r) => {
                  const pct = r.total > 0 ? Math.min(100, Math.round((r.received / r.total) * 100)) : 0;
                  return (
                    <li key={r.id} className="glass flex items-center gap-3 rounded-2xl p-2.5">
                      <img src={r.poster} alt="" data-ph-title={r.title} className="h-16 w-11 shrink-0 rounded-lg bg-ink-700 object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-white">{r.title}</p>
                        <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                          {r.episodeLabel ?? (r.quality ? `${r.quality} · ${r.variant || "—"}` : "")}
                          {r.status === "downloading" && r.speed > 0 ? ` · ${fmtSpeed(r.speed)}` : ""}
                          {r.status === "failed" ? " · ناموفق" : ""}
                          {r.status === "paused" ? " · متوقف" : ""}
                        </p>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        {confirmId === r.id && (
                          <p className="mt-1.5 text-[10px] font-bold text-rose-300">دوباره بزنید تا دانلود لغو شود — پیشرفت پاک می‌شود</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">{fa(pct)}٪</span>
                      <div className="flex shrink-0 items-center gap-1">
                        {(r.status === "downloading" || r.status === "queued") && (
                          <button type="button" onClick={() => void pauseDownload(r.id)} aria-label="توقف" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-200">
                            <PauseIcon width={15} height={15} />
                          </button>
                        )}
                        {(r.status === "paused" || r.status === "failed") && (
                          <button type="button" onClick={() => void resumeDownload(r.id)} aria-label="ادامه" className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-200">
                            <PlayIcon width={15} height={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="لغو"
                          onClick={() => {
                            const inFlight = r.status === "downloading" || r.status === "queued" || r.status === "paused";
                            if (inFlight && confirmId !== r.id) {
                              setConfirmId(r.id);
                              return;
                            }
                            setConfirmId(null);
                            void cancelDownload(r.id);
                          }}
                          className={`grid h-9 w-9 place-items-center rounded-full ${confirmId === r.id ? "bg-rose-600 text-white" : "bg-white/5 text-zinc-400"}`}
                        >
                          <CloseIcon width={15} height={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {done.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 text-xs font-black text-zinc-400">روی گوشی ذخیره شده — آفلاین پخش می‌شود</h2>
              <ul className="space-y-2">
                {done.map((r) => (
                  <li key={r.id} className="glass flex items-center gap-3 rounded-2xl p-2.5">
                    <Link href={watchHref(r.slug, r.episodeId ?? undefined)} className="shrink-0">
                      <img src={r.poster} alt="" data-ph-title={r.title} className="h-16 w-11 rounded-lg bg-ink-700 object-cover" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={watchHref(r.slug, r.episodeId ?? undefined)} className="block truncate text-xs font-bold text-white">
                        {r.title}
                      </Link>
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                        {r.episodeLabel ?? ""} {r.total > 0 ? `· ${fmtBytes(r.total)}` : ""}
                      </p>
                    </div>
                    <Link
                      href={watchHref(r.slug, r.episodeId ?? undefined)}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[11px] font-black text-black"
                    >
                      <PlayIcon width={13} height={13} />
                      پخش
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        void removeDownload(r.id);
                        toast.success("حذف شد");
                      }}
                      aria-label="حذف"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400"
                    >
                      <TrashIcon width={15} height={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-6 text-center text-[10px] text-zinc-600">
            برای مدیریت بیشتر، از پنجرهٔ هر عنوان دکمهٔ دانلود را بزنید.
          </p>
        </>
      )}
    </div>
  );
}
