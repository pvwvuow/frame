"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fa } from "@/lib/format";
import { genreLabel } from "@/lib/genres";
import { useI18n } from "./i18n/LocaleProvider";
import { ChevronDown, CloseIcon, StarIcon } from "./Icons";

/* labels live in the dictionary (v0.30.10) — the raw Persian strings used to
   leak into EN mode */
const SORTS = [
  { v: "trending", label: "catalog.sortTrending" },
  { v: "newest", label: "catalog.sortNewest" },
  { v: "rating", label: "catalog.sortRating" },
  { v: "views", label: "catalog.sortViews" },
] as const;

export default function CatalogFilters({
  genres,
  years,
  genre,
  sort,
  year,
  minRating,
}: {
  genres: string[];
  years: number[];
  genre?: string;
  sort: string;
  year?: number;
  minRating?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const { t: tr, locale } = useI18n();

  const build = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const activeCount = [genre, year, minRating].filter(Boolean).length;

  return (
    <div className="sticky top-16 z-30 -mx-4 border-y border-white/5 bg-ink/85 px-4 py-3 backdrop-blur-xl sm:top-[72px] sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        {/* genres */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          <Link
            href={build({ genre: undefined })}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              !genre ? "border-brand bg-brand text-white shadow-[0_6px_20px_var(--color-brand-glow)]" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {tr("common.all")}
          </Link>
          {genres.map((g) => (
            <Link
              key={g}
              href={build({ genre: g })}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                genre === g ? "border-brand bg-brand text-white shadow-[0_6px_20px_var(--color-brand-glow)]" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {genreLabel(g, locale)}
            </Link>
          ))}
        </div>

        {/* sort + secondary filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
            {SORTS.map((s) => (
              <Link
                key={s.v}
                href={build({ sort: s.v })}
                className={`rounded-full px-3 py-1.5 font-bold transition ${sort === s.v ? "bg-white text-black" : "text-zinc-300 hover:text-white"}`}
              >
                {tr(s.label)}
              </Link>
            ))}
          </div>

          <div className="relative">
            <select
              value={year ?? ""}
              onChange={(e) => router.push(build({ year: e.target.value || undefined }))}
              className="h-9 appearance-none rounded-full border border-white/10 bg-white/5 pe-8 ps-4 text-xs font-medium text-zinc-200 focus:outline-none"
            >
              <option value="">{tr("catalog.allYears")}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {fa(y)}
                </option>
              ))}
            </select>
            <ChevronDown width={14} height={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>

          <div className="relative">
            <select
              value={minRating ?? ""}
              onChange={(e) => router.push(build({ rating: e.target.value || undefined }))}
              className="h-9 appearance-none rounded-full border border-white/10 bg-white/5 pe-8 ps-9 text-xs font-medium text-zinc-200 focus:outline-none"
            >
              <option value="">{tr("catalog.anyRating")}</option>
              <option value="9">{tr("catalog.ratingUp", { n: fa(9) })}</option>
              <option value="8">{tr("catalog.ratingUp", { n: fa(8) })}</option>
              <option value="7">{tr("catalog.ratingUp", { n: fa(7) })}</option>
            </select>
            <StarIcon width={13} height={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-amber-400" />
            <ChevronDown width={14} height={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>

          {activeCount > 0 && (
            <Link
              href={pathname}
              className="flex h-9 items-center gap-1 rounded-full border border-white/10 px-3 text-xs text-zinc-400 transition hover:border-brand/50 hover:text-white"
            >
              <CloseIcon width={12} height={12} /> {tr("catalog.reset")} ({fa(activeCount)})
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
