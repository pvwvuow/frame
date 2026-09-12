import { PrismaClient } from "@prisma/client";

/**
 * Database URL resolution.
 *
 * Nama ships an embedded SQLite database (./db/custom.db). Prisma resolves a
 * *relative* `file:` URL against the generated client's own folder, which is
 * fine in `next dev` but breaks in the standalone build (node_modules/.prisma
 * lives somewhere else) → "Unable to open the database file".
 *
 * So we always hand Prisma an ABSOLUTE path:
 *   • absolute `file:` URL (Electron passes <userData>/nama.db) → used as-is
 *   • $NAMA_DB_PATH                                             → used as-is
 *   • relative `file:` URL / missing / foreign URL (e.g. a Postgres URL injected
 *     by a hosting platform) → <cwd>/db/custom.db (postbuild copies the seed DB
 *     next to the standalone server, so both `npm start` and `node server.js`
 *     from inside .next/standalone work).
 *
 * NOTE: no `node:` imports here – this module is reachable from client chunks
 * (type-only re-exports), and Turbopack refuses Node built-ins in that context.
 */
const DEFAULT_REL = "db/custom.db";

function isAbsolutePath(p: string) {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() ?? "";
  if (/^file:/i.test(raw)) {
    const p = raw.replace(/^file:/i, "");
    if (isAbsolutePath(p)) return raw;
  }
  const custom = process.env.NAMA_DB_PATH?.trim();
  if (custom) return `file:${custom}`;
  const cwd = typeof process.cwd === "function" ? process.cwd() : ".";
  return `file:${cwd.replace(/[\\/]+$/, "")}/${DEFAULT_REL}`;
}

const url = resolveDatabaseUrl();
process.env.DATABASE_URL = url;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasourceUrl: url,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/* ------------------------------------------------------------------ */
/* Runtime schema ensure (v0.10.33)                                    */
/*                                                                     */
/* The desktop app deliberately keeps the user's existing nama.db      */
/* across updates (ensureUserDb in electron/main.cjs copies the        */
/* bundled seed only on the FIRST run). A database created by an       */
/* older release therefore lacks every table introduced later — e.g.   */
/* UserCollection / UserCollectionItem from v0.10.32 — and each query  */
/* against them fails with "no such table", 500ing /api/collections,   */
/* /api/library and /api/cloud/merge, which bricked the My List page   */
/* on updated installs.                                                */
/*                                                                     */
/* ensureRuntimeSchema() applies idempotent CREATE TABLE IF NOT        */
/* EXISTS DDL (exactly what `prisma db push` generates for these       */
/* models) before the routes that touch the newer tables. It is        */
/* memoized per process, costs nothing when the tables already exist   */
/* and is harmless on a fresh database.                                */
/* ------------------------------------------------------------------ */
let schemaPromise: Promise<void> | null = null;

const RUNTIME_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "UserCollection" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserCollection_userKey_name_key" ON "UserCollection"("userKey" ASC, "name" ASC)`,
  `CREATE INDEX IF NOT EXISTS "UserCollection_userKey_idx" ON "UserCollection"("userKey" ASC)`,
  `CREATE TABLE IF NOT EXISTS "UserCollectionItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "collectionId" INTEGER NOT NULL,
  "titleId" INTEGER NOT NULL,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "UserCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserCollectionItem_collectionId_titleId_key" ON "UserCollectionItem"("collectionId" ASC, "titleId" ASC)`,
  `CREATE INDEX IF NOT EXISTS "UserCollectionItem_collectionId_idx" ON "UserCollectionItem"("collectionId" ASC)`,
  /* v0.10.35 — per-account data spaces (نگاشت حساب ابری ← فضای داده‌ی محلی) */
  `CREATE TABLE IF NOT EXISTS "AccountSpace" (
  "accountId" TEXT NOT NULL PRIMARY KEY,
  "uid" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE INDEX IF NOT EXISTS "AccountSpace_uid_idx" ON "AccountSpace"("uid" ASC)`,
  /* v0.27.0 (DATA-7) — per-EPISODE progress: the title-level WatchProgress
   * row stays the continue-watching pointer; this table remembers EVERY
   * episode position. Additive (CREATE IF NOT EXISTS) — existing DBs get it
   * at boot with zero migration risk. */
  `CREATE TABLE IF NOT EXISTS "WatchEpisodeProgress" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userKey" TEXT NOT NULL,
  "titleId" INTEGER NOT NULL,
  "episodeId" INTEGER NOT NULL,
  "position" REAL NOT NULL DEFAULT 0,
  "duration" REAL NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "WatchEpisodeProgress_userKey_titleId_episodeId_key" ON "WatchEpisodeProgress"("userKey" ASC, "titleId" ASC, "episodeId" ASC)`,
  `CREATE INDEX IF NOT EXISTS "WatchEpisodeProgress_userKey_titleId_idx" ON "WatchEpisodeProgress"("userKey" ASC, "titleId" ASC)`,
  /* v0.29.0 (NEW-DATA-13) — contact messages submitted from the form are
   * persisted server-side too (desktop): the form ALSO pushes them to the
   * cloud when signed in; this table is the durable local copy an operator
   * can read from the user's own machine. */
  `CREATE TABLE IF NOT EXISTS "ContactMessage" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "topic" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "userKey" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL
)`,
];

/** v0.27.0 (DATA-10) — additive column helper: `ALTER TABLE ADD COLUMN` is
 * idempotent ONLY when guarded by a pragma check (SQLite has no IF NOT
 * EXISTS for columns). */
async function ensureColumn(table: string, column: string, ddl: string): Promise<void> {
  try {
    const cols = (await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`)) as { name: string }[];
    if (Array.isArray(cols) && cols.some((c) => c.name === column)) return;
    await db.$executeRawUnsafe(ddl);
  } catch (e) {
    console.error("[db] ensureColumn failed:", table + "." + column, e);
  }
}

export function ensureRuntimeSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const sql of RUNTIME_DDL) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (e) {
          // never let bootstrap DDL take the server down; the statements are
          // idempotent so the next launch retries naturally
          console.error("[db] runtime schema ensure failed:", sql.slice(0, 48), e);
        }
      }
      // v0.27.0 (DATA-10) — the synced player-prefs blob on UserProfile
      await ensureColumn("UserProfile", "playerPrefs", `ALTER TABLE "UserProfile" ADD COLUMN "playerPrefs" TEXT`);
      // v0.29.0 (VERIFY-DATA-16) — the cloud row's STABLE uuid on UserCollection
      await ensureColumn("UserCollection", "cloudId", `ALTER TABLE "UserCollection" ADD COLUMN "cloudId" TEXT`);
      // v0.29.0 (NEW-DATA-10) — reviews become PER-ACCOUNT (legacy rows keep
      // NULL and stay visible to everyone, exactly like before)
      await ensureColumn("Review", "userKey", `ALTER TABLE "Review" ADD COLUMN "userKey" TEXT`);
    })();
  }
  return schemaPromise;
}
