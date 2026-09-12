"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { MobileDownloadButton } from "../download/MobileDownloads";
import { titleHref, watchHref } from "@/lib/mobile-links";
import { GlassButton } from "../ui/glass";

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
 * Quick-view, reworked in v0.30.2 — one disciplined vertical rhythm:
 *
 *   ┌ media header (full-bleed, close/mute, badges at the far end) ┐
 *   │ poster overlaps the header on the START side                 │
 *   │ identity column — EVERYTHING start-aligned (no more mixed    │
 *   │   left/right alignment): title, names, one meta row, chips   │
 *   │ synopsis                                                     │
 *   │ episodes — thumb + two tidy lines (name / season·ep·time)    │
 *   │ actions — row 1: one full-width brand CTA; row 2: details    │
 *   │   pill + the icon toggles, all the same height               │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * v0.30.5 — the modal has NO body at all anymore. The v0.30.2 glass slab
 * (a bordered rounded-rect) is replaced by a melt AURA: two layers that
 * extend FAR past the content (≈208px on the sides, ≈64–80px vertically
 * on desktop — the zone the user circled) and dissolve into the page:
 *
 *   1. a feathered backdrop-blur + darken halo (the page sinks into
 *      blur/darkness as it approaches the modal),
 *   2. a radial dark veil (the “ink cloud” the content floats on).
 *
 * Both are masked with an intersect of two linear gradients so there is
 * no edge, no border, no corner anywhere — opacity reaches 0 far beyond
 * the content box. The artwork melts the same way on ALL FOUR sides
 * (top/side fades added to the v0.30.3 bottom seam melt), so cover and
 * modal are one continuous cloud of image and ink over the page.
 *
 * Clicks in the aura zone fall through to the backdrop (pointer-events:
 * none) and close — the aura IS background.
 */

/* the aura fade: two gradient masks composited with “intersect” → a soft
 * rectangle whose edges dissolve over ~96px (x) / ~44px (y). The long
 * radial tail of the veil below already thins the layers near the rim —
 * the mask only finishes the job, so no perceptible boundary anywhere.
 * Feathers must stay ≤ the negative insets (96/48/56px on mobile). */
const AURA_MASK = [
  "linear-gradient(to right, transparent 0%, #000 96px, #000 calc(100% - 96px), transparent 100%)",
  "linear-gradient(to bottom, transparent 0%, #000 44px, #000 calc(100% - 44px), transparent 100%)",
].join(", ");

/* artwork melt on all four sides: fades in over the top ~9%, stays solid
 * through the body of the still, then dissolves toward the identity zone
 * (keeps the v0.30.3 seam melt) and on both flanks. */
const COVER_MASK = [
  "linear-gradient(to bottom, transparent 0%, #000 9%, #000 64%, transparent 97%)",
  "linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)",
].join(", ");

export default function TitleModal({
  title,
  onClose,
}: {
  title: TitleCardData | null;
  onClose: () => void;
  onSwitch: (t: TitleCardData) => void;
}) {
  const { t: tr, locale } = useI18n();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  // B-12: a failed detail fetch used to leave the episode skeletons forever
  const [detailError, setDetailError] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!title) {
      setDetail(null);
      setDetailError(false);
      return;
    }
    let alive = true;
    setDetail(null);
    setDetailError(false);
    setMuted(true);
    fetch(`/api/title/${title.slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(`detail ${r.status}`);
        return r.json();
      })
      .then((d: Detail) => alive && setDetail(d))
      .catch(() => alive && setDetailError(true));
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
  const resumeHref = t ? watchHref(t.slug, progress?.episodeId) : "#";
  // episodes teaser: the one in progress + the next, otherwise the first two
  const startIdx = progress?.episodeId ? Math.max(0, eps.findIndex((e) => e.id === progress.episodeId)) : 0;
  const teaserEps = eps.slice(startIdx, startIdx + 2);
  const isSeries = t?.type === "series";

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
          style={{ background: "rgba(8, 8, 13, 0.42)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
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
            className="relative w-full max-w-[560px]"
          >
            {/* ── the melt aura — replaces the bordered glass slab ──── */}
            {/* extends well past the content (the circled zone) and
                dissolves into the page; pointer-events-none so a click
                anywhere in the melt falls through and closes */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-24 -top-12 -bottom-14 sm:-inset-x-52 sm:-top-16 sm:-bottom-20"
              style={{
                WebkitMaskImage: AURA_MASK,
                maskImage: AURA_MASK,
                WebkitMaskComposite: "source-in",
                maskComposite: "intersect",
              }}
            >
              {/* 1) the page sinks into blur + darkness near the modal */}
              <div
                className="absolute inset-0"
                style={{
                  backdropFilter: "blur(26px) brightness(0.75) saturate(150%)",
                  WebkitBackdropFilter: "blur(26px) brightness(0.75) saturate(150%)",
                }}
              />
              {/* 2) the radial ink veil the content floats on — a long tail
                  so it thins gradually and the mask never cuts a rim */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 88% at 50% 42%, rgba(9, 9, 14, 0.92) 30%, rgba(9, 9, 14, 0.6) 60%, rgba(9, 9, 14, 0.16) 85%, rgba(9, 9, 14, 0) 98%)",
                }}
              />
            </div>

            <div className="no-scrollbar sheet-safe-bottom relative z-10 max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain">
                {/* ── media header ──────────────────────────────────── */}
                {/* no hard seam anywhere (v0.30.3 + v0.30.5): the artwork
                    extends 40px PAST the strip into the body and dissolves
                    there; COVER_MASK melts it on ALL FOUR sides — top, both
                    flanks, and the old seam — so the still emerges from the
                    aura's ink veil with no edge and no tone jump */}
                <div className="force-dark relative z-0 h-[170px] w-full sm:h-[190px]">
                  <div
                    className="absolute inset-x-0 top-0 h-[calc(100%+40px)]"
                    style={{
                      WebkitMaskImage: COVER_MASK,
                      maskImage: COVER_MASK,
                      WebkitMaskComposite: "source-in",
                      maskComposite: "intersect",
                    }}
                  >
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
                  </div>

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

                  {/* badges pinned to the far END corner, clear of the poster */}
                  <div className="absolute bottom-0 end-0 z-10 flex items-center gap-2 p-4 text-[10px] font-bold">
                    <span className="rounded-md bg-brand px-2 py-0.5 text-white shadow-[0_0_14px_var(--color-brand-glow)]">{typeLabel(t.type)}</span>
                    <span className="rounded-md border border-white/25 bg-black/40 px-2 py-0.5 text-white backdrop-blur">{t.quality}</span>
                    <span className="rounded-md border border-white/25 bg-black/40 px-2 py-0.5 text-white backdrop-blur">{t.ageRating}</span>
                  </div>

                  {hasProgress && (
                    <div className="absolute inset-x-4 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>

                {/* ── body ──────────────────────────────────────────── */}
                <div className="relative z-10 p-4 sm:p-5">
                  {/* identity: poster overlaps the header, all text start-aligned */}
                  <div className="flex items-start gap-4">
                    <img
                      src={t.poster}
                      alt={t.title}
                      data-ph-title={t.title}
                      className="relative z-20 -mt-16 h-[124px] w-[84px] shrink-0 rounded-xl bg-ink-700 object-cover shadow-[0_16px_40px_rgb(var(--shadow-color)/0.55)] ring-1 ring-white/25"
                    />
                    <div className="min-w-0 flex-1 pt-1">
                      <TitleName
                        t={t}
                        as="h2"
                        /* match-parent: an English primary name (dir=ltr) must
                         * still ALIGN with the RTL column — start would resolve
                         * against the span's own direction and jump left */
                        primaryClass="[text-align:match-parent] text-xl font-black text-white"
                        secondaryClass="[text-align:match-parent] mt-0.5 block text-[11px] text-zinc-400"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-300">
                        <span className="flex items-center gap-1 font-extrabold text-amber-400">
                          <StarIcon width={13} height={13} /> {fa(t.rating)}
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span className="flex items-center gap-1">
                          <CalendarIcon width={13} height={13} className="text-zinc-500" /> {fa(t.year)}
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span className="flex items-center gap-1">
                          <ClockIcon width={13} height={13} className="text-zinc-500" />
                          {isSeries ? (eps.length ? `${fa(eps.length)} ${tr("common.episodes")}` : typeLabel(t.type)) : formatDuration(t.duration)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.genres.slice(0, 3).map((g) => (
                          <span key={g} className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-300">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 line-clamp-3 text-start text-[13px] leading-6 text-zinc-300">{t.description}</p>

                  {/* ── episodes teaser ──────────────────────────────── */}
                  {isSeries && (
                    <div className="mt-4">
                      {detailError ? (
                        <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs leading-6 text-zinc-400" dir="rtl">
                          بارگیری جزئیات ناتمام ماند؛ برای دیدن قسمت‌ها صفحه‌ی کامل اثر را باز کنید.
                        </p>
                      ) : !detail ? (
                        <div className="space-y-2">
                          {[0, 1].map((i) => (
                            <div key={i} className="skeleton h-14 rounded-2xl" />
                          ))}
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {teaserEps.map((e) => {
                            const active = progress?.episodeId === e.id;
                            return (
                              <li key={e.id} className="relative">
                                <Link
                                  href={watchHref(t.slug, e.id)}
                                  className={`group flex items-center gap-3 rounded-2xl border p-1.5 pe-2.5 transition ${
                                    active ? "border-brand/40 bg-brand/10" : "border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.08]"
                                  }`}
                                >
                                  <div className="relative h-12 w-[84px] shrink-0 overflow-hidden rounded-lg">
                                    <img src={e.thumbnail} alt="" className="h-full w-full object-cover" />
                                    <span className="absolute inset-0 grid place-items-center bg-black/30 text-white opacity-0 transition group-hover:opacity-100">
                                      <PlayIcon width={18} height={18} />
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1 text-start">
                                    <p className="truncate text-xs font-bold text-white">
                                      <span dir="auto">{e.name || `قسمت ${fa(e.number)}`}</span>
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                                      فصل {fa(e.season)} · قسمت {fa(e.number)} · {fa(e.duration)} دقیقه
                                    </p>
                                  </div>
                                  <span className="shrink-0">
                                    <MobileDownloadButton
                                      titleId={t.id}
                                      slug={t.slug}
                                      title={t.title}
                                      poster={t.poster}
                                      type="series"
                                      episodeId={e.id}
                                      episodeLabel={`فصل ${fa(e.season)} · قسمت ${fa(e.number)}`}
                                      size={34}
                                    />
                                  </span>
                                </Link>
                                {active && hasProgress && (
                                  <div className="absolute inset-x-2.5 bottom-0 h-[3px] overflow-hidden rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </li>
                            );
                          })}
                          {eps.length > teaserEps.length && (
                            <li>
                              <Link
                                href={titleHref(t.slug)}
                                className="flex items-center gap-1 px-1 pt-0.5 text-[11px] font-bold text-zinc-400 transition hover:text-white"
                              >
                                {locale === "en" ? `+${eps.length - teaserEps.length} more episodes` : `و ${fa(eps.length - teaserEps.length)} قسمت دیگر`}
                                <ChevronLeft width={12} height={12} className="rtl-flip" />
                              </Link>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* ── actions: one disciplined CTA, one tidy tool row ── */}
                  <div className="mt-5 space-y-2">
                    {/* row 1 — the ONE primary action, full width */}
                    <GlassButton
                      onClick={() => router.push(resumeHref)}
                      className="w-full"
                      style={{
                        background: "linear-gradient(180deg, rgba(229, 9, 20, 0.92), rgba(196, 8, 18, 0.92))",
                        borderColor: "rgba(255, 255, 255, 0.25)",
                        boxShadow: "0 14px 36px var(--color-brand-glow), inset 0 1.5px 0 rgba(255, 255, 255, 0.25)",
                      }}
                    >
                      <span className="flex h-12 w-full items-center justify-center gap-2 px-5 text-sm font-extrabold text-white">
                        <PlayIcon width={18} height={18} />
                        {hasProgress && progress
                          ? `${tr("common.resume")} · ${formatClock(progress.position)}`
                          : isSeries
                            ? locale === "en"
                              ? "Play episode 1"
                              : "پخش قسمت اول"
                            : tr("common.play")}
                      </span>
                    </GlassButton>

                    {/* row 2 — details + the toggles, one consistent height */}
                    <div className="flex items-center gap-2">
                      <GlassButton onClick={() => router.push(titleHref(t.slug))} className="min-w-0 flex-1">
                        <span className="flex h-11 w-full items-center justify-center gap-1.5 px-4 text-sm font-bold text-white/85">
                          {tr("modal.continueInDetails")}
                          <ChevronLeft width={16} height={16} className="rtl-flip shrink-0" />
                        </span>
                      </GlassButton>
                      <WatchlistButton titleId={t.id} name={t.title} initial={detail?.inList ?? false} variant="icon" className="!h-11 !w-11" />
                      <FavoriteButton titleId={t.id} name={t.title} variant="icon" className="!h-11 !w-11" />
                      {!isSeries && (
                        <MobileDownloadButton
                          titleId={t.id}
                          slug={t.slug}
                          title={t.title}
                          poster={t.poster}
                          type="movie"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
