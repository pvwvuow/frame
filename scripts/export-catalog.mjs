#!/usr/bin/env node
/* Regenerate public/catalog/index.json + version.json from db/custom.db.
 * (Companion of catalog-refresh.ts: the desktop app syncs from the hosted
 * catalog by hashing the body — version.json lets it skip identical payloads.)
 * Run: node scripts/export-catalog.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new PrismaClient({
  datasources: { db: { url: "file:" + process.cwd().replace(/\\/g, "/") + "/db/custom.db" } },
});

const METAHUB = (tt, kind) => `https://images.metahub.space/${kind}/${tt}/img`;

function coverTt(poster) {
  const m = /^\/covers\/(tt\d+)\//.exec(poster || "");
  return m ? m[1] : null;
}

async function main() {
  const titles = await db.title.findMany({
    orderBy: { id: "asc" },
    include: { episodes: { orderBy: [{ season: "asc" }, { number: "asc" }] } },
  });
  console.log("titles:", titles.length);

  const out = titles.map((t) => {
    const tt = coverTt(t.poster);
    const eps = t.episodes.map((e) => ({
      season: e.season,
      number: e.number,
      name: e.name,
      synopsis: e.synopsis,
      duration: e.duration,
      videoUrl: e.videoUrl,
      sources: safeParse(e.sources),
      thumbnail: e.thumbnail,
    }));
    return {
      slug: t.slug,
      title: t.title,
      titleEn: t.titleEn,
      type: t.type,
      year: t.year,
      rating: t.rating,
      duration: t.duration,
      description: t.description,
      genres: safeParse(t.genres),
      poster: t.poster,
      backdrop: t.backdrop,
      posterUrl: tt ? METAHUB(tt, "poster/small") : "",
      backdropUrl: tt ? METAHUB(tt, "background/medium") : "",
      videoUrl: t.videoUrl,
      trailerUrl: t.trailerUrl,
      director: t.director,
      cast: safeParse(t.cast),
      country: t.country,
      ageRating: t.ageRating,
      quality: t.quality,
      sources: safeParse(t.sources),
      featured: t.featured,
      trendingScore: t.trendingScore,
      views: t.views,
      source: t.source,
      // v0.23.0 «جدیدترین‌ها» — real add-date (null for pre-refresh titles →
      // the newest sort sinks them; the 484 v0.22.0 arrivals carry their date)
      addedAt: t.createdAt ? new Date(t.createdAt).toISOString() : "",
      episodes: eps,
    };
  });

  /* A-4 — قطعی‌سازی خروجی: generatedAt از خودِ داده مشتق می‌شود (جدیدترین
   * createdAt)، نه از ساعتِ سیستم. با صفر تغییرِ داده، خروجیِ دوباره بایت‌به‌بایت
   * یکی است و هش تغییر نمی‌کند ⇒ هیچ دستگاهی دانلود/ادغامِ بی‌دلیل نمی‌کند. */
  const latestAddedMs = out.reduce((acc, t) => {
    const ms = t.addedAt ? Date.parse(t.addedAt) : 0;
    return Number.isFinite(ms) && ms > acc ? ms : acc;
  }, 0);
  const payload = {
    format: "nama-catalog",
    version: 1,
    generatedAt: latestAddedMs
      ? new Date(latestAddedMs).toISOString()
      : "1970-01-01T00:00:00.000Z",
    counts: {
      titles: out.length,
      movies: out.filter((t) => t.type === "movie").length,
      series: out.filter((t) => t.type === "series").length,
      episodes: out.reduce((a, t) => a + t.episodes.length, 0),
    },
    titles: out,
  };

  const dir = path.join(__dirname, "..", "public", "catalog");
  /* v0.34.0 — SPLIT CATALOG (GitHub's 100MB raw-file cap).
   *
   * Three artifacts leave this script:
   *
   * 1. public/catalog/index.json — UNTOUCHED legacy payload (the v0.33.0
   *    core). Old installed clients probe version.json, see the SAME sha256
   *    they already merged, and skip: zero churn for them. This file stays
   *    frozen; future content waves only grow the release assets below.
   *
   * 2. public/catalog/catalog-core.json + catalog-f2m.json — the FULL
   *    current catalog split by source (demo/od = core, everything else —
   *    f2m today — = one more part per 60MB). CI attaches them to the
   *    GitHub RELEASE (assets allow 2GiB); v0.34.0+ clients fetch
   *    releases/latest/download/… (electron/main.cjs DEFAULT_CATALOG_URL)
   *    and merge the union. Git-ignored: too big for blobs.
   *
   * 3. public/catalog/version.json — v2: sha256 = the frozen legacy core
   *    (old-client skip), partsSha256 = core+f2m content identity for the
   *    new clients, parts[] = the release-asset part list.
   *
   * .full.json is a local hand-off for mobile-shard-catalog.cjs so the
   * Android lite shards cover the FULL library (git-ignored too). */
  const PART_LIMIT = 60 * 1024 * 1024;
  const CORE_SOURCES = new Set(["demo", "od"]);
  const coreTitles = out.filter((t) => CORE_SOURCES.has(t.source));
  const restTitles = out.filter((t) => !CORE_SOURCES.has(t.source));

  const coreBody = JSON.stringify({
    format: "nama-catalog",
    version: 1,
    generatedAt: payload.generatedAt,
    counts: {
      titles: coreTitles.length,
      movies: coreTitles.filter((t) => t.type === "movie").length,
      series: coreTitles.filter((t) => t.type === "series").length,
      episodes: coreTitles.reduce((a, t) => a + t.episodes.length, 0),
    },
    titles: coreTitles,
  });
  fs.writeFileSync(path.join(dir, "catalog-core.json"), coreBody);

  const restChunks = [];
  let chunk = [];
  let chunkBytes = 0;
  const flushChunk = () => {
    if (!chunk.length) return;
    restChunks.push(chunk);
    chunk = [];
    chunkBytes = 0;
  };
  for (const t of restTitles) {
    const sz = Buffer.byteLength(JSON.stringify(t));
    if (chunkBytes + sz > PART_LIMIT) flushChunk();
    chunk.push(t);
    chunkBytes += sz;
  }
  flushChunk();
  const partsMeta = restChunks.map((titles, i) => {
    const file = i === 0 ? "catalog-f2m.json" : `catalog-part-${i}.json`;
    const pb = Buffer.from(JSON.stringify({ format: "nama-catalog-part", version: 1, titles }));
    fs.writeFileSync(path.join(dir, file), pb);
    return {
      file,
      sha256: createHash("sha256").update(pb).digest("hex"),
      titles: titles.length,
      bytes: pb.length,
    };
  });

  fs.writeFileSync(
    path.join(dir, ".full.json"),
    JSON.stringify({ format: "nama-catalog", version: 1, generatedAt: payload.generatedAt, counts: payload.counts, titles: out })
  );

  /* The frozen legacy index.json's sha256 — old clients compare it against
   * their stored hash and skip the download entirely. */
  let legacySha = "";
  try {
    legacySha = createHash("sha256").update(fs.readFileSync(path.join(dir, "index.json"))).digest("hex");
  } catch {
    legacySha = sha; // no legacy file on disk (fresh host) — point at the core
  }

  const partsSha256 = createHash("sha256").update(coreBody + partsMeta.map((p) => fs.readFileSync(path.join(dir, p.file))).join("")).digest("hex");
  /* v0.49.0 — the HERO DECK's content identity rides in version.json: the
   * afterPack hook and the desktop shell use it to ship/skip the ~12KB deck
   * (public/catalog/mobile/hero.json, copied by mobile-shard-catalog.cjs). */
  let heroSha256 = "";
  try {
    heroSha256 = createHash("sha256").update(fs.readFileSync(path.join(dir, ".hero-deck.json"))).digest("hex");
  } catch {
    /* no deck this publish — consumers fall back to featured flags */
  }
  fs.writeFileSync(
    path.join(dir, "version.json"),
    JSON.stringify({
      format: "nama-catalog-version",
      version: 2,
      sha256: legacySha,
      /* v0.34.3 — per-file hash of catalog-core.json: lets the Electron-side
       * catalog cache (catalog-cache downloader in main.cjs) skip the ~111MB
       * core re-download when only a part changed. Old clients ignore it. */
      coreSha256: createHash("sha256").update(coreBody).digest("hex"),
      partsSha256,
      parts: partsMeta,
      heroSha256,
      counts: payload.counts,
      generatedAt: payload.generatedAt,
    })
  );
  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log(`legacy index.json (frozen): sha256 ${legacySha.slice(0, 12)}…`);
  console.log(`catalog-core.json: ${mb(Buffer.byteLength(coreBody))} (core ${coreTitles.length} titles)`);
  for (const p of partsMeta) console.log(`  ${p.file}: ${mb(p.bytes)} | ${p.titles} titles | ${p.sha256.slice(0, 12)}…`);
  console.log(`partsSha256: ${partsSha256.slice(0, 12)}…`);
  if (heroSha256) console.log(`heroSha256: ${heroSha256.slice(0, 12)}…`);
  console.log("counts (full):", JSON.stringify(payload.counts));

  /* v0.25.0 — PER-TITLE full records (the on-demand half of the mobile
   * architecture). The Android shards become ~7MB LITE files (list fields
   * only); the heavy part (description + all episode sources) is split into
   * one small JSON per title under titles/{2-char-prefix}/{slug}.json and is
   * fetched BY THE DEVICE the moment that title is opened (jsDelivr → raw
   * GitHub fallback, cached in IndexedDB). These files are committed to the
   * repo — raw.githubusercontent serves them; they are NOT bundled into the
   * APK/webbundle (mobile-build.cjs strips out/catalog/titles). */
  const titlesDir = path.join(dir, "titles");
  fs.rmSync(titlesDir, { recursive: true, force: true });
  let titleBytes = 0;
  let titleFiles = 0;
  for (const t of out) {
    const bucket = path.join(titlesDir, String(t.slug || "").slice(0, 2));
    fs.mkdirSync(bucket, { recursive: true });
    const body2 = Buffer.from(JSON.stringify(t));
    fs.writeFileSync(path.join(bucket, `${t.slug}.json`), body2);
    titleBytes += body2.length;
    titleFiles++;
  }
  console.log(`titles/: ${titleFiles} per-title full records | ${mb(titleBytes)}`);
  await db.$disconnect();
}

function safeParse(s) {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
