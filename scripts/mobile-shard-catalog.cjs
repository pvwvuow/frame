#!/usr/bin/env node
/* Mobile catalog sharder (android branch) — v0.25.0 LITE edition.
 *
 * The desktop app reads titles from SQLite via Prisma. The Android build has
 * no Node server, so the catalog ships as JSON shards inside the APK/OTA
 * webbundle (public/catalog/mobile/) and is imported into IndexedDB on first
 * launch.
 *
 * v0.25.0 — ON-DEMAND, not bulk: shards used to carry FULL records
 * (description + every episode's synopsis/sources ≈ 84MB), so every content
 * update meant a ~25MB webbundle download and a multi-minute device import.
 * Shards now carry the LITE projection only (the ~25 list fields every row,
 * card, hero and search needs — incl. posterUrl/backdropUrl, episodeCount,
 * addedAt) ≈ 7MB. The heavy half moved to ONE small JSON per title
 * (public/catalog/titles/{prefix}/{slug}.json, written by export-catalog.mjs)
 * which the device fetches the moment a title is opened and caches in
 * IndexedDB (db.ts loadFullRecord). The user scrolls → images stream from
 * metahub lazily; the user opens a title → THAT title's data loads.
 *
 * - ids: the JSON has no numeric id (desktop uses SQLite autoincrement), so we
 *   assign stable ids by slug-sorted order. User data (favorites, progress…)
 *   references these ids.
 * - shards: ~700 titles per file keeps each JSON.parse small and the
 *   first-run import smooth (now seconds, not minutes).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public", "catalog", "index.json");
const OUT_DIR = path.join(ROOT, "public", "catalog", "mobile");
const SHARD_SIZE = 700;

/* Where devices fetch per-title full records from. jsDelivr mirrors the repo
 * (fast + usually reachable in IR); raw.githubusercontent is the fallback the
 * desktop sync already uses. Order matters — db.ts tries them in order. */
const FULL_BASES = [
  "https://cdn.jsdelivr.net/gh/pvwvuow/frame@main/public/catalog",
  "https://raw.githubusercontent.com/pvwvuow/frame/main/public/catalog",
];

/* The lite projection: everything list surfaces need, nothing heavy.
 * NOTE: if you add a field here, mirror it in db.ts sanitizeTitle/toLite. */
const LITE_FIELDS = [
  "slug", "title", "titleEn", "type", "year", "rating", "duration",
  "genres", "poster", "backdrop", "posterUrl", "backdropUrl",
  "trailerUrl", "director", "cast", "country", "ageRating", "quality",
  "featured", "trendingScore", "views", "source", "addedAt",
];

function main() {
  console.time("shard");
  const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
  if (raw.format !== "nama-catalog") throw new Error("unexpected catalog format: " + raw.format);

  // stable id assignment: slug-sorted
  const titles = [...raw.titles].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  titles.forEach((t, i) => {
    t.id = i + 1;
  });

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const seasonsOf = (t) => {
    const set = new Set();
    for (const e of t.episodes || []) set.add(Number(e.season) || 1);
    return set.size;
  };

  const shardCount = Math.ceil(titles.length / SHARD_SIZE);
  let episodes = 0;
  for (let s = 0; s < shardCount; s++) {
    const slice = titles.slice(s * SHARD_SIZE, (s + 1) * SHARD_SIZE).map((t) => {
      const epCount = Array.isArray(t.episodes) ? t.episodes.length : 0;
      episodes += epCount;
      const lite = {};
      for (const f of LITE_FIELDS) lite[f] = t[f] !== undefined ? t[f] : (f === "featured" ? false : "");
      lite.id = t.id;
      lite.episodeCount = epCount;
      lite.seasonCount = seasonsOf(t);
      return lite;
    });
    const file = path.join(OUT_DIR, `lite-${String(s).padStart(2, "0")}.json`);
    fs.writeFileSync(file, JSON.stringify(slice));
  }

  /* Manifest version must CHANGE whenever the catalog content changes:
   * db.ts's doInit() skips the whole import when storedManifest.version ===
   * remote.version, so a constant (the old format-version 1) made Android
   * keep the previous catalog forever after an update. The index payload's
   * sha256 (from version.json, written by export-catalog.mjs) is the
   * content identity — its prefix is unique per content change. */
  let version = "unknown";
  try {
    const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "catalog", "version.json"), "utf8"));
    version = String(vj.sha256 || vj.version || "unknown").slice(0, 12);
  } catch {}

  const manifest = {
    format: "nama-catalog-mobile-lite",
    version,
    generatedAt: new Date().toISOString(),
    counts: {
      titles: titles.length,
      movies: titles.filter((t) => t.type === "movie").length,
      series: titles.filter((t) => t.type === "series").length,
      episodes,
    },
    shardSize: SHARD_SIZE,
    shardCount,
    /* v0.25.0 — per-title full-record base(s); db.ts loadFullRecord() */
    fullBases: FULL_BASES,
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest));

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  const total = fs.readdirSync(OUT_DIR).reduce((a, f) => a + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`shards: ${shardCount} (lite) | titles: ${manifest.counts.titles} | episodes(refs): ${episodes} | total: ${mb(total)}`);
  console.timeEnd("shard");
}

main();
