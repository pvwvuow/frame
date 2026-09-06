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
  const opts: CatalogQuery = {
    genre: sp.get("genre") || undefined,
    sort: sp.get("sort") || undefined,
    year: sp.get("year") ? Number(sp.get("year")) : undefined,
    minRating: sp.get("rating") ? Number(sp.get("rating")) : undefined,
  };
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
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
