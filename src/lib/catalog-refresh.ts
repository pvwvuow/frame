import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Catalog refresh – how users get new content after an app update.
 *
 * The desktop shell ships a pristine seed database (resources/app/seed.db).
 * User data lives in <userData>/nama.db and intentionally SURVIVES updates,
 * which is why a plain "overwrite on update" never worked: the app kept
 * rendering whatever catalog version it had installed first (the v0.6.x demo
 * titles) even after upgrading to v0.7.0.
 *
 * Electron compares the bundled seed's SHA-256 with a marker file in
 * <userData> (see electron/main.cjs). On a mismatch it spawns this server
 * with NAMA_CATALOG_SEED pointing at the bundled seed; /api/health then runs
 * the merge below exactly once per server process, BEFORE the window opens:
 *
 *   1. titles/episodes are upserted from the seed – `slug` is the stable key
 *      across catalog versions, so ids (and therefore favorites, ratings and
 *      watchlist entries of surviving titles) are preserved
 *   2. episodes are only replaced when their rows actually changed, so
 *      "continue watching" progress survives no-op refreshes
 *   3. titles that left the catalog are removed together with every user row
 *      that references them (they would be dead links otherwise)
 *   4. UserProfile / settings rows are never touched
 */

export type CatalogRefreshResult = {
  ok: boolean;
  titles: number;
  episodes: number;
  created: number;
  updated: number;
  removed: number;
  error?: string;
};

const EMPTY: CatalogRefreshResult = { ok: false, titles: 0, episodes: 0, created: 0, updated: 0, removed: 0 };

let inflight: Promise<CatalogRefreshResult> | null = null;

/**
 * Runs the refresh at most once per server process. Later calls (health is
 * probed twice during boot) await the same result instead of re-merging.
 */
export function refreshCatalogOnce(seedPath: string): Promise<CatalogRefreshResult> {
  if (!inflight) {
    inflight = refreshCatalog(seedPath).catch((e) => ({
      ...EMPTY,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
  return inflight;
}

type SeedEpisodeData = {
  season: number;
  number: number;
  name: string;
  synopsis: string;
  duration: number;
  videoUrl: string;
  thumbnail: string;
};

async function openSeedClient(seedPath: string): Promise<PrismaClient> {
  const forward = seedPath.replace(/\\/g, "/");
  // Windows install directories may contain spaces → percent-encode like any
  // other file: URL. Older query engines choked on that, so fall back to the
  // raw path if the encoded one cannot be opened.
  try {
    const client = new PrismaClient({ log: ["error"], datasourceUrl: "file:" + encodeURI(forward) });
    await client.$queryRawUnsafe("SELECT 1");
    return client;
  } catch {
    const client = new PrismaClient({ log: ["error"], datasourceUrl: "file:" + forward });
    await client.$queryRawUnsafe("SELECT 1");
    return client;
  }
}

async function refreshCatalog(seedPath: string): Promise<CatalogRefreshResult> {
  const seed = await openSeedClient(seedPath);
  const stats = { created: 0, updated: 0, removed: 0 };
  try {
    const seedTitles = await seed.title.findMany({
      include: { episodes: { orderBy: [{ season: "asc" }, { number: "asc" }] } },
    });
    const seedSlugs = new Set(seedTitles.map((t) => t.slug));

    const current = await db.title.findMany({ select: { id: true, slug: true } });
    const idBySlug = new Map(current.map((t) => [t.slug, t.id]));
    const goneIds = current.filter((t) => !seedSlugs.has(t.slug)).map((t) => t.id);

    // 1. detach user rows from titles that are about to leave the catalog
    if (goneIds.length) {
      await db.$transaction([
        db.favorite.deleteMany({ where: { titleId: { in: goneIds } } }),
        db.userRating.deleteMany({ where: { titleId: { in: goneIds } } }),
        db.watchlist.deleteMany({ where: { titleId: { in: goneIds } } }),
        db.review.deleteMany({ where: { titleId: { in: goneIds } } }),
        db.watchProgress.deleteMany({ where: { titleId: { in: goneIds } } }),
      ]);
      stats.removed = goneIds.length;
    }

    // 2. upsert the catalog, slug is the stable identity across versions
    let episodeTotal = 0;
    for (const t of seedTitles) {
      const data = {
        title: t.title,
        titleEn: t.titleEn,
        type: t.type,
        year: t.year,
        rating: t.rating,
        duration: t.duration,
        description: t.description,
        genres: t.genres,
        poster: t.poster,
        backdrop: t.backdrop,
        videoUrl: t.videoUrl,
        trailerUrl: t.trailerUrl,
        director: t.director,
        cast: t.cast,
        country: t.country,
        ageRating: t.ageRating,
        quality: t.quality,
        featured: t.featured,
        trendingScore: t.trendingScore,
        views: t.views,
        source: t.source,
      };
      const eps: SeedEpisodeData[] = t.episodes.map((e) => ({
        season: e.season,
        number: e.number,
        name: e.name,
        synopsis: e.synopsis,
        duration: e.duration,
        videoUrl: e.videoUrl,
        thumbnail: e.thumbnail,
      }));
      episodeTotal += eps.length;

      const existingId = idBySlug.get(t.slug);
      if (existingId === undefined) {
        await db.title.create({ data: { slug: t.slug, ...data, episodes: { create: eps } } });
        stats.created++;
        continue;
      }

      await db.title.update({ where: { id: existingId }, data });
      if (await episodesDiffer(existingId, eps)) {
        await db.episode.deleteMany({ where: { titleId: existingId } });
        if (eps.length) {
          await db.episode.createMany({ data: eps.map((e) => ({ ...e, titleId: existingId })) });
        }
        // episode ids changed → drop progress rows that point at removed
        // episodes (ON DELETE CASCADE normally handles this; this also cleans
        // up databases created before the FK carried a cascade clause)
        await db.$executeRawUnsafe(
          `DELETE FROM "WatchProgress" WHERE "titleId" = ? AND "episodeId" IS NOT NULL
           AND "episodeId" NOT IN (SELECT id FROM "Episode" WHERE "titleId" = ?)`,
          existingId,
          existingId
        );
      }
      stats.updated++;
    }

    // 3. remove titles that are no longer part of the catalog
    if (goneIds.length) {
      await db.title.deleteMany({ where: { id: { in: goneIds } } });
    }

    return { ok: true, titles: seedTitles.length, episodes: episodeTotal, ...stats };
  } finally {
    await seed.$disconnect().catch(() => {});
  }
}

/** True when the stored episode rows no longer match the seed's rows. */
async function episodesDiffer(titleId: number, eps: SeedEpisodeData[]): Promise<boolean> {
  const rows = await db.episode.findMany({
    where: { titleId },
    orderBy: [{ season: "asc" }, { number: "asc" }],
  });
  if (rows.length !== eps.length) return true;
  for (let i = 0; i < eps.length; i++) {
    const a = rows[i];
    const b = eps[i];
    if (
      a.season !== b.season ||
      a.number !== b.number ||
      a.name !== b.name ||
      a.synopsis !== b.synopsis ||
      a.duration !== b.duration ||
      a.videoUrl !== b.videoUrl ||
      a.thumbnail !== b.thumbnail
    ) {
      return true;
    }
  }
  return false;
}
