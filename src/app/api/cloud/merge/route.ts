import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

/* Merge the cloud snapshot (from Supabase) into the LOCAL database.
 *
 * Merge policy (v1, safe & predictable):
 *   - cloud rows that don't exist locally are ADDED (cloud fills gaps)
 *   - conflicts keep the LOCAL value (local is the source of truth for the UI)
 *   - nothing is ever deleted locally by a sync
 */

type Body = {
  favorites?: number[];
  watchlist?: { titleId: number; status: string }[];
  ratings?: { titleId: number; score: number }[];
};

const VALID_STATUSES = new Set(["planned", "watching", "watched"]);

export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  // favorites
  let favoritesAdded = 0;
  const favIds = (body.favorites ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (favIds.length) {
    const existing = await db.favorite.findMany({ where: { userKey, titleId: { in: favIds } }, select: { titleId: true } });
    const have = new Set(existing.map((e) => e.titleId));
    const missing = [...new Set(favIds)].filter((id) => !have.has(id));
    if (missing.length) {
      const r = await db.favorite.createMany({ data: missing.map((titleId) => ({ userKey, titleId })) });
      favoritesAdded = r.count;
    }
  }

  // watchlist
  let listAdded = 0;
  for (const row of body.watchlist ?? []) {
    const titleId = Number(row?.titleId);
    const status = String(row?.status ?? "");
    if (!titleId || Number.isNaN(titleId) || !VALID_STATUSES.has(status)) continue;
    const ex = await db.watchlist.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    if (!ex) {
      await db.watchlist.create({ data: { userKey, titleId, status } });
      listAdded++;
    }
    // conflicts keep the local status on purpose
  }

  // ratings (only fill gaps — never overwrite a local score)
  let ratingsAdded = 0;
  for (const row of body.ratings ?? []) {
    const titleId = Number(row?.titleId);
    const score = Number(row?.score);
    if (!titleId || Number.isNaN(titleId) || !Number.isFinite(score) || score < 1 || score > 10) continue;
    const ex = await db.userRating.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    if (!ex) {
      await db.userRating.create({ data: { userKey, titleId, score: Math.round(score) } });
      ratingsAdded++;
    }
  }

  return Response.json({ ok: true, favoritesAdded, listAdded, ratingsAdded });
}
