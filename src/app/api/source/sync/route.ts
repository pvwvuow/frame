import { NextRequest, NextResponse } from "next/server";
import { sourceSync } from "@/lib/source/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await sourceSync.status();
  return NextResponse.json(s, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
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
  const res = await sourceSync.start(url || DEFAULT_SOURCE);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
