import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";

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
  /** v0.23.1 — the version probe could not confirm the remote state (network
   *  flake); with a stored hash we skip the cycle instead of burning ~80MB,
   *  and the UI says “couldn’t check, retry later” instead of “up to date”. */
  probeUnknown?: boolean;
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
  sources: string; // JSON: [{q, v, url, mb?}] — all quality/variant links
  featured: boolean;
  trendingScore: number;
  views: number;
  source: string;
  /** v0.23.0 — catalog add-date (ISO) from the hosted index; empty = old title */
  addedAt?: string;
  episodes: {
    season: number;
    number: number;
    name: string;
    synopsis: string;
    duration: number;
    videoUrl: string;
    sources: string;
    thumbnail: string;
  }[];
};

const EMPTY: CatalogRefreshResult = {
  ok: false, titles: 0, episodes: 0, created: 0, updated: 0, removed: 0,
};

const HASH_KEY = "catalog.hash";
/** v0.24.0 — completion proof: the value is the SHA-256 of the bundled seed
 *  file whose catalog is FULLY merged into this database. Written only after
 *  a verified skip or a completed merge, so a process killed mid-merge (the
 *  frozen mixed-hero bug: half-applied flags, no proof) re-merges on the
 *  next boot instead of staying half-updated forever. */
const SEED_PROOF_KEY = "seed.applied";

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
 *  probe keeps this cheap when nothing changed. While the boot-time startup
 *  sync is still running we await it instead of racing a second merge. */
export function recheckCatalogNow(url: string): Promise<CatalogRefreshResult> {
  if (startupInflight && startupState.status === "running") {
    return startupInflight.then(
      (s) => s.result ?? { ...EMPTY, error: "startup sync failed" }
    );
  }
  syncInflight = null;
  return syncCatalogOnce(url);
}

/* ------------------------------------------------------------------ */
/* boot-time startup sync (background)                                */
/* ------------------------------------------------------------------ */

export type StartupSyncState = {
  status: "idle" | "running" | "ok" | "error";
  phase: "adopt" | "remote" | "seed" | "done";
  startedAt?: number;
  finishedAt?: number;
  result?: CatalogRefreshResult;
};

let startupState: StartupSyncState = { status: "idle", phase: "done" };
let startupInflight: Promise<StartupSyncState> | null = null;

/** Current boot-sync progress – exposed via /api/health. */
export function getStartupSyncState(): StartupSyncState {
  return startupState;
}

/**
 * Runs the full boot pipeline (fresh-seed adoption → hosted-catalog sync →
 * bundled-seed fallback) exactly once per server process, in the BACKGROUND.
 *
 * v0.10.1 and earlier executed this chain synchronously inside /api/health,
 * which meant the app window waited for a potential ~69MB download plus a
 * 14,000-title merge on every content release → "server did not start in
 * time". The health route now kicks this off fire-and-forget and answers in
 * milliseconds; the Electron shell polls the state until it settles.
 */
export function runStartupSync(): Promise<StartupSyncState> {
  if (startupInflight) return startupInflight;
  const startedAt = Date.now();
  startupState = { status: "running", phase: "adopt", startedAt };
  startupInflight = (async (): Promise<StartupSyncState> => {
    const catalogUrl = process.env.NAMA_CATALOG_URL?.trim();
    const seedPath = process.env.NAMA_CATALOG_SEED?.trim();
    let catalog: CatalogRefreshResult | undefined;
    let phase: StartupSyncState["phase"] = "adopt";
    try {
      if (process.env.NAMA_CATALOG_FRESH_SEED === "1") {
        catalog = await adoptFreshSeed();
      }
      /* v0.24.0 — SEED FIRST, and UNCONDITIONALLY. The bundled seed used to
       * run only as a fallback when the remote sync failed, so the v0.23.1
       * skip-guard (probeUnknown → ok:true) starved it: devices whose merge
       * had been killed halfway kept a frozen half-updated catalog forever.
       * The seed path now decides from its own in-DB completion proof:
       * instant skip when the content is already in place, a full repair
       * merge when it is not — no network required. Running it first also
       * stores the release hash on success, so the remote probe below skips
       * its ~80MB download entirely on release-day upgrades. */
      phase = "seed";
      if (seedPath) {
        const seed = await refreshCatalogOnce(seedPath);
        if (seed.ok) catalog = seed;
      }
      phase = "remote";
      if (catalogUrl) {
        const remote = await syncCatalogOnce(catalogUrl);
        if (remote?.ok && (!remote.skipped || !catalog?.ok || catalog.skipped)) {
          // prefer a positive remote apply (it is the newer content) in the
          // report; keep a positive seed merge when the remote only skipped
          catalog = remote;
        }
      }
      return {
        status: catalog?.ok ? "ok" : "error",
        phase: "done",
        startedAt,
        finishedAt: Date.now(),
        result: catalog ?? { ...EMPTY, error: "no catalog source configured" },
      };
    } catch (e) {
      return {
        status: "error",
        phase: "done",
        startedAt,
        finishedAt: Date.now(),
        result: {
          ...EMPTY,
          ...(catalog?.ok ? { titles: catalog.titles } : {}),
          error: e instanceof Error ? e.message : String(e),
        },
      };
    }
  })().then((state) => {
    startupState = state;
    return state;
  });
  return startupInflight;
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
/* fresh seed adoption (cover-light packages)                         */
/* ------------------------------------------------------------------ */

/**
 * Fast first-run path for cover-light packages (v0.10.1+).
 *
 * A freshly copied seed.db already contains the exact catalog of the release,
 * so a full merge (or a ~69MB remote download) would be pure overhead. All
 * that is needed:
 *
 *   1. rebase root-relative cover paths (/covers/…) in-place against the
 *      hosted site root (NAMA_CATALOG_SITE_ROOT) – covers are not bundled
 *      anymore, they stream from GitHub raw;
 *   2. pre-store the release catalog hash (NAMA_CATALOG_SEED_VERSION_HASH,
 *      written by afterPack as seed-version.json) in SyncState, so the
 *      boot-time remote sync fast-paths via its version.json probe instead
 *      of downloading the full index.json for identical content.
 *
 * Idempotent: rows already rebased (or absolute) never match the UPDATE
 * predicates, so a re-run never double-prefixes. Offline first runs are fine
 * too – the rebase is local, covers simply load once the network is back.
 */
export async function adoptFreshSeed(): Promise<CatalogRefreshResult> {
  await ensureSeeded(); // heal legacy schemas before touching Title/Episode
  const versionHash = (process.env.NAMA_CATALOG_SEED_VERSION_HASH || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(versionHash)) {
    return { ...EMPTY, error: "fresh-seed adoption skipped: no seed-version hash" };
  }
  const siteRoot = (process.env.NAMA_CATALOG_SITE_ROOT || "").trim();
  const root = /^https?:\/\//i.test(siteRoot) ? siteRoot.replace(/\/+$/, "") : "";
  let rebased = 0;
  if (root) {
    // Title.poster / Title.backdrop / Episode.thumbnail – local root-relative
    // paths only (skip absolute URLs, /api/… endpoints and already-rebased rows)
    const cols = [
      ['"Title"', '"poster"'],
      ['"Title"', '"backdrop"'],
      ['"Episode"', '"thumbnail"'],
    ];
    for (const [table, col] of cols) {
      rebased += await db.$executeRawUnsafe(
        `UPDATE ${table} SET ${col} = ? || ${col}
         WHERE ${col} LIKE '/%' AND ${col} NOT LIKE '/api/%' AND ${col} NOT LIKE ? AND ${col} NOT LIKE ?`,
        root,
        "http%",
        root + "%"
      );
    }
  }
  await db.syncState.upsert({
    where: { key: HASH_KEY },
    update: { value: versionHash },
    create: { key: HASH_KEY, value: versionHash },
  });
  const titles = await db.title.count();
  return { ok: true, titles, episodes: 0, created: 0, updated: 0, removed: 0, skipped: true };
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
  await ensureSeeded(); // heal legacy schemas before merging into them

  /* Content identity of the bundled seed file (~90MB, one hash ≈ a blink). */
  const seedSha = sha256(readFileSync(seedPath));

  /* 1) Completion proof — this exact seed was already fully merged here.
   *    Written only after a completed merge or a verified skip, so a process
   *    killed mid-merge never leaves a stale proof behind. */
  const proof = await db.syncState.findUnique({ where: { key: SEED_PROOF_KEY } });
  if (proof?.value === seedSha) {
    const titles = await db.title.count();
    return { ok: true, skipped: true, titles, episodes: 0, created: 0, updated: 0, removed: 0 };
  }

  /* 2) The database already provably carries this seed's catalog — a prior
   *    remote apply of the same release content (adoptFreshSeed pre-stores
   *    this hash on fresh copies) → record the proof, skip the merge. */
  const versionHash = (process.env.NAMA_CATALOG_SEED_VERSION_HASH || "").trim().toLowerCase();
  const releaseHashOk = /^[0-9a-f]{64}$/.test(versionHash);
  if (releaseHashOk) {
    const applied = await db.syncState.findUnique({ where: { key: HASH_KEY } });
    if (applied?.value === versionHash) {
      await db.syncState.upsert({
        where: { key: SEED_PROOF_KEY },
        update: { value: seedSha },
        create: { key: SEED_PROOF_KEY, value: seedSha },
      });
      const titles = await db.title.count();
      return { ok: true, skipped: true, titles, episodes: 0, created: 0, updated: 0, removed: 0 };
    }
  }

  const seed = await openSeedClient(seedPath);
  try {
    /* 3) Light verification (v0.24.0) — two cheap queries instead of a
     *    14k-title merge churn on every boot: same title count and same
     *    featured set ⇒ the seed's catalog is already in place. A NEWER
     *    database (count >) is fine too — the remote sync owns that delta.
     *    A mismatch is exactly the half-applied-merge state (or a genuinely
     *    older DB) that must fall through to the full merge below. */
    const [seedCount, dbCount] = [await seed.title.count(), await db.title.count()];

    /* 3a) A-2 — remote-ahead guard. اگر HASH_KEY در دیتابیس هست (یعنی این
     *     دستگاه قبلاً کاتالوگ ریموت را اعمال کرده) و با هشِ انتشارِ این
     *     seed یکی نیست و تعداد عنوان‌ها هم از seed کمتر نیست، این seed
     *     قدیمی‌تر از محتوای فعلی دستگاه است؛ ادغام کامل آن، عنوان‌ها و
     *     ردیف‌های کاربرِ گرفته‌شده از ریموت را حذف می‌کرد. پس ادغام را کلاً
     *     رد می‌کنیم — و چون «رد شدن تأییدشده» است، هیچ اثر اتمام
     *     (SEED_PROOF_KEY) ثبت نمی‌کنیم تا ترمیم‌های مشروع بعدی (سناریوی
     *     نیمه‌کاره) گرسنه نمانند. دیتابیس تازه (بدون HASH_KEY) و سناریوی
     *     نیمه‌کاره‌ی واقعی (بدون HASH_KEY، تعداد برابر، فلگ‌های قاطی) مثل
     *     قبل به merge کامل می‌رسند. */
    const appliedHash = await db.syncState.findUnique({ where: { key: HASH_KEY } });
    if (appliedHash?.value && dbCount >= seedCount && appliedHash.value !== versionHash) {
      console.info(
        `[catalog] seed merge skipped: DB already carries a different (likely newer) remote catalog ` +
          `(hash=${appliedHash.value.slice(0, 12)}…, titles=${dbCount} >= seed ${seedCount}) — no downgrade, no proof written`
      );
      return { ok: true, skipped: true, titles: dbCount, episodes: 0, created: 0, updated: 0, removed: 0 };
    }
    const featuredSlugs = (client: PrismaClient) =>
      client.title.findMany({ where: { featured: true }, select: { slug: true }, orderBy: { slug: "asc" } });
    const [seedFeatured, dbFeatured] = await Promise.all([featuredSlugs(seed), featuredSlugs(db)]);
    const sameFeatured =
      seedFeatured.length === dbFeatured.length &&
      seedFeatured.every((t, i) => t.slug === dbFeatured[i].slug);
    if (dbCount >= seedCount && sameFeatured) {
      if (dbCount === seedCount) {
        await db.syncState.upsert({
          where: { key: SEED_PROOF_KEY },
          update: { value: seedSha },
          create: { key: SEED_PROOF_KEY, value: seedSha },
        });
      }
      return { ok: true, skipped: true, titles: dbCount, episodes: 0, created: 0, updated: 0, removed: 0 };
    }

    /* Cover-light packages: root-relative asset paths of the bundled seed
       must point at the hosted site root (covers are not bundled). */
    const envRoot = (process.env.NAMA_CATALOG_SITE_ROOT || "").trim();
    const siteRoot = /^https?:\/\//i.test(envRoot) ? envRoot : "";
    const rb = (u: string) => rebaseAsset(u, siteRoot);
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
      poster: rb(t.poster),
      backdrop: rb(t.backdrop),
      videoUrl: t.videoUrl,
      trailerUrl: t.trailerUrl,
      director: t.director,
      cast: t.cast,
      country: t.country,
      ageRating: t.ageRating,
      quality: t.quality,
      sources: t.sources,
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
        sources: e.sources,
        thumbnail: rb(e.thumbnail),
      })),
    }));
    const result = await applyCatalog(items);
    if (result.ok) {
      /* The database now provably reflects this seed — and, when the shell
       * tells us which hosted catalog the seed was exported from, that
       * release hash too, so the remote sync's version probe skips its
       * ~80MB download for content the seed just delivered offline. */
      await db.syncState.upsert({
        where: { key: SEED_PROOF_KEY },
        update: { value: seedSha },
        create: { key: SEED_PROOF_KEY, value: seedSha },
      });
      if (releaseHashOk) {
        await db.syncState.upsert({
          where: { key: HASH_KEY },
          update: { value: versionHash },
          create: { key: HASH_KEY, value: versionHash },
        });
      }
    }
    return result;
  } finally {
    await seed.$disconnect().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* remote (online) path                                               */
/* ------------------------------------------------------------------ */

function sha256(s: string | Buffer): string {
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

const FETCH_TIMEOUT_MS = 300_000; // full-catalog payloads grow with the library (+sources ≈ 69MB)
const VERSION_TIMEOUT_MS = 15_000; // v0.23.1: 8s was too tight for cold connections to raw.githubusercontent

/**
 * Tiny companion of index.json (same directory): { sha256, titles, … }.
 * When present the app can detect "nothing changed" without downloading
 * the multi-megabyte payload on every start.
 *
 * v0.23.1: one short retry — a single timed-out probe on a flaky connection
 * used to fall through to the full ~80MB download path below.
 */
async function probeVersionHash(catalogUrl: string): Promise<string | null> {
  const vUrl = catalogUrl.replace(/[^/]*(?:\?.*)?#.*$/, "version.json");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(vUrl, {
        headers: { "User-Agent": "Nama-Catalog-Sync" },
        signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { sha256?: string };
      return typeof j.sha256 === "string" && /^[0-9a-f]{64}$/i.test(j.sha256) ? j.sha256.toLowerCase() : null;
    } catch {
      // transient network hiccup → retry once, then report unknown
    }
  }
  return null;
}

async function syncCatalog(catalogUrl: string): Promise<CatalogRefreshResult> {
  // v0.10.26: never merge against an unhealed schema – ensureSeeded() runs the
  // schema-drift healer (seed.ts) so legacy databases gain Title.sources &
  // friends BEFORE the upserts below reference them (was: P2022 → merge died
  // → "catalog sync watcher timed out" on every boot of upgraded old installs)
  await ensureSeeded();
  const prev = await db.syncState.findUnique({ where: { key: HASH_KEY } });
  const knownHash = await probeVersionHash(catalogUrl);

  // v0.23.1 — PROOF-OF-CHANGE GUARD. The version.json probe is the only cheap
  // way to know the remote changed. When the probe itself is unreachable
  // (flaky connection to raw.githubusercontent), the previous code fell
  // through to a FULL ~80MB index.json download — on every boot and every 6h
  // resync cycle, repeatedly, with no evidence anything changed. Now a known
  // stored hash only re-downloads when the probe POSITIVELY reports a new
  // hash; an unreachable probe means "assume unchanged, retry next cycle".
  // (version.json and index.json share a host — if the probe fails, the big
  // fetch would have failed too.) The very first sync (no stored hash) still
  // downloads unconditionally.
  if (prev?.value) {
    if (knownHash === prev.value) {
      scheduleResync(catalogUrl);
      const count = await db.title.count();
      return { ok: true, skipped: true, titles: count, episodes: 0, created: 0, updated: 0, removed: 0 };
    }
    if (knownHash === null) {
      scheduleResync(catalogUrl);
      const count = await db.title.count();
      return { ok: true, skipped: true, probeUnknown: true, titles: count, episodes: 0, created: 0, updated: 0, removed: 0 };
    }
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
    sources: typeof t.sources === "string" && t.sources.startsWith("[") ? t.sources : "[]",
    featured: Boolean(t.featured),
    trendingScore: Number(t.trendingScore) || 0,
    views: Number(t.views) || 0,
    source: String(t.source ?? "od"),
    addedAt: typeof t.addedAt === "string" ? t.addedAt : "",
    episodes: Array.isArray(t.episodes)
      ? t.episodes.map((e) => ({
          season: Number(e.season) || 1,
          number: Number(e.number) || 0,
          name: String(e.name ?? ""),
          synopsis: String(e.synopsis ?? ""),
          duration: Number(e.duration) || 45,
          videoUrl: String(e.videoUrl ?? ""),
          sources: typeof e.sources === "string" && e.sources.startsWith("[") ? e.sources : "[]",
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
    // A-14 — addedAt ممکن است در کاتالوگ ریموت خراب/نامعتبر باشد؛ یک تاریخ
    // بد نباید کل ادغام را با خطا متوقف کند یا ردیف Invalid Date بسازد.
    const addedAt = safeDate(t.addedAt);
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
      sources: t.sources ?? "[]",
      featured: t.featured,
      trendingScore: t.trendingScore,
      views: t.views,
      source: t.source,
      // v0.23.0 — preserve the real add-date across desktop re-syncs so the
      // «جدیدترین‌ها» row keeps its meaning on Electron too (idempotent:
      // the same hosted date is written every time; empty/invalid → untouched)
      ...(addedAt ? { createdAt: addedAt } : {}),
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
    await mergeEpisodes(existingId, eps);
    stats.updated++;
  }

  // 3. remove titles that are no longer part of the catalog
  if (goneIds.length) {
    await db.title.deleteMany({ where: { id: { in: goneIds } } });
  }

  return { ok: true, titles: items.length, episodes: episodeTotal, ...stats };
}

/** A-14 — تبدیل امن تاریخ: مقدار خالی/نامعتبر → undefined به‌جای Invalid Date
 *  (یک addedAt خراب در کاتالوگ نباید کل ادغام را با خطا بکشد). */
function safeDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t) : undefined;
}

/**
 * A-1 — ادغام اپیزودهای یک عنوان با کلید پایدار «فصل:شماره».
 *
 * پیش‌تر همه‌ی اپیزودها با deleteMany + createMany از نو ساخته می‌شدند؛ چون
 * id اپیزود autoincrement است، با هر انتشار محتوای جدید همه‌ی شناسه‌ها عوض
 * می‌شد و ردیف‌های WatchProgress («ادامه‌ی تماشا») که با episodeId وصل‌اند و
 * onDelete: Cascade دارند، همراهشان نابود می‌شد.
 *
 * حالا: اپیزود موجود → فقط فیلدهای واقعاً تغییریافته update می‌شود و شناسه‌ی
 * قبلی حفظ می‌شود (بنابراین پیشرفت تماشای کاربر سر جایش می‌ماند)؛ اپیزود
 * تازه → create؛ اپیزودهایی که واقعاً از کاتالوگ حذف شده‌اند → فقط همان‌ها
 * delete (کاسکید فقط برای همین عده اتفاق می‌افتد). مقایسه‌ی فیلدها همان
 * منطق قبلی (episodesDiffer) است، فقط به‌تفکیک هر اپیزود اعمال می‌شود.
 */
async function mergeEpisodes(titleId: number, eps: CatalogItem["episodes"]): Promise<void> {
  const rows = await db.episode.findMany({ where: { titleId } });
  const byKey = new Map(rows.map((r) => [`${r.season}:${r.number}`, r]));
  const seenKeys = new Set<string>();

  for (const e of eps) {
    const key = `${e.season}:${e.number}`;
    // کلید تکراری در ورودی مثل قبل به‌صورت ردیف جدید ساخته می‌شود (رفتار قدیمی)
    const existing = seenKeys.has(key) ? undefined : byKey.get(key);
    seenKeys.add(key);
    if (existing) {
      const changed: {
        name?: string;
        synopsis?: string;
        duration?: number;
        videoUrl?: string;
        sources?: string;
        thumbnail?: string;
      } = {};
      if (existing.name !== e.name) changed.name = e.name;
      if (existing.synopsis !== e.synopsis) changed.synopsis = e.synopsis;
      if (existing.duration !== e.duration) changed.duration = e.duration;
      if (existing.videoUrl !== e.videoUrl) changed.videoUrl = e.videoUrl;
      if (existing.sources !== e.sources) changed.sources = e.sources;
      if (existing.thumbnail !== e.thumbnail) changed.thumbnail = e.thumbnail;
      if (Object.keys(changed).length) {
        // شناسه‌ی اپیزود عوض نمی‌شود → ردیف‌های WatchProgress زنده می‌مانند
        await db.episode.update({ where: { id: existing.id }, data: changed });
      }
    } else {
      await db.episode.create({ data: { ...e, titleId } });
    }
  }

  const goneIds = rows
    .filter((r) => !seenKeys.has(`${r.season}:${r.number}`))
    .map((r) => r.id);
  if (goneIds.length) {
    await db.episode.deleteMany({ where: { id: { in: goneIds }, titleId } });
    // پیشرفت‌های چسبیده به اپیزودهای واقعاً حذف‌شده پاک می‌شوند (این پاک‌سازی
    // برای دیتابیس‌های قدیمی‌تر از بند Cascade هم هست؛ وقتی چیزی حذف نشده
    // اجرا نمی‌شود)
    await db.$executeRawUnsafe(
      `DELETE FROM "WatchProgress" WHERE "titleId" = ? AND "episodeId" IS NOT NULL
       AND "episodeId" NOT IN (SELECT id FROM "Episode" WHERE "titleId" = ?)`,
      titleId,
      titleId
    );
  }
}
