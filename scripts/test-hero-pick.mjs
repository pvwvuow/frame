/* Unit tests for src/lib/hero-pick.ts (v0.24.0) — the runtime auto-hero.
 *
 * Guards the exact rules the publish pipeline (scripts/feature-new-hero.mjs)
 * applies when it recuts the featured flags: newest add-wave (72h), rating
 * ≥ 8.5, real tt poster AND backdrop, series-first with movie fill,
 * rating → trendingScore order, hard cap. The client re-derives the lineup
 * from these rules on every device, so the hero can no longer go stale the
 * way the featured flags did (the frozen mixed-hero report).
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
const { pickHero, addedOf } = module_.exports;

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
const NOW = Date.parse("2026-09-10T12:00:00Z");
const h = (hours) => new Date(NOW - hours * 3600_000).toISOString();
const days = (d) => h(d * 24);

let seq = 1000;
const t = (over = {}) => ({
  id: seq++,
  type: "series",
  rating: 9.0,
  trendingScore: 80,
  poster: "/covers/tt0000123/poster.jpg",
  backdrop: "/covers/tt0000123/backdrop.jpg",
  createdAt: h(10),
  ...over,
});

/* ---- addedOf ---------------------------------------------------------- */
console.log("\n[addedOf] add-date parsing");
check("ISO string parses", addedOf({ createdAt: "2026-09-10T08:00:00.000Z" }) === Date.parse("2026-09-10T08:00:00.000Z"));
check("date-only string parses", addedOf({ createdAt: "2026-09-10" }) > 0);
check("empty → 0", addedOf({ createdAt: "" }) === 0);
check("undefined → 0", addedOf({}) === 0);
check("garbage → 0", addedOf({ createdAt: "not-a-date" }) === 0);

/* ---- wave + rules ------------------------------------------------------ */
console.log("\n[pickHero] wave window + quality rules");
{
  const lite = [
    t({ id: 1, title: "old-but-9.9", rating: 9.9, createdAt: days(5) }),   // outside wave
    t({ id: 2, rating: 9.3, createdAt: h(20) }),                           // in, series
    t({ id: 3, type: "movie", rating: 9.0, createdAt: h(30) }),            // in, movie
    t({ id: 4, rating: 8.0, createdAt: h(5) }),                            // rating below floor
    t({ id: 5, rating: 9.1, poster: "/posters/x.jpg", createdAt: h(6) }),  // no tt poster
    t({ id: 6, rating: 9.1, backdrop: "", createdAt: h(7) }),              // no backdrop
    t({ id: 7, rating: 8.5, createdAt: h(71) }),                           // boundary rating + inside window
    t({ id: 8, rating: 9.0, createdAt: h(93) }),                           // anchor − 73h → just outside 72h
    t({ id: 9, rating: 9.2, createdAt: "" }),                              // no date → outside
  ];
  const picks = pickHero(lite, {});
  const ids = picks.map((x) => x.id);
  check("wave excludes titles older than 72h (ids 1, 8 out)", !ids.includes(1) && !ids.includes(8));
  check("rating floor excludes 8.0 (id 4 out)", !ids.includes(4));
  check("non-tt covers excluded (ids 5, 6 out)", !ids.includes(5) && !ids.includes(6));
  check("dateless titles excluded (id 9 out)", !ids.includes(9));
  check("8.5 boundary included (id 7 in)", ids.includes(7));
  check("series before movies regardless of movie rating", ids.indexOf(2) < ids.indexOf(3));
  check("within pools ordered by rating desc", ids.indexOf(2) < ids.indexOf(7));
}

console.log("\n[pickHero] ordering + cap");
{
  const lite = [
    t({ id: 11, rating: 9.0, trendingScore: 50, createdAt: h(1) }),
    t({ id: 12, rating: 9.0, trendingScore: 90, createdAt: h(2) }),        // same rating → higher ts first
    t({ id: 13, rating: 9.0, trendingScore: 90, createdAt: h(3) }),        // same both → higher id first
    t({ id: 14, rating: 8.9, createdAt: h(4) }),
    t({ id: 15, rating: 8.8, createdAt: h(5) }),
    t({ id: 16, rating: 8.7, createdAt: h(6) }),
    t({ id: 17, rating: 8.6, createdAt: h(7) }),
    t({ id: 18, rating: 8.6, createdAt: h(8) }),
    t({ id: 19, rating: 8.5, createdAt: h(9) }),                           // lowest rated → capped out
  ];
  const picks = pickHero(lite, {});
  check("default cap = 8", picks.length === 8, `got ${picks.length}`);
  const ids = picks.map((x) => x.id);
  check("tie broken by trendingScore (12 before 11)", ids.indexOf(12) < ids.indexOf(11));
  check("full tie broken by id (13 before 12)", ids.indexOf(13) < ids.indexOf(12));
  check("rating order preserved (14 before 15)", ids.indexOf(14) < ids.indexOf(15));
  check("19th candidate capped out", !ids.includes(19));
}

console.log("\n[pickHero] series-first fill");
{
  const lite = [
    t({ id: 21, type: "movie", rating: 9.9, createdAt: h(1) }),
    t({ id: 22, type: "movie", rating: 9.8, createdAt: h(2) }),
    t({ id: 23, rating: 8.5, createdAt: h(3) }),
  ];
  const picks = pickHero(lite, {});
  check("lone series leads even with lower rating", picks[0].id === 23);
  check("movies fill after", picks[1].id === 21 && picks[2].id === 22);
}

console.log("\n[pickHero] degenerate catalogs → caller falls back");
check("no add-dates at all → []", pickHero([t({ createdAt: "" }), t({ id: 2, createdAt: undefined })]).length === 0);
check("empty catalog → []", pickHero([]).length === 0);
check("wave exists but nothing qualifies → []", pickHero([t({ rating: 7.9 }), t({ id: 2, rating: 8.4 })]).length === 0);

console.log("\n[pickHero] knobs");
{
  const lite = Array.from({ length: 12 }, (_, i) => t({ id: 40 + i, rating: 9.5 - i * 0.05, createdAt: h(1 + i) }));
  check("HERO_COUNT honored", pickHero(lite, { count: 5 }).length === 5);
  check("HERO_MIN_RATING honored", pickHero(lite, { minRating: 9.3 }).every((x) => x.rating >= 9.3));
  const wide = pickHero(lite, { waveWindowH: 24 * 30, count: 12 });
  check("wider window pulls older titles in", wide.length === 12);
}

/* ---- summary ----------------------------------------------------------- */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
