import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const bust = () => {
  revalidatePath("/collections");
  revalidatePath("/my-list");
};

/* ------------------------------------------------------------------ */
/* GET /api/collections — the user's own collections (with preview)    */
/* ------------------------------------------------------------------ */
export async function GET() {
  const userKey = await getUserKey();
  const rows = await db.userCollection.findMany({
    where: { userKey },
    orderBy: { createdAt: "asc" },
    include: {
      items: { orderBy: { addedAt: "desc" }, take: 6 },
      _count: { select: { items: true } },
    },
  });
  // manual join — items may reference titles missing locally (synced from cloud)
  const posterIds = [...new Set(rows.flatMap((c) => c.items.map((i) => i.titleId)))].slice(0, 200);
  const titles = posterIds.length
    ? await db.title.findMany({ where: { id: { in: posterIds } }, select: { id: true, poster: true, backdrop: true, type: true } })
    : [];
  const tById = new Map(titles.map((t) => [t.id, t]));
  type TRow = { id: number; poster: string; backdrop: string; type: string };
  return Response.json(
    rows.map((c) => {
      const joins = c.items.map((i) => tById.get(i.titleId)).filter((t): t is TRow => !!t);
      return {
        id: c.id,
        name: c.name,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        count: c._count.items,
        posters: joins.map((t) => t.poster).filter(Boolean),
        backdrops: joins.map((t) => t.backdrop).filter(Boolean),
        movies: joins.filter((t) => t.type === "movie").length,
        series: joins.filter((t) => t.type === "series").length,
      };
    }),
    { headers: { "Cache-Control": "no-store" } }
  );
}

/* POST /api/collections — create. Body: { name } → { id, name } */
export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  const existing = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name } } });
  if (existing) return Response.json({ id: existing.id, name: existing.name, duplicate: true });
  const row = await db.userCollection.create({ data: { userKey, name } });
  bust();
  return Response.json({ id: row.id, name: row.name });
}

/* PATCH /api/collections — rename. Body: { id, name } */
export async function PATCH(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { id?: number; name?: string } | null;
  const id = Number(body?.id);
  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!id || !name) return Response.json({ error: "id + name required" }, { status: 400 });
  const owned = await db.userCollection.findFirst({ where: { id, userKey }, select: { id: true } });
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });
  const dupe = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name } } });
  if (dupe && dupe.id !== id) return Response.json({ error: "duplicate" }, { status: 409 });
  await db.userCollection.update({ where: { id }, data: { name } });
  bust();
  return Response.json({ ok: true });
}

/* DELETE /api/collections — Body/query: { id } */
export async function DELETE(req: Request) {
  const userKey = await getUserKey();
  let id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) {
    const body = (await req.json().catch(() => null)) as { id?: number } | null;
    id = Number(body?.id);
  }
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const owned = await db.userCollection.findFirst({ where: { id, userKey }, select: { id: true } });
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });
  await db.userCollection.delete({ where: { id } });
  bust();
  return Response.json({ ok: true });
}
