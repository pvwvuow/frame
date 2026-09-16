/* Unit tests for src/lib/hero-pick.ts (v0.38.0 — the «برترین‌ها» billboard).
 *
 * Guards the curation rules the user recut for v0.38:
 *   «فعلا میخام ۳ تا فیلم برتر و ۲ تا سریال برتر رو اونجا بزاریم..
 *    مستند ها رو هم بردار کلا»
 *   — top 3 movies + top 2 series by rating over the WHOLE catalog,
 *     documentaries («مستند») excluded completely, real tt poster AND
 *     backdrop required, display order = the merged five by rating.
 * No wave window, no add-date dependence: a catalog without any createdAt
 * still gets a lineup (the old v0.24 rules required fresh add-dates).
 *
 * The module is pure TypeScript with no imports — transpiled in-process with
 * the repo's own typescript package (no build step, no ts-node dependency).
 *
 * Run: node scripts/test-hero-pick.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "lib", "hero-pick.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module_ = { exports: {} };
new Function("module", "exports", "require", js)(module_, module_.exports, require);
const { pickHero } = module_.exports;

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}${extra ? " — " + extra : ""}`);
  }
}

/* ---- fixtures --------------------------------------------------------- */
let seq = 1000;
const t = (over = {}) => ({
  id: seq++,
  type: "series",
  rating: 9.0,
  trendingScore: 80,
  poster: `/covers/tt0000${seq}/poster.jpg`,
  backdrop: `/covers/tt0000${seq}/backdrop.jpg`,
  genres: ["درام"],
  createdAt: "2026-09-10T12:00:00.000Z",
  ...over,
});

/* ---- the billboard shape ----------------------------------------------- */
console.log("\n[pickHero] top-3 movies + top-2 series by rating");
{
  const lite = [
    t({ id: 1, type: "movie", rating: 9.1 }), // movie #1
    t({ id: 2, type: "movie", rating: 8.8 }), // movie #2
    t({ id: 3, type: "movie", rating: 8.7 }), // movie #3
    t({ id: 4, type: "movie", rating: 8.6 }), // movie #4 → capped out
    t({ id: 5, type: "movie", rating: 8.5 }), // movie #5 → capped out
    t({ id: 6, rating: 9.2 }), // series #1
    t({ id: 7, rating: 9.0 }), // series #2
    t({ id: 8, rating: 8.9 }), // series #3 → capped out
  ];
  const picks = pickHero(lite, {});
  const ids = picks.map((x) => x.id);
  check("exactly five slides", picks.length === 5, `got ${picks.length}`);
  check("top 3 movies taken (1,2,3)", ids.includes(1) && ids.includes(2) && ids.includes(3));
  check("4th movie capped out", !ids.includes(4) && !ids.includes(5));
  check("top 2 series taken (6,7)", ids.includes(6) && ids.includes(7));
  check("3rd series capped out", !ids.includes(8));
  check("display order = rating desc (6 → 1 → 7 → 2 → 3)", JSON.stringify(ids) === JSON.stringify([6, 1, 7, 2, 3]), JSON.stringify(ids));
}

console.log("\n[pickHero] documentaries are excluded completely");
{
  const lite = [
    t({ id: 11, type: "movie", rating: 9.9, genres: ["مستند"] }), // highest rated doc → OUT
    t({ id: 12, type: "movie", rating: 9.5, genres: ["تاریخی", "مستند"] }), // doc hybrid → OUT
    t({ id: 13, rating: 9.8, genres: ["مستند", "تاریخی"] }), // doc series → OUT
    t({ id: 14, type: "movie", rating: 7.0 }), // lower-rated fiction still wins the slot
    t({ id: 15, type: "movie", rating: 6.5 }),
    t({ id: 16, type: "movie", rating: 6.0 }),
    t({ id: 17, rating: 8.0 }),
    t({ id: 18, rating: 7.5 }),
  ];
  const picks = pickHero(lite, {});
  const ids = picks.map((x) => x.id);
  check("no documentary in the lineup", !ids.includes(11) && !ids.includes(12) && !ids.includes(13));
  check("low-rated fiction fills the movie slots instead", ids.includes(14) && ids.includes(15) && ids.includes(16));
  check("fiction series keep their slots", ids.includes(17) && ids.includes(18));
}

console.log("\n[pickHero] art requirement + missing genres field");
{
  const lite = [
    t({ id: 21, type: "movie", rating: 9.9, poster: "/posters/x.jpg" }), // non-tt poster → OUT
    t({ id: 22, type: "movie", rating: 9.8, backdrop: "" }), // no backdrop → OUT
    t({ id: 23, rating: 9.7, genres: undefined }), // no genres field → treated as fiction
    t({ id: 24, rating: 9.6, genres: undefined }),
    t({ id: 25, type: "movie", rating: 9.5 }),
    t({ id: 26, type: "movie", rating: 9.4 }),
    t({ id: 27, type: "movie", rating: 9.3 }),
  ];
  const picks = pickHero(lite, {});
  const ids = picks.map((x) => x.id);
  check("non-tt poster excluded", !ids.includes(21));
  check("missing backdrop excluded", !ids.includes(22));
  check("undefined genres tolerated (23, 24 in)", ids.includes(23) && ids.includes(24));
  check("five slides still assembled", picks.length === 5, `got ${picks.length}`);
}

console.log("\n[pickHero] ranking tie-breaks");
{
  const lite = [
    t({ id: 31, rating: 9.0, trendingScore: 50 }),
    t({ id: 32, rating: 9.0, trendingScore: 90 }), // same rating → higher ts first
    t({ id: 33, type: "movie", rating: 9.0, trendingScore: 90 }), // full tie → higher id first
    t({ id: 34, type: "movie", rating: 9.0, trendingScore: 90 }),
    t({ id: 35, type: "movie", rating: 9.0, trendingScore: 90 }),
    t({ id: 36, type: "movie", rating: 8.8 }), // lowest → capped out of the movie slots
  ];
  const picks = pickHero(lite, {});
  const ids = picks.map((x) => x.id);
  check("tie broken by trendingScore (32 before 31)", ids.indexOf(32) < ids.indexOf(31));
  check("full tie broken by id (35 before 34 before 33)", ids.indexOf(35) < ids.indexOf(34) && ids.indexOf(34) < ids.indexOf(33));
  check("lowest-ranked movie capped out", !ids.includes(36));
}

console.log("\n[pickHero] short sides stay strict (no cross-fill)");
{
  const lite = [
    t({ id: 41, type: "movie", rating: 9.9 }),
    t({ id: 42, type: "movie", rating: 9.8 }),
    t({ id: 43, type: "movie", rating: 9.7 }),
    t({ id: 44, type: "movie", rating: 9.6 }),
  ];
  const picks = pickHero(lite, {});
  check("no series in catalog → 3 movie slides only", picks.length === 3 && picks.every((x) => x.type !== "series"));
}

console.log("\n[pickHero] add-date independence");
{
  const lite = [
    t({ id: 51, type: "movie", rating: 9.1, createdAt: "" }),
    t({ id: 52, rating: 9.0, createdAt: undefined }),
    t({ id: 53, type: "movie", rating: 8.9, createdAt: "2020-01-01" }), // ancient still eligible
    t({ id: 54, type: "movie", rating: 8.8 }),
    t({ id: 55, rating: 8.7 }),
  ];
  const picks = pickHero(lite, {});
  check("no add-dates at all still yields the full lineup", picks.length === 5);
}

console.log("\n[pickHero] degenerate catalogs → caller falls back");
check("empty catalog → []", pickHero([]).length === 0);
check("no tt art at all → []", pickHero([t({ poster: "", backdrop: "" }), t({ id: 2, poster: "/p.jpg" })]).length === 0);

console.log("\n[pickHero] knobs");
{
  const lite = Array.from({ length: 12 }, (_, i) =>
    t({ id: 60 + i, type: i % 2 ? "movie" : "series", rating: 9.5 - i * 0.05 })
  );
  check("defaults = 3 movies + 2 series", pickHero(lite).length === 5);
  check("movieCount honored", pickHero(lite, { movieCount: 5, seriesCount: 0 }).length === 5);
  check("seriesCount honored", pickHero(lite, { movieCount: 0, seriesCount: 5 }).length === 5);
}

console.log("\n[pickHero] v0.38.2 — synced-device art shapes (the Cosmos-forever fix)");
{
  /* Exactly what a device DB holds after the boot-time catalog sync /
   * fresh-seed adoption: applyCatalog wrote the export's values through
   * rebaseAsset, so posters were REBASED ABSOLUTE urls (not /covers/…) —
   * the v0.38.0 anchored /^\/covers\/tt\d+\// emptied the pool on every
   * synced device → featured-flag fallback → Cosmos stayed forever. */
  const GH = "https://github.com/pvwvuow/frame/releases/latest/download/covers";
  const RAW = "https://raw.githubusercontent.com/pvwvuow/frame/main/public/covers";
  const MH = "https://images.metahub.space";
  const lite = [
    // rebased releases-host shape (v0.34+ syncs) — the user's machine
    t({ id: 71, type: "movie", rating: 9.5, poster: `${GH}/tt0903747/poster.jpg`, backdrop: `${GH}/tt0903747/backdrop.jpg` }),
    // rebased raw.githubusercontent shape (v0.23–v0.33 era syncs)
    t({ id: 72, type: "movie", rating: 9.0, poster: `${RAW}/tt0111161/poster.jpg`, backdrop: `${RAW}/tt0111161/backdrop.jpg` }),
    // metahub shape (mobile posterUrl era rows)
    t({ id: 73, rating: 8.9, poster: `${MH}/poster/small/tt0993846/img`, backdrop: `${MH}/background/medium/tt0993846/img` }),
    // root-relative /covers keeps working (repo rows, v0.38.2+ syncs)
    t({ id: 74, rating: 8.8 }),
    // identity mismatch → OUT (junk pair)
    t({ id: 75, type: "movie", rating: 9.9, poster: `${GH}/tt1111111/poster.jpg`, backdrop: `${GH}/tt2222222/backdrop.jpg` }),
    // SVG placeholder art → OUT (no tt identity)
    t({ id: 76, type: "movie", rating: 9.8, poster: "/api/cover/some-slug.svg", backdrop: "/api/cover/some-slug-wide.svg" }),
    // "tt" glued into a word → no identity → OUT
    t({ id: 77, type: "movie", rating: 9.7, poster: "/p/matrixtt1234567.jpg", backdrop: `${GH}/tt3333333/backdrop.jpg` }),
  ];
  const picks = pickHero(lite, {});
  const ids = picks.map((x) => x.id);
  check("rebased releases-host urls eligible (71)", ids.includes(71), JSON.stringify(ids));
  check("rebased raw.githubusercontent urls eligible (72)", ids.includes(72));
  check("metahub urls eligible (73)", ids.includes(73));
  check("root-relative /covers still eligible (74)", ids.includes(74));
  check("poster/backdrop tt mismatch excluded (75)", !ids.includes(75));
  check("svg placeholder excluded (76)", !ids.includes(76));
  check("glued-tt junk excluded (77)", !ids.includes(77));
  check("lineup assembled from a fully rebased pool", picks.length === 4, `got ${picks.length}`);

  /* the regression itself: a synced device where EVERY row is rebased —
   * v0.38.0 returned [] here (→ featured flags → Cosmos). */
  const rebasedPool = Array.from({ length: 40 }, (_, i) =>
    t({ id: 90 + i, type: i % 2 ? "movie" : "series", rating: 9.0 - i * 0.05,
        poster: `${GH}/tt0${(7000000 + i * 37)}/poster.jpg`, backdrop: `${GH}/tt0${(7000000 + i * 37)}/backdrop.jpg` })
  );
  const fromRebased = pickHero(rebasedPool, {});
  check("all-rebased catalog yields the full 5-slide lineup (was 0 → Cosmos)", fromRebased.length === 5, `got ${fromRebased.length}`);
}

/* ---- summary ----------------------------------------------------------- */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
