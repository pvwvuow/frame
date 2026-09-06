"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TitleCardData } from "@/components/TitleCard";
import { fa, formatClock, formatDuration, typeLabel } from "@/lib/format";
import WatchlistButton from "../WatchlistButton";
import FavoriteButton from "../FavoriteButton";
import { CloseIcon, PlayIcon, StarIcon, ClockIcon, MuteIcon, VolumeIcon, ChevronLeft, CalendarIcon } from "../Icons";
import TitleName from "../TitleName";
import { useI18n } from "../i18n/LocaleProvider";
import { stopMediaEl } from "@/lib/media";

type Episode = {
  id: number;
  season: number;
  number: number;
  name: string;
  synopsis: string;
  duration: number;
  thumbnail: string;
};

type Detail = {
  title: TitleCardData;
  episodes: Episode[];
  similar: TitleCardData[];
  inList: boolean;
  progress: { position: number; duration: number; episodeId: number | null } | null;
  reviewCount: number;
  userScore: number | null;
};

/**
 * Compact quick-view: a small liquid-glass card with a short teaser
 * (poster, meta, 3-line synopsis, 2 episodes for series) and a clear
 * "ادامه در جزئیات" call-to-action that opens the full title page.
 */
export default function TitleModal({
  title,
  onClose,
}: {
  title: TitleCardData | null;
  onClose: () => void;
  onSwitch: (t: TitleCardData) => void;
}) {
  const { t: tr, locale } = useI18n();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!title) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetail(null);
    setMuted(true);
    fetch(`/api/title/${title.slug}`)
      .then((r) => r.json())
      .then((d: Detail) => alive && setDetail(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [title]);

  useEffect(() => {
    if (!title) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [title, onClose]);

  // v0.10.12: the teaser <video> must never outlive the modal. Chromium
  // keeps a DETACHED, still-playing element alive until GC — with `loop` it
  // would keep playing «در پس‌زمینه» forever after the quick-view closes or
  // switches to another title. Stop the exact element this title mounted.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    return () => stopMediaEl(el);
  }, [title?.id ?? null]);

  const t = title;
  const eps = detail?.episodes ?? [];
  const progress = detail?.progress ?? null;
  const hasProgress = !!(progress && progress.duration > 0 && progress.position > 5 && progress.position / progress.duration < 0.97);
  const pct = hasProgress && progress ? (progress.position / progress.duration) * 100 : 0;
  const resumeHref = t ? `/watch/${t.slug}${progress?.episodeId ? `?ep=${progress.episodeId}` : ""}` : "#";
  // episodes teaser: the one in progress + the next, otherwise the first two
  const startIdx = progress?.episodeId ? Math.max(0, eps.findIndex((e) => e.id === progress.episodeId)) : 0;
  const teaserEps = eps.slice(startIdx, startIdx + 2);

  return (
    <AnimatePresence>
      {t && (
        <motion.div
          key="qv-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6"
          style={{ background: "var(--overlay)", backdropFilter: "blur(6px)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            key={t.id}
            role="dialog"
            aria-modal="true"
            aria-label={t.title}
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="glass-strong relative w-full max-w-[560px] overflow-hidden rounded-[28px]"
          >
            {/* ── media strip (always dark, like a film cell) ─────────── */}
            <div className="force-dark relative z-0 h-[150px] w-full overflow-hidden sm:h-[170px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <video
                ref={videoRef}
                src={t.videoUrl}
                poster={t.backdrop}
                muted={muted}
                autoPlay
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700"
                onPlaying={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />

              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={tr("common.close")}
                  className="glass-btn grid h-9 w-9 place-items-center rounded-full text-white"
                >
                  <CloseIcon width={16} height={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? tr("common.unmute") : tr("common.mute")}
                  className="glass-btn grid h-9 w-9 place-items-center rounded-full text-white"
                >
                  {muted ? <MuteIcon width={16} height={16} /> : <VolumeIcon width={16} height={16} />}
                </button>
              </div>

              {/* badges sit on the END side; the poster overlaps the strip on the START side (-mt-14) */}
              <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-end gap-2 p-4 ps-[120px] text-[10px] font-bold">
                <span className="rounded-md bg-brand px-2 py-0.5 text-white shadow-[0_0_14px_var(--color-brand-glow)]">{typeLabel(t.type)}</span>
                <span className="rounded-md border border-white/25 bg-black/40 px-2 py-0.5 text-white backdrop-blur">{t.quality}</span>
                <span className="rounded-md border border-white/25 bg-black/40 px-2 py-0.5 text-white backdrop-blur">{t.ageRating}</span>
              </div>

              {hasProgress && (
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                  <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>

            {/* ── body ───────────────────────────────────────────────── */}
            <div className="relative z-10 p-4 sm:p-5">
              <div className="flex items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.poster}
                  alt={t.title}
                  className="relative z-20 -mt-14 h-[120px] w-[82px] shrink-0 rounded-xl bg-ink-700 object-cover shadow-[0_12px_30px_rgb(var(--shadow-color)/0.45)] ring-1 ring-white/20"
                />
                <div className="min-w-0 flex-1 pt-1">
                  <TitleName t={t} as="h2" primaryClass="text-xl font-black text-white" secondaryClass="text-[11px] text-zinc-500" />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-300">
                    <span className="flex items-center gap-1 font-extrabold text-amber-400">
                      <StarIcon width={13} height={13} /> {fa(t.rating)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarIcon width={13} height={13} className="text-zinc-500" /> {fa(t.year)}
                    </span>
                    <span className="flex items-center gap-1">
                      <ClockIcon width={13} height={13} className="text-zinc-500" />
                      {t.type === "series" ? (eps.length ? `${fa(eps.length)} ${tr("common.episodes")}` : typeLabel(t.type)) : formatDuration(t.duration)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.genres.slice(0, 3).map((g) => (
                      <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <p className="mt-4 line-clamp-3 text-[13px] leading-6 text-zinc-300">{t.description}</p>

              {/* episodes teaser */}
              {t.type === "series" && (
                <div className="mt-4">
                  {!detail ? (
                    <div className="space-y-2">
                      {[0, 1].map((i) => (
                        <div key={i} className="skeleton h-14 rounded-xl" />
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {teaserEps.map((e) => {
                        const active = progress?.episodeId === e.id;
                        return (
                          <li key={e.id}>
                            <Link
                              href={`/watch/${t.slug}?ep=${e.id}`}
                              className={`group flex items-center gap-3 rounded-xl border p-1.5 pe-3 transition ${
                                active ? "border-brand/40 bg-brand/10" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.07]"
                              }`}
                            >
                              <div className="relative h-11 w-[76px] shrink-0 overflow-hidden rounded-lg">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={e.thumbnail} alt="" className="h-full w-full object-cover" />
                                <span className="absolute inset-0 grid place-items-center bg-black/30 text-white opacity-0 transition group-hover:opacity-100">
                                  <PlayIcon width={18} height={18} />
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-white">
                                  <span className="text-zinc-500" dir="ltr">S{fa(e.season)}·E{fa(e.number)} · </span>
                                  {e.name}
                                </p>
                                <p className="truncate text-[11px] text-zinc-500">{e.synopsis}</p>
                              </div>
                              <span className="shrink-0 text-[10px] text-zinc-500">{fa(e.duration)}′</span>
                            </Link>
                          </li>
                        );
                      })}
                      {eps.length > teaserEps.length && (
                        <li className="px-1 pt-0.5 text-[11px] text-zinc-500">{locale === "en" ? `+${eps.length - teaserEps.length} more episodes…` : `و ${fa(eps.length - teaserEps.length)} قسمت دیگر…`}</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/* actions */}
              <div className="mt-5 flex items-center gap-2">
                <Link
                  href={resumeHref}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-black transition hover:scale-[1.02]"
                >
                  <PlayIcon width={18} height={18} />
                  {hasProgress && progress
                    ? `${tr("common.resume")} · ${formatClock(progress.position)}`
                    : t.type === "series"
                      ? locale === "en" ? "Play episode 1" : "پخش قسمت اول"
                      : tr("common.play")}
                </Link>
                <WatchlistButton titleId={t.id} name={t.title} initial={detail?.inList ?? false} variant="icon" className="!h-11 !w-11" />
                <FavoriteButton titleId={t.id} name={t.title} variant="icon" className="!h-11 !w-11" />
              </div>

              <Link
                href={`/title/${t.slug}`}
                className="glass-btn mt-2.5 flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-bold text-white"
              >
                {tr("modal.continueInDetails")}
                <ChevronLeft width={16} height={16} className="rtl-flip" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
