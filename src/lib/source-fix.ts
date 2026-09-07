/* نما – canonical source hygiene (v0.10.17)
 *
 * WHY THIS EXISTS
 * The archive's own tables list several files per quality, and the original
 * import zipped the label rows against the file rows in the wrong order:
 * ~17% of the shipped sources carried a quality label that does NOT match
 * the file their URL actually points at (label «720p» on a 480p file, label
 * «1080p» on a 720p file …). The user picks «۴۸۰» in the quality menu and
 * the app faithfully plays the mislabeled file — reported as
 * «۴۸۰ می‌گذارم، ۷۲۰ پخش می‌شود؛ لینک‌ها با کیفیت‌ها هماهنگ نیستند».
 *
 * The file name inside the URL is the GROUND TRUTH (DonyayeSerial always
 * encodes the real resolution in the file/dir name) — the same rule
 * scripts/fix-variant-labels.cjs already applies to variant labels. Every
 * source list is therefore re-derived from the URL at runtime, wherever it
 * came from (bundled seed, remote catalog sync, older database).
 *
 * This module is intentionally NEUTRAL (no "use client", no server imports):
 * both server pages (/watch, /title) and client stores import it.
 */

export interface SourceLikeQV {
  q?: string;
  v?: string;
  url: string;
  mb?: number;
}

/** quality tag → canonical UI label */
const Q_LABEL: Record<string, string> = {
  "2160p": "4K",
  "4k": "4K",
  uhd: "4K",
  "1080p": "1080p",
  "720p": "720p",
  "576p": "540p",
  "540p": "540p",
  "480p": "480p",
  "360p": "360p",
  "240p": "360p",
};

/** canonical label → sort rank (matches parser.ts QUALITY_RANK) */
const Q_RANK: Record<string, number> = {
  "4K": 10,
  "1080p": 8,
  "720p": 6,
  "540p": 4,
  "480p": 3,
  "360p": 2,
};

const Q_TAG_RE = /(?:^|[.\-_ \/])(2160p|1080p|720p|576p|540p|480p|360p|240p|4k|uhd)(?=$|[.\-_ \/])/i;

/** The quality the URL's file/dir names actually carry, or null.
 *  The BASENAME is matched first (the file name is the most specific truth —
 *  a `...480p...mkv` inside a `720p.BluRay/` dir is still a 480p file), then
 *  the whole path. Hostname and query string are excluded. */
export function urlQuality(url: string): string | null {
  let s = String(url || "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  s = s.split("?")[0].split("#")[0];
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(slash + 1); // drop the host
  const baseSlash = s.lastIndexOf("/");
  const base = baseSlash >= 0 ? s.slice(baseSlash + 1) : s;
  const m = Q_TAG_RE.exec(base) ?? Q_TAG_RE.exec(s);
  if (!m) return null;
  return Q_LABEL[m[1].toLowerCase()] ?? null;
}

/** Variant label from the file name — the exact rules of
 *  scripts/fix-variant-labels.cjs (Dubbed / SoftSub / HardSub / NoSub). */
export function canonicalVariant(url: string, current: string): string {
  let s = String(url || "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  if (/\/Dubbed\/|[.\-]Dubbed[.\-]|Farsi[.\-]?Dubbed/i.test(s)) return "دوبله فارسی";
  if (/HardSub/i.test(s)) return "زیرنویس چسبیده";
  if (/SoftSub/i.test(s)) return "زیرنویس چسبیده";
  if (/\/NoSub\/|[.\-]NoSub[.\-]/i.test(s)) return "بدون زیرنویس";
  return current; // plain-named files (e.g. drama encodes) keep their label
}

/** Sort rank of a source's REAL quality (URL first, label fallback). */
export function sourceQualityRank(s: { q?: string; url: string }): number {
  const fromUrl = urlQuality(s.url);
  if (fromUrl) return Q_RANK[fromUrl] ?? 0;
  return Q_RANK[s.q ?? ""] ?? 0;
}

/**
 * Fix a source list in place-less style: quality & variant re-derived from
 * the URL, duplicate URLs dropped (a duplicated row is another import artifact —
 * picking either row must play the same file, and a duplicated «۴۸۰» row
 * pointing at the 720p file looks EXACTLY like the wrong-quality bug).
 * Order is preserved so remembered variant indexes and PiP hints stay valid.
 */
export function normalizeSources<T extends SourceLikeQV>(list: T[] | null | undefined): T[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    if (!s || !s.url) continue;
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const q = urlQuality(s.url) ?? s.q ?? "";
    const v = canonicalVariant(s.url, s.v ?? "");
    out.push(q === s.q && v === s.v ? s : { ...s, q, v });
  }
  return out;
}
