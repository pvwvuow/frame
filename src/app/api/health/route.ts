import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { refreshCatalogOnce } from "@/lib/catalog-refresh";

export const dynamic = "force-dynamic";

/**
 * Liveness + database probe used by the Electron shell (electron/main.cjs)
 * right after the standalone server boots. `ok` is always true so the startup
 * gate passes; callers must inspect `db.ok` for the real database status.
 * Touching ensureSeeded() here also triggers the schema self-heal (seed.ts)
 * before the first real page render.
 *
 * When the shell detects that the bundled seed database differs from the
 * installed one (app update carrying new content) it spawns this server with
 * NAMA_CATALOG_SEED=<seed.db path>. The first probe then merges the bundled
 * catalog into the user database before the window is allowed to open.
 */
export async function GET() {
  let dbOk = true;
  let dbError: string | undefined;
  let catalog: Awaited<ReturnType<typeof refreshCatalogOnce>> | undefined;
  try {
    await ensureSeeded();
    const seedPath = process.env.NAMA_CATALOG_SEED?.trim();
    if (seedPath) {
      catalog = await refreshCatalogOnce(seedPath);
    }
    await db.$queryRawUnsafe("SELECT 1");
    await db.title.count();
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json({ ok: true, db: { ok: dbOk, error: dbError }, catalog: catalog ?? null });
}
