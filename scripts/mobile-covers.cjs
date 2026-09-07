#!/usr/bin/env node
/* Mobile cover optimizer (android branch).
 *
 * 682MB of JPEG covers cannot ship inside an APK. This script converts the
 * posters/backdrops of the most-seen titles to compact WebP files that sit
 * NEXT TO the originals (public/covers/<tt>/poster.webp). The mobile image
 * fallback chain then becomes: poster.jpg → poster.webp (bundled) → SVG.
 *
 * Budget-driven: top titles first (views desc), stop at the size caps.
 *   posters   width 300 q62  cap ~115MB
 *   backdrops width 640 q55  cap ~12MB
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "public", "catalog", "index.json");
const COVERS = path.join(ROOT, "public", "covers");
const POSTER_BUDGET = 115 * 1024 * 1024;
const BACKDROP_BUDGET = 12 * 1024 * 1024;
const POSTER_LIMIT = 6500;
const BACKDROP_LIMIT = 450;

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function convert(list, kind, width, quality, budget) {
  let bytes = 0;
  let done = 0;
  let skipped = 0;
  await pool(list, 8, async (t) => {
    if (bytes > budget) {
      skipped++;
      return;
    }
    const src = path.join(ROOT, "public", t[kind]);
    if (!src.endsWith(".jpg") || !fs.existsSync(src)) {
      skipped++;
      return;
    }
    const out = src.replace(/\.jpg$/, ".webp");
    if (fs.existsSync(out)) {
      bytes += fs.statSync(out).size;
      done++;
      return;
    }
    try {
      await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(out);
      bytes += fs.statSync(out).size;
      done++;
      if (done % 500 === 0) console.log(`  ${kind}: ${done} | ${(bytes / 1024 / 1024).toFixed(1)}MB`);
    } catch {
      skipped++;
    }
  });
  console.log(`${kind}: converted=${done} skipped=${skipped} total=${(bytes / 1024 / 1024).toFixed(1)}MB`);
  return bytes;
}

async function main() {
  console.time("covers");
  const raw = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const byViews = [...raw.titles].sort((a, b) => (b.views || 0) - (a.views || 0));
  const posters = byViews.filter((t) => t.poster && t.poster.endsWith(".jpg")).slice(0, POSTER_LIMIT);
  const backdrops = byViews.filter((t) => t.backdrop && t.backdrop.endsWith(".jpg")).slice(0, BACKDROP_LIMIT);
  console.log(`candidates: ${posters.length} posters, ${backdrops.length} backdrops`);
  await convert(backdrops, "backdrop", 640, 55, BACKDROP_BUDGET);
  await convert(posters, "poster", 300, 62, POSTER_BUDGET);
  console.timeEnd("covers");
}

main();
