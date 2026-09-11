"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import TitleCard from "@/components/TitleCard";
import LoadErrorCard from "@/components/LoadErrorCard";
import { fa } from "@/lib/format";
import { LayersIcon, ChevronLeft, TrashIcon } from "@/components/Icons";
import { fetchCollectionItems, fetchUserCollections, setCollectionItem } from "@/lib/collections";
import type { LiteTitle } from "@/lib/mobile/db";
import type { UCollection } from "@/lib/collections";
import { useAsyncData } from "@/lib/use-async-data";

function UCollectionInner() {
  const sp = useSearchParams();
  const cid = Number(sp.get("c")) || 0;

  /* one run = the collection header + its items; retry() re-runs after a
   * removal so the grid stays honest (B-2: failures surface instead of hang) */
  const { data, error, retry } = useAsyncData<{ col: UCollection | null; items: LiteTitle[] }>(async () => {
    if (!cid) return { col: null, items: [] };
    const [list, rows] = await Promise.all([fetchUserCollections(), fetchCollectionItems(cid)]);
    return { col: list.find((c) => c.id === cid) ?? null, items: rows };
  }, [cid]);
  const col = data?.col ?? null;
  const items = data?.items ?? null;

  async function removeItem(titleId: number) {
    if (!col) return;
    try {
      await setCollectionItem(col.id, col.name, titleId, false);
      toast.success("از مجموعه حذف شد");
      retry();
    } catch {
      toast.error("حذف ناموفق بود");
    }
  }

  if (!cid) {
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-32 text-center sm:px-8 lg:px-12">
          <h1 className="text-2xl font-black text-white">مجموعه‌ای انتخاب نشده</h1>
          <Link href="/collections" className="mt-4 inline-block text-sm font-bold text-brand hover:underline">
            بازگشت به مجموعه‌ها
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-16">
      <div className="mx-auto max-w-[1600px] px-4 pt-28 sm:px-8 lg:px-12 lg:pt-32">
        <Link href="/collections" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 transition hover:text-brand">
          <ChevronLeft width={14} height={14} /> همه‌ی مجموعه‌ها
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand">
            <LayersIcon width={22} height={22} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black text-white sm:text-3xl">{col?.name ?? (items ? "مجموعه" : "…")}</h1>
            <p className="num mt-0.5 text-xs font-bold text-zinc-500">
              {items ? `${fa(items.length)} عنوان` : ""}
              {col ? " · سینک با حساب کاربری" : ""}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-8">
            <LoadErrorCard onRetry={retry} />
          </div>
        ) : items === null ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <p className="text-sm font-black text-zinc-300">این مجموعه هنوز خالی است</p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-zinc-500">
              از صفحه‌ی هر فیلم یا سریال، دکمه‌ی «افزودن به مجموعه» را بزن تا عنوان‌های دلخواهت این‌جا جمع شوند.
            </p>
            <Link href="/" className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-xs font-black text-white transition hover:bg-brand-600">
              گشتن در کاتالوگ
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {items.map((t) => (
              <div key={t.id} className="group relative [&>div]:w-full">
                <TitleCard t={t} />
                <button
                  type="button"
                  onClick={() => void removeItem(t.id)}
                  aria-label={`حذف ${t.title} از مجموعه`}
                  className="absolute end-2 top-2 z-10 hidden h-8 w-8 place-items-center rounded-full bg-black/70 text-zinc-300 ring-1 ring-white/15 backdrop-blur transition hover:bg-rose-600 hover:text-white group-hover:grid"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function UCollectionPage() {
  return (
    <Suspense
      fallback={
        <main className="pb-16">
          <div className="mx-auto max-w-[1600px] px-4 pt-32 sm:px-8 lg:px-12">
            <div className="h-10 w-56 animate-pulse rounded-xl bg-white/10" />
          </div>
        </main>
      }
    >
      <UCollectionInner />
    </Suspense>
  );
}
