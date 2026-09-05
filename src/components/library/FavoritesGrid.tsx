"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FavoriteRow } from "@/lib/library";
import { fa, formatDuration } from "@/lib/format";
import TitleCard from "../TitleCard";
import { useLibrary } from "./LibraryProvider";
import { HeartIcon, SearchIcon, CloseIcon, ShuffleIcon } from "../Icons";
import { useQuickView } from "../quickview/QuickViewProvider";

type Sort = "added" | "rating" | "title" | "year";

export default function FavoritesGrid({ rows }: { rows: FavoriteRow[] }) {
  const lib = useLibrary();
  const { open } = useQuickView();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "movie" | "series">("all");
  const [sort, setSort] = useState<Sort>("added");

  const live = useMemo(() => rows.filter((r) => !lib.ready || lib.isFavorite(r.title.id)), [rows, lib]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return live
      .filter((r) => (type === "all" ? true : r.title.type === type))
      .filter((r) => !term || r.title.title.toLowerCase().includes(term) || r.title.titleEn.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === "rating") return b.title.rating - a.title.rating;
        if (sort === "title") return a.title.title.localeCompare(b.title.title, "fa");
        if (sort === "year") return b.title.year - a.title.year;
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      });
  }, [live, q, type, sort]);

  const surprise = () => {
    if (!filtered.length) return;
    open(filtered[Math.floor(Math.random() * filtered.length)].title);
  };

  if (live.length === 0) {
    return (
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-dashed border-white/10 p-12 text-center">
        <div className="absolute -top-20 start-1/2 h-40 w-80 -translate-x-1/2 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/10 text-rose-400">
            <HeartIcon width={30} height={30} />
          </span>
          <p className="mt-5 text-xl font-black text-white">هنوز چیزی را دوست نداشته‌اید!</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-500">روی هر پوستر که بروید، دکمه‌ی ♥ ظاهر می‌شود. آثار محبوب‌تان را این‌جا جمع کنید.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/movies?sort=rating" className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-rose-700">برترین فیلم‌ها</Link>
            <Link href="/series" className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-bold text-white hover:bg-white/10">سریال‌ها</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {(["all", "movie", "series"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${type === t ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
              {t === "all" ? "همه" : t === "movie" ? "فیلم‌ها" : "سریال‌ها"}
              <span className="ms-1 text-[10px] opacity-60">{fa(t === "all" ? live.length : live.filter((r) => r.title.type === t).length)}</span>
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <label className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 focus-within:border-white/30">
            <SearchIcon width={15} height={15} className="text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو…" className="w-28 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none sm:w-40" />
            {q && <button type="button" onClick={() => setQ("")}><CloseIcon width={13} height={13} className="text-zinc-400" /></button>}
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-full border border-white/10 bg-ink-700 px-3 text-xs text-zinc-200 focus:outline-none" aria-label="مرتب‌سازی">
            <option value="added">جدیدترین</option>
            <option value="rating">بالاترین امتیاز</option>
            <option value="year">سال ساخت</option>
            <option value="title">الفبا</option>
          </select>
          <button type="button" onClick={surprise} className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:bg-white/10">
            <ShuffleIcon width={14} height={14} /> تصادفی
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {fa(filtered.length)} عنوان · {formatDuration(filtered.reduce((a, r) => a + r.title.duration, 0))} محتوا
      </p>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {filtered.map((r) => (
          <div key={r.title.id} className="[&>div]:w-full">
            <TitleCard t={r.title} />
            <p className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
              <span>{new Date(r.addedAt).toLocaleDateString("fa-IR")}</span>
              {(lib.scoreOf(r.title.id) ?? r.myScore) && <span className="text-amber-400">امتیاز من: {fa(lib.scoreOf(r.title.id) ?? r.myScore ?? 0)}</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
