"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TitleView } from "@/lib/queries";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { InfoIcon, PlayIcon, StarIcon } from "./Icons";
import WatchlistButton from "./WatchlistButton";
import FavoriteButton from "./FavoriteButton";

export default function Hero({ items, watchlistIds }: { items: TitleView[]; watchlistIds: number[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  if (!items.length) return null;
  const cur = items[idx];

  return (
    <section
      className="relative h-[82vh] min-h-[560px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((t, i) => (
        <div
          key={t.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? "opacity-100" : "opacity-0"}`}
          aria-hidden={i !== idx}
        >
          { }
          <img
            src={t.backdrop}
            alt=""
            className={`h-full w-full object-cover ${i === idx ? "animate-ken" : ""}`}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-l from-ink via-ink/60 to-ink/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-black/40" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-end px-4 pb-24 sm:px-8 lg:px-12 lg:pb-28">
        <div key={cur.id} className="max-w-2xl animate-fade-up">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-md bg-brand px-2 py-1 text-white shadow-[0_0_20px_var(--color-brand-glow)]">
              {cur.featured ? "پیشنهاد ویژه" : typeLabel(cur.type)}
            </span>
            <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200 backdrop-blur">
              {cur.quality}
            </span>
            <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200 backdrop-blur">
              {cur.ageRating}
            </span>
          </div>

          <h1 className="text-glow text-4xl font-black leading-[1.15] text-white sm:text-5xl lg:text-6xl">
            {cur.title}
          </h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-zinc-400" dir="ltr">
            {cur.titleEn}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-200">
            <span className="flex items-center gap-1 font-bold text-amber-400">
              <StarIcon width={16} height={16} /> {fa(cur.rating)}
            </span>
            <span>{fa(cur.year)}</span>
            <span>{cur.type === "series" ? `هر قسمت ${formatDuration(cur.duration)}` : formatDuration(cur.duration)}</span>
            <span className="text-zinc-400">{cur.genres.join(" · ")}</span>
          </div>

          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-7 text-zinc-300 sm:text-base">
            {cur.description}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={`/watch/${cur.slug}`}
              className="flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-extrabold text-black shadow-[0_10px_40px_rgba(255,255,255,0.15)] transition hover:scale-[1.03] hover:bg-zinc-200"
            >
              <PlayIcon width={20} height={20} />
              پخش
            </Link>
            <Link
              href={`/title/${cur.slug}`}
              className="flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              <InfoIcon />
              جزئیات بیشتر
            </Link>
            <WatchlistButton titleId={cur.id} name={cur.title} initial={watchlistIds.includes(cur.id)} variant="icon" />
            <FavoriteButton titleId={cur.id} name={cur.title} variant="icon" />
          </div>
        </div>

        {/* indicators */}
        <div className="absolute bottom-8 end-4 hidden items-center gap-2 sm:end-8 sm:flex lg:end-12">
          {items.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-label={t.title}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-brand" : "w-3 bg-white/30 hover:bg-white/60"}`}
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
              <img src={t.poster} alt={t.title} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
