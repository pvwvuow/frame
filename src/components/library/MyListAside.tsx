"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import FavoriteButton from "../FavoriteButton";
import { StarIcon, ChevronRight, FilmIcon, TvIcon, PlusIcon, LayersIcon, TrashIcon } from "../Icons";
import { fa } from "@/lib/format";
import type { FavoriteRow } from "@/lib/mobile/userdata";
import { titleHref } from "@/lib/mobile-links";
import { createCollection, deleteCollection, type UCollection } from "@/lib/collections";
import { COLLECTION_TEMPLATES, createCollectionFromTemplate, type CollectionTemplate } from "@/lib/collection-templates";

export type AsideCollection = {
  slug: string;
  title: string;
  count: number;
  movies: number;
  series: number;
  thumb: string;
};

/**ICollection card thumb (first poster of the collection). */
function thumbOf(c: UCollection): string {
  return c.posters[0] ?? "";
}

/**
 * ستون کنار «لیست من» — کالکشن‌های شخصی کاربر (+ ساخت مجموعه) و علاقه‌مندی‌ها.
 * v0.10.32: مجموعه‌های پیش‌فرض تحریریه از این‌جا حذف شدند؛ فقط کالکشن‌هایی که
 * خود کاربر ساخته و با حسابش سینک می‌شوند این‌جا دیده می‌شوند.
 */
export default function MyListAside({
  favs,
  userCollections,
  onCollectionsChanged,
}: {
  favs: FavoriteRow[];
  userCollections: UCollection[];
  onCollectionsChanged?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyTpl, setBusyTpl] = useState<string | null>(null);
  const [cols, setCols] = useState<UCollection[]>(userCollections);

  // keep local state in sync when the parent re-fetches (create/delete elsewhere)
  useEffect(() => {
    setCols(userCollections);
  }, [userCollections]);

  async function submit() {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const r = await createCollection(clean);
      setCols((l) => [
        ...l,
        { id: r.id, name: r.name, count: 0, posters: [], movies: 0, series: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);
      setName("");
      setCreating(false);
      toast.success(`مجموعه «${r.name}» ساخته شد`);
      onCollectionsChanged?.();
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
      setCols((l) => l.filter((x) => x.id !== c.id));
      toast.success(`مجموعه «${c.name}» حذف شد`);
      onCollectionsChanged?.();
    } catch {
      toast.error("حذف ناموفق بود");
    }
  }

  /* v0.10.34 — ساخت یک‌کلیکی از روی قالب آماده (پیش‌پرشده با آثار برتر موضوع) */
  async function createFromTpl(tpl: CollectionTemplate) {
    if (busyTpl) return;
    setBusyTpl(tpl.id);
    try {
      const r = await createCollectionFromTemplate(tpl);
      toast.success(`مجموعه «${r.name}» با ${fa(r.added)} عنوان ساخته شد`);
      setCreating(false);
      onCollectionsChanged?.();
    } catch {
      toast.error("ساخت از قالب ناموفق بود");
    } finally {
      setBusyTpl(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ---- مجموعه‌های من (شخصی) ---- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-white">مجموعه‌های من</h2>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-brand/15 px-2 py-1 text-[11px] font-black text-brand transition hover:bg-brand/25"
          >
            <PlusIcon width={12} height={12} /> مجموعه جدید
          </button>
        </div>

        {creating && (
          <div className="mb-3 flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="نام مجموعه…"
              maxLength={60}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-[13px] font-bold text-white outline-none placeholder:text-zinc-600 focus:border-brand/60"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
              className="h-10 shrink-0 rounded-xl bg-brand px-3 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              ساخت
            </button>
          </div>
        )}

        {creating && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-bold text-zinc-500">یا با یک قالب آماده بساز:</p>
            <div className="flex flex-wrap gap-1.5">
              {COLLECTION_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  title={tpl.desc}
                  onClick={() => void createFromTpl(tpl)}
                  disabled={busyTpl !== null}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-zinc-300 transition hover:border-brand/50 hover:text-white disabled:opacity-40"
                >
                  {busyTpl === tpl.id ? "در حال ساخت…" : tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {cols.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs leading-6 text-zinc-500">
            <p className="flex items-center gap-1.5 font-black text-zinc-400">
              <LayersIcon width={13} height={13} /> هنوز مجموعه‌ای نساخته‌ای
            </p>
            <p className="mt-1.5">
              با «مجموعه جدید» اولین کالکشن شخصی‌ات را بساز و هر فیلم یا سریالی که خواستی داخلش بگذار. مجموعه‌ها با حسابت ذخیره می‌شوند.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {cols.map((c) => (
              <li key={c.id} className="group relative">
                <Link
                  href={`/collections/u?c=${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 transition hover:border-white/15 hover:bg-white/[0.07]"
                >
                  {thumbOf(c) ? (
                    <img src={thumbOf(c)} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-14 w-20 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-600">
                      <LayersIcon width={18} height={18} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-extrabold text-white">{c.name}</span>
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
                <button
                  type="button"
                  onClick={() => void remove(c)}
                  aria-label={`حذف ${c.name}`}
                  className="absolute -top-1.5 -start-1.5 grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-zinc-400 opacity-0 ring-1 ring-white/10 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <TrashIcon width={12} height={12} />
                </button>
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
                <Link href={titleHref(f.title.slug)} className="flex min-w-0 flex-1 items-center gap-3">
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
