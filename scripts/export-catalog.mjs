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

  const payload = {
    format: "nama-catalog",
    version: 1,
    generatedAt: new Date().toISOString(),
    counts: {
      titles: out.length,
      movies: out.filter((t) => t.type === "movie").length,
      series: out.filter((t) => t.type === "series").length,
      episodes: out.reduce((a, t) => a + t.episodes.length, 0),
    },
    titles: out,
  };
  const body = JSON.stringify(payload);
  const sha = createHash("sha256").update(body).digest("hex");

  const dir = path.join(__dirname, "..", "public", "catalog");
  fs.writeFileSync(path.join(dir, "index.json"), body);
  fs.writeFileSync(
    path.join(dir, "version.json"),
    JSON.stringify({
      format: "nama-catalog-version",
      version: 1,
      sha256: sha,
      counts: payload.counts,
      generatedAt: payload.generatedAt,
    })
  );
  const mb = (n) => (n / 1024 / 1024).toFixed(1) + "MB";
  console.log(`index.json: ${mb(body.length)} | sha256: ${sha}`);
  console.log("counts:", JSON.stringify(payload.counts));

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
