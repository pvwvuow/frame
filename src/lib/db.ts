import { PrismaClient } from "@prisma/client";

/**
 * Fallback so the app boots even without a .env file
 * (SQLite file lives in ./db/custom.db relative to the project root).
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:../db/custom.db";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
