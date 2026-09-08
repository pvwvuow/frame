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
];

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
    })();
  }
  return schemaPromise;
}
