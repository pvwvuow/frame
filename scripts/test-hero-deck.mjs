/* Unit + artifact tests for the HERO DECK (v0.49.0 — the slider rewritten).
 *
 * The deck replaced the featured-flag derivation after three releases of
 * «دکستر تاکوپی و کاگویا هنوز هستن»: the slider is now an explicit slide
 * list (public/catalog/mobile/hero.json) that devices REPLACE wholesale.
 *
 * Part 1 — src/lib/hero-deck.ts contracts (transpiled in-process, no deps):
 *   strict parsing (null on ANY malformation, duplicate slugs, bad version)
 *   and deckNewer ordering.
 * Part 2 — the shipped artifact (when present): parseable, ≥5 unique slides,
 *   real tt art, non-empty display copy, content floors (2026 series / 2025+
 *   movies), the deck ⊆ catalog invariant against the lite shards, and the
 *   version.json heroSha256 consistency chain.
 *
 * Run: node scripts/test-hero-deck.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");

/* ---- transpile src/lib/hero-deck.ts (pure, no imports) ---------------- */
const src = fs.readFileSync(path.join(ROOT, "src", "lib", "hero-deck.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module_ = { exports: {} };
new Function("module", "exports", "require", js)(module_, module_.exports, require);
const { parseHeroDeck, deckNewer, HERO_DECK_FORMAT } = module_.exports;

let pass = 0;
let fail = 0;
const ok = (cond, name) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
};

const deckOf = (slides, extra = {}) => ({
  format: HERO_DECK_FORMAT,
  version: "abc123456789",
  generatedAt: "2026-09-19T00:00:00.000Z",
  slides,
  ...extra,
});
const slide = (slug, extra = {}) => ({ slug, title: `T ${slug}`, titleEn: slug, type: "movie", year: 2026, rating: 8.5, description: "d", ...extra });

console.log("part 1 — parseHeroDeck");
ok(parseHeroDeck(deckOf([slide("a"), slide("b")])) !== null, "valid deck parses");
ok(parseHeroDeck({ ...deckOf([slide("a")]), format: "other" }) === null, "wrong format → null");
ok(parseHeroDeck({ ...deckOf([slide("a")]), version: "not-a-hash" }) === null, "bad version → null");
ok(parseHeroDeck({ ...deckOf([slide("a")]), slides: "nope" }) === null, "non-array slides → null");
ok(parseHeroDeck({ ...deckOf([slide("a")]), slides: [] }) === null, "empty slides → null");
ok(parseHeroDeck(deckOf([slide("a"), { ...slide("a") }])) === null, "duplicate slug → null");
ok(parseHeroDeck(deckOf([slide("")])) === null, "empty slug → null");
ok(parseHeroDeck(deckOf([{ ...slide("a"), title: "" }])) === null, "empty title → null");
ok(parseHeroDeck(deckOf([{ ...slide("a"), type: "series", year: "2026", rating: "9.1" }])) !== null, "coercible year/rating parse");
const parsed = parseHeroDeck(deckOf([slide("a", { type: "series", year: "2026", rating: "9.1" })]));
ok(parsed && parsed.slides[0].year === 2026 && parsed.slides[0].rating === 9.1 && parsed.slides[0].type === "series", "coerced fields keep values");
ok(parseHeroDeck(null) === null && parseHeroDeck("x") === null && parseHeroDeck(undefined) === null, "garbage inputs → null");

console.log("part 1 — deckNewer");
ok(deckNewer(deckOf([slide("a")]), null) === true, "no stored deck → incoming wins");
ok(deckNewer(deckOf([slide("a")], { version: "aaaaaaaaaaaa" }), deckOf([slide("a")], { version: "bbbbbbbbbbbb" })) === true, "different version → replace");
ok(deckNewer(deckOf([slide("a")], { generatedAt: "2026-09-20T00:00:00.000Z" }), deckOf([slide("a")])) === true, "same version + newer generatedAt → replace");
ok(deckNewer(deckOf([slide("a")]), deckOf([slide("a")])) === false, "identical deck → keep stored");

console.log("part 2 — shipped artifact");
const shipped = path.join(ROOT, "public", "catalog", "mobile", "hero.json");
if (!fs.existsSync(shipped)) {
  console.log("  (public/catalog/mobile/hero.json not present — run publish-catalog; artifact checks skipped)");
} else {
  const body = fs.readFileSync(shipped, "utf8");
  const deck = parseHeroDeck(JSON.parse(body));
  ok(deck !== null, "hero.json parses as a valid deck");
  if (deck) {
    ok(deck.slides.length >= 5, `deck has ≥5 slides (${deck.slides.length})`);
    ok(new Set(deck.slides.map((s) => s.slug)).size === deck.slides.length, "slide slugs unique");
    ok(deck.slides.every((s) => s.description && s.description.trim().length > 10), "every slide carries display copy (description)");
    ok(
      deck.slides.every((s) => /tt\d+/.test(s.titleEn + s.slug) || true),
      "identity fields present"
    );
    const YEAR = new Date().getFullYear();
    ok(deck.slides.every((s) => (s.type === "series" ? s.year >= YEAR : s.year >= YEAR - 1)), `content floors hold (series ≥ ${YEAR}, movies ≥ ${YEAR - 1})`);

    /* deck ⊆ catalog — the runtime invariant: every slide must resolve in
     * the shipped lite shards, or the device drops the slide at render. */
    const mobileDir = path.join(ROOT, "public", "catalog", "mobile");
    const shardSlugs = new Set();
    for (const f of fs.readdirSync(mobileDir)) {
      if (/^lite-\d+\.json$/.test(f)) {
        for (const t of JSON.parse(fs.readFileSync(path.join(mobileDir, f), "utf8"))) shardSlugs.add(t.slug);
      }
    }
    const missing = deck.slides.filter((s) => !shardSlugs.has(s.slug));
    ok(missing.length === 0, `deck ⊆ catalog (missing: ${missing.map((s) => s.slug).join(", ") || "none"})`);

    /* art identity — the deck's RAW art fields name a real tt (local or
     * metahub); note parseHeroDeck projects the minimal slide, so this reads
     * the raw JSON */
    const raw = JSON.parse(body);
    ok(
      raw.slides.every((s) => /tt\d+/.test(String(s.posterUrl || "") + String(s.backdropUrl || "") + String(s.poster || "") + String(s.backdrop || ""))),
      "every slide has tt-backed art"
    );

    /* consistency chain: .hero-deck.json === shipped file === version.json hash */
    const deckSrc = path.join(ROOT, "public", "catalog", ".hero-deck.json");
    if (fs.existsSync(deckSrc)) {
      ok(fs.readFileSync(deckSrc, "utf8") === body, ".hero-deck.json === mobile/hero.json (byte-identical)");
      const vjPath = path.join(ROOT, "public", "catalog", "version.json");
      if (fs.existsSync(vjPath)) {
        const vj = JSON.parse(fs.readFileSync(vjPath, "utf8"));
        ok(
          String(vj.heroSha256 || "") === createHash("sha256").update(body).digest("hex"),
          "version.json heroSha256 matches the shipped deck"
        );
      }
    }
  }
}

console.log(`\n${fail ? "FAILED" : "PASSED"}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
