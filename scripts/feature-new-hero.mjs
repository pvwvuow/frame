#!/usr/bin/env node
/* Curate the home-hero slideshow (featured flag) — v0.23.0.
 *
 * The user asked: «سریال‌های برتر جدیدی که با آپدیت اومدن» must own the top
 * slideshow. The previous featured set was 8 all-time classics (Breaking Bad,
 * Chernobyl, Band of Brothers…). This script:
 *   1. un-features everything,
 *   2. features the curated 8 NEW series that arrived with the v0.22.0
 *      DonyayeSerial refresh (matched by the IMDb tt-id inside the poster
 *      path — robust against slug renames),
 *   3. prints the resulting hero lineup for review.
 *
 * Run: node scripts/feature-new-hero.mjs
 * Idempotent: safe to re-run, same result every time.
 */
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const require2 = createRequire(import.meta.url);
const { PrismaClient } = require2(path.join(ROOT, "node_modules", "@prisma", "client"));

const db = new PrismaClient({
  datasources: { db: { url: "file:" + ROOT + "/db/custom.db" } },
});

/* The curated hero: top-rated series from the NEW batch (createdAt >= 2026-09),
 * picked for a mix of prestige, popularity and fresh release years. */
const HERO_TT = [
  "tt26471411", // وقتی زندگی به شما نارنگی می دهد — When Life Gives You Tangerines (2025, 9.0)
  "tt11170862", // کیهان: جهان های ممکن — Cosmos: Possible Worlds (2020, 9.0)
  "tt5182866",  // پاسخ ۱۹۸۸ — Reply 1988 (2015, 9.0)
  "tt10541088", // مزرعه کلارکسون — Clarkson's Farm (2021, 9.0)
  "tt1910272",  // دروازه اشتاینز — Steins;Gate (2011, 8.8)
  "tt15435876", // پنگوئن — The Penguin (2024, 8.6)
  "tt1856010",  // خانه پوشالی — House of Cards US (2013, 8.6)
  "tt10048342", // گامبی وزیر — The Queen's Gambit (2020, 8.5)
];

async function main() {
  const cleared = await db.title.updateMany({ where: { featured: true }, data: { featured: false } });
  console.log(`un-featured: ${cleared.count} title(s)`);

  const picked = [];
  for (const tt of HERO_TT) {
    const t = await db.title.findFirst({
      where: { poster: { startsWith: `/covers/${tt}/` } },
      select: { id: true, title: true, titleEn: true, year: true, rating: true, type: true, createdAt: true },
    });
    if (!t) {
      console.error(`  !! NOT FOUND: ${tt}`);
      continue;
    }
    if (t.type !== "series") {
      console.error(`  !! skip (not a series): ${t.titleEn} (${tt})`);
      continue;
    }
    await db.title.update({ where: { id: t.id }, data: { featured: true } });
    picked.push(t);
    console.log(`  + featured: ${t.title} / ${t.titleEn} (${t.year}, ${t.rating})`);
  }
  if (picked.length !== HERO_TT.length) {
    throw new Error(`only ${picked.length}/${HERO_TT.length} hero titles matched — fix HERO_TT before shipping`);
  }
  console.log(`hero lineup ready: ${picked.length} new top series`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
