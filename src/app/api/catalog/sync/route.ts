import { NextResponse } from "next/server";
import { recheckCatalogNow } from "@/lib/catalog-refresh";

export const dynamic = "force-dynamic";

/**
 * Manual content-update check (Settings → "بررسی به‌روزرسانی محتوا").
 * Contacts the remote catalog immediately; a no-op merge returns
 * { ok: true, skipped: true } within a version-probe round-trip.
 */
export async function POST() {
  const url = process.env.NAMA_CATALOG_URL?.trim();
  if (!url) {
    return NextResponse.json({ ok: false, skipped: false, error: "remote-catalog-disabled" }, { status: 200 });
  }
  try {
    const result = await recheckCatalogNow(url);
    return NextResponse.json({ ...result, error: result.error ?? null });
  } catch (e) {
    return NextResponse.json(
      { ok: false, skipped: false, error: e instanceof Error ? e.message : String(e) },
      { status: 200 }
    );
  }
}
