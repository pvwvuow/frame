import Link from "next/link";
import type { Metadata } from "next";
import { getRankings } from "@/lib/queries";
import { fa, formatViews, typeLabel } from "@/lib/format";
import TitleName from "@/components/TitleName";
import { StarIcon, FilmIcon, TvIcon, SparklesIcon, EyeIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "رنکینگ | نما" };

const TABS = [
  { v: undefined, label: "همه", icon: SparklesIcon },
  { v: "movie", label: "فیلم", icon: FilmIcon },
  { v: "series", label: "سریال", icon: TvIcon },
] as const;

const RANK_STYLES = [
  "from-amber-300 to-yellow-500 text-black shadow-[0_0_24px_rgba(251,191,36,0.45)]", // gold
  "from-zinc-200 to-zinc-400 text-black", // silver
  "from-amber-600 to-orange-700 text-white", // bronze
];

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const valid = type === "movie" || type === "series" ? (type as "movie" | "series") : undefined;
  const rows = await getRankings(valid, 100);
  const movies = rows.filter((t) => t.type === "movie").length;

  return (
    <main className="pb-16">
      {/* header */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.14),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(229,9,20,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-400">
            <SparklesIcon width={16} height={16} /> جدول افتخارات نما
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">رنکینگ فیلم و سریال</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">
            ۱۰۰ اثر برتر آرشیو بر اساس امتیاز IMDb و محبوبیت تماشا. با هر تغییر امتیاز، جدول هم به‌روز می‌شود.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {TABS.map((tb) => {
              const active = (tb.v ?? undefined) === valid;
              return (
                <Link
                  key={tb.label}
                  href={tb.v ? `/rankings?type=${tb.v}` : "/rankings"}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    active ? "border-white bg-white text-black" : "border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <tb.icon width={14} height={14} /> {tb.label}
                </Link>
              );
            })}
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-zinc-400">
              <span className="font-bold text-white num">{fa(rows.length)}</span> عنوان · {fa(movies)} فیلم / {fa(rows.length - movies)} سریال
            </span>
          </div>
        </div>
      </section>

      {/* list */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-400">فعلاً موردی برای نمایش نیست.</div>
        ) : (
          <ol className="space-y-2">
            {rows.map((t, i) => {
              const rank = i + 1;
              const medal = rank <= 3 ? RANK_STYLES[rank - 1] : "";
              return (
                <li key={t.id}>
                  <Link
                    href={`/title/${t.slug}`}
                    className="group flex items-center gap-3 rounded-2xl border border-white/5 bg-ink-700/40 p-3 transition hover:border-white/15 hover:bg-ink-700 sm:gap-4 sm:p-4"
                  >
                    {/* rank */}
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black num sm:h-11 sm:w-11 sm:text-base ${
                        medal ? `bg-gradient-to-br ${medal}` : "bg-white/5 text-zinc-400"
                      }`}
                    >
                      {fa(rank)}
                    </span>
                    {/* poster */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.poster} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded-lg object-cover sm:h-20 sm:w-14" />
                    {/* name */}
                    <span className="min-w-0 flex-1">
                      <TitleName t={t} primaryClass="truncate text-sm font-extrabold text-white sm:text-base" secondaryClass="truncate text-[11px] text-zinc-500" />
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-bold text-zinc-300">{typeLabel(t.type)}</span>
                        <span className="num">{fa(t.year)}</span>
                        <span className="hidden truncate sm:inline">{t.genres.slice(0, 3).join("، ")}</span>
                      </span>
                    </span>
                    {/* stats */}
                    <span className="hidden shrink-0 items-center gap-2 text-[11px] text-zinc-500 md:flex">
                      <EyeIcon width={14} height={14} /> <span className="num">{formatViews(t.views)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-sm font-black text-amber-400 num">
                      <StarIcon width={14} height={14} /> {fa(t.rating)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
