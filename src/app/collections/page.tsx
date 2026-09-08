"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import { getCollections } from "@/lib/mobile/db";
import { fa } from "@/lib/format";
import { LayersIcon, ChevronLeft, PlusIcon, TrashIcon, SparkIcon, ShareIcon } from "@/components/Icons";
import { createCollection, deleteCollection, fetchUserCollections, type UCollection } from "@/lib/collections";
import { COLLECTION_TEMPLATES, createCollectionFromTemplate, type CollectionTemplate } from "@/lib/collection-templates";

/* ================================================================== */
/* مجموعه‌های من (شخصی + سینک با اکانت) — v0.10.32                     */
/* ================================================================== */
function MyCollectionsSection() {
  const [cols, setCols] = useState<UCollection[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetchUserCollections().then((c) => setCols(c));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const r = await createCollection(clean);
      setName("");
      setCreating(false);
      toast.success(`مجموعه «${r.name}» ساخته شد`);
      load();
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
      load();
    } catch {
      toast.error("حذف ناموفق بود");
    }
  }

  /* v0.10.34 — ساخت یک‌کلیکی از روی قالب آماده */
  async function createFromTpl(tpl: CollectionTemplate) {
    if (busyTpl) return;
    setBusyTpl(tpl.id);
    try {
      const r = await createCollectionFromTemplate(tpl);
      toast.success(`مجموعه «${r.name}» با ${fa(r.added)} عنوان ساخته شد`);
      load();
    } catch {
      toast.error("ساخت از قالب ناموفق بود");
    } finally {
      setBusyTpl(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 lg:px-12 lg:pt-32">
      <section className="mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
              <LayersIcon width={18} height={18} className="text-brand" /> مجموعه‌های من
            </h2>
            <p className="mt-1 text-xs text-zinc-500">کالکشن‌های شخصی خودت — با حسابت ذخیره می‌شوند و روی همه دستگاه‌ها می‌آیند</p>
          </div>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-white transition hover:bg-brand-600"
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

        {/* قالب‌های آماده — ساخت یک‌کلیکی با پیش‌پرشدن از آثار برتر موضوع (v0.10.34) */}
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-zinc-400">
            <SparkIcon width={12} height={12} className="text-brand" /> قالب‌های آماده — یک کلیک، یک کالکشنِ پر
          </p>
          <div className="flex snap-x gap-2.5 overflow-x-auto pb-2">
            {COLLECTION_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => void createFromTpl(tpl)}
                disabled={busyTpl !== null}
                className="w-[190px] shrink-0 snap-start rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-start transition hover:border-brand/40 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="block text-[13px] font-extrabold text-white">{tpl.name}</span>
                <span className="mt-1 block text-[11px] leading-5 text-zinc-500">{tpl.desc}</span>
                <span className="mt-2 block text-[10px] font-black text-brand">
                  {busyTpl === tpl.id ? "در حال ساخت…" : `ساخت از این قالب →`}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* بنر تاریک‌روم — انتشار کالکشن روی دیوار عمومی */}
        <Link
          href="/darkroom?view=collections"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-white/5 bg-gradient-to-l from-brand/[0.08] to-transparent p-4 transition hover:border-brand/30"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <ShareIcon width={16} height={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold text-white">کالکشن‌هایت را در تاریک‌روم به اشتراک بگذار</span>
            <span className="block text-[11px] leading-5 text-zinc-500">
              روی دیوار عمومی تاریک‌روم منتشر کن تا بقیه کاربران هم ببینند و ذخیره کنند
            </span>
          </span>
          <ChevronLeft width={16} height={16} className="shrink-0 text-zinc-600" />
        </Link>

        {cols === null ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cols.map((c) => (
              <div key={c.id} className="group relative">
                <Link
                  href={`/collections/u?c=${c.id}`}
                  className="flex items-center gap-4 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-3 transition hover:border-white/15 hover:bg-white/[0.06]"
                >
                  {c.posters.length > 0 ? (
                    <span className="flex shrink-0 -space-x-3">
                      {c.posters.slice(0, 3).map((p, i) => (
                        <img key={i} src={p} alt="" className="h-16 w-11 rounded-md object-cover ring-2 ring-zinc-950" loading="lazy" />
                      ))}
                    </span>
                  ) : (
                    <span className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-600">
                      <LayersIcon width={20} height={20} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-white">{c.name}</span>
                    <span className="num mt-1 block text-[11px] font-bold text-zinc-500">{fa(c.count)} عنوان</span>
                  </span>
                  <ChevronLeft width={16} height={16} className="shrink-0 text-zinc-600 transition group-hover:text-brand" />
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  aria-label={`حذف ${c.name}`}
                  className="absolute end-3 top-3 hidden h-7 w-7 place-items-center rounded-full bg-zinc-900/90 text-zinc-400 ring-1 ring-white/10 transition hover:bg-rose-600 hover:text-white group-hover:grid"
                >
                  <TrashIcon width={13} height={13} />
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
  const [collections, setCollections] = useState<Awaited<ReturnType<typeof getCollections>> | null>(null);

  useEffect(() => {
    let alive = true;
    getCollections(12).then((c) => alive && setCollections(c));
    return () => {
      alive = false;
    };
  }, []);

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
              href={`/collections/${c.slug}`}
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
          <Row key={c.slug} title={c.title} subtitle={c.tagline} href={`/collections/${c.slug}`}>
            {c.items.map((t) => (
              <TitleCard key={t.id} t={t} />
            ))}
            <Link
              href={`/collections/${c.slug}`}
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
