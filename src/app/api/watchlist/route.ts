import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["planned", "watching", "watched"]);
const bust = () => {
  revalidatePath("/my-list");
  revalidatePath("/profile");
};

/** Toggle membership. Body: { titleId, value?: boolean } → { inList } */
export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; value?: boolean } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });

  const existing = await db.watchlist.findUnique({
    where: { userKey_titleId: { userKey, titleId } },
    select: { id: true },
  });
  const wanted = typeof body?.value === "boolean" ? body.value : !existing;

  if (!wanted && existing) await db.watchlist.delete({ where: { id: existing.id } });
  if (wanted && !existing) {
    try {
      await db.watchlist.create({ data: { userKey, titleId } });
    } catch {
      /* already exists */
    }
  }
  bust();
  return Response.json({ inList: wanted });
}

/** Update one row. Body: { titleId, status?, note?, pinned? } */
export async function PATCH(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; status?: string; note?: string; pinned?: boolean } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });
  const data: { status?: string; note?: string; pinned?: boolean } = {};
  if (body?.status && STATUSES.has(body.status)) data.status = body.status;
  if (typeof body?.note === "string") data.note = body.note.slice(0, 500);
  if (typeof body?.pinned === "boolean") data.pinned = body.pinned;

  const row = await db.watchlist.upsert({
    where: { userKey_titleId: { userKey, titleId } },
    update: data,
    create: { userKey, titleId, ...data },
  });
  bust();
  return Response.json({ ok: true, status: row.status, note: row.note, pinned: row.pinned });
}

/** Bulk ops. Body: { titleIds: number[], action: "add" | "status", status? } */
export async function PUT(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[]; action?: string; status?: string } | null;
  const ids = (body?.titleIds ?? []).map(Number).filter(Boolean);
  if (!ids.length) return Response.json({ error: "titleIds required" }, { status: 400 });

  if (body?.action === "status" && body.status && STATUSES.has(body.status)) {
    await db.watchlist.updateMany({ where: { userKey, titleId: { in: ids } }, data: { status: body.status } });
  } else {
    await Promise.all(
      ids.map((titleId) => db.watchlist.upsert({ where: { userKey_titleId: { userKey, titleId } }, update: {}, create: { userKey, titleId } }))
    );
  }
  bust();
  return Response.json({ ok: true, count: ids.length });
}

/** Remove many / clear all. Body: { titleIds?: number[] } */
export async function DELETE(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[] } | null;
  const ids = body?.titleIds?.map(Number).filter(Boolean);
  const r = await db.watchlist.deleteMany({ where: { userKey, ...(ids?.length ? { titleId: { in: ids } } : {}) } });
  bust();
  return Response.json({ ok: true, removed: r.count });
}
