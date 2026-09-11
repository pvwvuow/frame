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
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncData<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

export function useAsyncData<T>(fn: () => Promise<T>, deps: unknown[]): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // latest loader without making it a dependency (pages pass inline closures);
  // the ref is synced OUTSIDE render (effect) per the react-hooks/refs rule
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null);
    fnRef.current().then(
      (r) => {
        if (!alive) return;
        setData(r);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
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
