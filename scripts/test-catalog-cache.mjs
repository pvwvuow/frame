#!/usr/bin/env node
/* v0.34.3 — LOCAL-FIRST catalog cache (the proxy fix) E2E.
 *
 * The Electron shell downloads version.json + core + parts into
 * <userData>/catalog-cache (via the proxy-aware Chromium stack) and the
 * server's syncCatalog must merge from that dir with ZERO network — even
 * when the catalog URL points at a dead host. Scenarios:
 *
 *   A. cold cache merge from disk (remote host UNREACHABLE on purpose)
 *   B. stored hash == partsSha256
 *   C. second run → skip (hash match)
 *   D. publisher updates a part → incremental files in the same cache dir
 *      → merge applies just the delta
 *   E. tampered cache file → NO merge, falls back to the (dead) remote → fail
 *   F. repaired cache → skip again (hash match)
 *   G. env unset → legacy remote path (probe dead → probeUnknown skip)
 *   H. v0.48.0 NO-GOING-BACKWARDS: a cache OLDER than the bundled seed is
 *      never merged — the fresh seed pins survive (the stale-cache revert bug)
 *   I. v0.48.0 release-day skip: cache hash == bundled seed hash → skip
 *   J. v0.48.0: a cache NEWER than the bundled seed still merges (guard is
 *      one-directional)
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { PrismaClient } = require(path.join(ROOT, "node_modules", "@prisma/client"));

const TMP = path.join(ROOT, ".tmp-cache-test");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const CACHE = path.join(TMP, "catalog-cache");
const DEAD = "http://127.0.0.1:9/catalog-core.json"; // nothing listens on port 9

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.log(`  ✘ ${name}${extra ? " — " + extra : ""}`); }
};
const sha = (s) => createHash("sha256").update(s).digest("hex");

/* ---- scratch DB + transpiled REAL module (same harness as split-catalog) */
const scratch = path.join(TMP, "cache-e2e.db");
execSync("npx prisma db push --skip-generate", {
  cwd: ROOT,
  env: { ...process.env, DATABASE_URL: "file:" + scratch },
  stdio: "pipe",
});
fs.writeFileSync(path.join(TMP, "db.stub.mjs"),
  `import { PrismaClient } from "@prisma/client";\n` +
  `export const db = new PrismaClient({ datasources: { db: { url: "file:" + ${JSON.stringify(scratch)} } } });\n`);
fs.writeFileSync(path.join(TMP, "seed.stub.mjs"), `export const ensureSeeded = async () => {};\n`);
let js = ts.transpileModule(
  fs.readFileSync(path.join(ROOT, "src", "lib", "catalog-refresh.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }
).outputText;
js = js.replace(`from "@/lib/db"`, `from "./db.stub.mjs"`).replace(`from "@/db/seed"`, `from "./seed.stub.mjs"`);
fs.writeFileSync(path.join(TMP, "catalog-refresh.mjs"), js);
const m = await import(pathToFileURL(path.join(TMP, "catalog-refresh.mjs")).href + `?v=${Date.now()}`);
const db = new PrismaClient({ datasources: { db: { url: "file:" + scratch } } });

/* ---- synthetic publisher output ---------------------------------------- */
const ep = (n, slug) => ({
  season: 1, number: n, name: "E" + n, synopsis: "s" + n, duration: 42,
  videoUrl: `https://x/${slug}-e${n}.mkv`, sources: [], thumbnail: "",
});
const title = (slug, name, source, extra = {}) => ({
  slug, title: name, titleEn: name, type: "movie", year: 2020, rating: 7.5,
  duration: 100, description: "d", genres: ["Drama"], poster: `/covers/tt0${slug}/poster.jpg`,
  backdrop: `/covers/tt0${slug}/backdrop.jpg`, videoUrl: `https://x/${slug}.mkv`,
  trailerUrl: null, director: "", cast: [], country: "US", ageRating: "+13",
  quality: "1080p", sources: [{ q: "1080p", v: "f2m", url: `https://x/${slug}-1080.mkv` }],
  featured: false, trendingScore: 10, views: 1, source, addedAt: "2026-09-01T00:00:00.000Z",
  episodes: [],
});

let core = { format: "nama-catalog", version: 1, titles: [title("alpha", "Alpha", "od"), title("beta", "Beta", "od")] };
let part = { format: "nama-catalog-part", version: 1, titles: [title("gamma", "Gamma", "f2m")] };

function writeCache() {
  fs.rmSync(CACHE, { recursive: true, force: true });
  fs.mkdirSync(CACHE, { recursive: true });
  const coreBody = JSON.stringify(core);
  const partBody = JSON.stringify(part);
  fs.writeFileSync(path.join(CACHE, "catalog-core.json"), coreBody);
  fs.writeFileSync(path.join(CACHE, "catalog-f2m.json"), partBody);
  const version = {
    format: "nama-catalog-version",
    version: 2,
    sha256: sha(coreBody), // legacy field (frozen index in production)
    coreSha256: sha(coreBody),
    partsSha256: sha(coreBody + partBody),
    parts: [{ file: "catalog-f2m.json", sha256: sha(partBody), titles: part.titles.length }],
    counts: { titles: core.titles.length + part.titles.length },
    generatedAt: "2026-09-13T23:26:43.624Z",
  };
  fs.writeFileSync(path.join(CACHE, "version.json"), JSON.stringify(version));
}
writeCache();
process.env.NAMA_CATALOG_CACHE_DIR = CACHE;

console.log("\n[A] cold merge FROM CACHE while the remote host is dead");
{
  const r = await m.syncCatalogOnce(DEAD);
  check("merge ok, 3 titles created", r.ok === true && !r.skipped && r.created === 3, JSON.stringify(r));
  check("db rows really exist", (await db.title.count()) === 3);
  const f2m = await db.title.findFirst({ where: { slug: "gamma" }, select: { sources: true } });
  check("array sources survived the mapper", (JSON.parse(f2m.sources) || []).length === 1);
}

console.log("\n[B] stored hash == partsSha256");
{
  const v = JSON.parse(fs.readFileSync(path.join(CACHE, "version.json"), "utf8"));
  const stored = await db.syncState.findUnique({ where: { key: "catalog.hash" } });
  check("HASH_KEY matches partsSha256", stored?.value === v.partsSha256, `${stored?.value?.slice(0, 12)} vs ${v.partsSha256?.slice(0, 12)}`);
}

console.log("\n[C] second run → skip");
{
  const r = await m.recheckCatalogNow(DEAD); // drops the syncInflight memo, like the Settings button
  check("skipped (content unchanged)", r.ok === true && r.skipped === true, JSON.stringify(r));
}

console.log("\n[D] publisher adds a title to the part → incremental delta merges");
{
  part = { ...part, titles: [...part.titles, title("delta", "Delta", "f2m")] };
  writeCache();
  const r = await m.recheckCatalogNow(DEAD);
  check("delta applied (+1 created)", r.ok === true && !r.skipped && r.created === 1, JSON.stringify(r));
  check("4 titles now", (await db.title.count()) === 4);
}

console.log("\n[E] tampered cache file → cache rejected, remote dead → safe probeUnknown skip");
{
  const p = path.join(CACHE, "catalog-f2m.json");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8") + " "); // sha mismatch
  const r = await m.recheckCatalogNow(DEAD);
  check("no merge from a bad cache", r.ok === true && r.skipped === true && r.probeUnknown === true, JSON.stringify(r));
  check("db untouched (still 4)", (await db.title.count()) === 4);
}

console.log("\n[F] repaired cache → skip (hash match again)");
{
  writeCache();
  const r = await m.recheckCatalogNow(DEAD);
  check("skipped after repair", r.ok === true && r.skipped === true, JSON.stringify(r));
}

console.log("\n[G] env unset → legacy remote path (dead probe → probeUnknown skip)");
{
  delete process.env.NAMA_CATALOG_CACHE_DIR;
  const r = await m.recheckCatalogNow(DEAD);
  check("probeUnknown skip, no crash", r.ok === true && r.skipped === true && r.probeUnknown === true, JSON.stringify(r));
}

console.log("\n[H] v0.48.0 stale cache OLDER than the bundled seed → NEVER merged (no pin revert)");
{
  process.env.NAMA_CATALOG_CACHE_DIR = CACHE;
  /* the "device" just seed-merged a NEWER release: its pins = gamma + delta */
  await db.title.update({ where: { slug: "gamma" }, data: { featured: true } });
  await db.title.update({ where: { slug: "delta" }, data: { featured: true } });
  /* the shell's <userData> cache still holds the PREVIOUS release:
   * delta is gone (older catalog) and its version.json predates the seed */
  part = { ...part, titles: part.titles.filter((t) => t.slug !== "delta") };
  writeCache(); // generatedAt stays 2026-09-13
  process.env.NAMA_CATALOG_SEED_VERSION_HASH = "f".repeat(64); // seed identity ≠ cache hash
  process.env.NAMA_CATALOG_SEED_VERSION_GEN = "2026-09-18T21:03:02.000Z"; // NEWER than cache
  const r = await m.recheckCatalogNow(DEAD);
  check("stale merge REJECTED (skipped)", r.ok === true && r.skipped === true, JSON.stringify(r));
  check("db untouched — still 4 titles", (await db.title.count()) === 4);
  const g = await db.title.findFirst({ where: { slug: "gamma" }, select: { featured: true } });
  const d = await db.title.findFirst({ where: { slug: "delta" }, select: { featured: true } });
  check("fresh seed pins survived (gamma+delta still featured)", !!g?.featured && !!d?.featured);
}

console.log("\n[I] v0.48.0 release-day skip: cache hash == bundled seed hash");
{
  /* same release shipped as seed and as release assets — zero reason to merge */
  const v = JSON.parse(fs.readFileSync(path.join(CACHE, "version.json"), "utf8"));
  process.env.NAMA_CATALOG_SEED_VERSION_HASH = v.partsSha256;
  process.env.NAMA_CATALOG_SEED_VERSION_GEN = "2020-01-01T00:00:00.000Z"; // even an OLD seed gen must skip on hash equality
  const r = await m.recheckCatalogNow(DEAD);
  check("skipped (content identical to seed)", r.ok === true && r.skipped === true, JSON.stringify(r));
  check("db untouched (still 4)", (await db.title.count()) === 4);
}

console.log("\n[J] v0.48.0 cache NEWER than the bundled seed → still merges (guard is one-directional)");
{
  /* brand-new title so the cache hash also differs from the stored HASH_KEY —
   * this proves the MERGE happened, not a hash-match skip */
  part = { ...part, titles: [...part.titles, title("epsilon", "Epsilon", "f2m")] };
  writeCache();
  process.env.NAMA_CATALOG_SEED_VERSION_HASH = "e".repeat(64);
  process.env.NAMA_CATALOG_SEED_VERSION_GEN = "2026-09-01T00:00:00.000Z"; // seed OLDER than cache
  const r = await m.recheckCatalogNow(DEAD);
  check("newer-than-seed cache merged (+1 created)", r.ok === true && !r.skipped && r.created === 1, JSON.stringify(r));
  /* 4, not 5: delta left the cache catalog in [H] and applyCatalog removes
   * titles that left — the point here is the MERGE happened at all */
  check("epsilon exists after merge", (await db.title.findFirst({ where: { slug: "epsilon" } })) !== null);
  delete process.env.NAMA_CATALOG_SEED_VERSION_HASH;
  delete process.env.NAMA_CATALOG_SEED_VERSION_GEN;
}

fs.rmSync(TMP, { recursive: true, force: true });
await db.$disconnect();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
