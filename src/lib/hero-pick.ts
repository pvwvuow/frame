/* The hero curation rules (v0.38.0 — the «برترین‌ها» billboard).
 *
 * v0.24–v0.37 picked the lineup from the newest ADD-WAVE (72h window,
 * rating ≥ 8.5, series first). The user recut the show for v0.38:
 *   «فعلا میخام ۳ تا فیلم برتر و ۲ تا سریال برتر رو اونجا بزاریم..
 *    مستند ها رو هم بردار کلا»
 *
 * The rules are now a straight best-of-catalog billboard:
 *   1. the whole catalog is the candidate pool (no wave window, no add-date
 *      dependence — a catalog without any createdAt still gets a lineup);
 *   2. documentaries («مستند») are excluded completely — the hero is a
 *      fictional-showcase surface, however high a doc rates;
 *   3. the plate needs real art: tt-shaped poster AND backdrop (the same
 *      isTtCover proxy the pipeline always used);
 *   4. top `movieCount` (3) movies + top `seriesCount` (2) series, each side
 *      ranked rating → trendingScore → id;
 *   5. display order = the merged five by rating — the best title opens the
 *      show.
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
  genres?: string[]; // stored Persian genre strings; «مستند» is excluded
  createdAt?: string; // kept for LiteTitle shape-compat (no longer used)
};

const isTtCover = (p: string) => /^\/covers\/tt\d+\//.test(p || "");

/** Documentaries never belong on the hero billboard (user rule, v0.38.0). */
const DOCUMENTARY = "مستند";

const byQuality = (a: HeroCandidate, b: HeroCandidate) =>
  b.rating - a.rating || b.trendingScore - a.trendingScore || b.id - a.id;

export type PickHeroOptions = {
  movieCount?: number; // top movies (default 3)
  seriesCount?: number; // top series (default 2)
};

/**
 * Pick the hero lineup from a lite index. Deterministic: the same data always
 * yields the same lineup, on every platform, without any server round-trip.
 * Returns [] only when NO title carries real tt art at all — callers then
 * fall back to the featured flags.
 */
export function pickHero(
  lite: HeroCandidate[],
  opts: PickHeroOptions = {}
): HeroCandidate[] {
  const movieCount = opts.movieCount ?? 3;
  const seriesCount = opts.seriesCount ?? 2;

  const pool = lite.filter(
    (t) => isTtCover(t.poster) && isTtCover(t.backdrop) && !(t.genres || []).includes(DOCUMENTARY)
  );
  const series = pool.filter((t) => t.type === "series").sort(byQuality).slice(0, seriesCount);
  const movies = pool.filter((t) => t.type !== "series").sort(byQuality).slice(0, movieCount);
  return [...series, ...movies].sort(byQuality);
}
