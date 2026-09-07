"use client";

/* v0.10.19 — the user's PLAYBACK quality, chosen on the movie/series page
 * BEFORE pressing play («کدوم کیفیت رو میخاد ببینه»). The player applies it
 * to every new video it opens: clicking any episode starts with the picked
 * quality instead of the archive default. A manual quality switch inside the
 * player updates it too, so the choice sticks everywhere.
 * "best" (default) = no preference → the archive's own order wins. */

const KEY = "nama-quality-pref";
export const QUALITY_PREF_EVENT = "nama-quality-pref-changed";

export function getQualityPref(): string {
  try {
    return localStorage.getItem(KEY) || "best";
  } catch {
    return "best";
  }
}

export function setQualityPref(q: string) {
  try {
    const clean = (q || "").trim();
    if (clean && clean !== "best") localStorage.setItem(KEY, clean);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(QUALITY_PREF_EVENT, { detail: q || "best" }));
  } catch {
    /* ignore */
  }
}
