import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { refreshCatalogOnce, syncCatalogOnce } from "@/lib/catalog-refresh";

export const dynamic = "force-dynamic";

/**
 * Liveness + database probe used by the Electron shell (electron/main.cjs)
 * right after the standalone server boots. `ok` is always true so the startup
 * gate passes; callers must inspect `db.ok` for the real database status.
 * Touching ensureSeeded() here also triggers the schema self-heal (seed.ts)
 * before the first real page render.
 *
 * Catalog update paths (checked before the window is allowed to open):
 *   - NAMA_CATALOG_URL  → hosted nama-catalog JSON (by default the GitHub
 *     raw URL of this repo, so content auto-updates without a new install);
 *     only re-merges when the hosted payload's hash changed (SyncState)
 *   - NAMA_CATALOG_SEED → bundled seed.db that differs from the installed
 *     one (app update carrying new content, detected by the shell) and the
 *     offline fallback whenever the remote catalog is unreachable
 */
export async function GET() {
  let dbOk = true;
  let dbError: string | undefined;
  let catalog: Awaited<ReturnType<typeof syncCatalogOnce>> | undefined;
  try {
    await ensureSeeded();
    const catalogUrl = process.env.NAMA_CATALOG_URL?.trim();
    const seedPath = process.env.NAMA_CATALOG_SEED?.trim();
    if (catalogUrl) {
      catalog = await syncCatalogOnce(catalogUrl);
      if (!catalog?.ok && seedPath) {
        // remote unreachable (offline / GitHub down) → fall back to the
        // bundled seed so an app update still delivers its content
        catalog = await refreshCatalogOnce(seedPath);
      }
    } else if (seedPath) {
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
