import Link from "next/link";
import type { Title } from "@/db/schema";
import { fa, typeLabel } from "@/lib/format";
import { PlayIcon, StarIcon } from "./Icons";

export default function TitleCard({
  t,
  progress,
  size = "md",
}: {
  t: Title;
  progress?: { position: number; duration: number } | null;
  size?: "sm" | "md" | "lg";
}) {
  const pct = progress && progress.duration > 0 ? Math.min(100, (progress.position / progress.duration) * 100) : 0;
  const w = size === "sm" ? "w-[130px] sm:w-[150px]" : size === "lg" ? "w-[190px] sm:w-[230px]" : "w-[150px] sm:w-[190px]";

  return (
    <Link
      href={`/title/${t.slug}`}
      className={`group relative block shrink-0 ${w} snap-start`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-700 ring-1 ring-white/5 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_20px_50px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.poster}
          alt={t.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="card-gradient absolute inset-0 opacity-90" />

        <div className="absolute start-2 top-2 flex gap-1">
          <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
            {t.quality}
          </span>
        </div>
        <div className="absolute end-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-amber-400 backdrop-blur">
          <StarIcon width={11} height={11} />
          {fa(t.rating)}
        </div>

        <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-black shadow-xl transition-transform group-hover:scale-110">
            <PlayIcon width={22} height={22} className="ms-1" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate text-sm font-bold text-white">{t.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-300">
            <span>{typeLabel(t.type)}</span>
            <span className="opacity-50">·</span>
            <span>{fa(t.year)}</span>
            <span className="opacity-50">·</span>
            <span className="truncate">{t.genres[0]}</span>
          </p>
        </div>

        {pct > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
