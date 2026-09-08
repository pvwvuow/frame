import type { Title as DbTitle } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const bust = () => {
  revalidatePath("/collections");
  revalidatePath("/my-list");
};

const J = (s: string): string[] => {
  try {
    const p = JSON.parse(s || "[]");
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
};

/** Project a full DbTitle row to the lite list shape (same as /api/x). */
const liteOf = (t: DbTitle) => ({
  id: t.id,
  slug: t.slug,
  title: t.title,
  titleEn: t.titleEn,
  type: t.type === "series" ? ("series" as const) : ("movie" as const),
  year: t.year,
  rating: t.rating,
  duration: t.duration,
  description: t.description,
  genres: J(t.genres),
  poster: t.poster,
  backdrop: t.backdrop,
  quality: t.quality,
  country: t.country,
  ageRating: t.ageRating,
  views: t.views,
  featured: t.featured,
  trendingScore: t.trendingScore,
  director: t.director,
  cast: J(t.cast),
  videoUrl: t.videoUrl,
  trailerUrl: t.trailerUrl ?? null,
  sources: t.sources,
  createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt ?? ""),
});

/* ------------------------------------------------------------------ */
/* GET /api/collections/items                                          */
/*   ?collectionId=N → TitleView[] of that collection (newest first)   */
/*   ?titleId=N       → { collectionIds } — which of MY collections    */
/*                      contain this title (picker checkmarks)         */
/* ------------------------------------------------------------------ */
export async function GET(req: Request) {
  const userKey = await getUserKey();
  const sp = new URL(req.url).searchParams;

  const titleId = Number(sp.get("titleId"));
  if (titleId) {
    const mine = await db.userCollection.findMany({ where: { userKey }, select: { id: true } });
    if (!mine.length) return Response.json({ collectionIds: [] });
    const rows = await db.userCollectionItem.findMany({
      where: { collectionId: { in: mine.map((c) => c.id) }, titleId },
      select: { collectionId: true },
    });
    return Response.json({ collectionIds: rows.map((r) => r.collectionId) }, { headers: { "Cache-Control": "no-store" } });
  }

  const collectionId = Number(sp.get("collectionId"));
  if (!collectionId) return Response.json({ error: "collectionId or titleId required" }, { status: 400 });
  const owned = await db.userCollection.findFirst({ where: { id: collectionId, userKey }, select: { id: true } });
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });
  const rows = await db.userCollectionItem.findMany({
    where: { collectionId },
    orderBy: { addedAt: "desc" },
  });
  // manual join: items may reference titles the local catalog doesn't know
  const titles = await db.title.findMany({
    where: { id: { in: rows.map((r) => r.titleId) } },
  });
  const byId = new Map(titles.map((t) => [t.id, t]));
  return Response.json(
    rows.map((r) => byId.get(r.titleId)).filter((t): t is DbTitle => !!t).map(liteOf),
    { headers: { "Cache-Control": "no-store" } }
  );
}

/* POST /api/collections/items — add/remove. Body: { collectionId, titleId, value? } */
export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { collectionId?: number; titleId?: number; value?: boolean } | null;
  const collectionId = Number(body?.collectionId);
  const titleId = Number(body?.titleId);
  if (!collectionId || !titleId) return Response.json({ error: "collectionId + titleId required" }, { status: 400 });

  const owned = await db.userCollection.findFirst({ where: { id: collectionId, userKey }, select: { id: true } });
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const existing = await db.userCollectionItem.findUnique({
    where: { collectionId_titleId: { collectionId, titleId } },
    select: { id: true },
  });
  const wanted = typeof body?.value === "boolean" ? body.value : !existing;
  if (wanted && !existing) {
    try {
      await db.userCollectionItem.create({ data: { collectionId, titleId } });
    } catch {
      /* race – already exists */
    }
  }
  if (!wanted && existing) await db.userCollectionItem.delete({ where: { id: existing.id } });
  await db.userCollection.update({ where: { id: collectionId }, data: { updatedAt: new Date() } });
  const items = await db.userCollectionItem.findMany({ where: { collectionId }, select: { titleId: true } });
  bust();
  return Response.json({ inCollection: wanted, items: items.map((i) => i.titleId) });
}
