import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Catalog refresh – how users get new content after an app update.
 *
 * Two delivery paths feed the same slug-based merge:
 *
 *   1. Bundled seed (offline): Electron compares the bundled seed.db SHA-256
 *      with a marker file in <userData> (see electron/main.cjs). On a mismatch
 *      it spawns this server with NAMA_CATALOG_SEED pointing at the seed; the
 *      health probe then runs the merge before the window opens.
 *
 *   2. Remote catalog (online): NAMA_CATALOG_URL points at a hosted
 *      nama-catalog JSON (public/catalog/index.json, produced by
 *      scripts/export-catalog.mjs). The server downloads it, hashes the body
 *      and only re-merges when the hash changed – the applied hash is stored
 *      in the SyncState table, so no shell cooperation is needed. This is the
 *      path to use once a real server hosts the catalog.
 *
 * Merge semantics (identical for both paths):
 *   - titles/episodes are upserted – `slug` is the stable key across catalog
 *     versions, so ids (and therefore favorites, ratings and watchlist
 *     entries of surviving titles) are preserved
 *   - episodes are only replaced when their rows actually changed, so
 *     "continue watching" progress survives no-op refreshes
 *   - titles that left the catalog are removed together with every user row
 *     that references them (they would be dead links otherwise)
 *   - UserProfile / settings rows are never touched
 */

export type CatalogRefreshResult = {
  ok: boolean;
  titles: number;
  episodes: number;
  created: number;
  updated: number;
  removed: number;
  skipped?: boolean;
  error?: string;
};

export type CatalogItem = {
  slug: string;
  title: string;
  titleEn: string;
  type: string;
  year: number;
  rating: number;
  duration: number;
  description: string;
  genres: string; // JSON string[]
  poster: string;
  backdrop: string;
  videoUrl: string;
  trailerUrl: string | null;
  director: string;
  cast: string; // JSON string[]
  country: string;
  ageRating: string;
  quality: string;
  featured: boolean;
  trendingScore: number;
  views: number;
  source: string;
  episodes: {
    season: number;
    number: number;
    name: string;
    synopsis: string;
    duration: number;
    videoUrl: string;
    thumbnail: string;
  }[];
};

const EMPTY: CatalogRefreshResult = {
  ok: false, titles: 0, episodes: 0, created: 0, updated: 0, removed: 0,
};

const HASH_KEY = "catalog.hash";

let inflight: Promise<CatalogRefreshResult> | null = null;

/**
 * Runs the seed refresh at most once per server process. Later calls (health
 * is probed twice during boot) await the same result instead of re-merging.
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

/** Remote sync – re-runs only when the hosted catalog's content hash changes. */
export function syncCatalogOnce(url: string): Promise<CatalogRefreshResult> {
  if (!inflight) {
    inflight = syncCatalog(url).catch((e) => ({
      ...EMPTY,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
  return inflight;
}

/* ------------------------------------------------------------------ */
/* seed (offline) path                                                */
/* ------------------------------------------------------------------ */

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
  try {
    const seedTitles = await seed.title.findMany({
      include: { episodes: { orderBy: [{ season: "asc" }, { number: "asc" }] } },
    });
    const items: CatalogItem[] = seedTitles.map((t) => ({
      slug: t.slug,
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
      episodes: t.episodes.map((e) => ({
        season: e.season,
        number: e.number,
        name: e.name,
        synopsis: e.synopsis,
        duration: e.duration,
        videoUrl: e.videoUrl,
        thumbnail: e.thumbnail,
      })),
    }));
    return await applyCatalog(items);
  } finally {
    await seed.$disconnect().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* remote (online) path                                               */
/* ------------------------------------------------------------------ */

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Normalises genres/cast fields that may arrive as arrays or JSON strings. */
function asJsonString(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v ?? []);
}

/**
 * Rebases relative asset paths (poster/backdrop/thumbnail) against the
 * catalog URL, so a self-hosted catalog can also serve its own images.
 * Absolute URLs (CDN) pass through untouched.
 */
function rebaseAsset(url_: string, base: string): string {
  if (!url_ || !base || !url_.startsWith("/") || !/^https?:\/\//i.test(base)) return url_;
  try {
    return new URL(url_, base).toString();
  } catch {
    return url_;
  }
}

async function syncCatalog(catalogUrl: string): Promise<CatalogRefreshResult> {
  const res = await fetch(catalogUrl, { headers: { "User-Agent": "Nama-Catalog-Sync" } });
  if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
  const body = await res.text();
  const hash = sha256(body);

  const prev = await db.syncState.findUnique({ where: { key: HASH_KEY } });
  if (prev?.value === hash) {
    const count = await db.title.count();
    return { ok: true, skipped: true, titles: count, episodes: 0, created: 0, updated: 0, removed: 0 };
  }

  const payload = JSON.parse(body) as {
    format?: string;
    titles?: Record<string, unknown>[];
  };
  if (payload.format !== "nama-catalog" || !Array.isArray(payload.titles)) {
    throw new Error("not a nama-catalog payload (bad format field)");
  }

  const items: CatalogItem[] = payload.titles.map((t) => ({
    slug: String(t.slug),
    title: String(t.title),
    titleEn: String(t.titleEn ?? t.title),
    type: String(t.type),
    year: Number(t.year) || 0,
    rating: Number(t.rating) || 0,
    duration: Number(t.duration) || 0,
    description: String(t.description ?? ""),
    genres: asJsonString(t.genres),
    poster: rebaseAsset(String(t.poster ?? ""), catalogUrl),
    backdrop: rebaseAsset(String(t.backdrop ?? ""), catalogUrl),
    videoUrl: String(t.videoUrl ?? ""),
    trailerUrl: t.trailerUrl ? String(t.trailerUrl) : null,
    director: String(t.director ?? ""),
    cast: asJsonString(t.cast),
    country: String(t.country ?? "نامشخص"),
    ageRating: String(t.ageRating ?? "+13"),
    quality: String(t.quality ?? "HD"),
    featured: Boolean(t.featured),
    trendingScore: Number(t.trendingScore) || 0,
    views: Number(t.views) || 0,
    source: String(t.source ?? "od"),
    episodes: Array.isArray(t.episodes)
      ? t.episodes.map((e) => ({
          season: Number(e.season) || 1,
          number: Number(e.number) || 0,
          name: String(e.name ?? ""),
          synopsis: String(e.synopsis ?? ""),
          duration: Number(e.duration) || 45,
          videoUrl: String(e.videoUrl ?? ""),
          thumbnail: rebaseAsset(String(e.thumbnail ?? ""), catalogUrl),
        }))
      : [],
  }));

  const result = await applyCatalog(items);
  if (result.ok) {
    await db.syncState.upsert({
      where: { key: HASH_KEY },
      update: { value: hash },
      create: { key: HASH_KEY, value: hash },
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* shared merge core                                                  */
/* ------------------------------------------------------------------ */

async function applyCatalog(items: CatalogItem[]): Promise<CatalogRefreshResult> {
  const stats = { created: 0, updated: 0, removed: 0 };
  const seedSlugs = new Set(items.map((t) => t.slug));

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
  for (const t of items) {
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
    const eps = t.episodes;
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

  return { ok: true, titles: items.length, episodes: episodeTotal, ...stats };
}

/** True when the stored episode rows no longer match the given rows. */
async function episodesDiffer(
  titleId: number,
  eps: CatalogItem["episodes"]
): Promise<boolean> {
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
