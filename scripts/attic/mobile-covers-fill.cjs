#!/usr/bin/env node
/* v0.16.0 — fill the missing mobile webp covers.
 *
 * mobile-covers.cjs was budget-capped (6,500 posters / 450 backdrops) so
 * ~7,300 titles had NO offline artwork on the phone and the released
 * bundles shipped placeholders for them. This script converts EVERY
 * remaining poster.jpg/backdrop.jpg to the same compact webp so the split
 * cover packs (Frame-coverpack-rN-pNN.zip) cover the whole catalog.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const COVERS = path.join(ROOT, "public", "covers");

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

async function main() {
  const dirs = fs.readdirSync(COVERS).filter((d) => {
    try {
      return fs.statSync(path.join(COVERS, d)).isDirectory();
    } catch {
      return false;
    }
  });
  const jobs = [];
  for (const d of dirs) {
    const pj = path.join(COVERS, d, "poster.jpg");
    const pw = path.join(COVERS, d, "poster.webp");
    if (fs.existsSync(pj) && !fs.existsSync(pw)) jobs.push({ src: pj, out: pw, width: 300, quality: 62 });
    const bj = path.join(COVERS, d, "backdrop.jpg");
    const bw = path.join(COVERS, d, "backdrop.webp");
    if (fs.existsSync(bj) && !fs.existsSync(bw)) jobs.push({ src: bj, out: bw, width: 640, quality: 55 });
  }
  console.log(`missing poster.webp: ${jobs.filter((j) => j.width === 300).length} | missing backdrop.webp: ${jobs.filter((j) => j.width === 640).length}`);
  let done = 0;
  let bytes = 0;
  let failed = 0;
  await pool(jobs, 8, async (j) => {
    try {
      await sharp(j.src).resize({ width: j.width, withoutEnlargement: true }).webp({ quality: j.quality }).toFile(j.out);
      done++;
      bytes += fs.statSync(j.out).size;
      if (done % 1000 === 0) console.log(`  ${done} converted | ${(bytes / 1048576).toFixed(1)}MB`);
    } catch (e) {
      failed++;
      console.warn(`  FAIL ${j.src}: ${e.message}`);
    }
  });
  console.log(`done: ${done} webp generated (${(bytes / 1048576).toFixed(1)}MB), failed: ${failed}`);
}

main();
