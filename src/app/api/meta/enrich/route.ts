/* تکمیل خودکار ژانر و توضیح (v0.32.0) — پس از سینک منبع و از تنظیمات.
 * GET  → آمار عنوان‌های نیازمند
 * POST { action: "run", limit? } → یک بچه اجرا می‌کند و آمار می‌دهد
 */
import { NextRequest, NextResponse } from "next/server";
import { sameOriginOrThrow } from "@/lib/api-guard";
import { enrichBatch, enrichStats } from "@/lib/meta-enrich";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await enrichStats();
  return NextResponse.json(stats, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  let body: { action?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty ok */
  }
  if (body.action !== "run") {
    return NextResponse.json({ ok: false, error: "bad-action" }, { status: 400 });
  }
  const limit = Math.min(60, Math.max(5, Number(body.limit) || 25));
  const stats = await enrichBatch(limit);
  return NextResponse.json({ ok: true, ...stats });
}
