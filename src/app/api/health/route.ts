import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { getStartupSyncState, runStartupSync } from "@/lib/catalog-refresh";

export const dynamic = "force-dynamic";

/**
 * Liveness + database probe used by the Electron shell (electron/main.cjs)
 * right after the standalone server boots. `ok` is always true so the startup
 * gate passes; callers must inspect `db.ok` for the real database status.
 * Touching ensureSeeded() here also triggers the schema self-heal (seed.ts)
 * and the WAL/busy-timeout pragmas before the first real page render.
 *
 * Catalog update paths (run in the BACKGROUND via runStartupSync – kicked
 * once per server process, fire-and-forget; this route answers immediately
 * and reports progress through `catalog.status`):
 *   - NAMA_CATALOG_FRESH_SEED=1 → first run of a freshly copied seed.db:
 *     fast in-place cover-URL rebase + release-hash pre-store (no merge, no
 *     big download – see adoptFreshSeed); the remote sync below then
 *     fast-paths via its version.json probe
 *   - NAMA_CATALOG_URL  → hosted nama-catalog JSON (by default the GitHub
 *     raw URL of this repo, so content auto-updates without a new install);
 *     only re-merges when the hosted payload's hash changed (SyncState)
 *   - NAMA_CATALOG_SEED → bundled seed.db that differs from the installed
 *     one (app update carrying new content, detected by the shell) and the
 *     offline fallback whenever the remote catalog is unreachable
 *
 * v0.10.1 and earlier ran this whole chain inline, so a ~69MB catalog
 * release blocked the first health answer for minutes and the Electron
 * shell aborted with "server did not start in time".
 */
export async function GET() {
  let dbOk = true;
  let dbError: string | undefined;
  let titles: number | null = null;
  try {
    await ensureSeeded();
    await db.$queryRawUnsafe("SELECT 1");
    // background boot sync (singleton – later calls join the same promise)
    runStartupSync().catch(() => {});
    titles = await db.title.count();
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : String(e);
  }
  // flattened convenience fields (ok/titles/error) keep the Settings card and
  // the Electron poller simple; `status`/`phase` carry the live progress
  const st = getStartupSyncState();
  const catalog = dbOk
    ? {
        ...st,
        ok: st.result?.ok ?? undefined,
        titles: st.result?.titles ?? undefined,
        error: st.result?.error ?? undefined,
      }
    : null;
  return NextResponse.json({ ok: true, db: { ok: dbOk, error: dbError, titles }, catalog });
}
