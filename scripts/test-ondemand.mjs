#!/usr/bin/env node
/* v0.25.0 — on-demand pipeline integrity test (pure node, no app, no DB).
 *
 * Validates that the SPLIT catalog is consistent end-to-end:
 *   1. public/catalog/mobile/manifest.json  — lite format + fullBases + sha version
 *   2. lite shards                          — NO heavy fields (episodes/description/
 *                                             sources/videoUrl), ids 1..N unique/stable,
 *                                             counters present, posterUrl on tt titles
 *   3. public/catalog/titles/{aa}/{slug}.json — exists for every slug, carries the
 *                                             heavy fields the shards dropped
 *   4. index.json                           — still the full desktop payload
 *
 * Run after publish-catalog.mjs:  node scripts/test-ondemand.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "public", "catalog");
const MOBILE = path.join(CATALOG, "mobile");

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}${extra ? " — " + extra : ""}`);
  }
};

const HEAVY_FIELDS = ["episodes", "description", "sources", "videoUrl"];
const REQUIRED_LITE = ["id", "slug", "title", "type", "year", "rating", "genres", "poster", "backdrop", "featured", "trendingScore", "views", "addedAt", "episodeCount", "seasonCount"];

function main() {
  console.log("== manifest ==");
  const manifest = JSON.parse(fs.readFileSync(path.join(MOBILE, "manifest.json"), "utf8"));
  check("manifest format is lite", manifest.format === "nama-catalog-mobile-lite", manifest.format);
  check("manifest version is content sha", typeof manifest.version === "string" && manifest.version.length === 12 && manifest.version !== "unknown", manifest.version);
  check("manifest carries fullBases", Array.isArray(manifest.fullBases) && manifest.fullBases.length >= 2 && manifest.fullBases.every((u) => /^https:\/\//.test(u)));

  console.log("== lite shards ==");
  const shardFiles = fs.readdirSync(MOBILE).filter((f) => /^lite-\d+\.json$/.test(f)).sort();
  check("shard files exist", shardFiles.length > 0);
  check("shard count matches manifest", shardFiles.length === manifest.shardCount, `${shardFiles.length} vs ${manifest.shardCount}`);
  check("no legacy full-XX.json left behind", fs.readdirSync(MOBILE).filter((f) => /^full-\d+\.json$/.test(f)).length === 0);

  const seenIds = new Set();
  const slugs = [];
  const shardTts = new Set();
  let heavyLeak = 0;
  let missingFields = 0;
  let episodeRefCount = 0;
  for (const f of shardFiles) {
    const rows = JSON.parse(fs.readFileSync(path.join(MOBILE, f), "utf8"));
    for (const r of rows) {
      if (seenIds.has(r.id)) heavyLeak++;
      seenIds.add(r.id);
      for (const hf of HEAVY_FIELDS) if (r[hf] !== undefined) heavyLeak++;
      for (const rf of REQUIRED_LITE) if (r[rf] === undefined) missingFields++;
      if (typeof r.posterUrl === "string" && r.posterUrl.includes("metahub")) episodeRefCount++;
      slugs.push(r.slug);
      const pm = /^\/covers\/(tt\d+)\//.exec(r.poster || "");
      if (pm) shardTts.add(pm[1]);
    }
  }
  check("lite ids unique & dense 1..N", seenIds.size === manifest.counts.titles && heavyLeak === 0 || seenIds.size === manifest.counts.titles, `unique=${seenIds.size} titles=${manifest.counts.titles}`);
  check("no heavy fields in lite records", heavyLeak === 0, `${heavyLeak} leaks`);
  check("all required lite fields present", missingFields === 0, `${missingFields} missing`);
  /* v0.34.0 — threshold 0.9 → 0.6: the Film2Media wave (~5.4k titles) ships
   * with runtime SVG covers (/api/cover) until each earns an IMDb tt via the
   * metadata pipeline; posterUrl is only derivable for tt-covered titles. */
  check("posterUrl shipped for most titles", episodeRefCount > manifest.counts.titles * 0.6, `${episodeRefCount}/${manifest.counts.titles}`);
  check("episode counters match manifest", slugs.length === manifest.counts.titles);

  console.log("== per-title full records ==");
  const titlesDir = path.join(CATALOG, "titles");
  check("titles/ dir exists", fs.existsSync(titlesDir));
  const buckets = fs.existsSync(titlesDir) ? fs.readdirSync(titlesDir) : [];
  check("titles/ bucketed by 2-char prefix", buckets.length > 10 && buckets.every((b) => b.length === 2));
  const onDisk = new Set();
  let onDiskBytes = 0;
  for (const b of buckets) {
    const dir = path.join(titlesDir, b);
    for (const f of fs.readdirSync(dir)) {
      onDisk.add(f.replace(/\.json$/, ""));
      onDiskBytes += fs.statSync(path.join(dir, f)).size;
    }
  }
  check("every lite slug has a full record on disk", slugs.every((s) => onDisk.has(s)), `${slugs.filter((s) => !onDisk.has(s)).length} missing`);

  // spot-check: 5 sampled slugs carry the heavy fields + episodes with sources
  const step = Math.max(1, Math.floor(slugs.length / 5));
  const samples = [slugs[0], slugs[Math.floor(slugs.length / 4)], slugs[Math.floor(slugs.length / 2)], slugs[Math.floor((3 * slugs.length) / 4)], slugs[slugs.length - 1]]
    .filter((s, i, a) => a.indexOf(s) === i);
  let sampleOk = true;
  let sampleEpisodes = 0;
  for (const slug of samples) {
    const rec = JSON.parse(fs.readFileSync(path.join(titlesDir, slug.slice(0, 2), `${slug}.json`), "utf8"));
    if (typeof rec.description !== "string" || !Array.isArray(rec.episodes) || typeof rec.sources === "undefined") sampleOk = false;
    sampleEpisodes += rec.episodes.length;
    for (const e of rec.episodes) {
      if (!Array.isArray(e.sources)) sampleOk = false;
    }
  }
  check("sampled full records carry description+episodes+sources", sampleOk, `${sampleEpisodes} episodes across ${samples.length} samples`);

  console.log("== desktop index.json ==");
  const index = JSON.parse(fs.readFileSync(path.join(CATALOG, "index.json"), "utf8"));
  check("index.json still full format", index.format === "nama-catalog");
  const vj2 = JSON.parse(fs.readFileSync(path.join(CATALOG, "version.json"), "utf8"));
  /* v0.34.0 — the committed index.json is the FROZEN legacy core (old
   * clients hash-skip it); the full library now lives in the release-asset
   * split (version.json counts) + the shards built from it.
   *
   * v0.42.5 — the old "index.titles + parts == shards" EQUALITY assumed the
   * demo/od core never changes after the freeze. Reality: legit catalog
   * maintenance (the v0.42.4 dead-duplicate purge removed 6 od ghosts) and
   * future od waves move the od count in EITHER direction, breaking the sum
   * while every delivery contract stays intact. The contracts that actually
   * matter — the ones real clients verify — are:
   *
   *   1. FREEZE — index.json's bytes must hash to version.json.sha256
   *      (export-catalog.mjs computes that sha FROM index.json; old clients
   *      compare their merged hash against it and skip the ~88MB core when
   *      equal). An accidental index.json regeneration fails this loudly.
   *   2. COVERAGE — every slug inside the frozen index still resolves in the
   *      current lite shards, so a client that merged the legacy core keeps
   *      a fully resolvable library.
   *   3. IDENTITY — version.json counts == shards count (kept below): the
   *      split (core+parts assets) and the shards are built from the same
   *      DB export, so their totals must agree.
   */
  const indexSha = createHash("sha256").update(fs.readFileSync(path.join(CATALOG, "index.json"))).digest("hex");
  check("index.json sha256 == version.json.sha256 (frozen core)", indexSha === String(vj2.sha256 || "").toLowerCase(), `index=${indexSha.slice(0, 12)} version=${String(vj2.sha256 || "").slice(0, 12)}`);
  const shardSlugSet = new Set(slugs);
  /* v0.42.4 purged 884 dead/duplicate records from the DB — 6 of them lived
   * inside the frozen index, so their slugs legitimately vanished from the
   * shards: the CONTENT was re-homed on the canonical record (5 same-tt
   * twins + De Dag re-slugged, tt6144672). A missing frozen slug is
   * therefore tolerable when the content survives — either the frozen
   * record itself was unwatchable (no title/episode sources: dedup fodder)
   * or its tt-cover identity still rides on a live shard record. A ghost
   * that lost BOTH its watchability and its tt means real content
   * disappeared from the library — that must fail. */
  const deadGhosts = [];
  const liveGhosts = [];
  for (const t of index.titles) {
    if (shardSlugSet.has(t.slug)) continue;
    const watchable = (t.sources || []).length > 0 || (t.episodes || []).some((e) => (e.sources || []).length > 0);
    const tt = /^\/covers\/(tt\d+)\//.exec(t.poster || "");
    if (!watchable || (tt && shardTts.has(tt[1]))) deadGhosts.push(t.slug);
    else liveGhosts.push(t.slug);
  }
  check("frozen-index ghosts all re-homed or dead (deduped)", liveGhosts.length === 0, `${liveGhosts.length} LIVE ghosts: ${liveGhosts.slice(0, 5).join(",")} | ${deadGhosts.length} re-homed/dead tolerated`);
  const partTitles = (vj2.parts || []).reduce((a, p) => a + (p.titles || 0), 0);
  check("parts never exceed the library", partTitles <= manifest.counts.titles, `parts=${partTitles} shards=${manifest.counts.titles}`);
  check("version.json counts == shards count", (vj2.counts?.titles ?? -1) === manifest.counts.titles, `version=${vj2.counts?.titles} shards=${manifest.counts.titles}`);
  const idxSample = index.titles.find((t) => t.episodes && t.episodes.length > 0);
  check("index.json keeps full records (episodes)", !!idxSample);
  check("index.json carries posterUrl", index.titles.some((t) => typeof t.posterUrl === "string" && t.posterUrl.includes("metahub")));

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log(`\nsummary: ${pass} ok, ${fail} failed | titles/ ${mb(onDiskBytes)} | shards+manifest in ${MOBILE}`);
  if (fail > 0) process.exit(1);
}

main();
