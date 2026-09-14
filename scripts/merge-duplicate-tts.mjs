/* merge-duplicate-tts.mjs — v0.34.4 (DEDUPE-1)
 *
 * The catalog carries 859 duplicate tt groups (1,743 titles, 884 surplus
 * rows): od∩f2m twins where the Film2Media import created its own row for a
 * title the od wave already had, plus f2m∩f2m sheet dupes (worst: tt8579674 ×8).
 * Users see the same movie twice in every grid — and the surfer's complaint.
 *
 * Merge policy (user asked: «با حفظ علاقه‌مندی‌ها» — keep favorites):
 *   • CANONICAL per tt group: od source wins (od rows are also the ones the
 *     device-side removal policy never touches → the f2m twin is the row that
 *     cleanly disappears on devices), then richness: more episodes, longer
 *     description, more genres, rating, views, stable lowest id.
 *   • USER DATA migrates to the canonical with skip-if-exists:
 *     Favorite / Watchlist / UserRating / Review (userKey+titleId),
 *     WatchProgress (userKey+titleId+episodeId, keep the most-watched row on
 *     collision), CollectionItem (collectionId+titleId).
 *   • EPISODES: (season,number)-unique — non-colliding rows are re-pointed to
 *     the canonical; colliding rows UNION their sources ({q,v,url} deduped by
 *     url) and fill empty fields, then the surplus row is deleted.
 *   • TITLE FIELDS: featured=OR, views/trendingScore=max, empty description /
 *     genres / rating / duration / quality / country / ageRating / director /
 *     cast / trailerUrl / videoUrl are filled from the richest duplicate.
 *   • Remaining duplicate rows are deleted (episodes cascade).
 *
 * Device safety: applyCatalog (catalog-refresh.ts) gained the same tt-twin
 * reconciliation for rows it removes — user rows ride over to the surviving
 * twin before deletion. This script only runs against the seed/catalog DB.
 *
 * Run: node scripts/merge-duplicate-tts.mjs [--dry-run]
 */

import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const ROOT = path.join(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");
const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.join(ROOT, "db", "custom.db") } },
});

const TT_RE = /^\/covers\/(tt\d+)\//;

const ttOf = (p) => {
  const m = TT_RE.exec(p || "");
  return m ? m[1] : "";
};

const parseJson = (s, fb) => {
  try {
    const v = JSON.parse(s || "");
    return v ?? fb;
  } catch {
    return fb;
  }
};

function richnessScore(t, epCount) {
  return [
    t.source === "od" ? 1e9 : 0, // od wins (device removal policy never touches od)
    epCount * 1e6,
    (t.description || "").length * 10,
    parseJson(t.genres, []).length * 1e3,
    (t.rating || 0) * 1e2,
    t.videoUrl ? 50 : 0,
    t.views || 0,
    -t.id, // stable: lowest id wins ties
  ].reduce((a, b) => a + b, 0);
}

/* pick the longer/richer of two scalar strings */
const richer = (a, b) => (a && (!b || a.length > b.length) ? a : b);

/* The SEED db's runtime tables predate some schema additions (Review has no
 * userKey; CollectionItem/NotificationEvent don't exist at all in the seed —
 * ensureRuntimeSchema creates them on devices). Introspect and adapt. */
async function columnsOf(table) {
  const rows = await db.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  return rows.map((r) => r.name);
}

async function migrateUserRows(model, dupeIds, canonicalId, keyOf, label, stats) {
  for (const dupeId of dupeIds) {
    const rows = await model.findMany({ where: { titleId: dupeId } });
    for (const r of rows) {
      const key = keyOf(r);
      const exists = await model.findFirst({ where: { ...key, titleId: canonicalId } });
      if (exists) {
        // collision: keep the richer row when both exist
        if (label === "progress" && exists.position < r.position) {
          await model.update({ where: { id: exists.id }, data: { position: r.position, duration: r.duration, updatedAt: r.updatedAt } });
        }
        await model.delete({ where: { id: r.id } });
        stats.userCollisions++;
      } else {
        await model.update({ where: { id: r.id }, data: { titleId: canonicalId } });
        stats.userMigrated++;
      }
    }
  }
}

async function main() {
  const titles = await db.title.findMany({
    select: { id: true, slug: true, title: true, titleEn: true, type: true, year: true, rating: true, duration: true, description: true, genres: true, poster: true, backdrop: true, videoUrl: true, trailerUrl: true, director: true, cast: true, country: true, ageRating: true, quality: true, views: true, featured: true, trendingScore: true, source: true },
  });

  const groups = new Map();
  for (const t of titles) {
    const tt = ttOf(t.poster);
    if (!tt) continue;
    if (!groups.has(tt)) groups.set(tt, []);
    groups.get(tt).push(t);
  }
  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1);
  const surplus = dupes.reduce((a, [, g]) => a + g.length - 1, 0);
  console.log(`[dedupe] titles=${titles.length} tt-groups=${groups.size} dup-groups=${dupes.length} surplus-rows=${surplus}`);
  if (DRY) {
    for (const [tt, g] of dupes.slice(0, 15)) {
      g.sort((a, b) => richnessScore(b, 0) - richnessScore(a, 0));
      console.log(`  [dry] ${tt}: keep "${g[0].titleEn || g[0].title}" (${g[0].source}, id=${g[0].id}) — drop ${g.slice(1).map((x) => `${x.slug}(id=${x.id},${x.source})`).join(", ")}`);
    }
  }

  const stats = { groups: 0, removed: 0, userMigrated: 0, userCollisions: 0, episodesMoved: 0, episodesMerged: 0, fieldsFilled: 0 };

  if (DRY) {
    console.log("[dedupe] dry-run — no writes performed.");
    await db.$disconnect();
    return;
  }

  for (const [tt, group] of dupes) {
    const epCounts = await db.episode.groupBy({ by: ["titleId"], _count: { _all: true }, where: { titleId: { in: group.map((g) => g.id) } } });
    const epOf = new Map(epCounts.map((e) => [e.titleId, e._count._all]));
    const sorted = [...group].sort((a, b) => richnessScore(b, epOf.get(b.id) || 0) - richnessScore(a, epOf.get(a.id) || 0));
    const keep = sorted[0];
    const drop = sorted.slice(1);

    /* ---- 1) user data rides to the canonical ---- */
    const kw = (r) => ({ userKey: r.userKey });
    await migrateUserRows(db.favorite, drop.map((d) => d.id), keep.id, kw, "favorite", stats);
    await migrateUserRows(db.watchlist, drop.map((d) => d.id), keep.id, kw, "watchlist", stats);
    await migrateUserRows(db.userRating, drop.map((d) => d.id), keep.id, kw, "rating", stats);
    /* reviews (seed shape: id/titleId/author/rating/body — no userKey, no
     * unique): simply re-point every review of a duplicate to the canonical. */
    if ((await columnsOf("Review")).includes("userKey")) {
      await migrateUserRows(db.review, drop.map((d) => d.id), keep.id, kw, "review", stats);
    } else if ((await columnsOf("Review")).length) {
      const n = await db.review.updateMany({ where: { titleId: { in: drop.map((d) => d.id) } }, data: { titleId: keep.id } });
      stats.userMigrated += n.count;
    }
    /* collection items / notification events: not part of the seed db —
     * device-side applyCatalog handles them when it reconciles tt twins. */
    if ((await columnsOf("CollectionItem")).includes("titleId")) {
      await migrateUserRows(db.collectionItem, drop.map((d) => d.id), keep.id, (r) => ({ collectionId: r.collectionId }), "collectionItem", stats);
    }
    await migrateUserRows(db.watchProgress, drop.map((d) => d.id), keep.id, (r) => ({ userKey: r.userKey, episodeId: r.episodeId ?? 0 }), "progress", stats);

    /* ---- 2) episodes: move non-colliding, merge colliding ---- */
    const keepEps = await db.episode.findMany({ where: { titleId: keep.id }, select: { id: true, season: true, number: true, sources: true, videoUrl: true, name: true, synopsis: true, thumbnail: true, duration: true } });
    const keepBySN = new Map(keepEps.map((e) => [`${e.season}:${e.number}`, e]));
    for (const d of drop) {
      const dEps = await db.episode.findMany({ where: { titleId: d.id } });
      for (const e of dEps) {
        const key = `${e.season}:${e.number}`;
        const twin = keepBySN.get(key);
        if (!twin) {
          await db.episode.update({ where: { id: e.id }, data: { titleId: keep.id } });
          keepBySN.set(key, { ...e, titleId: keep.id });
          stats.episodesMoved++;
          continue;
        }
        // same (season,number): union sources by url, fill empty fields
        const a = parseJson(twin.sources, []);
        const b = parseJson(e.sources, []);
        const seen = new Set(a.map((s) => s.url));
        const union = a.concat(b.filter((s) => s && s.url && !seen.has(s.url)));
        const patch = {};
        if (union.length !== a.length) patch.sources = JSON.stringify(union);
        if (!twin.videoUrl && e.videoUrl) patch.videoUrl = e.videoUrl;
        if (!twin.name && e.name) patch.name = e.name;
        if (!twin.synopsis && e.synopsis) patch.synopsis = e.synopsis;
        if (!twin.thumbnail && e.thumbnail) patch.thumbnail = e.thumbnail;
        if (!twin.duration && e.duration) patch.duration = e.duration;
        if (Object.keys(patch).length) await db.episode.update({ where: { id: twin.id }, data: patch });
        await db.episode.delete({ where: { id: e.id } });
        stats.episodesMerged++;
      }
    }

    /* ---- 3) title fields: fill the canonical from the richest duplicate ---- */
    const patch = {};
    for (const d of drop) {
      if (d.featured && !keep.featured) { patch.featured = true; keep.featured = true; }
      if ((d.views || 0) > (keep.views || 0)) { patch.views = d.views; keep.views = d.views; }
      if ((d.trendingScore || 0) > (keep.trendingScore || 0)) { patch.trendingScore = d.trendingScore; keep.trendingScore = d.trendingScore; }
      if (!keep.description && d.description) { patch.description = d.description; keep.description = d.description; }
      else if (d.description && (d.description.length > (keep.description || "").length) && (keep.description || "").length < 100) { patch.description = d.description; keep.description = d.description; }
      if (parseJson(keep.genres, []).length === 0 && parseJson(d.genres, []).length > 0) { patch.genres = d.genres; keep.genres = d.genres; }
      if (!keep.rating && d.rating) { patch.rating = d.rating; keep.rating = d.rating; }
      if (!keep.duration && d.duration) { patch.duration = d.duration; keep.duration = d.duration; }
      if (!keep.quality || keep.quality === "—") { if (d.quality) { patch.quality = d.quality; keep.quality = d.quality; } }
      if (!keep.country && d.country) { patch.country = d.country; keep.country = d.country; }
      if (!keep.ageRating && d.ageRating) { patch.ageRating = d.ageRating; keep.ageRating = d.ageRating; }
      if (!keep.director && d.director) { patch.director = d.director; keep.director = d.director; }
      if ((!keep.cast || keep.cast === "[]") && d.cast && d.cast !== "[]") { patch.cast = d.cast; keep.cast = d.cast; }
      if (!keep.trailerUrl && d.trailerUrl) { patch.trailerUrl = d.trailerUrl; keep.trailerUrl = d.trailerUrl; }
      if (!keep.videoUrl && d.videoUrl) { patch.videoUrl = d.videoUrl; keep.videoUrl = d.videoUrl; }
    }
    if (Object.keys(patch).length) {
      await db.title.update({ where: { id: keep.id }, data: patch });
      stats.fieldsFilled++;
    }

    /* ---- 4) delete the duplicates (remaining episodes cascade) ---- */
    await db.title.deleteMany({ where: { id: { in: drop.map((d) => d.id) } } });
    stats.groups++;
    stats.removed += drop.length;
    if (stats.groups % 100 === 0) console.log(`  … ${stats.groups}/${dupes.length} groups done`);
  }

  console.log("[dedupe] DONE", JSON.stringify(stats));
  console.log(`[dedupe] title count now: ${await db.title.count()}`);
  if (!DRY) {
    console.log("[dedupe] vacuuming…");
    await db.$executeRawUnsafe("VACUUM");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
