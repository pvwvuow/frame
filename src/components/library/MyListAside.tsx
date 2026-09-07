import Link from "next/link";
import FavoriteButton from "../FavoriteButton";
import { StarIcon, ChevronRight, FilmIcon, TvIcon } from "../Icons";
import { fa } from "@/lib/format";
import type { FavoriteRow } from "@/lib/library";

export type AsideCollection = {
  slug: string;
  title: string;
  count: number;
  movies: number;
  series: number;
  thumb: string;
};

/**
 * ستون کنار «لیست من» — مجموعه‌ها + علاقه‌مندی‌ها (مطابق طرح جدید).
 */
export default function MyListAside({ favs, collections }: { favs: FavoriteRow[]; collections: AsideCollection[] }) {
  return (
    <div className="space-y-8">
      {/* ---- مجموعه‌های من ---- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-white">مجموعه‌های من</h2>
          <Link href="/collections" className="text-[11px] font-bold text-zinc-400 transition hover:text-brand">
            مشاهده همه
          </Link>
        </div>
        {collections.length === 0 ? (
          <p className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs leading-6 text-zinc-500">
            هنوز مجموعه‌ای ساخته نشده است.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {collections.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/collections/${c.slug}`}
                  className="group flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 transition hover:border-white/15 hover:bg-white/[0.07]"
                >
                  { }
                  <img src={c.thumb} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-extrabold text-white">{c.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[10px] font-medium text-zinc-500">
                      <span className="flex items-center gap-1">
                        <FilmIcon width={10} height={10} /> {fa(c.movies)} فیلم
                      </span>
                      <span className="text-zinc-700">•</span>
                      <span className="flex items-center gap-1">
                        <TvIcon width={10} height={10} /> {fa(c.series)} سریال
                      </span>
                    </span>
                  </span>
                  <ChevronRight width={14} height={14} className="shrink-0 rotate-180 text-zinc-600 transition group-hover:text-brand" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- علاقه‌مندی‌ها ---- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-white">علاقه‌مندی‌ها</h2>
          <Link href="/favorites" className="text-[11px] font-bold text-zinc-400 transition hover:text-brand">
            مشاهده همه
          </Link>
        </div>
        {favs.length === 0 ? (
          <p className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs leading-6 text-zinc-500">
            با زدن قلبِ هر عنوان، آن را این‌جا می‌بینید.
          </p>
        ) : (
          <ul className="space-y-1">
            {favs.map((f) => (
              <li
                key={f.title.id}
                className="group flex items-center gap-3 rounded-2xl border border-transparent p-2 transition hover:border-white/5 hover:bg-white/[0.04]"
              >
                <Link href={`/title/${f.title.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                  { }
                  <img src={f.title.poster} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold text-white">{f.title.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className="num">{fa(f.title.year)}</span>
                      <span className="flex items-center gap-0.5 text-amber-400">
                        <StarIcon width={10} height={10} />
                        <span className="num">{fa(f.myScore ?? f.title.rating ?? 0)}</span>
                      </span>
                    </span>
                  </span>
                </Link>
                <FavoriteButton titleId={f.title.id} name={f.title.title} variant="mini" className="shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
