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

let seedInflight: Promise<CatalogRefreshResult> | null = null;
let syncInflight: Promise<CatalogRefreshResult> | null = null;

/**
 * Runs the seed refresh at most once per server process. Later calls (health
 * is probed twice during boot) await the same result instead of re-merging.
 */
export function refreshCatalogOnce(seedPath: string): Promise<CatalogRefreshResult> {
  if (!seedInflight) {
    seedInflight = refreshCatalog(seedPath).catch((e) => ({
      ...EMPTY,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
  return seedInflight;
}

/** Remote sync – re-runs only when the hosted catalog's content hash changes. */
export function syncCatalogOnce(url: string): Promise<CatalogRefreshResult> {
  if (!syncInflight) {
    syncInflight = syncCatalog(url).catch((e) => ({
      ...EMPTY,
      error: e instanceof Error ? e.message : String(e),
    }));
  }
  return syncInflight;
}

/** Manual re-check (Settings button): drops the cached sync result so the
 *  remote is actually contacted again, then runs one sync. The version.json
 *  probe keeps this cheap when nothing changed. */
export function recheckCatalogNow(url: string): Promise<CatalogRefreshResult> {
  syncInflight = null;
  return syncCatalogOnce(url);
}

/* ---------------------------------------------------------------- */
/* periodic re-check while the app stays open                        */
/* ---------------------------------------------------------------- */

const RESYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let resyncUrl: string | null = null;
let resyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Fire-and-forget background re-sync so long-running apps pick up new
 *  content without a restart. Never blocks and never throws. */
function scheduleResync(url: string) {
  resyncUrl = url;
  if (resyncTimer) return;
  resyncTimer = setTimeout(() => {
    resyncTimer = null;
    const u = resyncUrl;
    if (!u) return;
    // a fresh sync is allowed: the previous inflight promise has settled
    syncInflight = null;
    syncCatalogOnce(u)
      .then((r) => {
        if (r.ok) scheduleResync(u);
      })
      .catch(() => {});
  }, RESYNC_INTERVAL_MS);
  resyncTimer.unref?.();
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
 * Site root that root-relative asset paths (/covers/…) resolve against.
 *
 * For GitHub raw the catalog lives at  <repo>/main/public/catalog/index.json
 * while covers live under <repo>/main/public/covers/… – i.e. the site root is
 * the URL minus the trailing catalog/<file> segment. A classic static host
 * serving the whole public/ folder keeps the origin root, which the same
 * rule produces when the path has no /catalog/ segment.
 */
function siteRootOf(catalogUrl: string): string {
  try {
    const u = new URL(catalogUrl);
    const m = u.pathname.match(/^(.*\/)catalog\/[^/]+$/);
    u.pathname = m ? m[1] : u.pathname.replace(/[^/]*$/, "");
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return catalogUrl;
  }
}

/**
 * Rebases root-relative asset paths (poster/backdrop/thumbnail) against the
 * catalog's site root, so a remote catalog can also serve its own images.
 * Absolute URLs (CDN) and app-local endpoints (/api/cover/*.svg fallback –
 * served by this app itself) pass through untouched.
 */
function rebaseAsset(url_: string, siteRoot: string): string {
  if (!url_ || !siteRoot || !/^https?:\/\//i.test(siteRoot)) return url_;
  if (!url_.startsWith("/") || url_.startsWith("/api/")) return url_;
  return siteRoot.replace(/\/+$/, "") + url_;
}

const FETCH_TIMEOUT_MS = 20_000;
const VERSION_TIMEOUT_MS = 8_000;

/**
 * Tiny companion of index.json (same directory): { sha256, titles, … }.
 * When present the app can detect "nothing changed" without downloading
 * the multi-megabyte payload on every start.
 */
async function probeVersionHash(catalogUrl: string): Promise<string | null> {
  try {
    const vUrl = catalogUrl.replace(/[^/]*(?:\?.*)?#.*$/, "version.json");
    const res = await fetch(vUrl, {
      headers: { "User-Agent": "Nama-Catalog-Sync" },
      signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { sha256?: string };
    return typeof j.sha256 === "string" && /^[0-9a-f]{64}$/i.test(j.sha256) ? j.sha256.toLowerCase() : null;
  } catch {
    return null; // probe is optional – full download decides below
  }
}

async function syncCatalog(catalogUrl: string): Promise<CatalogRefreshResult> {
  const prev = await db.syncState.findUnique({ where: { key: HASH_KEY } });

  // fast path: the version probe tells us the payload is unchanged
  const knownHash = await probeVersionHash(catalogUrl);
  if (knownHash && prev?.value === knownHash) {
    scheduleResync(catalogUrl);
    const count = await db.title.count();
    return { ok: true, skipped: true, titles: count, episodes: 0, created: 0, updated: 0, removed: 0 };
  }

  const res = await fetch(catalogUrl, {
    headers: { "User-Agent": "Nama-Catalog-Sync" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
  const body = await res.text();
  const hash = sha256(body);

  if (prev?.value === hash) {
    scheduleResync(catalogUrl);
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

  const siteRoot = siteRootOf(catalogUrl);

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
    poster: rebaseAsset(String(t.poster ?? ""), siteRoot),
    backdrop: rebaseAsset(String(t.backdrop ?? ""), siteRoot),
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
          thumbnail: rebaseAsset(String(e.thumbnail ?? ""), siteRoot),
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
    scheduleResync(catalogUrl);
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
