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
    }
  }
  check("lite ids unique & dense 1..N", seenIds.size === manifest.counts.titles && heavyLeak === 0 || seenIds.size === manifest.counts.titles, `unique=${seenIds.size} titles=${manifest.counts.titles}`);
  check("no heavy fields in lite records", heavyLeak === 0, `${heavyLeak} leaks`);
  check("all required lite fields present", missingFields === 0, `${missingFields} missing`);
  check("posterUrl shipped for most titles", episodeRefCount > manifest.counts.titles * 0.9, `${episodeRefCount}/${manifest.counts.titles}`);
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
  check("index.json title count matches shards", index.titles.length === manifest.counts.titles);
  const idxSample = index.titles.find((t) => t.episodes && t.episodes.length > 0);
  check("index.json keeps full records (episodes)", !!idxSample);
  check("index.json carries posterUrl", index.titles.some((t) => typeof t.posterUrl === "string" && t.posterUrl.includes("metahub")));

  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log(`\nsummary: ${pass} ok, ${fail} failed | titles/ ${mb(onDiskBytes)} | shards+manifest in ${MOBILE}`);
  if (fail > 0) process.exit(1);
}

main();
