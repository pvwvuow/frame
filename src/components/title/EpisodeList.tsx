"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fa } from "@/lib/format";
import { PlayIcon, CheckIcon } from "../Icons";

export type EpisodeItem = {
  id: number;
  season: number;
  number: number;
  name: string;
  synopsis: string;
  duration: number;
  thumbnail: string;
};

export default function EpisodeList({
  slug,
  episodes,
  progress,
}: {
  slug: string;
  episodes: EpisodeItem[];
  progress: { episodeId: number | null; position: number; duration: number } | null;
}) {
  const seasons = useMemo(() => Array.from(new Set(episodes.map((e) => e.season))), [episodes]);
  const currentEp = episodes.find((e) => e.id === progress?.episodeId);
  const [season, setSeason] = useState(currentEp?.season ?? seasons[0] ?? 1);
  const list = episodes.filter((e) => e.season === season);
  const currentIdx = currentEp ? episodes.findIndex((e) => e.id === currentEp.id) : -1;
  const totalMinutes = list.reduce((a, e) => a + e.duration, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {seasons.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeason(s)}
              className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                season === s ? "border-brand bg-brand text-white shadow-[0_6px_24px_var(--color-brand-glow)]" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              فصل {fa(s)}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {fa(list.length)} قسمت · حدود {fa(Math.round(totalMinutes / 60))} ساعت
        </p>
      </div>

      <ol className="grid gap-3 md:grid-cols-2">
        {list.map((e) => {
          const idx = episodes.findIndex((x) => x.id === e.id);
          const active = progress?.episodeId === e.id;
          const watched = currentIdx > idx;
          const pct = active && progress && progress.duration > 0 ? (progress.position / progress.duration) * 100 : watched ? 100 : 0;
          return (
            <li key={e.id}>
              <Link
                href={`/watch/${slug}?ep=${e.id}`}
                className={`group flex gap-4 rounded-2xl border p-3 transition ${
                  active ? "border-brand/50 bg-brand/10 shadow-[0_0_0_1px_rgba(229,9,20,0.2)]" : "border-white/5 bg-ink-700/40 hover:border-white/15 hover:bg-ink-700"
                }`}
              >
                <div className="relative h-[92px] w-[164px] shrink-0 overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.thumbnail} alt={e.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                      <PlayIcon width={18} height={18} className="ms-0.5" />
                    </span>
                  </div>
                  <span className="absolute bottom-1.5 end-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{fa(e.duration)} دقیقه</span>
                  {watched && !active && (
                    <span className="absolute start-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">
                      <CheckIcon width={12} height={12} />
                    </span>
                  )}
                  {pct > 0 && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                      <div className={`h-full ${watched && !active ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black leading-none text-zinc-600">{fa(e.number)}</span>
                    <p className="truncate font-bold text-white">{e.name}</p>
                    {active && <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-[10px] font-bold text-brand">در حال تماشا</span>}
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-6 text-zinc-400">{e.synopsis}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
