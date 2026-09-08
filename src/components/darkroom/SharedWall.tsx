"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * دیوار کالکشن‌های کاربران (تاریکخانه) — v0.10.34.
 * Public wall of user-published collections (Supabase `shared_collections`).
 * Browse signed-out or signed-in; publish/unpublish YOUR collections;
 * clone any wall collection into your own (local + account sync).
 * Overlays stay under z-[90] so the TitleCard quick-view (z-[90]) stacks above.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import TitleCard from "@/components/TitleCard";
import {
  CheckIcon,
  CloseIcon,
  GlobeIcon,
  LayersIcon,
  RefreshIcon,
  ShareIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/Icons";
import { localIdsForSlugs, useCloudSession } from "@/lib/cloud";
import { fetchCollectionItems, fetchUserCollections, type UCollection } from "@/lib/collections";
import {
  listMySharedNames,
  listSharedCollections,
  saveSharedCollectionToLocal,
  shareCollectionToWall,
  unshareCollectionFromWall,
  type SharedCollection,
} from "@/lib/shared-collections";
import { getFullTitle, type LiteTitle } from "@/lib/mobile/db";
import { fa } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* wall card — poster collage + identity                               */
/* ------------------------------------------------------------------ */
function WallCard({ sc, onOpen }: { sc: SharedCollection; onOpen: () => void }) {
  const posters = sc.items.map((i) => i.poster).filter(Boolean).slice(0, 4);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-3xl border border-white/5 bg-white/[0.03] text-start transition hover:-translate-y-1 hover:border-white/15 hover:bg-white/[0.06]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {posters.length > 0 ? (
          <div className={`grid h-full w-full gap-0.5 ${posters.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {(posters.length === 1 ? [posters[0], posters[0], posters[0], posters[0]] : posters).map((p, i) => (
              <img key={i} src={p} alt="" className="h-full w-full object-cover" loading="lazy" />
            ))}
          </div>
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-white/[0.06] to-transparent text-zinc-700">
            <LayersIcon width={34} height={34} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <span className="num absolute bottom-2.5 start-3 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur">
          {fa(sc.itemCount)} عنوان
        </span>
      </div>
      <div className="p-3.5">
        <p className="truncate text-sm font-extrabold text-white">{sc.name}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
          <UsersIcon width={11} height={11} /> {sc.ownerName}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* the wall                                                            */
/* ------------------------------------------------------------------ */
export default function SharedWall({ modeBar }: { modeBar?: ReactNode }) {
  const { session } = useCloudSession();
  const signedIn = !!session?.user;

  const [rows, setRows] = useState<SharedCollection[] | null>(null);
  const [mineNames, setMineNames] = useState<Map<string, string>>(new Map());

  const [open, setOpen] = useState<SharedCollection | null>(null);
  const [openItems, setOpenItems] = useState<(LiteTitle | null)[] | null>(null);
  const [savingWall, setSavingWall] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [myCols, setMyCols] = useState<UCollection[] | null>(null);
  const [busyCol, setBusyCol] = useState<number | null>(null);

  const load = useCallback(() => {
    void listSharedCollections(60).then(setRows);
    void listMySharedNames().then(setMineNames);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* resolve wall items to real catalog rows when a card opens */
  useEffect(() => {
    if (!open) {
      setOpenItems(null);
      return;
    }
    let alive = true;
    setOpenItems(null);
    (async () => {
      // v0.13.0 — resolve slugs against THIS device's catalog first; the
      // numeric ids stored by the publishing device can point at completely
      // different titles here (id drift).
      const resolved = await localIdsForSlugs(open.items.map((it) => it.slug ?? "").filter(Boolean));
      const full = await Promise.all(
        open.items.map((it) => {
          const id = (it.slug ? resolved.get(it.slug)?.id : undefined) ?? it.id ?? 0;
          return id ? getFullTitle(id).catch(() => null) : Promise.resolve(null);
        })
      );
      if (alive) setOpenItems(full);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  /* my collections for the share modal */
  useEffect(() => {
    if (!shareOpen) return;
    setMyCols(null);
    fetchUserCollections()
      .then(setMyCols)
      .catch(() => setMyCols([]));
  }, [shareOpen]);

  async function doShare(c: UCollection) {
    setBusyCol(c.id);
    try {
      const items = await fetchCollectionItems(c.id);
      const r = await shareCollectionToWall(c, items);
      if (r.ok) {
        toast.success(`«${c.name}» در تاریکخانه منتشر شد`);
        void listMySharedNames().then(setMineNames);
      } else if (r.error === "signed-out") {
        toast.error("برای انتشار، اول وارد حسابت شو");
      } else {
        toast.error("انتشار ناموفق بود — مطمئن شو اسکریپت SQL اجرا شده و دوباره تلاش کن");
      }
    } catch {
      toast.error("انتشار ناموفق بود");
    } finally {
      setBusyCol(null);
    }
  }

  async function doUnshare(c: UCollection) {
    if (!confirm(`«${c.name}» از دیوار تاریکخانه حذف شود؟`)) return;
    setBusyCol(c.id);
    try {
      const r = await unshareCollectionFromWall(c.name);
      if (r.ok) {
        toast.success("از دیوار تاریکخانه حذف شد");
        void listMySharedNames().then(setMineNames);
      } else if (r.error === "signed-out") {
        toast.error("برای حذف، اول وارد حسابت شو");
      } else {
        toast.error("حذف ناموفق بود");
      }
    } catch {
      toast.error("حذف ناموفق بود");
    } finally {
      setBusyCol(null);
    }
  }

  async function saveToLocal(sc: SharedCollection) {
    setSavingWall(true);
    try {
      const r = await saveSharedCollectionToLocal(sc);
      toast.success(`«${r.name}» با ${fa(r.added)} عنوان به کالکشن‌هایت اضافه شد`);
      setOpen(null);
    } catch {
      toast.error("افزودن به کالکشن‌ها ناموفق بود");
    } finally {
      setSavingWall(false);
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-28">
      {/* ── header ── */}
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-white/[0.07] pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-[28px]">کالکشن‌های کاربران</h1>
          <p className="mt-1.5 max-w-lg text-[13px] leading-6 text-zinc-500">
            دیوار تاریکخانه — کالکشن‌های شخصی که کاربران فریم انتخابشان را این‌جا به اشتراک گذاشته‌اند؛ ببین، ذخیره کن، خودت هم منتشر کن.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modeBar}
          <button
            type="button"
            onClick={load}
            aria-label="به‌روزرسانی"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/30 text-zinc-400 transition hover:border-white/30 hover:text-white"
          >
            <RefreshIcon width={15} height={15} />
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-black text-white transition hover:bg-brand-600"
          >
            <ShareIcon width={13} height={13} /> انتشار کالکشن من
          </button>
        </div>
      </header>

      {/* ── grid ── */}
      {rows === null ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <GlobeIcon width={30} height={30} className="mx-auto text-zinc-700" />
          <p className="mt-3 text-sm font-black text-zinc-300">هنوز کالکشنی منتشر نشده — اولین نفر باش!</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-zinc-500">
            با دکمه‌ی «انتشار کالکشن من» یکی از کالکشن‌های شخصی‌ات را روی این دیوار به اشتراک بگذار تا بقیه کاربران هم ببینند.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((sc) => (
            <WallCard key={sc.id} sc={sc} onOpen={() => setOpen(sc)} />
          ))}
        </div>
      )}

      {/* ══════════ detail overlay ══════════ */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="force-dark flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/5 p-5">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-white">{open.name}</h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-500">
                  <span className="flex items-center gap-1">
                    <UsersIcon width={11} height={11} /> {open.ownerName}
                  </span>
                  <span className="num flex items-center gap-1">
                    <LayersIcon width={11} height={11} /> {fa(open.itemCount)} عنوان
                  </span>
                  {mineNames.has(open.name) && (
                    <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 font-bold text-emerald-400">
                      <CheckIcon width={10} height={10} /> منتشر شده
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="بستن"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white"
              >
                <CloseIcon width={15} height={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {openItems === null ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {open.items.slice(0, 12).map((_, i) => (
                    <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {openItems.map((t, i) =>
                    t ? (
                      <TitleCard key={`${open.id}-${i}`} t={t} size="sm" />
                    ) : (
                      /* synced id the local catalog doesn't know — static tile */
                      <div key={`${open.id}-${i}`} className="opacity-70">
                        <img
                          src={open.items[i]?.poster}
                          alt=""
                          className="aspect-[2/3] w-full rounded-xl object-cover"
                          loading="lazy"
                        />
                        <p className="mt-1.5 truncate text-[11px] font-bold text-zinc-400">{open.items[i]?.title}</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 p-4">
              <button
                type="button"
                onClick={() => void saveToLocal(open)}
                disabled={savingWall}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                <PlusGlyph /> {savingWall ? "در حال افزودن…" : "افزودن به کالکشن‌های من"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ share modal ══════════ */}
      {shareOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="force-dark flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/5 p-5">
              <div>
                <h3 className="text-base font-black text-white">انتشار کالکشن در تاریکخانه</h3>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  یکی از کالکشن‌های شخصی‌ات را روی دیوار عمومی منتشر کن؛ هر وقت خواستی حذفش کن.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="بستن"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white"
              >
                <CloseIcon width={15} height={15} />
              </button>
            </div>

            {!signedIn ? (
              <div className="p-8 text-center">
                <p className="text-sm font-black text-zinc-300">برای انتشار کالکشن، اول وارد حسابت شو</p>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-6 text-zinc-500">
                  انتشار روی دیوار عمومی به حساب نیاز دارد تا نام تو کنار کالکشن بماند و بتوانی هر وقت خواستی حذفش کنی.
                </p>
                <Link
                  href="/auth"
                  className="mt-5 inline-flex rounded-xl bg-brand px-5 py-2.5 text-xs font-black text-white transition hover:bg-brand-600"
                >
                  ورود / ثبت‌نام
                </Link>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {myCols === null ? (
                  <div className="space-y-2.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
                    ))}
                  </div>
                ) : myCols.length === 0 ? (
                  <p className="p-6 text-center text-xs leading-6 text-zinc-500">
                    هنوز کالکشنی نساخته‌ای؛ اول از صفحه‌ی «مجموعه‌ها» یا «لیست من» یک کالکشن بساز.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {myCols.map((c) => {
                      const published = mineNames.has(c.name);
                      return (
                        <li
                          key={c.id}
                          className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5"
                        >
                          {c.posters.length > 0 ? (
                            <span className="flex shrink-0 -space-x-2.5">
                              {c.posters.slice(0, 2).map((p, i) => (
                                <img key={i} src={p} alt="" className="h-12 w-8 rounded-md object-cover ring-2 ring-zinc-950" loading="lazy" />
                              ))}
                            </span>
                          ) : (
                            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-600">
                              <LayersIcon width={16} height={16} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-extrabold text-white">{c.name}</span>
                            <span className="num mt-0.5 block text-[10px] font-medium text-zinc-500">
                              {c.count === 0 ? "خالی" : `${fa(c.count)} عنوان`}
                            </span>
                          </span>
                          {published && (
                            <span className="hidden items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 sm:flex">
                              <CheckIcon width={10} height={10} /> منتشر شده
                            </span>
                          )}
                          {published ? (
                            <span className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void doShare(c)}
                                disabled={busyCol === c.id || c.count === 0}
                                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-zinc-300 transition hover:border-white/30 hover:text-white disabled:opacity-40"
                              >
                                {busyCol === c.id ? "…" : "به‌روزرسانی"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void doUnshare(c)}
                                disabled={busyCol === c.id}
                                aria-label={`حذف ${c.name} از دیوار`}
                                className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-zinc-500 transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-40"
                              >
                                <TrashIcon width={12} height={12} />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void doShare(c)}
                              disabled={busyCol === c.id || c.count === 0}
                              className="flex shrink-0 items-center gap-1 rounded-lg bg-brand/15 px-2.5 py-1.5 text-[10px] font-black text-brand transition hover:bg-brand/25 disabled:opacity-40"
                            >
                              <ShareIcon width={11} height={11} />
                              {busyCol === c.id ? "…" : "انتشار"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
