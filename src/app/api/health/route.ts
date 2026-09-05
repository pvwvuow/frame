import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

/**
 * Liveness + database probe used by the Electron shell (electron/main.cjs)
 * right after the standalone server boots. `ok` is always true so the startup
 * gate passes; callers must inspect `db.ok` for the real database status.
 * Touching ensureSeeded() here also triggers the schema self-heal (seed.ts)
 * before the first real page render.
 */
export async function GET() {
  let dbOk = true;
  let dbError: string | undefined;
  try {
    await ensureSeeded();
    await db.$queryRawUnsafe("SELECT 1");
    await db.title.count();
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json({ ok: true, db: { ok: dbOk, error: dbError } });
}
