"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TitleView } from "@/lib/mobile/db";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { InfoIcon, PlayIcon, StarIcon, PauseIcon } from "./Icons";
import WatchlistButton from "./WatchlistButton";
import FavoriteButton from "./FavoriteButton";
import { useI18n } from "./i18n/LocaleProvider";
import { titleNames } from "@/lib/title-name";
import { titleHref, watchHref } from "@/lib/mobile-links";
import { posterSrc, backdropSrc } from "@/lib/covers";
import { useLibrary } from "./library/LibraryProvider";
import { GlassButton } from "./ui/glass";

export default function Hero({ items, watchlistIds }: { items: TitleView[]; watchlistIds: number[] }) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  /* v0.27.0 (UI-5) — manual pause via the new play/pause button */
  const [userPaused, setUserPaused] = useState(false);
  const { t: tr, locale } = useI18n();
  /* v0.27.0 (UI-5) — respect «کاهش انیمیشن‌ها» (profile) AND the OS-level
   * prefers-reduced-motion setting: the carousel must not auto-rotate. */
  const { profile } = useLibrary();
  const reduceMotion =
    profile.reduceMotion ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (paused || userPaused || reduceMotion || items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [paused, userPaused, reduceMotion, items.length]);

  if (!items.length) return null;
  const cur = items[idx];
  const names = titleNames(cur, locale);
  const stopped = userPaused || !!reduceMotion;

  return (
    <section
      className="relative h-[82vh] min-h-[560px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      /* v0.27.0 (UI-5) — touch devices have no hover: a tap holds the slide
       * still so reading the synopsis is never interrupted mid-scroll */
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), 8000)}
    >
      {items.map((t, i) => {
        /* v0.25.0 — mount ONLY the active slide ±1 (wrap-aware): 8 full-bleed
         * backdrops used to fetch eagerly on every home view */
        const dist = Math.min(Math.abs(i - idx), items.length - Math.abs(i - idx));
        return (
          <div
            key={t.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? "opacity-100" : "opacity-0"}`}
            aria-hidden={i !== idx}
          >
            {dist <= 1 && (
              <img
                src={backdropSrc(t)}
                alt=""
                loading={dist === 0 ? "eager" : "lazy"}
                decoding="async"
                data-ph-title={titleNames(t, locale).primary}
                className={`h-full w-full object-cover ${i === idx ? "animate-ken" : ""}`}
              />
            )}
          </div>
        );
      })}
      <div className={`absolute inset-0 ${locale === "en" ? "bg-gradient-to-r" : "bg-gradient-to-l"} from-ink via-ink/60 to-ink/10`} />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-black/40" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-end px-4 pb-24 sm:px-8 lg:px-12 lg:pb-28">
        <div key={cur.id} className="max-w-2xl animate-fade-up">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-md bg-brand px-2 py-1 text-white shadow-[0_0_20px_var(--color-brand-glow)]">
              {cur.featured ? tr("hero.featured") : typeLabel(cur.type)}
            </span>
            <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200 backdrop-blur">
              {cur.quality}
            </span>
            <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200 backdrop-blur">
              {cur.ageRating}
            </span>
          </div>

          <h1 className="text-glow text-4xl font-black leading-[1.15] text-white sm:text-5xl lg:text-6xl" dir={names.primaryDir}>
            {names.primary}
          </h1>
          {names.secondary && (
            <p className="mt-2 text-sm font-medium tracking-wide text-zinc-400" dir={names.secondaryDir}>
              {names.secondary}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-200">
            <span className="flex items-center gap-1 font-bold text-amber-400">
              <StarIcon width={16} height={16} /> {fa(cur.rating)}
            </span>
            <span>{fa(cur.year)}</span>
            <span>{cur.type === "series" ? `${tr("common.perEpisode")} ${formatDuration(cur.duration)}` : formatDuration(cur.duration)}</span>
            <span className="text-zinc-400">{cur.genres.join(" · ")}</span>
          </div>

          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
            {cur.description}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {/* v0.30.0 — hero CTAs are liquid-glass pills (Button Example) */}
            <GlassButton onClick={() => router.push(watchHref(cur.slug))}>
              <span className="flex h-12 items-center gap-2 px-7 text-sm font-extrabold text-white">
                <PlayIcon width={20} height={20} />
                {tr("common.play")}
              </span>
            </GlassButton>
            <GlassButton onClick={() => router.push(titleHref(cur.slug))}>
              <span className="flex h-12 items-center gap-2 px-6 text-sm font-bold text-white/85">
                <InfoIcon />
                {tr("common.moreDetails")}
              </span>
            </GlassButton>
            <WatchlistButton titleId={cur.id} name={names.primary} initial={watchlistIds.includes(cur.id)} variant="icon" />
            <FavoriteButton titleId={cur.id} name={names.primary} variant="icon" />
          </div>
        </div>

        {/* indicators — v0.27.0 (A11Y-5): the 6px dots got an invisible 44px
            tap target (tap-expand) and an explicit pause/rotate control sits
            next to them (UI-5). */}
        <div className="absolute bottom-8 end-4 hidden items-center gap-2 sm:end-8 sm:flex lg:end-12">
          <button
            type="button"
            aria-label={stopped ? "ادامه چرخش اسلاید" : "توقف چرخش اسلاید"}
            onClick={() => setUserPaused((p) => !p)}
            className="tap-expand grid h-8 w-8 place-items-center rounded-full bg-black/50 text-zinc-200 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/70"
          >
            {stopped ? <PlayIcon width={13} height={13} className="ms-0.5" /> : <PauseIcon width={13} height={13} />}
          </button>
          {items.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-label={titleNames(t, locale).primary}
              aria-current={i === idx}
              onClick={() => setIdx(i)}
              className={`tap-expand rounded-full transition-all ${i === idx ? "h-1.5 w-8 bg-brand" : "h-1.5 w-3 bg-white/30 hover:bg-white/60"}`}
            />
          ))}
        </div>

        {/* thumbnails */}
        <div className="absolute bottom-20 end-4 hidden gap-2 sm:end-8 lg:end-12 lg:flex">
          {items.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setIdx(i)}
              className={`relative h-24 w-16 overflow-hidden rounded-lg ring-2 transition-all ${
                i === idx ? "ring-brand scale-105" : "ring-white/10 opacity-60 hover:opacity-100"
              }`}
            >
              { }
              <img src={posterSrc(t)} alt={titleNames(t, locale).primary} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
