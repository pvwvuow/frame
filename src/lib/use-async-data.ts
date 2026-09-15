"use client";

/* useAsyncData — the one fetch-lifecycle hook for client pages (B-2/B-3 fix).
 *
 * Every client page used to hand-roll `useEffect(() => { promise.then(...) })`
 * with no .catch — any rejection left the page on its loading skeleton (or a
 * forever spinner) with no way back. This hook:
 *   • races an alive-flag against unmount/dep changes (no late setState)
 *   • captures the error MESSAGE so the UI can render a Persian error card
 *   • resets `data` to null on every (re)run — pages keep their skeletons
 *   • exposes retry() — bumps an internal counter that re-runs the loader
 *
 * IMG-CACHE-5 (v0.35.4) — the SWR remount layer. Router staleness (60s in
 * v0.35.2) keeps the rendered tree alive for a while, but ANY router.refresh()
 * (a favorite toggle, a progress save, a rating — LibraryProvider.softRefresh
 * debounces into one) invalidates the whole client router cache, so the next
 * back-navigation remounts the page from scratch: skeleton → useAsyncData
 * blanks data → <img>s unmount → the user stares at a beat of dark boxes —
 * the «بعد ورود مجدد به هر صفحه یک یا دو ثانیه طول می‌کشه» report, even with
 * every artwork cache layer warm. A module-level last-good cache keyed by an
 * optional cacheKey flips remounts to stale-while-revalidate: the FIRST
 * render paints the previous visit's data (cards + posters, all RAM-warm)
 * and the loader re-runs silently underneath. No skeleton, no unmount flash.
 * Keys are capped LRU-style — this is a remount smoother, not a datastore.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncData<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

type SwrOpts = { cacheKey?: string };

const SWR_MAX = 48;
const swrCache = new Map<string, unknown>();

function swrGet(key: string): unknown | undefined {
  const hit = swrCache.get(key);
  if (hit !== undefined) {
    // refresh LRU recency
    swrCache.delete(key);
    swrCache.set(key, hit);
  }
  return hit;
}

function swrSet(key: string, value: unknown) {
  if (swrCache.has(key)) swrCache.delete(key);
  swrCache.set(key, value);
  if (swrCache.size > SWR_MAX) {
    const oldest = swrCache.keys().next().value;
    if (oldest !== undefined) swrCache.delete(oldest);
  }
}

export function useAsyncData<T>(fn: () => Promise<T>, deps: unknown[], opts?: SwrOpts): AsyncData<T> {
  const key = opts?.cacheKey;
  const hasCached = !!key && swrCache.has(key);
  const [data, setData] = useState<T | null>(() =>
    hasCached ? ((swrGet(key as string) as T) ?? null) : null
  );
  const [loading, setLoading] = useState(!hasCached);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // latest loader + current key without making them dependencies (pages pass
  // inline closures); the refs are synced OUTSIDE render (effect) per the
  // react-hooks/refs rule — effect ORDER matters: this one runs first, so the
  // loader effect below always reads the key of the render that scheduled it
  const fnRef = useRef(fn);
  const keyRef = useRef(key);
  useEffect(() => {
    fnRef.current = fn;
    keyRef.current = key;
  });

  useEffect(() => {
    let alive = true;
    const k = keyRef.current;
    const cached = !!k && swrCache.has(k);
    if (cached) {
      // stale-while-revalidate: keep last-good data on screen, revalidate
      // quietly; the first paint after a remount is already complete
      setLoading(false);
      setError(null);
      // also covers an in-place cacheKey change (e.g. catalog filter swap to
      // an already-visited filter): swap to THAT key's last-good instantly
      setData(swrGet(k as string) as T);
    } else {
      setLoading(true);
      setError(null);
      setData(null);
    }
    fnRef.current().then(
      (r) => {
        if (!alive) return;
        if (k) swrSet(k, r);
        setData(r);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        // a failed revalidation must not blank last-good data — only a
        // cold run (nothing cached) surfaces the error card
        if (!cached) setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    );
    return () => {
      alive = false;
    };
    // `deps` is intentionally dynamic — callers own the dependency list.
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return { data, loading, error, retry };
}
