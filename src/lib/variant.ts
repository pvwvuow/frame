"use client";

/* Variant (ورژن) helpers shared by the theater player and the desktop pip
 * window. Labels come from the archive; since v0.10.5 they are derived from
 * the actual file names (SoftSub → «زیرنویس چسبیده», Dubbed → «دوبله فارسی»,
 * NoSub → «بدون زیرنویس») so a variant pick always matches the file. */
import { sourceQualityRank } from "@/lib/source-fix";
import { getQualityPref } from "@/lib/quality-pref";

export function variantShort(v: string) {
  if (!v) return "";
  if (v.includes("دوبله")) return "دوبله";
  return v; // «زیرنویس چسبیده» / «بدون زیرنویس» — keep as-is
}

/** v0.10.19: index of the source matching the user's quality pick (made on
 *  the title page or in the player menu), -1 when absent or "best". */
export function qualityPrefIdx(list: { q: string }[]): number {
  const pref = getQualityPref();
  if (!pref || pref === "best") return -1;
  const p = pref.toLowerCase();
  return list.findIndex((s) => (s.q || "").toLowerCase() === p);
}

/** Which source should start by default?
 *  1. the user's quality pick (v0.10.19 — «با همون کیفیت پلی بشه، نه پیش‌فرض»)
 *  2. burned/bundled-subtitle versions, then Persian dub, then catalog order;
 *     same-variant rows are tie-broken by their REAL quality (from the URL). */
export function preferredSourceIdx(list: { q: string; v: string; url: string }[]): number {
  if (list.length <= 1) return 0;
  const qp = qualityPrefIdx(list);
  if (qp >= 0) return qp;
  const score = (v: string) => (v.includes("چسبیده") ? 3 : v.includes("دوبله") ? 2 : v.includes("زیرنویس") ? 1 : 0);
  let best = 0;
  let bestScore = -1;
  let bestQ = -1;
  for (let i = 0; i < list.length; i++) {
    const s = score(list[i].v || "");
    const q = sourceQualityRank(list[i]);
    if (s > bestScore || (s === bestScore && q > bestQ)) {
      best = i;
      bestScore = s;
      bestQ = q;
    }
  }
  return best;
}

const VARIANT_PREF_KEY = "nama-variant-pref"; // remembered default variant choice

/** Remember the variant the user manually picked, so the NEXT video they open
 *  starts with the same taste (dubbed people get dubbed, etc.). */
export function rememberedVariantIdx(list: { q: string; v: string }[]): number {
  try {
    const pref = localStorage.getItem(VARIANT_PREF_KEY);
    if (!pref) return -1;
    for (let i = 0; i < list.length; i++) {
      const v = list[i].v || "";
      if (v.includes("چسبیده") && pref === "hardsub") return i;
      if (v.includes("دوبله") && pref === "dub") return i;
    }
  } catch {
    /* ignore */
  }
  return -1;
}

export function rememberVariantPref(v?: string) {
  try {
    if (!v) return;
    if (v.includes("چسبیده")) localStorage.setItem(VARIANT_PREF_KEY, "hardsub");
    else if (v.includes("دوبله")) localStorage.setItem(VARIANT_PREF_KEY, "dub");
  } catch {
    /* ignore */
  }
}
