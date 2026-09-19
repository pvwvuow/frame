/* Paged catalog API (v0.10.4) — backs the load-more flow on /movies & /series.
   Returns lightweight list rows (no description/cast/sources) + the user's
   progress map for the returned batch. */
import { NextRequest, NextResponse } from "next/server";
import { getCatalogPage, type CatalogQuery } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { getProgressMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") === "series" ? "series" : "movie";
  // D09 (audit v0.49) — numeric params must be NUMBERS: garbage used to
  // become NaN and silently distort the query; invalid ⇒ structured 400.
  const numParam = (name: string): number | undefined => {
    const raw = sp.get(name);
    if (raw === null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };
  const year = numParam("year");
  const minRating = numParam("rating");
  if (Number.isNaN(year) || Number.isNaN(minRating)) {
    return Response.json({ error: "invalid numeric parameter" }, { status: 400 });
  }
  const opts: CatalogQuery = {
    genre: sp.get("genre") || undefined,
    sort: sp.get("sort") || undefined,
    year: year !== undefined ? Math.max(1900, Math.min(2100, Math.round(year))) : undefined,
    minRating: minRating !== undefined ? Math.max(0, Math.min(10, minRating)) : undefined,
  };
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  // D09 — offset capped: an unbounded offset let one request page arbitrarily
  // deep into the table (cost amplifier for a loopback service)
  const offset = Math.min(200_000, Math.max(0, Number(sp.get("offset") ?? 0) || 0));
  const limit = Math.min(120, Math.max(1, Number(sp.get("limit") ?? 48) || 48));
  const userKey = await getUserKey();

  // support both page-N and raw-offset paging
  const pageNo = offset > 0 ? Math.floor(offset / limit) : page;
  const { items, total } = await getCatalogPage(type, opts, pageNo, limit);
  const progress = await getProgressMap(
    userKey,
    items.map((t) => t.id)
  );

  return NextResponse.json({
    items,
    total,
    progress: Object.fromEntries(progress),
  });
}
