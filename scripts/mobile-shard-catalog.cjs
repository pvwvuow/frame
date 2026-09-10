#!/usr/bin/env node
/* Mobile catalog sharder (android branch).
 *
 * The desktop app reads titles from SQLite via Prisma. The Android build has
 * no Node server, so the whole catalog ships as JSON shards inside the APK
 * (public/catalog/mobile/) and is imported into IndexedDB on first launch.
 *
 * - ids: the JSON has no numeric id (desktop uses SQLite autoincrement), so we
 *   assign stable ids by slug-sorted order. The APK catalog is immutable, so
 *   ids stay stable for the app lifetime. User data (favorites, progress…)
 *   references these ids.
 * - shards: ~700 titles per file keeps each JSON.parse under ~4MB, so the
 *   first-run import can show a smooth progress bar and stay responsive.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public", "catalog", "index.json");
const OUT_DIR = path.join(ROOT, "public", "catalog", "mobile");
const SHARD_SIZE = 700;

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

  const shardCount = Math.ceil(titles.length / SHARD_SIZE);
  let episodes = 0;
  for (let s = 0; s < shardCount; s++) {
    const slice = titles.slice(s * SHARD_SIZE, (s + 1) * SHARD_SIZE);
    for (const t of slice) if (t.episodes) episodes += t.episodes.length;
    const file = path.join(OUT_DIR, `full-${String(s).padStart(2, "0")}.json`);
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
    format: "nama-catalog-mobile",
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
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest));

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  const total = fs.readdirSync(OUT_DIR).reduce((a, f) => a + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  console.log(`shards: ${shardCount} | titles: ${manifest.counts.titles} | episodes: ${episodes} | total: ${mb(total)}`);
  console.timeEnd("shard");
}

main();
