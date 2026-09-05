import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const bust = () => {
  revalidatePath("/favorites");
  revalidatePath("/my-list");
  revalidatePath("/profile");
};

/** Toggle favorite. Body: { titleId } → { isFavorite } */
export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; value?: boolean } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });

  const existing = await db.favorite.findUnique({ where: { userKey_titleId: { userKey, titleId } }, select: { id: true } });
  const wanted = typeof body?.value === "boolean" ? body.value : !existing;

  if (!wanted && existing) await db.favorite.delete({ where: { id: existing.id } });
  if (wanted && !existing) {
    try {
      await db.favorite.create({ data: { userKey, titleId } });
    } catch {
      /* race – already exists */
    }
  }
  bust();
  return Response.json({ isFavorite: wanted });
}

/** Bulk add. Body: { titleIds: number[] } */
export async function PUT(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[] } | null;
  const ids = (body?.titleIds ?? []).map(Number).filter(Boolean);
  if (!ids.length) return Response.json({ error: "titleIds required" }, { status: 400 });
  await Promise.all(
    ids.map((titleId) => db.favorite.upsert({ where: { userKey_titleId: { userKey, titleId } }, update: {}, create: { userKey, titleId } }))
  );
  bust();
  return Response.json({ ok: true, count: ids.length });
}

/** Remove many / clear all. Body: { titleIds?: number[] } (omit → clear all) */
export async function DELETE(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[] } | null;
  const ids = body?.titleIds?.map(Number).filter(Boolean);
  const r = await db.favorite.deleteMany({ where: { userKey, ...(ids?.length ? { titleId: { in: ids } } : {}) } });
  bust();
  return Response.json({ ok: true, removed: r.count });
}
