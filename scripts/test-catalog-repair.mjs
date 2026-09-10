/* Integration tests for the v0.24.0 catalog self-repair (src/lib/catalog-refresh.ts).
 *
 * Guards the frozen-mixed-hero class of bugs end to end against REAL SQLite
 * databases:
 *   A. the user's broken state — a merge killed halfway (missing titles +
 *      mixed featured flags) → the bundled-seed merge REPAIRS it offline;
 *   B. the completion proof — the same healthy DB re-runs skip instantly;
 *   C. a NEWER database (remote already applied more content) → verified
 *      skip, no churn, no proof (the remote sync owns that delta);
 *   D. same-count-but-mixed-featured (the exact frozen hero) → repaired;
 *   E. the release-hash fast path (NAMA_CATALOG_SEED_VERSION_HASH) → skip
 *      without touching data.
 *
 * The module under test imports "@/lib/db" + "@/db/seed" aliases, so — like
 * test-mobile-playback.mjs — the REAL source is transpiled in-process with
 * the repo's own typescript package and the specifiers are rewritten to
 * per-scenario stubs pointing at throwaway SQLite files (prisma db push once,
 * then file copies). Each scenario re-imports the transpiled module with a
 * fresh URL so the once-per-process inflight memo can't leak between cases.
 *
 * Run: node scripts/test-catalog-repair.mjs
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const ROOT = path.join(path.dirname(path.basename(import.meta.url)), "..");
const ROOT_ABS = fs.realpathSync(new URL("..", import.meta.url).pathname);
const TMP = path.join(ROOT_ABS, ".test-tmp-repair");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✘ ${name}${extra ? " — " + extra : ""}`); }
};

/* ---- throwaway databases ---------------------------------------------- */
// one schema push, then byte-copies: every scenario starts from clean tables
const TEMPLATE = path.join(TMP, "template.db");
console.log("prisma db push (template schema)…");
execSync(`npx prisma db push --skip-generate`, {
  cwd: ROOT_ABS,
  env: { ...process.env, DATABASE_URL: "file:" + TEMPLATE },
  stdio: "pipe",
});
const freshDb = (name) => {
  const p = path.join(TMP, name);
  fs.copyFileSync(TEMPLATE, p);
  return p;
};
const client = (file) =>
  new PrismaClient({ datasources: { db: { url: "file:" + file } } });

/* ---- load the REAL catalog-refresh.ts with rewritten specifiers -------- */
let instance = 0;
async function loadModule(liveDbPath) {
  instance++;
  const n = String(instance);
  const stubDb = path.join(TMP, `db-${n}.mjs`);
  const stubSeed = path.join(TMP, `seed-${n}.mjs`);
  const modFile = path.join(TMP, `catalog-refresh-${n}.mjs`);
  fs.writeFileSync(
    stubDb,
    `import { PrismaClient } from "@prisma/client";\n` +
    `export const db = new PrismaClient({ datasources: { db: { url: "file:" + ${JSON.stringify(liveDbPath)} } } });\n`
  );
  fs.writeFileSync(stubSeed, `export const ensureSeeded = async () => {};\n`);
  const src = fs.readFileSync(path.join(ROOT_ABS, "src", "lib", "catalog-refresh.ts"), "utf8");
  let js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  js = js.replace(`from "@/lib/db"`, `from "./db-${n}.mjs"`);
  js = js.replace(`from "@/db/seed"`, `from "./seed-${n}.mjs"`);
  fs.writeFileSync(modFile, js);
  return import(pathToFileURL(modFile).href + `?v=${n}`);
}

/* ---- fixture helpers ---------------------------------------------------- */
const sha256 = (buf) => require("crypto").createHash("sha256").update(buf).digest("hex");
const slugOf = (s) => `t-${s}`;

async function makeCatalog(db2, spec) {
  // spec: [{ s: "a1", featured, episodes?, newer? }] — deterministic slugs
  for (const item of spec) {
    const t = await db2.title.create({
      data: {
        slug: slugOf(item.s),
        title: "عنوان " + item.s,
        titleEn: "Title " + item.s,
        type: item.episodes ? "series" : "movie",
        year: 2020,
        rating: item.rating ?? 8.0,
        description: "d",
        poster: "/covers/tt0" + item.s + "/poster.jpg",
        backdrop: "/covers/tt0" + item.s + "/backdrop.jpg",
        videoUrl: "https://x/" + item.s + ".mkv",
        featured: !!item.featured,
        trendingScore: item.featured ? 90 : 50,
        source: "od",
        createdAt: new Date(2026, 8, 10),
      },
    });
    for (let e = 1; e <= (item.episodes ?? 0); e++) {
      await db2.episode.create({
        data: { titleId: t.id, season: 1, number: e, name: "E" + e, videoUrl: `https://x/${item.s}-e${e}.mkv`, thumbnail: "" },
      });
    }
  }
}

const featuredSlugsOf = async (db2) =>
  (await db2.title.findMany({ where: { featured: true }, select: { slug: true }, orderBy: { slug: "asc" } })).map((t) => t.slug);
const proofOf = async (db2) =>
  (await db2.syncState.findUnique({ where: { key: "seed.applied" } }))?.value ?? null;

/* Seed of the "release": 8 titles, 4 featured (a1..a4), two with episodes */
const RELEASE = [
  { s: "a1", featured: true, episodes: 2 },
  { s: "a2", featured: true, episodes: 1 },
  { s: "a3", featured: true },
  { s: "a4", featured: true, episodes: 3 },
  { s: "a5" },
  { s: "a6" },
  { s: "a7" },
  { s: "a8", rating: 9.9 },
];
const SEED_FEATURED = ["t-a1", "t-a2", "t-a3", "t-a4"];

async function makeSeedFile() {
  const p = freshDb("seed.db");
  const c = client(p);
  await makeCatalog(c, RELEASE);
  await c.$disconnect();
  return p;
}

/* ---- scenarios ----------------------------------------------------------- */
console.log("\n[A] half-applied merge (the frozen mixed-hero report) → repaired offline");
{
  const live = freshDb("live-a.db");
  const c = client(live);
  // the kill happened mid-merge: only 5 of the 8 release titles exist (z9 is
  // an extra stale title), featured flags are a MIX
  await makeCatalog(c, [
    { s: "a1", featured: true, episodes: 2 },               // old flag survived
    { s: "a5", featured: true },                            // wrongly featured leftover
    { s: "a6", featured: true },                            // wrongly featured leftover
    { s: "a7" },
    { s: "a8", rating: 9.9 },
    { s: "z9", featured: true },                            // extra stale-featured title
  ]);
  await c.favorite.create({ data: { userKey: "u1", titleId: (await c.title.findFirst({ where: { slug: slugOf("a7") } })).id } });
  const beforeFeatured = await featuredSlugsOf(c);
  const seedPath = await makeSeedFile();
  const seedSha = sha256(fs.readFileSync(seedPath));

  const m = await loadModule(live);
  const r = await m.refreshCatalogOnce(seedPath);
  check("merge ran (not skipped)", r.ok === true && !r.skipped, JSON.stringify(r));
  check("3 missing titles created", r.created === 3, `created=${r.created}`);
  check("mixed flags updated (≥3)", r.updated >= 3, `updated=${r.updated}`);
  check("stale extra title removed", r.removed === 1 && (await c.title.count()) === 8, `removed=${r.removed} count=${await c.title.count()}`);
  check("featured set == release lineup", JSON.stringify(await featuredSlugsOf(c)) === JSON.stringify(SEED_FEATURED));
  check("completion proof stored", (await proofOf(c)) === seedSha);
  check("pre-existing favorite survived", (await c.favorite.count({ where: { userKey: "u1" } })) === 1);
  check(`before-state really was mixed (${beforeFeatured.join(",")})`, beforeFeatured.length === 4);
  await c.$disconnect();
}

console.log("\n[B] healthy DB re-run → instant skip via completion proof");
{
  // reuse scenario A's repaired database with a FRESH module instance
  const live = path.join(TMP, "live-a.db");
  const seedPath = path.join(TMP, "seed.db");
  const c = client(live);
  const m = await loadModule(live);
  const r = await m.refreshCatalogOnce(seedPath);
  check("skipped via proof", r.ok === true && r.skipped === true, JSON.stringify(r));
  check("no churn", r.created === 0 && r.updated === 0 && r.removed === 0);
  check("8 titles untouched", (await c.title.count()) === 8);
  await c.$disconnect();
}

console.log("\n[C] newer database (remote applied more) → verified skip, no downgrade");
{
  const live = freshDb("live-c.db");
  const c = client(live);
  await makeCatalog(c, [...RELEASE, { s: "new1", featured: false }, { s: "new2" }]); // 10 titles
  const seedPath = path.join(TMP, "seed.db");
  const m = await loadModule(live);
  const r = await m.refreshCatalogOnce(seedPath);
  check("skipped (db is a superset)", r.ok === true && r.skipped === true, JSON.stringify(r));
  check("newer titles NOT removed", (await c.title.count()) === 10);
  check("featured untouched", JSON.stringify(await featuredSlugsOf(c)) === JSON.stringify(SEED_FEATURED));
  check("no proof stored (content ≠ seed)", (await proofOf(c)) === null);
  await c.$disconnect();
}

console.log("\n[D] same count, mixed featured (the exact frozen hero) → repaired");
{
  const live = freshDb("live-d.db");
  const c = client(live);
  await makeCatalog(c, RELEASE);
  // corrupt exactly the way the interrupted v0.23.x merge did
  await c.title.update({ where: { slug: slugOf("a4") }, data: { featured: false } });
  await c.title.update({ where: { slug: slugOf("a6") }, data: { featured: true } });
  const seedPath = path.join(TMP, "seed.db");
  const m = await loadModule(live);
  const r = await m.refreshCatalogOnce(seedPath);
  check("verification caught the flag drift → merge ran", r.ok === true && !r.skipped, JSON.stringify(r));
  check("featured set == release lineup", JSON.stringify(await featuredSlugsOf(c)) === JSON.stringify(SEED_FEATURED));
  check("completion proof stored", (await proofOf(c)) === sha256(fs.readFileSync(seedPath)));
  await c.$disconnect();
}

console.log("\n[E] release-hash fast path (HASH_KEY == seed version) → skip without data touch");
{
  const live = freshDb("live-e.db");
  const c = client(live);
  await makeCatalog(c, RELEASE);
  await c.title.update({ where: { slug: slugOf("a4") }, data: { featured: false } }); // "broken" flags
  await c.syncState.create({ data: { key: "catalog.hash", value: "a".repeat(64) } });
  const seedPath = path.join(TMP, "seed.db");
  process.env.NAMA_CATALOG_SEED_VERSION_HASH = "a".repeat(64);
  try {
    const m = await loadModule(live);
    const r = await m.refreshCatalogOnce(seedPath);
    check("skipped via release hash", r.ok === true && r.skipped === true, JSON.stringify(r));
    check("data not touched (flags still broken)", !(await featuredSlugsOf(c)).includes("t-a4"));
    check("proof recorded from the hash match", (await proofOf(c)) === sha256(fs.readFileSync(seedPath)));
  } finally {
    delete process.env.NAMA_CATALOG_SEED_VERSION_HASH;
  }
  await c.$disconnect();
}

/* ---- summary -------------------------------------------------------------- */
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
