"use client";

import Link from "next/link";
import { collectionHref } from "@/lib/links";
import { useState } from "react";
import { toast } from "sonner";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import LoadErrorCard from "@/components/LoadErrorCard";
import { getCollections } from "@/lib/mobile/db";
import { fa } from "@/lib/format";
import { LayersIcon, ChevronLeft, PlusIcon, TrashIcon } from "@/components/Icons";
import { createCollection, deleteCollection, fetchUserCollections, type UCollection } from "@/lib/collections";
import { useAsyncData } from "@/lib/use-async-data";

/* ================================================================== */
/* مجموعه‌های من — اسلایدشو شخصی به سبک دست‌چین تحریریه — v0.30.16     */
/* ================================================================== */
/* v0.30.16 — the old block is GONE at the user's call («بخش قرمز رو کلا
 * حذف کن.. این تمپلیت‌های مجموعه‌ای مزخرف رو میگم»): the starter
 * TEMPLATE cards, the darkroom share banner and the compact list rows
 * all removed. What replaces them: the user's OWN collections dressed
 * exactly like the editorial hero tiles below — poster collage, ink
 * gradient, hue bloom, count badge, big name («یک اسلایدشو مخصوص
 * کالکشن‌های خودش بساز مثل همون دستچین تحریریه») — so the personal
 * collections sit beside the editorial ones as siblings of the same
 * visual family. Create lives in the section header; delete on hover. */
function MyCollectionsSection() {
  /* B-2: failures no longer hang on skeletons — retry() doubles as the
   * post-mutation refetch (create/delete call it after a successful write). */
  const { data: cols, error, retry } = useAsyncData(() => fetchUserCollections(), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const r = await createCollection(clean);
      setName("");
      setCreating(false);
      toast.success(`مجموعه «${r.name}» ساخته شد`);
      retry();
    } catch {
      toast.error("ساخت مجموعه ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: UCollection) {
    if (!confirm(`مجموعه «${c.name}» حذف شود؟`)) return;
    try {
      await deleteCollection(c.id, c.name);
      toast.success(`مجموعه «${c.name}» حذف شد`);
      retry();
    } catch {
      toast.error("حذف ناموفق بود");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 lg:px-12 lg:pt-32">
      <section className="mt-4">
        {/* header — same editorial anatomy as «دست‌چین تحریریه» below:
            small brand kicker + big black title; create lives here */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
              <LayersIcon width={16} height={16} /> کالکشن‌های شخصی
            </p>
            <h1 className="text-3xl font-black text-white sm:text-4xl">مجموعه‌های من</h1>
          </div>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-xs font-black text-white transition hover:border-brand/50 hover:bg-brand/15"
          >
            <PlusIcon width={14} height={14} /> ایجاد مجموعه
          </button>
        </div>

        {creating && (
          <div className="mb-4 flex max-w-md items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="نام مجموعه جدید… مثلاً: فیلم‌های موردعلاقه بابا"
              maxLength={60}
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 text-[13px] font-bold text-white outline-none placeholder:text-zinc-600 focus:border-brand/60"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
              className="h-11 shrink-0 rounded-xl bg-brand px-4 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              ساخت
            </button>
          </div>
        )}

        {error ? (
          <LoadErrorCard onRetry={retry} />
        ) : cols === null ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="min-h-[200px] animate-pulse rounded-3xl bg-white/5" />
            ))}
          </div>
        ) : cols.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-black text-zinc-300">هنوز مجموعه‌ی شخصی نساخته‌ای</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-zinc-500">
              با دکمه‌ی «ایجاد مجموعه» اولین کالکشن‌ات را بساز؛ بعد از صفحه‌ی هر فیلم با دکمه‌ی افزودن به مجموعه هر عنوانی را خواستی داخلش بگذار.
            </p>
          </div>
        ) : (
          /* the slideshow — the SAME hero-tile anatomy as the editorial
             collection tiles below: poster collage → ink gradient → count
             badge → big name. Deterministic hue bloom per collection. */
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cols.map((c) => (
              <div key={c.id} className="group relative">
                <Link
                  href={`/collections/u?c=${c.id}`}
                  className="glass group relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-3xl p-5 transition hover:-translate-y-1"
                >
                  <div className="absolute inset-0 flex opacity-60 transition duration-700 group-hover:scale-105">
                    {c.posters.length > 0 ? (
                      c.posters.slice(0, 3).map((p, i) => (
                        <img
                          key={i}
                          src={p}
                          alt=""
                          className="h-full object-cover"
                          style={{ width: `${100 / Math.min(c.posters.length, 3)}%` }}
                          loading="lazy"
                        />
                      ))
                    ) : (
                      <span className="grid w-full place-items-center bg-white/[0.03] text-zinc-600">
                        <LayersIcon width={30} height={30} />
                      </span>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/10" />
                  <span
                    className="absolute -end-10 -top-10 h-36 w-36 rounded-full blur-3xl"
                    style={{ background: `hsl(${(c.id * 47) % 360} 70% 50% / 0.4)` }}
                  />
                  <div className="relative">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur num">{fa(c.count)} عنوان</span>
                    <h3 className="mt-2 text-2xl font-black text-white">{c.name}</h3>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  aria-label={`حذف ${c.name}`}
                  className="absolute end-3 top-3 z-10 hidden h-8 w-8 place-items-center rounded-full bg-zinc-900/90 text-zinc-400 ring-1 ring-white/10 transition hover:bg-rose-600 hover:text-white group-hover:grid"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function CollectionsPage() {
  const { data: collections, error, retry } = useAsyncData(() => getCollections(12), []);

  if (error) {
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-32 sm:px-8 lg:px-12">
          <LoadErrorCard onRetry={retry} />
        </div>
      </main>
    );
  }

  if (!collections) {
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-32 sm:px-8 lg:px-12">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-white/10" />
        </div>
      </main>
    );
  }

  const hero = collections.slice(0, 4);

  return (
    <main className="pb-16">
      {/* مجموعه‌های شخصی کاربر — بالای دست‌چین تحریریه */}
      <MyCollectionsSection />

      <section className="relative mt-14 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-10 sm:px-8 lg:px-12 lg:pt-14">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <LayersIcon width={16} height={16} /> دست‌چین تحریریه
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">مجموعه‌ها</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">
            {fa(collections.length)} مجموعه‌ی موضوعی که هر شب به‌روز می‌شوند؛ از شاهکارهای پرامتیاز تا فیلم‌های جمع‌وجور برای وقتی حوصله‌ی انتخاب ندارید.
          </p>
        </div>
      </section>

      {/* hero tiles */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {hero.map((c) => (
            <Link
              key={c.slug}
              href={collectionHref(c.slug)}
              className="glass group relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-3xl p-5 transition hover:-translate-y-1"
            >
              <div className="absolute inset-0 grid grid-cols-3 opacity-60 transition duration-700 group-hover:scale-105">
                {c.items.slice(0, 3).map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={t.id} src={t.poster} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/10" />
              <span className="absolute -end-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: `hsl(${c.hue} 85% 55% / 0.5)` }} />
              <div className="relative">
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur">{fa(c.count)} عنوان</span>
                <h2 className="mt-2 text-2xl font-black text-white">{c.title}</h2>
                <p className="mt-1 text-xs text-zinc-300">{c.tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* shelves */}
      <div className="mt-14 space-y-2">
        {collections.map((c) => (
          <Row key={c.slug} title={c.title} subtitle={c.tagline} href={collectionHref(c.slug)}>
            {c.items.map((t) => (
              <TitleCard key={t.id} t={t} />
            ))}
            <Link
              href={collectionHref(c.slug)}
              className="glass-btn flex w-[150px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl text-sm font-bold text-white sm:w-[190px]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
                <ChevronLeft width={20} height={20} />
              </span>
              مشاهده همه
              <span className="text-[11px] font-normal text-zinc-400">{fa(c.count)} عنوان</span>
            </Link>
          </Row>
        ))}
      </div>
    </main>
  );
}
