"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TitleView } from "@/lib/queries";
import { fa, formatClock, formatDuration, formatViews, typeLabel } from "@/lib/format";
import WatchlistButton from "../WatchlistButton";
import {
  CloseIcon,
  PlayIcon,
  StarIcon,
  ClockIcon,
  EyeIcon,
  ExpandIcon,
  MuteIcon,
  VolumeIcon,
  ChevronDown,
  UsersIcon,
  ClapperIcon,
  SubtitleIcon,
} from "../Icons";

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
  title: TitleView;
  episodes: Episode[];
  similar: TitleView[];
  inList: boolean;
  progress: { position: number; duration: number; episodeId: number | null } | null;
  reviewCount: number;
  userScore: number | null;
};

export default function TitleModal({
  title,
  onClose,
  onSwitch,
}: {
  title: TitleView | null;
  onClose: () => void;
  onSwitch: (t: TitleView) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [muted, setMuted] = useState(true);
  const [season, setSeason] = useState(1);
  const [showAllEps, setShowAllEps] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // fetch details whenever a title is opened
  useEffect(() => {
    if (!title) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetail(null);
    setSeason(1);
    setShowAllEps(false);
    scrollRef.current?.scrollTo({ top: 0 });
    fetch(`/api/title/${title.slug}`)
      .then((r) => r.json())
      .then((d: Detail) => {
        if (alive) setDetail(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [title]);

  // esc to close
  useEffect(() => {
    if (!title) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [title, onClose]);

  const t = title;
  const eps = detail?.episodes ?? [];
  const seasons = Array.from(new Set(eps.map((e) => e.season)));
  const seasonEps = eps.filter((e) => e.season === season);
  const visibleEps = showAllEps ? seasonEps : seasonEps.slice(0, 4);
  const progress = detail?.progress ?? null;
  const hasProgress = !!(progress && progress.duration > 0 && progress.position > 5 && progress.position / progress.duration < 0.97);
  const pct = hasProgress && progress ? (progress.position / progress.duration) * 100 : 0;
  const resumeHref = t ? `/watch/${t.slug}${progress?.episodeId ? `?ep=${progress.episodeId}` : ""}` : "#";

  return (
    <AnimatePresence>
      {t && (
        <motion.div
          key="qv-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-6 backdrop-blur-sm sm:px-6 sm:py-10"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            key={t.id}
            ref={scrollRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.title}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-ink-800 shadow-[0_40px_120px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
          >
            {/* ── Media header ─────────────────────────────────────── */}
            <div className="relative aspect-video w-full overflow-hidden bg-ink">
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
              <div className="absolute inset-0 bg-gradient-to-t from-ink-800 via-ink-800/20 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-l from-ink-800/40 to-transparent" />

              {/* top controls */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="بستن"
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-black/80"
                >
                  <CloseIcon />
                </button>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/title/${t.slug}`}
                    className="flex h-10 items-center gap-2 rounded-full bg-black/60 px-4 text-xs font-bold text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-black/80"
                  >
                    <ExpandIcon width={16} height={16} /> صفحه کامل
                  </Link>
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? "روشن کردن صدا" : "بی‌صدا"}
                    className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-black/80"
                  >
                    {muted ? <MuteIcon width={18} height={18} /> : <VolumeIcon width={18} height={18} />}
                  </button>
                </div>
              </div>

              {/* bottom title & actions */}
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="rounded-md bg-brand px-2 py-1 text-white shadow-[0_0_18px_var(--color-brand-glow)]">{typeLabel(t.type)}</span>
                  <span className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-zinc-100 backdrop-blur">{t.quality}</span>
                  <span className="rounded-md border border-white/20 bg-black/50 px-2 py-1 text-zinc-100 backdrop-blur">{t.ageRating}</span>
                </div>
                <h2 className="text-glow text-3xl font-black text-white sm:text-4xl">{t.title}</h2>
                <p className="mt-1 text-xs font-medium tracking-wide text-zinc-400" dir="ltr">
                  {t.titleEn} · {t.year}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    href={resumeHref}
                    className="flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-extrabold text-black transition hover:scale-[1.03] hover:bg-zinc-200"
                  >
                    <PlayIcon width={20} height={20} className="ms-0.5" />
                    {hasProgress && progress ? `ادامه از ${formatClock(progress.position)}` : t.type === "series" ? "پخش قسمت اول" : "پخش"}
                  </Link>
                  {detail ? (
                    <WatchlistButton key={`${t.id}-${detail.inList}`} titleId={t.id} initial={detail.inList} variant="icon" />
                  ) : (
                    <span className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
                  )}
                </div>

                {hasProgress && (
                  <div className="mt-4 max-w-sm">
                    <div className="h-1 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {fa(Math.round(pct))}٪ تماشا شده · {formatClock((progress?.duration ?? 0) - (progress?.position ?? 0))} باقی‌مانده
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────── */}
            <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1fr_260px]">
              <div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
                  <span className="flex items-center gap-1 rounded-lg bg-amber-400/10 px-2 py-1 font-extrabold text-amber-400">
                    <StarIcon width={15} height={15} /> {fa(t.rating)}
                  </span>
                  {detail?.userScore != null && (
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <UsersIcon width={14} height={14} /> کاربران {fa(detail.userScore.toFixed(1))} ({fa(detail.reviewCount)})
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <ClockIcon width={15} height={15} className="text-zinc-500" />
                    {t.type === "series" && eps.length ? `${fa(eps.length)} قسمت` : formatDuration(t.duration)}
                  </span>
                  <span className="flex items-center gap-1">
                    <EyeIcon width={15} height={15} className="text-zinc-500" />
                    {formatViews(t.views)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <SubtitleIcon width={15} height={15} /> زیرنویس · دوبله
                  </span>
                </div>

                <p className="mt-4 text-sm leading-8 text-zinc-200">{t.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {t.genres.map((g) => (
                    <Link
                      key={g}
                      href={`/${t.type === "series" ? "series" : "movies"}?genre=${encodeURIComponent(g)}`}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:border-brand/60 hover:text-white"
                    >
                      {g}
                    </Link>
                  ))}
                </div>

                {/* episodes */}
                {t.type === "series" && (
                  <section className="mt-8">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-extrabold text-white">قسمت‌ها</h3>
                      {seasons.length > 1 && (
                        <div className="relative">
                          <select
                            value={season}
                            onChange={(e) => {
                              setSeason(Number(e.target.value));
                              setShowAllEps(false);
                            }}
                            className="h-9 appearance-none rounded-full border border-white/10 bg-ink-700 pe-9 ps-4 text-sm text-white focus:outline-none"
                          >
                            {seasons.map((s) => (
                              <option key={s} value={s}>
                                فصل {fa(s)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown width={14} height={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        </div>
                      )}
                    </div>

                    {!detail ? (
                      <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="skeleton h-[84px] rounded-2xl" />
                        ))}
                      </div>
                    ) : (
                      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-ink-700/40">
                        {visibleEps.map((e) => {
                          const active = progress?.episodeId === e.id;
                          return (
                            <li key={e.id}>
                              <Link
                                href={`/watch/${t.slug}?ep=${e.id}`}
                                className={`group flex items-center gap-4 p-3 transition hover:bg-white/5 ${active ? "bg-brand/10" : ""}`}
                              >
                                <span className="w-6 shrink-0 text-center text-lg font-black text-zinc-500">{fa(e.number)}</span>
                                <div className="relative h-[64px] w-[112px] shrink-0 overflow-hidden rounded-lg">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={e.thumbnail} alt={e.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                                  <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                                    <PlayIcon width={22} height={22} className="text-white" />
                                  </div>
                                  {active && progress && (
                                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                                      <div className="h-full bg-brand" style={{ width: `${(progress.position / progress.duration) * 100}%` }} />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="truncate text-sm font-bold text-white">{e.name}</p>
                                    <span className="shrink-0 text-[11px] text-zinc-500">{fa(e.duration)} دقیقه</span>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{e.synopsis}</p>
                                </div>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {seasonEps.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllEps((v) => !v)}
                        className="mx-auto mt-3 flex items-center gap-1 rounded-full border border-white/10 px-4 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5"
                      >
                        {showAllEps ? "نمایش کمتر" : `نمایش همه (${fa(seasonEps.length)})`}
                        <ChevronDown width={14} height={14} className={`transition ${showAllEps ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </section>
                )}

                {/* similar */}
                <section className="mt-8">
                  <h3 className="mb-4 text-lg font-extrabold text-white">آثار مشابه</h3>
                  {!detail ? (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {detail.similar.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onSwitch(s)}
                          className="group relative aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-white/5 transition hover:-translate-y-1 hover:ring-white/20"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={s.poster} alt={s.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                          <div className="card-gradient absolute inset-0" />
                          <div className="absolute end-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur">
                            <StarIcon width={10} height={10} /> {fa(s.rating)}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-2 text-start">
                            <p className="truncate text-xs font-bold text-white">{s.title}</p>
                            <p className="text-[10px] text-zinc-400">{fa(s.year)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* sidebar */}
              <aside className="space-y-5 text-sm">
                <div className="rounded-2xl border border-white/5 bg-ink-700/40 p-4">
                  <dl className="space-y-3">
                    <div>
                      <dt className="flex items-center gap-1 text-xs text-zinc-500">
                        <ClapperIcon width={13} height={13} /> کارگردان
                      </dt>
                      <dd className="mt-0.5 font-bold text-white">{t.director}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-xs text-zinc-500">
                        <UsersIcon width={13} height={13} /> بازیگران
                      </dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {t.cast.map((c) => (
                          <Link
                            key={c}
                            href={`/search?q=${encodeURIComponent(c)}`}
                            className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-200 transition hover:bg-white/10"
                          >
                            {c}
                          </Link>
                        ))}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-white/5 pt-3">
                      <div>
                        <dt className="text-xs text-zinc-500">کشور</dt>
                        <dd className="text-zinc-200">{t.country}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">سال</dt>
                        <dd className="text-zinc-200">{fa(t.year)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">کیفیت</dt>
                        <dd className="text-zinc-200">{t.quality}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">رده سنی</dt>
                        <dd className="text-zinc-200">{t.ageRating}</dd>
                      </div>
                    </div>
                  </dl>
                </div>

                <Link
                  href={`/title/${t.slug}`}
                  className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  <ExpandIcon width={16} height={16} /> جزئیات کامل و نظرات
                </Link>
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
