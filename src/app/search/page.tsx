"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TitleCard from "@/components/TitleCard";
import { search, getTrending, GENRES } from "@/lib/mobile/db";
import { getProgressMap } from "@/lib/mobile/userdata";
import { fa } from "@/lib/format";
import { SearchIcon, FlameIcon, FilmIcon, TvIcon, SparkIcon, CloseIcon, HistoryIcon } from "@/components/Icons";
import { getRecentSearches, rememberSearch, forgetSearch, clearRecentSearches } from "@/lib/search-history";

// verified against the live catalog – every chip must return results
// (genres are stored in Persian; cast names are Latin, so actor names
// in Persian would find nothing)
const POPULAR_QUERIES = ["کمدی", "اکشن", "انیمیشن", "ترسناک", "علمی‌تخیلی", "جنایی", "معمایی"];

function SearchInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? undefined;
  const term = q.trim();
  const [st, setSt] = useState<{ all: Awaited<ReturnType<typeof search>>; trending: Awaited<ReturnType<typeof getTrending>>; progress: Map<number, { position: number; duration: number }> } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  useEffect(() => {
    if (term) rememberSearch(term);
  }, [term]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const all = term ? await search(q) : [];
      const trending = await getTrending(8);
      const results0 = term ? all : [];
      const progress = await getProgressMap(results0.map((t) => t.id));
      if (alive) setSt({ all, trending, progress });
    })();
    return () => {
      alive = false;
    };
  }, [q, term]);

  if (!st) {
    /* v0.27.0 (QOL-1) — the loading state now SAYS what it is doing */
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-32 text-center sm:px-8 lg:px-12">
          <div className="mx-auto flex w-72 items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span className="text-sm text-zinc-400">در حال جستجو…</span>
          </div>
        </div>
      </main>
    );
  }

  const { all, trending, progress } = st;
  const results = type === "movie" || type === "series" ? all.filter((t) => t.type === type) : all;
  const movies = all.filter((t) => t.type === "movie").length;
  const series = all.length - movies;

  const tabs = [
    { v: undefined, label: "همه", n: all.length, icon: SparkIcon },
    { v: "movie", label: "فیلم", n: movies, icon: FilmIcon },
    { v: "series", label: "سریال", n: series, icon: TvIcon },
  ];

  return (
    <main className="pb-16">
      {/* search hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.18),transparent_60%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 text-center sm:px-8 lg:px-12 lg:pt-36">
          <h1 className="text-3xl font-black text-white sm:text-4xl">دنبال چه چیزی می‌گردید؟</h1>
          <p className="mt-2 text-sm text-zinc-400">نام فیلم، سریال، بازیگر، کارگردان یا حتی ژانر را بنویسید.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value;
              // v0.27.0 (QOL-2) — an empty submit used to navigate to a
              // blank results page; the navbar already guards this
              if (!v.trim()) return;
              rememberSearch(v);
              router.push(`/search?q=${encodeURIComponent(v.trim())}`);
            }}
            className="mx-auto mt-8 flex max-w-2xl items-center gap-3 rounded-full border border-white/10 bg-ink-700/70 py-2 pe-2 ps-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur transition focus-within:border-brand/60 focus-within:shadow-[0_0_0_4px_rgba(229,9,20,0.15)]"
          >
            <SearchIcon className="shrink-0 text-zinc-400" />
            <input
              name="q"
              defaultValue={q}
              autoFocus
              autoComplete="off"
              placeholder="مثلاً: مدار سکوت، نوآر، شهاب حسینی..."
              className="h-11 w-full bg-transparent text-base text-white placeholder:text-zinc-500 focus:outline-none"
            />
            <button type="submit" className="h-11 shrink-0 rounded-full bg-brand px-6 text-sm font-bold text-white transition hover:bg-brand-600">
              جستجو
            </button>
          </form>

          {!term && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-zinc-500">
                <FlameIcon width={13} height={13} className="text-orange-400" /> جستجوهای پرتکرار:
              </span>
              {POPULAR_QUERIES.map((p) => (
                <Link key={p} href={`/search?q=${encodeURIComponent(p)}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300 transition hover:border-brand/50 hover:text-white">
                  {p}
                </Link>
              ))}
            </div>
          )}

          {/* v0.27.0 (UI-4) — the USER'S OWN recent searches */}
          {!term && recent.length > 0 && (
            <div className="mx-auto mt-4 max-w-2xl text-center">
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-zinc-500">
                  <HistoryIcon width={13} height={13} /> جستجوهای اخیر شما:
                </span>
                {recent.map((s) => (
                  <span key={s} className="flex items-center overflow-hidden rounded-full border border-brand/30 bg-brand/10">
                    <Link href={`/search?q=${encodeURIComponent(s)}`} className="px-3 py-1 text-zinc-100 hover:text-white">
                      {s}
                    </Link>
                    <button
                      type="button"
                      aria-label={`حذف ${s}`}
                      onClick={() => {
                        forgetSearch(s);
                        setRecent(getRecentSearches());
                      }}
                      className="grid h-6 w-6 place-items-center text-zinc-400 hover:text-rose-300"
                    >
                      <CloseIcon width={10} height={10} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                  className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  پاک کردن همه
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        {term ? (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-extrabold text-white">
                نتایج برای «{q}» <span className="text-sm font-normal text-zinc-500">({fa(results.length)} مورد)</span>
              </h2>
              {all.length > 0 && (
                <div className="flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
                  {tabs.map((tb) => {
                    const active = tb.v === type || (!tb.v && !type);
                    const href = tb.v ? `/search?q=${encodeURIComponent(q)}&type=${tb.v}` : `/search?q=${encodeURIComponent(q)}`;
                    return (
                      <Link
                        key={tb.label}
                        href={href}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold transition ${active ? "bg-white text-black" : "text-zinc-300 hover:text-white"}`}
                      >
                        <tb.icon width={13} height={13} /> {tb.label}
                        <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-black/10" : "bg-white/10"}`}>{fa(tb.n)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <SearchIcon width={28} height={28} />
                </span>
                <p className="mt-5 text-xl font-black text-white">چیزی پیدا نشد</p>
                <p className="mt-2 text-sm text-zinc-500">املای کلمه را بررسی کنید، یا یکی از این ژانرها را امتحان کنید:</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {GENRES.slice(0, 8).map((g) => (
                    <Link key={g} href={`/search?q=${encodeURIComponent(g)}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10">
                      {g}
                    </Link>
                  ))}
                </div>
                <p className="mt-10 mb-4 text-sm font-bold text-zinc-300">شاید این‌ها را دوست داشته باشید</p>
                <div className="flex flex-wrap justify-center gap-4">
                  {trending.slice(0, 6).map((t) => (
                    <TitleCard key={t.id} t={t} size="sm" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                {results.map((t) => (
                  <div key={t.id} className="[&>div]:w-full">
                    <TitleCard t={t} progress={progress.get(t.id)} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* browse by genre */}
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="text-xl font-extrabold text-white">مرور بر اساس ژانر</h2>
                <Link href="/genres" className="text-xs text-zinc-400 hover:text-brand">
                  همه ژانرها
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {GENRES.map((g, i) => (
                  <Link
                    key={g}
                    href={`/search?q=${encodeURIComponent(g)}`}
                    className="group relative overflow-hidden rounded-2xl border border-white/5 bg-ink-700/40 p-4 transition hover:border-white/15"
                  >
                    <span
                      className="absolute -end-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl transition group-hover:opacity-60"
                      style={{ background: `hsl(${(i * 47) % 360} 80% 55%)` }}
                    />
                    <p className="relative font-bold text-white">{g}</p>
                    <p className="relative mt-1 text-[11px] text-zinc-500">مشاهده آثار</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="mt-14">
              <div className="mb-4 flex items-end justify-between">
                <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
                  <FlameIcon width={18} height={18} className="text-orange-400" /> داغ‌ترین‌های امروز
                </h2>
                <Link href="/movies?sort=trending" className="text-xs text-zinc-400 hover:text-brand">
                  مشاهده همه
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {trending.map((t, i) => (
                  <div key={t.id} className="[&>div]:w-full">
                    <TitleCard t={t} rank={i + 1} />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-32 text-center sm:px-8 lg:px-12">
          <div className="mx-auto flex w-72 items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span className="text-sm text-zinc-400">در حال جستجو…</span>
          </div>
        </div>
      </main>
    }>
      <SearchInner />
    </Suspense>
  );
}
