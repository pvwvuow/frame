"use client";

import { flushSync } from "react-dom";

/**
 * v0.55.0 — the theme flip, perf-engineered.
 *
 * WHY: the old soft morph transitioned ~48 registered custom properties on
 * <html> over 800ms. Inherited custom properties invalidate style for every
 * element, so each animation frame did a full-document style recalc + paint
 * and re-rasterized every gradient, color-mix fade and backdrop-filter
 * surface — measured 4.2s of main-thread busy across 3 flips (worst frozen
 * frame 583ms) on scripts/measure_theme_flip.mjs. The tokens now SNAP
 * (one frame, under next-themes' transition kill) and the softness comes
 * from here instead:
 *
 *   document.startViewTransition(() => flushSync(() => setTheme(next)))
 *
 * The browser paints the old state ONCE into a snapshot texture, runs the
 * callback (React re-renders + next-themes flips the class in the same
 * task), paints the new state ONCE, then crossfades the two static
 * textures on the compositor — GPU-only, no per-frame style work at all.
 * 240ms (tuned in globals.css ::view-transition-*).
 *
 * Fallbacks:
 *   - no startViewTransition (older WebViews / Electron) → instant snap;
 *     still strictly cheaper than the old paint storm;
 *   - reduced motion → instant snap. Honors the app's own switch
 *     (LibraryProvider sets data-reduce-motion from the profile): "1" =
 *     always reduce, "0" = always animate (even if the OS asks to reduce,
 *     matching the CSS exemption), unset = follow the OS preference.
 */
export function flipTheme(setTheme: (theme: string) => void, next: string): void {
  const doc = document as Document & {
    startViewTransition?: (update: () => void) => unknown;
  };
  const attr = document.documentElement.getAttribute("data-reduce-motion");
  const reduce =
    attr === "1" ||
    (attr === null && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  /* «system» resolves through prefers-color-scheme — if it resolves to the
   * class already on <html>, nothing will change visually, so skip the
   * snapshot crossfade entirely (240ms of fading identical frames). */
  const resolved =
    next === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : next;
  const html = document.documentElement;
  const unchanged = html.classList.contains(resolved);
  if (unchanged || typeof doc.startViewTransition !== "function" || reduce) {
    setTheme(next);
    return;
  }
  doc.startViewTransition(() => {
    flushSync(() => setTheme(next));
  });
}
