"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TitleCard from "@/components/TitleCard";
import MyListManager from "@/components/library/MyListManager";
import ListCalendar, { type WatchEvent } from "@/components/library/ListCalendar";
import MyListAside, { type AsideCollection } from "@/components/library/MyListAside";
import ContinueCard from "@/components/library/ContinueCard";
import {
  BookmarkIcon,
  CalendarIcon,
  HeartIcon,
  HistoryIcon,
  CheckCircleIcon,
  SparkIcon,
  DownloadIcon,
  LayersIcon,
  ChevronRight,
  ClockIcon,
} from "@/components/Icons";
import { getTrending, getCollections } from "@/lib/mobile/db";
import { getMyListRows, getUserStats, getFavoriteRows, getHistory, getContinueWatching } from "@/lib/mobile/userdata";
import { g2j } from "@/lib/jalali";
import { fa } from "@/lib/format";

function MyListInner() {
  const sp = useSearchParams();
  const view = sp.get("view") === "list" ? "list" : "calendar";

  const [st, setSt] = useState<{
    rows: Awaited<ReturnType<typeof getMyListRows>>;
    stats: Awaited<ReturnType<typeof getUserStats>>;
    cont: Awaited<ReturnType<typeof getContinueWatching>>;
    trending: Awaited<ReturnType<typeof getTrending>>;
    history: Awaited<ReturnType<typeof getHistory>>;
    favRows: Awaited<ReturnType<typeof getFavoriteRows>>;
    collections: AsideCollection[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rows, stats, cont, trending, history, favRows, collectionsRaw] = await Promise.all([
        getMyListRows(),
        getUserStats(),
        getContinueWatching(6),
        getTrending(16),
        getHistory(),
        getFavoriteRows(),
        getCollections(30),
      ]);
      const collections: AsideCollection[] = collectionsRaw.slice(0, 5).map((c) => ({
        slug: c.slug,
        title: c.title,
        count: c.count,
        movies: c.items.filter((t) => t.type === "movie").length,
        series: c.items.filter((t) => t.type === "series").length,
        thumb: c.items[0]?.backdrop ?? c.items[0]?.poster ?? "",
      }));
      if (alive) setSt({ rows, stats, cont, trending, history, favRows, collections });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!st) {
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 lg:px-12 lg:pt-32">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
            <div className="hidden h-64 animate-pulse rounded-2xl bg-white/5 lg:block" />
            <div className="h-96 animate-pulse rounded-3xl bg-white/5" />
            <div className="hidden h-64 animate-pulse rounded-2xl bg-white/5 lg:block" />
          </div>
        </div>
      </main>
    );
  }

  const { rows, stats, cont, trending, history, favRows, collections } = st;

  /* ---- رویدادهای تماشا برای تقویم (سبز) + شمارنده‌ی این ماه ---- */
  const events: WatchEvent[] = history.slice(0, 400).map((h) => ({
    titleId: h.title.id,
    slug: h.title.slug,
    name: h.title.title,
    poster: h.title.poster,
    backdrop: h.title.backdrop,
    date: h.updatedAt.slice(0, 10),
    iso: h.updatedAt,
  }));
  const tj = g2j(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  const thisMonthCount = events.filter((e) => {
    const [y, m, d] = e.date.split("-").map(Number);
    const j = g2j(y, m, d);
    return j.jy === tj.jy && j.jm === tj.jm;
  }).length;

  /* ---- آمار ---- */
  const seriesCompleted = rows.filter((r) => r.title.type === "series" && r.status === "watched").length;
  const hours = Math.round(stats.minutesWatched / 60);

  /* ---- مجموعه‌ها برای ستون کنار ---- */

  const heroBackdrop =
    history[0]?.title.backdrop ?? cont[0]?.title.backdrop ?? rows[0]?.title.backdrop ?? trending[0]?.backdrop;

  const NAV = [
    { href: "/my-list?view=list", label: "واچ‌لیست", icon: BookmarkIcon, active: view === "list" },
    { href: "/my-list?view=calendar", label: "تقویم", icon: CalendarIcon, active: view === "calendar" },
    { href: "/favorites", label: "علاقه‌مندی‌ها", icon: HeartIcon, active: false },
    { href: "/collections", label: "مجموعه‌ها", icon: LayersIcon, active: false },
    { href: "/history", label: "تاریخچه", icon: HistoryIcon, active: false },
    { href: "/downloads", label: "دانلودها", icon: DownloadIcon, active: false },
  ];

  return (
    <main className="pb-16">
      <div className="mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 lg:px-12 lg:pt-32">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
          {/* ================= ستون ناوبری + آمار ================= */}
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <div>
              <h1 className="text-2xl font-black text-white">لیست من</h1>
              <nav className="mt-4 space-y-1">
                {NAV.map((n) => (
                  <Link
                    key={n.label}
                    href={n.href}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-bold transition ${
                      n.active
                        ? "bg-gradient-to-l from-brand/80 to-brand/40 text-white shadow-[0_8px_24px_rgba(229,9,20,0.25)]"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <n.icon width={16} height={16} className={n.active ? "text-white" : "text-zinc-500"} />
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* آمار */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <p className="text-xs font-black text-white">آمار</p>
              <ul className="mt-3 space-y-3.5">
                {[
                  { icon: CalendarIcon, label: "دیده‌شده", v: fa(stats.watchedCount), c: "text-sky-400" },
                  { icon: HeartIcon, label: "علاقه‌مندی‌ها", v: fa(stats.favCount), c: "text-rose-400" },
                  { icon: CheckCircleIcon, label: "سریال کامل‌شده", v: fa(seriesCompleted), c: "text-emerald-400" },
                  { icon: ClockIcon, label: "ساعت تماشا", v: `${fa(hours)} ساعت`, c: "text-amber-400" },
                ].map((s) => (
                  <li key={s.label} className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 ${s.c}`}>
                      <s.icon width={16} height={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] text-zinc-500">{s.label}</span>
                      <span className="num block text-sm font-black text-white">{s.v}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="hidden px-1 text-[13px] font-bold italic leading-7 text-zinc-500 lg:block">
              داستان‌های خوب، روزهای بهتری می‌سازند.
              <span className="mt-2 block h-0.5 w-8 rounded-full bg-brand" />
            </p>
          </aside>

          {/* ================= ستون میانی ================= */}
          <div className="min-w-0">
            {view === "calendar" ? (
              <>
                {/* هیروی تقویم */}
                <section className="relative overflow-hidden rounded-3xl border border-white/5">
                  {heroBackdrop && (
                    <>
                      { }
                      <img src={heroBackdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/10" />
                      <div className="absolute inset-0 bg-gradient-to-l from-ink/70 via-ink/20 to-transparent" />
                    </>
                  )}
                  <div className="relative flex min-h-[190px] items-end justify-between gap-4 p-6 sm:p-8">
                    <div className="min-w-0">
                      <p className="mb-2 flex items-center gap-2 text-[11px] font-black text-zinc-300">
                        لیست من
                      </p>
                      <h2 className="text-3xl font-black text-white sm:text-4xl">تقویم</h2>
                      <p className="mt-2 max-w-md text-[13px] leading-6 text-zinc-300">
                        ثبتِ بصری فیلم‌ها و سریال‌هایی که دیده‌اید — همه در یک جا.
                      </p>
                    </div>
                    <Link
                      href="/history"
                      className="group hidden shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur transition hover:border-white/25 sm:flex"
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/20 text-brand">
                        <CalendarIcon width={20} height={20} />
                      </span>
                      <span>
                        <span className="block text-[10px] text-zinc-400">این ماه</span>
                        <span className="num block text-2xl font-black leading-7 text-white">{fa(thisMonthCount)}</span>
                        <span className="block text-[10px] text-zinc-400">عنوان دیده‌شده</span>
                      </span>
                      <ChevronRight width={16} height={16} className="rotate-180 text-zinc-500 transition group-hover:text-white" />
                    </Link>
                  </div>
                </section>

                {/* تقویم */}
                <section className="mt-5">
                  <ListCalendar rows={rows} events={events} />
                </section>
              </>
            ) : (
              <>
                {/* ادامه تماشا */}
                {cont.length > 0 && (
                  <section>
                    <div className="mb-4 flex items-end justify-between">
                      <div>
                        <h2 className="text-xl font-extrabold text-white">ادامه تماشا</h2>
                        <p className="text-xs text-zinc-500">از همان‌جا که رها کردید</p>
                      </div>
                      <Link href="/history" className="text-xs text-zinc-400 transition hover:text-brand">
                        تاریخچه کامل
                      </Link>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {cont.map((c) => (
                        <ContinueCard key={c.title.id} c={c} />
                      ))}
                    </div>
                  </section>
                )}

                {/* مدیریت لیست */}
                <section className="mt-10">
                  <div className="mb-2 flex items-end justify-between">
                    <div>
                      <h2 className="text-xl font-extrabold text-white">مدیریت لیست</h2>
                      <p className="text-xs text-zinc-500">{fa(rows.length)} عنوان در لیست شما</p>
                    </div>
                  </div>
                  <MyListManager rows={rows} />
                </section>

                {/* پیشنهاد */}
                <section className="mt-14">
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
                        <SparkIcon width={18} height={18} className="text-brand" /> پیشنهاد برای شما
                      </h2>
                      <p className="text-xs text-zinc-500">پرطرفدارترین‌های این هفته</p>
                    </div>
                    <Link href="/movies?sort=trending" className="text-xs text-zinc-400 transition hover:text-brand">
                      مشاهده همه
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {trending
                      .filter((t) => !rows.some((l) => l.title.id === t.id))
                      .slice(0, 8)
                      .map((t) => (
                        <div key={t.id} className="[&>div]:w-full">
                          <TitleCard t={t} />
                        </div>
                      ))}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* ================= ستون مجموعه‌ها + علاقه‌مندی‌ها ================= */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <MyListAside favs={favRows.slice(0, 6)} collections={collections} />
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function MyListPage() {
  return (
    <Suspense fallback={
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 lg:px-12 lg:pt-32">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-white/10" />
        </div>
      </main>
    }>
      <MyListInner />
    </Suspense>
  );
}
