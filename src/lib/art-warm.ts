/* IMG-CACHE-5 (v0.35.4) — bridge to the renderer RAM-art warmer
 * (ART_WARMER_SCRIPT in src/app/layout.tsx pins every finished artwork
 * <img> as a live Image element in a module LRU).
 *
 * `warmArtHas(src)` tells a client component whether THIS session already
 * finished loading that artwork once. Remounted cards use it to drop
 * loading="lazy" (warm srcs need no viewport gating — Chromium paints them
 * from renderer RAM on the first frame), so back-navigation posters never
 * wait for an IntersectionObserver callback + a service-worker round-trip
 * before they start painting. SSR/hydration renders see `false` (no window
 * / nothing loaded yet), which matches the server markup exactly. */

export function warmArtHas(src: string | null | undefined): boolean {
  if (!src || typeof window === "undefined") return false;
  const w = window as unknown as { __warmHas?: (u: string) => boolean };
  try {
    return !!w.__warmHas?.(src);
  } catch {
    return false;
  }
}
