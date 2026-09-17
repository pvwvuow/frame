import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import * as nodePath from "node:path";
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
  sources: string | null; // JSON: [{q, v, url, mb?}] — null = remote omitted → keep the device row (BUG-039)
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
    sources: string | null;
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

/* v0.33.0 — the manual «تکمیل بچه بعدی» button left the settings page; the
 * enrichment it triggered now rides the catalog pipeline itself. After every
 * successful seed/remote apply (boot + 6h re-check) the background enricher
 * wakes and fills the remaining junk genres / missing descriptions via
 * wikidata. enrichBatch no-ops in milliseconds when nothing needs work and
 * keeps its own per-slug 24h cooldowns, so this guard (1 trigger / 12h) is
 * purely belt-and-braces against hammering the loop on health re-probes. */
const AUTO_ENRICH_GAP_MS = 12 * 60 * 60 * 1000;
let lastAutoEnrich = 0;
function triggerAutoEnrich(): void {
  const now = Date.now();
  if (now - lastAutoEnrich < AUTO_ENRICH_GAP_MS) return;
  lastAutoEnrich = now;
  void import("@/lib/meta-enrich")
    .then((m) => m.enrichInBackground(200, 25))
    .catch(() => {});
}

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
  return syncCatalogOnce(url).then((r) => {
    if (r.ok) triggerAutoEnrich(); // v0.33.0 — auto-enrich after a positive re-check
    return r;
  });
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
    // v0.33.0 — enrichment continues automatically after the boot pipeline
    if (state.status === "ok") triggerAutoEnrich();
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
        if (r.ok) {
          triggerAutoEnrich(); // v0.33.0 — auto-enrich after each 6h apply
        }
      })
      .catch(() => {})
      .finally(() => {
        const u2 = resyncUrl;
        // BUG-038 — reschedule UNCONDITIONALLY: one failed check (offline at
        // that moment, GitHub flake, 5xx) used to leave no timer armed and
        // the catalog froze for the rest of the session.
        if (u2) scheduleResync(u2);
      });
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
 *   1. pre-store the release catalog hash (NAMA_CATALOG_SEED_VERSION_HASH,
 *      written by afterPack as seed-version.json) in SyncState, so the
 *      boot-time remote sync fast-paths via its version.json probe instead
 *      of downloading the full index.json for identical content.
 *
 * v0.38.2 — the old step 2 (rebase /covers/… in-place against
 * NAMA_CATALOG_SITE_ROOT, "covers stream from GitHub raw") is GONE: the
 * releases host serves no covers at all (every rebased URL 404s), and since
 * ART-3.0 the app-local /covers route (covers-store + metahub relay chain)
 * is the real art path on cover-light packages. Rebasing corrupted every
 * fresh install's art columns and starved the hero pick / tt-twin dedupe
 * of their /covers identities.
 */
export async function adoptFreshSeed(): Promise<CatalogRefreshResult> {
  await ensureSeeded(); // heal legacy schemas before touching Title/Episode
  const versionHash = (process.env.NAMA_CATALOG_SEED_VERSION_HASH || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(versionHash)) {
    return { ...EMPTY, error: "fresh-seed adoption skipped: no seed-version hash" };
  }
  // v0.38.2: NAMA_CATALOG_SITE_ROOT is no longer read here — art columns are
  // NOT rewritten on first run (see the doc block above); the app-local
  // /covers route + chain owns art on cover-light packages.
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

    /* 3a) A-2 — remote-ahead guard, v0.34.3 REFINED. اگر HASH_KEY در دیتابیس
     *     هست و با هشِ انتشارِ این seed یکی نیست، پیش‌تر ادغام کلاً رد می‌شد —
     *     حتی وقتی محتوای دستگاه فقط «کهنه» بود، نه «جدیدتر». آن ردِ کورکورانه
     *     دستگاه‌هایی را که سینک ریموتشان (مثلاً پشت پروکسی) همیشه شکست
     *     می‌خورد برای همیشه روی کاتالوگ کهنه قفل می‌کرد. حالا ردِ محافظ فقط
     *     وقتی اعمال می‌شود که دستگاه واقعاً عنوان‌های non-od داشته باشد که
     *     در seed نیستند (موجِ جدیدِ ریموت — حذف‌شدنی و همراهِ ردیف‌های
     *     کاربر). عنوان‌های od اضافی به سیاست v0.32.0 از حذف مصون‌اند، پس
     *     اجازه‌ی ادغام برایشان بی‌خطر است و merge می‌تواند محتوای کهنه‌ی
     *     فیلدها (مثلاً پوسترهای SVG) را ترمیم کند. */
    const appliedHash = await db.syncState.findUnique({ where: { key: HASH_KEY } });
    const seedRows = await seed.title.findMany({
      select: { slug: true, poster: true, backdrop: true },
    });
    const seedSlugs = new Set(seedRows.map((r) => r.slug));
    const seedTts = new Set(seedRows.map((r) => ttOfPoster(r.poster)).filter(Boolean));

    /* v0.34.4 (DEDUPE-1) — classify the device's non-od rows against the
     * seed ONCE (cheap query, reused by both skip guards below):
     *   • tt-covered extras: slug missing from the seed but its /covers/<tt>/
     *     identity IS in the seed → a DUPLICATE the dedupe release merged
     *     away. Not "newer content" — the thing this seed intentionally
     *     removes (user rows ride to the surviving tt twin in applyCatalog).
     *     Must NOT trigger a skip, or the dedupe would never reach devices.
     *   • twinless extras: unknown to the seed in any identity → possibly a
     *     genuinely newer remote wave → the downgrade guard must fire. */
    const dbNonOd = await db.title.findMany({ where: { source: { not: "od" } }, select: { slug: true, poster: true } });
    const dedupeExtras = dbNonOd.filter((r) => !seedSlugs.has(r.slug) && seedTts.has(ttOfPoster(r.poster)));
    const twinlessExtras = dbNonOd.filter((r) => !seedSlugs.has(r.slug) && !seedTts.has(ttOfPoster(r.poster))).map((r) => r.slug);

    if (appliedHash?.value && dbCount >= seedCount && appliedHash.value !== versionHash) {
      const extra = twinlessExtras;
      if (extra.length > 0) {
        console.info(
          `[catalog] seed merge skipped: DB already carries a different (likely newer) remote catalog ` +
            `(hash=${appliedHash.value.slice(0, 12)}…, titles=${dbCount} >= seed ${seedCount}, ` +
            `${extra.length} non-od titles unknown to this seed) — no downgrade, no proof written`
        );
        return { ok: true, skipped: true, titles: dbCount, episodes: 0, created: 0, updated: 0, removed: 0 };
      }
      console.info(
        `[catalog] remote-ahead guard relaxed: DB holds no twinless non-od titles outside this seed — ` +
          `proceeding (stale field content, e.g. cover paths, gets repaired offline)`
      );
    }
    const featuredSlugs = (client: PrismaClient) =>
      client.title.findMany({ where: { featured: true }, select: { slug: true }, orderBy: { slug: "asc" } });
    const [seedFeatured, dbFeatured] = await Promise.all([featuredSlugs(seed), featuredSlugs(db)]);
    const sameFeatured =
      seedFeatured.length === dbFeatured.length &&
      seedFeatured.every((t, i) => t.slug === dbFeatured[i].slug);
    if (dbCount >= seedCount && sameFeatured && dedupeExtras.length === 0) {
      /* v0.34.3 — the count+featured proof could not see FIELD-level drift
       * (poster/backdrop paths), so a device whose catalog was stale at the
       * field level (the SVG-posters report) fast-skipped forever. Compare
       * the cover-path maps: identical (after normalising relative/rebased
       * shapes) → the seed's content really is in place → skip; any drift →
       * fall through to the full repair merge. */
      const dbRows = await db.title.findMany({ select: { slug: true, poster: true, backdrop: true } });
      const dbBySlug = new Map(dbRows.map((r) => [r.slug, r]));
      const drift = seedRows.find((r) => {
        const d = dbBySlug.get(r.slug);
        return (
          !d ||
          normAssetPath(d.poster) !== normAssetPath(r.poster) ||
          normAssetPath(d.backdrop) !== normAssetPath(r.backdrop)
        );
      });
      if (!drift) {
        if (dbCount === seedCount) {
          await db.syncState.upsert({
            where: { key: SEED_PROOF_KEY },
            update: { value: seedSha },
            create: { key: SEED_PROOF_KEY, value: seedSha },
          });
        }
        return { ok: true, skipped: true, titles: dbCount, episodes: 0, created: 0, updated: 0, removed: 0 };
      }
      console.info(
        `[catalog] seed repair merge: cover/backdrop drift detected (first: ${drift.slug}) — ` +
          `full merge instead of the fast skip`
      );
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
 * Absolute URLs (CDN) and app-local endpoints pass through untouched:
 *   /api/cover/*.svg — the generated-SVG fallback, served by this app itself;
 *   /covers/** (v0.38.2) — the app-local art route on EVERY platform
 *     (desktop rewrite → covers-store, Android own layer). Rebased copies
 *     (https://site-root/covers/tt…/poster.jpg) never existed on any remote
 *     host — every one of them 404s — and the leading-slash shape is also
 *     the identity the hero pick and the tt-twin dedupe key off. Writing it
 *     corrupted synced devices' art columns (Cosmos-forever hero + dead
 *     direct mounts); /covers values now land verbatim, exactly as the
 *     export writes them.
 */
function rebaseAsset(url_: string, siteRoot: string): string {
  if (!url_ || !siteRoot || !/^https?:\/\//i.test(siteRoot)) return url_;
  if (!url_.startsWith("/") || url_.startsWith("/api/") || url_.startsWith("/covers/")) return url_;
  return siteRoot.replace(/\/+$/, "") + url_;
}

const FETCH_TIMEOUT_MS = 300_000; // full-catalog payloads grow with the library (+sources ≈ 69MB)
const VERSION_TIMEOUT_MS = 15_000; // v0.23.1: 8s was too tight for cold connections to raw.githubusercontent

/** URL of a file sitting NEXT TO the catalog payload — version.json, part
 *  files. v0.34.0 FIX: the old `[^/]*(?:\?.*)?#.*$` replace never matched a
 *  URL without a literal `#`, so the probe has been re-fetching the whole
 *  index.json (which has no sha256 field → probe "unknown") since v0.23.1 —
 *  every boot-time remote sync silently skipped. The URL API is exact. */
function siblingUrl(catalogUrl: string, fileName: string): string {
  try {
    const u = new URL(catalogUrl);
    u.pathname = u.pathname.replace(/[^/]*$/, fileName);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return catalogUrl.replace(/[^/]*$/, fileName);
  }
}

/**
 * Tiny companion of index.json (same directory): { sha256, titles, … }.
 * When present the app can detect "nothing changed" without downloading
 * the multi-megabyte payload on every start.
 *
 * v0.23.1: one short retry — a single timed-out probe on a flaky connection
 * used to fall through to the full ~80MB download path below.
 *
 * v0.34.0 — the hosted catalog outgrew a single raw file (GitHub's 100MB
 * blob cap): export-catalog now writes the CORE catalog (demo/od titles) as
 * index.json and the remaining waves (f2m) as one or more part files next to
 * it, with the part list + their sha256s advertised in version.json.
 *
 * Old clients keep fetching index.json and merge the core exactly as before
 * (extra version.json fields are ignored by them). New clients fetch core +
 * every part and merge the union; the stored sync hash is partsSha256
 * (sha256 of core body + every part body), so a parts-only content change
 * still triggers a re-merge.
 */
async function probeVersion(catalogUrl: string): Promise<{
  sha256: string;
  partsSha256: string | null;
  parts: Array<{ file: string; sha256?: string }>;
} | null> {
  const vUrl = siblingUrl(catalogUrl, "version.json");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(vUrl, {
        headers: { "User-Agent": "Nama-Catalog-Sync" },
        signal: AbortSignal.timeout(VERSION_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        sha256?: string;
        partsSha256?: string;
        parts?: Array<{ file?: string; sha256?: string }>;
      };
      if (typeof j.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(j.sha256)) return null;
      const parts = Array.isArray(j.parts)
        ? j.parts
            .filter((p) => typeof p?.file === "string" && p.file.length < 200)
            .map((p) => ({ file: p.file as string, sha256: typeof p.sha256 === "string" ? p.sha256 : undefined }))
        : [];
      const partsSha256 =
        typeof j.partsSha256 === "string" && /^[0-9a-f]{64}$/i.test(j.partsSha256)
          ? j.partsSha256.toLowerCase()
          : null;
      return { sha256: j.sha256.toLowerCase(), partsSha256, parts };
    } catch {
      // transient network hiccup → retry once, then report unknown
    }
  }
  return null;
}

/* v0.34.3 — LOCAL-FIRST CATALOG SOURCE (the proxy fix).
 *
 * The embedded Next server fetches the remote catalog with Node's fetch,
 * which IGNORES the system proxy. On machines where GitHub is only reachable
 * through a system proxy (the typical Iranian VPN setup: system proxy on,
 * TUN off), every probe/download failed silently → the catalog froze at
 * whatever the bundled seed last delivered (the "SVG posters" report).
 * Meanwhile app updates (electron-updater → Chromium net stack) and poster
 * images (WebView → Chromium net stack) worked fine on the same machines.
 *
 * Fix: the Electron shell now downloads version.json + core + parts with
 * net.fetch (Chromium stack, proxy-aware — the SAME stack that provably
 * downloads app updates) into <userData>/catalog-cache/, and passes the dir
 * via NAMA_CATALOG_CACHE_DIR. syncCatalog() below reads that cache FIRST and
 * only touches the network when the cache is missing/invalid. All hash
 * gating (partsSha256 skip / probeUnknown skip) keeps its exact semantics.
 */
const SAFE_CATALOG_NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** Normalises a poster/backdrop URL for content comparison: the tail from
 *  /covers/ or /api/ onwards, so relative seed paths, rebased site-root URLs
 *  and (garbage) GitHub-rebased URLs all collapse to the same key. */
function normAssetPath(u: unknown): string {
  const s = String(u ?? "");
  if (!s) return "";
  const c = s.indexOf("/covers/");
  if (c >= 0) return s.slice(c);
  const a = s.indexOf("/api/");
  if (a >= 0) return s.slice(a);
  return s;
}

/** Reads <NAMA_CATALOG_CACHE_DIR>/version.json + every advertised file from
 *  disk, verifying integrity (per-part sha256 when advertised, plus the
 *  authoritative combined partsSha256 — or the plain body sha256 for
 *  single-file catalogs). Returns null on ANY missing/invalid/tampered file
 *  so the caller falls back to the classic remote path. */
async function readLocalCatalogCache(catalogUrl: string): Promise<{
  knownHash: string;
  coreBody: string;
  partBodies: string[];
} | null> {
  const cacheDir = (process.env.NAMA_CATALOG_CACHE_DIR || "").trim();
  if (!cacheDir) return null;
  try {
    const vRaw = await readFileAsync(nodePath.join(cacheDir, "version.json"), "utf8");
    const v = JSON.parse(vRaw) as {
      format?: string;
      sha256?: string;
      coreSha256?: string;
      partsSha256?: string;
      parts?: Array<{ file?: string; sha256?: string }>;
    };
    if (v.format !== "nama-catalog-version" || !/^[0-9a-f]{64}$/i.test(v.sha256 ?? "")) return null;
    const parts = (Array.isArray(v.parts) ? v.parts : []).filter(
      (p): p is { file: string; sha256?: string } =>
        !!p && typeof p.file === "string" && SAFE_CATALOG_NAME_RE.test(p.file)
    );
    const partsSha = /^[0-9a-f]{64}$/i.test(v.partsSha256 ?? "") ? (v.partsSha256 as string).toLowerCase() : null;
    const knownHash = partsSha ?? (v.sha256 as string).toLowerCase();

    const coreName = (() => {
      try {
        return decodeURIComponent(new URL(catalogUrl).pathname.split("/").pop() || "catalog-core.json");
      } catch {
        return catalogUrl.split("/").pop() || "catalog-core.json";
      }
    })();
    if (!SAFE_CATALOG_NAME_RE.test(coreName)) return null;

    const readVerified = async (name: string, expected: string | null): Promise<string | null> => {
      try {
        const body = await readFileAsync(nodePath.join(cacheDir, name), "utf8");
        if (expected && sha256(body) !== expected.toLowerCase()) return null;
        return body;
      } catch {
        return null;
      }
    };

    const coreBody = await readVerified(coreName, v.coreSha256 ?? null);
    if (coreBody === null) return null;
    const partBodies: string[] = [];
    for (const p of parts) {
      const b = await readVerified(p.file, p.sha256 ?? null);
      if (b === null) return null;
      partBodies.push(b);
    }

    // authoritative content identity (mirrors export-catalog.mjs)
    if (partsSha) {
      if (sha256(coreBody + partBodies.join("")) !== partsSha) return null;
    } else if (sha256(coreBody) !== (v.sha256 as string).toLowerCase()) {
      return null;
    }
    return { knownHash, coreBody, partBodies };
  } catch {
    return null; // no cache / torn write / bad json → classic remote path
  }
}

async function syncCatalog(catalogUrl: string): Promise<CatalogRefreshResult> {
  // v0.10.26: never merge against an unhealed schema – ensureSeeded() runs the
  // schema-drift healer (seed.ts) so legacy databases gain Title.sources &
  // friends BEFORE the upserts below reference them (was: P2022 → merge died
  // → "catalog sync watcher timed out" on every boot of upgraded old installs)
  await ensureSeeded();
  const prev = await db.syncState.findUnique({ where: { key: HASH_KEY } });
  const local = await readLocalCatalogCache(catalogUrl);
  // v0.34.3 — with a valid local cache the remote probe (and ALL network) is
  // skipped entirely; the cache refresh is owned by the Electron shell.
  const probe = local ? null : await probeVersion(catalogUrl);
  // v0.34.0 — track the combined core+parts identity; single-file catalogs
  // (or a probe from an older host) fall back to the plain sha256.
  const knownHash = local ? local.knownHash : probe ? (probe.partsSha256 ?? probe.sha256) : null;

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

  // v0.34.3 — local cache (verified above) replaces the ~111MB core download
  let body: string;
  const partBodies: string[] = [];
  if (local) {
    body = local.coreBody;
    partBodies.push(...local.partBodies);
  } else {
    // BUG-037 — a parts-capable catalog whose probe FAILED (probeVersion
    // null after 2 timeouts) still lets the big core fetch succeed. Merging
    // core-only made applyCatalog treat EVERY part-carried title (the whole
    // f2m wave) as "left the catalog": titles deleted + user rows detached.
    // A parts-advertising hash stored locally proves the remote HAS parts —
    // refuse the core-only merge and wait for a healthy cycle instead.
    const res = await fetch(catalogUrl, {
      headers: { "User-Agent": "Nama-Catalog-Sync" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
    body = await res.text();
  }

  // v0.34.0 — the remote may advertise part files (the catalog outgrew the
  // 100MB raw-file cap). Fetch ALL parts BEFORE merging: a truncated union
  // would make applyCatalog delete the titles the missing parts carry.
  if (!local && probe?.parts.length) {
    for (const part of probe.parts) {
      const pUrl = part.file.startsWith("http") ? part.file : siblingUrl(catalogUrl, part.file);
      const pRes = await fetch(pUrl, {
        headers: { "User-Agent": "Nama-Catalog-Sync" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!pRes.ok) throw new Error(`catalog part fetch failed: ${part.file} HTTP ${pRes.status}`);
      const pBody = await pRes.text();
      if (part.sha256 && sha256(pBody) !== part.sha256.toLowerCase()) {
        throw new Error(`catalog part hash mismatch: ${part.file}`);
      }
      partBodies.push(pBody);
    }
  }

  // content identity: core body + every part body (matches version.json's
  // partsSha256; single-file catalogs keep the plain core-body hash)
  const hash = sha256(body + partBodies.join(""));

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

  // BUG-037 — probe-failed merges may be CORE-ONLY (the remote actually
  // advertises parts we could not list): applyCatalog would then delete every
  // part-carried title and detach its user rows. Precise guard: when the
  // probe failed AND the incoming payload is missing titles that exist on
  // this device, refuse the merge and wait for a healthy cycle. A genuine
  // single-file catalog (payload carries everything) still merges.
  if (probe === null && partBodies.length === 0 && (await db.title.count()) > 0) {
    const incoming = new Set(payload.titles.map((t) => String((t as { slug?: unknown }).slug ?? "")));
    const existingSlugs = (await db.title.findMany({ select: { slug: true } })).map((r) => r.slug);
    const missing = existingSlugs.filter((s) => !incoming.has(s)).length;
    if (missing > 0) {
      const count = await db.title.count();
      scheduleResync(catalogUrl);
      return { ok: true, skipped: true, probeUnknown: true, titles: count, episodes: 0, created: 0, updated: 0, removed: 0 };
    }
  }

  const siteRoot = siteRootOf(catalogUrl);

  /* v0.34.0 — the export writes `sources` as a REAL JSON array (safeParse in
   * export-catalog.mjs), but this mapper only accepted JSON STRINGS — every
   * remote merge silently wiped every device's sources down to "[]". Accept
   * both shapes now (array → stringify, string → keep). BUG-039 — a MISSING
   * or null field (older host / newer client / truncated object) no longer
   * normalizes to "[]": the caller keeps the existing DB row instead of
   * erasing every working quality/variant link. */
  const asSourcesJson = (v: unknown): string | null => {
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === "string" && v.startsWith("[")) return v;
    if (v == null) return null; // keep the row's current sources
    return "[]";
  };

  const mapItem = (t: Record<string, unknown>): CatalogItem => ({
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
    sources: asSourcesJson(t.sources),
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
          sources: asSourcesJson(e.sources),
          thumbnail: rebaseAsset(String(e.thumbnail ?? ""), siteRoot),
        }))
      : [],
  });

  const rawItems = [...payload.titles];
  for (const pBody of partBodies) {
    const part = JSON.parse(pBody) as { format?: string; titles?: Record<string, unknown>[] };
    if (part.format !== "nama-catalog-part" || !Array.isArray(part.titles)) {
      throw new Error("bad catalog part payload (format/titles)");
    }
    rawItems.push(...part.titles);
  }
  const items: CatalogItem[] = rawItems.map(mapItem);

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

/** /covers/<tt>/… → the tt identity (the dedupe twin key).
 *  v0.38.2: rows written by older syncs carry rebased-absolute art
 *  (https://host/.../covers/tt…/…) or metahub paths — the anchored match
 *  returned "" for those and silently disabled the tt-twin reconciliation
 *  on every synced device. Falls back to the same loose substring the
 *  client uses (covers.ts TT_RE / api/x ttOf / hero-pick ttFromArt). */
const ttOfPoster = (p: string | null | undefined): string =>
  /^\/covers\/(tt\d+)\//.exec(p || "")?.[1] ??
  /(?:^|[^a-zA-Z0-9])(tt\d{5,})(?!\d)/i.exec(p || "")?.[1]?.toLowerCase() ??
  "";

/* DEDUPE-1 — move every user row of the departing duplicate onto the
 * surviving tt twin. Uniqueness rules decide move vs merge-vs-delete:
 *   favorite/watchlist/userRating  (userKey,titleId)      → move | drop
 *   watchProgress                  (userKey,titleId)      → keep the more
 *   watchEpisodeProgress           (userKey,titleId,episodeId) advanced row
 *   review (no unique)                                    → re-point all
 *   userCollectionItem             (collectionId,titleId) → move | drop
 * Tables the running schema may not have yet are skipped defensively —
 * ensureRuntimeSchema owns that lifecycle and a failed reconcile must never
 * abort the whole merge (the caller falls back to plain removal). */
/** Minimal structural view of the (userKey,titleId)-unique tables — the three
 *  Prisma delegates share these exact call shapes. */
type TwinUserTable = {
  findMany(args: { where: { titleId: number } }): Promise<{ id: number; userKey: string }[]>;
  findFirst(args: { where: { userKey: string; titleId: number } }): Promise<{ id: number } | null>;
  update(args: { where: { id: number }; data: { titleId: number } }): Promise<unknown>;
  delete(args: { where: { id: number } }): Promise<unknown>;
};

/** move | drop for one (userKey,titleId)-unique table. */
async function reconcileTwinUniqueTable(table: TwinUserTable, goneId: number, twinId: number): Promise<number> {
  const rows = await table.findMany({ where: { titleId: goneId } });
  let moved = 0;
  for (const r of rows) {
    const twinRow = await table.findFirst({ where: { userKey: r.userKey, titleId: twinId } });
    if (!twinRow) {
      await table.update({ where: { id: r.id }, data: { titleId: twinId } });
      moved++;
    } else {
      await table.delete({ where: { id: r.id } });
    }
  }
  return moved;
}

async function reconcileTwinUserRows(goneId: number, twinId: number): Promise<number> {
  let moved = 0;

  for (const table of [db.favorite, db.watchlist, db.userRating].map((d) => d as unknown as TwinUserTable)) {
    moved += await reconcileTwinUniqueTable(table, goneId, twinId);
  }

  // «ادامه تماشا» pointer — one row per (userKey,titleId): the twin's row
  // survives, but if the departing copy was further along, it wins.
  const ptrs = await db.watchProgress.findMany({ where: { titleId: goneId } });
  for (const p of ptrs) {
    const twin = await db.watchProgress
      .findUnique({ where: { userKey_titleId: { userKey: p.userKey, titleId: twinId } } })
      .catch(() => null);
    if (!twin) {
      await db.watchProgress.update({ where: { id: p.id }, data: { titleId: twinId } });
      moved++;
    } else {
      if (p.position > twin.position) {
        await db.watchProgress.update({
          where: { id: twin.id },
          data: { position: p.position, duration: p.duration, episodeId: p.episodeId, updatedAt: new Date() },
        });
      }
      await db.watchProgress.delete({ where: { id: p.id } });
    }
  }

  try {
    // per-episode positions (v0.27.0 additive table)
    const eps = await db.watchEpisodeProgress.findMany({ where: { titleId: goneId } });
    for (const p of eps) {
      const twin = await db.watchEpisodeProgress.findFirst({
        where: { userKey: p.userKey, titleId: twinId, episodeId: p.episodeId },
      });
      if (!twin) {
        await db.watchEpisodeProgress.update({ where: { id: p.id }, data: { titleId: twinId } });
        moved++;
      } else {
        if (p.position > twin.position) {
          await db.watchEpisodeProgress.update({ where: { id: twin.id }, data: { position: p.position, duration: p.duration } });
        }
        await db.watchEpisodeProgress.delete({ where: { id: p.id } });
      }
    }
  } catch {
    /* older schema without the table — nothing to move */
  }

  moved += (await db.review.updateMany({ where: { titleId: goneId }, data: { titleId: twinId } })).count;

  try {
    const cis = await db.userCollectionItem.findMany({ where: { titleId: goneId } });
    for (const ci of cis) {
      const twin = await db.userCollectionItem
        .findUnique({ where: { collectionId_titleId: { collectionId: ci.collectionId, titleId: twinId } } })
        .catch(() => null);
      if (!twin) {
        await db.userCollectionItem.update({ where: { id: ci.id }, data: { titleId: twinId } });
        moved++;
      } else {
        await db.userCollectionItem.delete({ where: { id: ci.id } });
      }
    }
  } catch {
    /* older schema without the table — nothing to move */
  }

  return moved;
}

async function applyCatalog(items: CatalogItem[]): Promise<CatalogRefreshResult> {
  const stats = { created: 0, updated: 0, removed: 0 };
  const seedSlugs = new Set(items.map((t) => t.slug));

  const current = await db.title.findMany({ select: { id: true, slug: true, source: true, poster: true } });
  const idBySlug = new Map(current.map((t) => [t.slug, t.id]));
  // v0.32.0 — عنوان‌هایی که کاربر خودش از منبع دایرکتوری سینک کرده
  // (source=od — که کاتالوگ میزبان هم همین برچسب را دارد) دیگر در هر
  // به‌روزرسانی کاتالوگ به‌همراه فوری/لیست/پیشروی‌هایشان حذف نمی‌شوند؛
  // «حذف عنوانِ خارج‌شده» فقط برای ردیف‌های demo/seed اعمال می‌شود.
  // پیامد: عنوان od حذف‌شده از کاتالوگ میزبان روی دستگاه می‌ماند —
  // تا وقتی فایلش بالاست هنوز پخش می‌شود و سینک بعدی خودش سر و مرتبش می‌کند.
  const goneTitles = current.filter((t) => !seedSlugs.has(t.slug) && t.source !== "od");
  const goneIds = goneTitles.map((t) => t.id);

  // v0.34.4 (DEDUPE-1) — tt-twin reconciliation: the catalog-side dedupe
  // merged duplicate tt rows, so a device may hold a favorite/list/progress
  // on the copy that is ABOUT TO LEAVE the catalog. Before the removal
  // detach below, every user row of a departing title rides over to the
  // surviving twin (same /covers/<tt>/ identity) — «حفظ علاقه‌مندی‌ها».
  const twinIdByTt = new Map<string, number>();
  for (const t of current) {
    if (!seedSlugs.has(t.slug)) continue;
    const tt = ttOfPoster(t.poster);
    if (tt && !twinIdByTt.has(tt)) twinIdByTt.set(tt, t.id);
  }
  let twinMoves = 0;
  for (const g of goneTitles) {
    const twinId = twinIdByTt.get(ttOfPoster(g.poster));
    if (!twinId) continue;
    try {
      twinMoves += await reconcileTwinUserRows(g.id, twinId);
    } catch (e) {
      console.error("[catalog] tt-twin reconcile failed (kept removal path):", e instanceof Error ? e.message : e);
    }
  }
  if (twinMoves) console.log(`[catalog] dedupe: ${twinMoves} user rows moved to surviving tt twins`);

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
      // BUG-039 — null sources (remote omitted the field) means "KEEP what is
      // on the device": the update path drops the field, the create path
      // seeds "[]". Writing "[]" over working rows killed every quality link.
      ...(t.sources != null ? { sources: t.sources } : {}),
      featured: t.featured,
      trendingScore: t.trendingScore,
      views: t.views,
      source: t.source,
      // v0.23.0 — preserve the real add-date across desktop re-syncs so the
      // «جدیدترین‌ها» row keeps its meaning on Electron too (idempotent:
      // the same hosted date is written every time; empty/invalid → untouched)
      ...(addedAt ? { createdAt: addedAt } : {}),
    };
    // BUG-039 — episode rows used for CREATE need a concrete sources value;
    // the UPDATE path (mergeEpisodes) keeps the device's row when null.
    const eps = t.episodes.map((e) => ({ ...e, sources: e.sources ?? "[]" }));
    episodeTotal += eps.length;

    const existingId = idBySlug.get(t.slug);
    if (existingId === undefined) {
      await db.title.create({ data: { slug: t.slug, ...data, sources: t.sources ?? "[]", episodes: { create: eps } } });
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
      if (e.sources != null && existing.sources !== e.sources) changed.sources = e.sources;
      if (existing.thumbnail !== e.thumbnail) changed.thumbnail = e.thumbnail;
      if (Object.keys(changed).length) {
        // شناسه‌ی اپیزود عوض نمی‌شود → ردیف‌های WatchProgress زنده می‌مانند
        await db.episode.update({ where: { id: existing.id }, data: changed });
      }
    } else {
      await db.episode.create({ data: { ...e, sources: e.sources ?? "[]", titleId } });
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
