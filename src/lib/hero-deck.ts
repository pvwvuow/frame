/* =====================================================================================
 * v0.49.0 — THE HERO DECK (the theater slider, rewritten from scratch)
 *
 * HISTORY (why this module exists): the slider used to be DERIVED state — a
 * `featured` boolean scattered across 14k rows and then re-assembled at
 * runtime through five layers (SQLite seed → catalog merge → shards →
 * WebView HTTP cache → IndexedDB). Every release, some layer kept serving a
 * stale copy and the user kept seeing the OLD show
 * («دکستر تاکوپی و کاگویا هنوز هستن», three releases in a row).
 *
 * THE NEW CONTRACT — the deck is EXPLICIT, SELF-CONTAINED and REPLACED, never
 * merged:
 *
 *   • At build time scripts/feature-new-hero.mjs writes the FINAL slide list
 *     (identity, art, display copy — everything the theater renders) into
 *     public/catalog/mobile/hero.json, version-stamped by the slides' own
 *     content hash.
 *   • At runtime the app fetches that ONE small file and REPLACES the stored
 *     deck whenever a different deck version arrives. No flags, no joins, no
 *     hydration: slides render verbatim, in deck order.
 *   • A deck whose slides are not a subset of the installed catalog is stale
 *     against that catalog (a content-only publish happened) and is dropped
 *     — the featured-flag fallback takes over until the next deck arrives.
 *     Invariant: deck ⊆ catalog, always.
 *
 * This module is PURE (no imports) so scripts and both runtimes share the
 * exact same validation — the same guarantee test-hero-pick.mjs uses by
 * transpiling this file in-process.
 * ===================================================================================== */

export type HeroSlide = {
  /* cross-runtime identity — the runtime resolves its own numeric id from it */
  slug: string;
  title: string;
  titleEn: string;
  type: "movie" | "series";
  year: number;
  rating: number;
  /* display copy the lite projection does NOT carry — the deck does */
  description: string;
};

export type HeroDeck = {
  format: "nama-hero-deck";
  /* content identity of the SLIDES themselves (sha256[:12]) — two decks with
   * the same version are byte-identical; a different version means a recut */
  version: string;
  generatedAt: string;
  slides: HeroSlide[];
};

export const HERO_DECK_FORMAT = "nama-hero-deck";

/** Strict parser: null for ANY malformed input (wrong format, missing slides,
 *  garbage rows) — callers must treat null as "no deck", never as partial. */
export function parseHeroDeck(v: unknown): HeroDeck | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (d.format !== HERO_DECK_FORMAT) return null;
  const version = typeof d.version === "string" ? d.version.trim() : "";
  if (!/^[0-9a-f]{6,64}$/.test(version)) return null;
  const generatedAt = typeof d.generatedAt === "string" ? d.generatedAt : "";
  if (!Array.isArray(d.slides)) return null;
  const slides: HeroSlide[] = [];
  const seen = new Set<string>();
  for (const raw of d.slides) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    const slug = typeof s.slug === "string" ? s.slug.trim() : "";
    const title = typeof s.title === "string" ? s.title : "";
    if (!slug || !title) return null;
    if (seen.has(slug)) return null; // one show = one slide, ever
    seen.add(slug);
    const type = s.type === "series" ? "series" : "movie";
    slides.push({
      slug,
      title,
      titleEn: typeof s.titleEn === "string" ? s.titleEn : title,
      type,
      year: Number(s.year) || 0,
      rating: Number(s.rating) || 0,
      description: typeof s.description === "string" ? s.description : "",
    });
  }
  if (!slides.length) return null;
  return { format: HERO_DECK_FORMAT, version, generatedAt, slides };
}

/** True when deck `a` should replace deck `b` (newer cut, or none stored). */
export function deckNewer(a: HeroDeck, b: HeroDeck | null | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  if (a.version !== b.version) return true; // a different cut always wins
  const ta = Date.parse(a.generatedAt || "") || 0;
  const tb = Date.parse(b.generatedAt || "") || 0;
  return ta > tb;
}
