/* Runtime auto-hero picker (v0.24.0).
 *
 * The user asked for a SYSTEM, not a one-off curation: «از این به بعد اگه
 * محتوای جدیدی اضافه کردیم... خودش تشخیص بده چیا جدیدن و امتیاز خوبی دارن
 * و بذاره تو اسلایدشو اصلی بالا».
 *
 * The `featured` DB flag turned out to be a fragile delivery channel: it only
 * reaches a device through a full catalog merge, and a half-applied merge
 * (app closed mid-merge) leaves a frozen MIXED hero (the «چرا این ۴ تا هنوز
 * بالان؟» report: three old classics + one random new title). So the hero no
 * longer DEPENDS on the flag — this module re-derives the lineup from the
 * add-dates the device already has, with the exact same rules the publish
 * pipeline (scripts/feature-new-hero.mjs) uses when it recuts the flags:
 *
 *   1. wave anchor  = newest add-date in the local catalog;
 *   2. wave window  = anchor − 72h (a sync spilling across midnight is one
 *      wave);
 *   3. candidates   = wave titles with rating ≥ 8.5 and a real tt poster AND
 *      backdrop (the hero is a visual surface);
 *   4. series first, top movies fill the remaining slots;
 *   5. order rating → trendingScore, take COUNT (8).
 *
 * Pure + dependency-free (transpiled standalone by scripts/test-hero-pick.mjs
 * — keep it that way). Callers decide playability (episode counts) during
 * hydration; this module only ranks. Same-shape type as LiteTitle on purpose:
 * structural, no import cycle.
 */

export type HeroCandidate = {
  id: number;
  type: string; // "movie" | "series"
  rating: number;
  trendingScore: number;
  poster: string;
  backdrop: string;
  createdAt?: string; // catalog add-date (LiteTitle.createdAt = shard addedAt)
};

/** Parse an add-date to epoch ms; missing/unparseable → 0 (= oldest). */
export function addedOf(t: { createdAt?: string }): number {
  if (!t.createdAt) return 0;
  const ms = Date.parse(t.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

const isTtCover = (p: string) => /^\/covers\/tt\d+\//.test(p || "");

export type PickHeroOptions = {
  count?: number;        // lineup size (default 8 — HERO_COUNT)
  minRating?: number;    // default 8.5 (HERO_MIN_RATING)
  waveWindowH?: number;  // default 72 (HERO_WAVE_WINDOW_H)
};

/**
 * Pick the hero lineup from a lite index. Deterministic: the same data always
 * yields the same lineup, on every platform, without any server round-trip.
 * Returns [] when the catalog carries no add-dates at all (pre-v0.23 shards)
 * — callers then fall back to the featured flags.
 */
export function pickHero(
  lite: HeroCandidate[],
  opts: PickHeroOptions = {}
): HeroCandidate[] {
  const count = opts.count ?? 8;
  const minRating = opts.minRating ?? 8.5;
  const windowMs = (opts.waveWindowH ?? 72) * 3600_000;

  let anchor = 0;
  for (const t of lite) {
    const ms = addedOf(t);
    if (ms > anchor) anchor = ms;
  }
  if (!anchor) return []; // no add-date data → caller falls back

  const floor = anchor - windowMs;
  const byQuality = (a: HeroCandidate, b: HeroCandidate) =>
    b.rating - a.rating || b.trendingScore - a.trendingScore || b.id - a.id;
  const inWave = (t: HeroCandidate) =>
    t.rating >= minRating && isTtCover(t.poster) && isTtCover(t.backdrop);

  const wave = lite.filter((t) => {
    const ms = addedOf(t);
    return ms > 0 && ms >= floor;
  });
  // series first — the hero's Play button should open a binge, not a one-off
  const series = wave.filter((t) => t.type === "series" && inWave(t)).sort(byQuality);
  const movies = wave.filter((t) => t.type !== "series" && inWave(t)).sort(byQuality);
  return [...series, ...movies].slice(0, count);
}
