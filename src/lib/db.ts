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
