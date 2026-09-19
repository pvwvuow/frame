/* =====================================================================================
 * v0.50.0 — THE WEEKLY DECK (پیشنهاد این هفته — the shelf under the theater)
 *
 * The user asked for a "weekly shop" among the home rows: «مثل شاپ هفتگی ک
 * پیشنهادی میاد به کاربر نشون بده.. مثلا این هفته 6 تا فیلمی ک متناسب با
 * کاربره بیاد نمایش بده (مناسب با علاقه ها ..چیز هایی ک دیده)» — six frames
 * on a wooden shelf, recut EVERY WEEK, tuned to each viewer's taste.
 *
 * It is patterned EXACTLY on the HERO DECK (v0.49.0) — the architecture that
 * finally killed the «still the old show» bug class:
 *
 *   • At build time scripts/feature-weekly.mjs writes a POOL of ~36 quality
 *     candidates (identity, genres, display copy, art) into
 *     public/catalog/mobile/weekly.json — version-stamped by the pool's own
 *     content hash, self-contained (the runtime never hydrates or joins).
 *   • At runtime the app REPLACES the stored pool whenever a different deck
 *     version arrives. No merge, no flags, nothing a stale cache can revive.
 *   • The SIX visible picks are chosen ON DEVICE by pickWeeklySix: a pure,
 *     deterministic scorer that weighs the user's genre affinities (what
 *     they favorited, listed, watched) and rotates by the ISO week — same
 *     week ⇒ same six, next Monday ⇒ a fresh shop. Titles already on the
 *     user's shelves are excluded: the shop must offer something NEW.
 *   • No taste data ⇒ cold start: the same scorer with empty weights falls
 *     back to a quality+variety cut, still deterministic per week.
 *
 * This module is PURE (no imports) so scripts, both runtimes and the tests
 * share the exact same code — the same guarantee test-weekly-deck.mjs
 * checks by transpiling this file in-process.
 * ===================================================================================== */

export type WeeklyPick = {
  /* cross-runtime identity — the runtime resolves its own numeric id from it */
  slug: string;
  title: string;
  titleEn: string;
  type: "movie" | "series";
  year: number;
  rating: number;
  /* the personalization key — the on-device scorer reads THESE */
  genres: string[];
  /* display copy the lite projection already carries; the deck repeats it so
   * a pick renders even if its catalog row went missing mid-upgrade */
  description: string;
};

export type WeeklyDeck = {
  format: "nama-weekly-deck";
  /* content identity of the POOL itself (sha256[:12]) — two decks with the
   * same version are byte-identical; a different version means a recut */
  version: string;
  generatedAt: string;
  pool: WeeklyPick[];
};

export const WEEKLY_DECK_FORMAT = "nama-weekly-deck";
/** The shelf holds exactly six frames — the user's number, «این هفته ۶ تا». */
export const WEEKLY_COUNT = 6;
/** At most two picks may share the same primary genre — a varied shop, not
 * six thrillers in a row (the mockup reads as a curated mix). */
export const WEEKLY_MAX_PER_GENRE = 2;

/** Strict parser: null for ANY malformed input (wrong format, missing pool,
 * garbage rows, duplicate slugs) — callers must treat null as "no deck",
 * never as partial. */
export function parseWeeklyDeck(v: unknown): WeeklyDeck | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (d.format !== WEEKLY_DECK_FORMAT) return null;
  const version = typeof d.version === "string" ? d.version.trim() : "";
  if (!/^[0-9a-f]{6,64}$/.test(version)) return null;
  const generatedAt = typeof d.generatedAt === "string" ? d.generatedAt : "";
  if (!Array.isArray(d.pool)) return null;
  const pool: WeeklyPick[] = [];
  const seen = new Set<string>();
  for (const raw of d.pool) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    const slug = typeof s.slug === "string" ? s.slug.trim() : "";
    const title = typeof s.title === "string" ? s.title : "";
    if (!slug || !title) return null;
    if (seen.has(slug)) return null; // one show = one frame, ever
    seen.add(slug);
    if (!Array.isArray(s.genres)) return null; // genres drive the matching
    const genres: string[] = [];
    for (const g of s.genres) {
      if (typeof g !== "string") return null;
      if (g.trim()) genres.push(g.trim());
    }
    pool.push({
      slug,
      title,
      titleEn: typeof s.titleEn === "string" ? s.titleEn : title,
      type: s.type === "series" ? "series" : "movie",
      year: Number(s.year) || 0,
      rating: Number(s.rating) || 0,
      genres,
      description: typeof s.description === "string" ? s.description : "",
    });
  }
  // a pool too small to dress the shelf is not a deck — the fallback (the
  // catalog's own best-rated rows) takes over until the next publish
  if (pool.length < WEEKLY_COUNT) return null;
  return { format: WEEKLY_DECK_FORMAT, version, generatedAt, pool };
}

/** True when deck `a` should replace deck `b` (newer cut, or none stored). */
export function weeklyDeckNewer(a: WeeklyDeck, b: WeeklyDeck | null | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  if (a.version !== b.version) return true; // a different cut always wins
  const ta = Date.parse(a.generatedAt || "") || 0;
  const tb = Date.parse(b.generatedAt || "") || 0;
  return ta > tb;
}

/* --------------------------------------------------------------------- */
/* The weekly rotation                                                    */
/* --------------------------------------------------------------------- */

/** ISO week key ("2026-W38") — Monday-aligned, the rotation clock of the
 * shop. Same key ⇒ byte-stable picks; a new Monday ⇒ a new cut. */
export function isoWeekKey(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day); // this week's Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** FNV-1a → [0,1) — the deterministic jitter that spreads same-scored
 * candidates differently each week (no Math.random anywhere: the shop must
 * be reproducible, testable and SSR-safe). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** The viewer's taste, gathered ON DEVICE from their own shelves (favorites,
 * list statuses, progress) — never shipped anywhere. */
export type WeeklySignals = {
  /** genre → affinity weight (0 = cold start; favorites outweigh plans) */
  genreWeights: Record<string, number>;
  /** titles the user already has/has seen — the shop offers something NEW */
  excludeSlugs?: Iterable<string>;
  /** the rotation clock (isoWeekKey) — same week, same six */
  weekKey: string;
};

/** A structural subset satisfied by both the deck's picks and the runtime's
 * TitleView — the scorer never needs more than this. */
export type WeeklyCandidate = {
  slug: string;
  rating: number;
  year: number;
  genres: string[];
};

/** Pick the six frames: taste score + quality + a weekly jitter, then a
 * per-genre diversity cap so the shelf reads as a curated mix.
 * Deterministic: same (pool, signals) ⇒ same six, on every device. */
export function pickWeeklySix<T extends WeeklyCandidate>(
  pool: T[],
  signals: WeeklySignals,
): T[] {
  const exclude = new Set(signals.excludeSlugs ?? []);
  const scored: { item: T; score: number; primary: string }[] = [];
  for (const item of pool) {
    if (exclude.has(item.slug)) continue;
    // genre affinity — capped so one red-hot genre can't own the whole shelf
    let genre = 0;
    for (const g of item.genres || []) genre += signals.genreWeights[g] ?? 0;
    genre = Math.min(genre, 6);
    const quality = (Number(item.rating) || 0) * 0.55; // 0..~5.2
    const jitter = hash01(`${signals.weekKey}:${item.slug}`) * 1.5;
    scored.push({
      item,
      score: genre * 1.6 + quality + jitter,
      primary: (item.genres && item.genres[0]) || "",
    });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      hash01(`${signals.weekKey}:tie:${a.item.slug}`) - hash01(`${signals.weekKey}:tie:${b.item.slug}`),
  );

  const perGenre = new Map<string, number>();
  const picks: T[] = [];
  const overflow: typeof scored = [];
  for (const s of scored) {
    if (picks.length >= WEEKLY_COUNT) break;
    const n = perGenre.get(s.primary) ?? 0;
    if (n >= WEEKLY_MAX_PER_GENRE) {
      overflow.push(s); // genre quota full — kept for the top-up pass
      continue;
    }
    perGenre.set(s.primary, n + 1);
    picks.push(s.item);
  }
  for (const s of overflow) {
    if (picks.length >= WEEKLY_COUNT) break;
    picks.push(s.item);
  }
  return picks.slice(0, WEEKLY_COUNT);
}
