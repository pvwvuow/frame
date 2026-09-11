import { NextRequest, NextResponse } from "next/server";
import { sourceSync } from "@/lib/source/sync";
import { sameOriginOrThrow, isPublicHttpUrl } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await sourceSync.status();
  return NextResponse.json(s, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  /* C-1 — خزنده یک پریموم SSRF است: بدون گارد، هر URLی (از جمله
   * metadata/شبکه داخلی) fetch و نتیجه‌اش در DB می‌نشیند. */
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  let body: { action?: string; url?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body allowed */
  }

  if (body.action === "stop") {
    sourceSync.stop();
    return NextResponse.json({ ok: true });
  }

  const url = (body.url || "").trim();
  const DEFAULT_SOURCE = "https://dls4.aparatchi-dlcenter.top/DonyayeSerial/";
  const target = url || DEFAULT_SOURCE;
  if (!isPublicHttpUrl(target)) {
    return NextResponse.json({ ok: false, error: "unreachable-host" }, { status: 400 });
  }
  const res = await sourceSync.start(target);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
