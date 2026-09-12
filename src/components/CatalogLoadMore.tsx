"use client";

/* Loads the rest of the catalog in pages after the server-rendered first
   batch (v0.10.4 perf fix). Renders the same TitleCard grid; triggered by an
   explicit button plus an IntersectionObserver auto-load sentinel. */
import { useCallback, useEffect, useRef, useState } from "react";
import TitleCard, { type TitleCardData } from "@/components/TitleCard";
import { fa } from "@/lib/format";
import { useI18n } from "./i18n/LocaleProvider";
import { ChevronLeft, RefreshIcon } from "./Icons";

export default function CatalogLoadMore({
  filters,
  offset,
  total,
  rankStart,
  pageSize = 48,
}: {
  filters: { type: string; genre?: string; sort?: string; year?: number; minRating?: number };
  offset: number;
  total: number;
  rankStart?: number;
  pageSize?: number;
}) {
  const { t: tr, dir } = useI18n();
  const [items, setItems] = useState<TitleCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // B-13: a failed page used to silently DELETE the load-more UI (`catch →
  // setDone(true)`) — the rest of the catalog became unreachable. It is now
  // an explicit error state with a retry.
  const [failed, setFailed] = useState(false);
  const [auto, setAuto] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  /* B-13: offset lives in STATE now — the old ref was mutated inside the
   * setItems updater (impure: double-incremented under StrictMode) and was
   * read during render (the eslint:102 complaint). State keeps render pure
   * and the next offset unambiguous. */
  const [nextOffset, setNextOffset] = useState(offset);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    setFailed(false);
    try {
      const qs = new URLSearchParams();
      qs.set("type", filters.type);
      if (filters.genre) qs.set("genre", filters.genre);
      if (filters.sort) qs.set("sort", filters.sort);
      if (filters.year) qs.set("year", String(filters.year));
      if (filters.minRating) qs.set("rating", String(filters.minRating));
      qs.set("offset", String(nextOffset));
      qs.set("limit", String(pageSize));
      const res = await fetch(`/api/catalog?${qs.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: TitleCardData[]; progress: Record<string, { position: number; duration: number }> };
      const fetched = data.items ?? [];
      // dedupe against what is already mounted, advance ONLY by unique rows
      // (same semantics as the old in-updater mutation, now side-effect free)
      const seen = new Set(items.map((t) => t.id));
      const fresh = fetched.filter((t) => !seen.has(t.id));
      const advanced = nextOffset + fresh.length;
      setItems([...items, ...fresh]);
      setNextOffset(advanced);
      window.__namaProgress = { ...window.__namaProgress, ...data.progress };
      if (!fetched.length || advanced >= total) setDone(true);
      else setAuto(true); // first manual click → subsequent pages auto-load on scroll
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filters, loading, done, total, pageSize, items, nextOffset]);

  useEffect(() => {
    if (!auto || done || failed) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [auto, done, failed, loadMore]);

  const remaining = Math.max(0, total - nextOffset);

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {items.map((t, i) => (
          <div key={t.id} className="[&>div]:w-full">
            <TitleCard t={t} progress={window.__namaProgress?.[t.id]} rank={rankStart ? rankStart + i : undefined} />
          </div>
        ))}
      </div>

      <div ref={sentinel} />

      {failed ? (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-bold text-white" dir={dir}>{tr("loadMore.failed")}</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
            dir={dir}
          >
            <RefreshIcon width={15} height={15} /> {tr("nav.retry")}
          </button>
        </div>
      ) : (
        !done && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-8 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <ChevronLeft width={16} height={16} />
              )}
              {loading ? tr("common.loading") : tr("loadMore.more", { n: fa(remaining) })}
            </button>
          </div>
        )
      )}
    </>
  );
}
