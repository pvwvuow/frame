import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { sameOriginOrThrow } from "@/lib/api-guard";
import { prismaSafe, capTitleIds } from "@/lib/prisma-safe";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["planned", "watching", "watched"]);
const bust = () => {
  revalidatePath("/my-list");
  revalidatePath("/profile");
};

/** Toggle membership. Body: { titleId, value?: boolean } → { inList } */
export async function POST(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; value?: boolean } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });

  const existing = await db.watchlist.findUnique({
    where: { userKey_titleId: { userKey, titleId } },
    select: { id: true },
  });
  const wanted = typeof body?.value === "boolean" ? body.value : !existing;

  // BUG-048 — idempotent delete (a concurrent toggle used to throw P2025 → 500)
  if (!wanted && existing) await db.watchlist.deleteMany({ where: { id: existing.id, userKey } });
  if (wanted && !existing) {
    const err = await prismaSafe(() => db.watchlist.create({ data: { userKey, titleId } }));
    if (err) return err; // BUG-010 — 404 JSON instead of 500 HTML
  }
  bust();
  return Response.json({ inList: wanted });
}

/** Update one row. Body: { titleId, status?, note?, pinned?, plannedDate? } */
export async function PATCH(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as
    | { titleId?: number; status?: string; note?: string; pinned?: boolean; plannedDate?: string | null }
    | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });
  const data: { status?: string; note?: string; pinned?: boolean; plannedDate?: Date | null } = {};
  if (body?.status && STATUSES.has(body.status)) data.status = body.status;
  if (typeof body?.note === "string") data.note = body.note.slice(0, 500);
  if (typeof body?.pinned === "boolean") data.pinned = body.pinned;
  if (body?.plannedDate !== undefined) {
    if (body.plannedDate === null || body.plannedDate === "") data.plannedDate = null;
    else {
      const d = new Date(body.plannedDate);
      if (!isNaN(d.getTime())) data.plannedDate = d;
    }
  }

  // BUG-010 — a title deleted between resolution and the upsert is a clean 404
  const err = await prismaSafe(() =>
    db.watchlist.upsert({
      where: { userKey_titleId: { userKey, titleId } },
      update: data,
      create: { userKey, titleId, ...data },
    }),
  );
  if (err) return err;
  const row = await db.watchlist.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
  if (!row) return Response.json({ error: "unknown_or_gone_title" }, { status: 404 });
  bust();
  return Response.json({
    ok: true,
    status: row.status,
    note: row.note,
    pinned: row.pinned,
    plannedDate: row.plannedDate,
  });
}

/** Bulk ops. Body: { titleIds: number[], action: "add" | "status", status? } */
export async function PUT(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[]; action?: string; status?: string } | null;
  // C-8 — type-confusion: بدنه‌ی غیرآرایه‌ای نباید سرور را با ۵۰۰ بخواباند
  if (body?.titleIds !== undefined && !Array.isArray(body.titleIds)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  // BUG-049 — dedupe + cap
  const ids = capTitleIds(body?.titleIds);
  if (!ids.length) return Response.json({ error: "titleIds required" }, { status: 400 });

  if (body?.action === "status" && body.status && STATUSES.has(body.status)) {
    await db.watchlist.updateMany({ where: { userKey, titleId: { in: ids } }, data: { status: body.status } });
  } else {
    const err = await prismaSafe(() =>
      db.$transaction(ids.map((titleId) => db.watchlist.upsert({ where: { userKey_titleId: { userKey, titleId } }, update: {}, create: { userKey, titleId } }))),
    );
    if (err) return err;
  }
  bust();
  return Response.json({ ok: true, count: ids.length });
}

/** Remove many / clear all. Body: { titleIds?: number[] } */
export async function DELETE(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[] } | null;
  if (body?.titleIds !== undefined && !Array.isArray(body.titleIds)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const ids = capTitleIds(body?.titleIds);
  const r = await db.watchlist.deleteMany({ where: { userKey, ...(ids.length ? { titleId: { in: ids } } : {}) } });
  bust();
  return Response.json({ ok: true, removed: r.count });
}
