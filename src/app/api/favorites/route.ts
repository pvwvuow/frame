import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { sameOriginOrThrow } from "@/lib/api-guard";
import { prismaSafe, capTitleIds } from "@/lib/prisma-safe";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const bust = () => {
  revalidatePath("/favorites");
  revalidatePath("/my-list");
  revalidatePath("/profile");
};

/** Toggle favorite. Body: { titleId } → { isFavorite } */
export async function POST(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; value?: boolean } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });

  const existing = await db.favorite.findUnique({ where: { userKey_titleId: { userKey, titleId } }, select: { id: true } });
  const wanted = typeof body?.value === "boolean" ? body.value : !existing;

  // BUG-048 — `delete` throws P2025 when a concurrent toggle removed the row
  // first (double-tap / merge race); deleteMany is idempotent.
  if (!wanted && existing) {
    await db.favorite.deleteMany({ where: { id: existing.id, userKey } });
  }
  if (wanted && !existing) {
    const err = await prismaSafe(() => db.favorite.create({ data: { userKey, titleId } }));
    if (err) return err; // BUG-010 — bogus/deleted title → 404 JSON, not 500 HTML
  }
  bust();
  return Response.json({ isFavorite: wanted });
}

/** Bulk add. Body: { titleIds: number[] } */
export async function PUT(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[] } | null;
  // C-8 — type-confusion: بدنه‌ی غیرآرایه‌ای نباید سرور را با ۵۰۰ بخواباند
  if (body?.titleIds !== undefined && !Array.isArray(body.titleIds)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  // BUG-049 — dedupe + cap (a duplicated payload used to guarantee a P2002
  // 500 with partial writes; an oversized one exhausted the pool)
  const ids = capTitleIds(body?.titleIds);
  if (!ids.length) return Response.json({ error: "titleIds required" }, { status: 400 });
  const err = await prismaSafe(() =>
    db.$transaction(ids.map((titleId) => db.favorite.upsert({ where: { userKey_titleId: { userKey, titleId } }, update: {}, create: { userKey, titleId } }))),
  );
  if (err) return err;
  bust();
  return Response.json({ ok: true, count: ids.length });
}

/** Remove many / clear all. Body: { titleIds?: number[] } (omit → clear all) */
export async function DELETE(req: Request) {
  const forbidden = sameOriginOrThrow(req);
  if (forbidden) return forbidden;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleIds?: number[] } | null;
  if (body?.titleIds !== undefined && !Array.isArray(body.titleIds)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  // BUG-049 — same cap on the IN clause (SQLite bind-parameter limit)
  const ids = capTitleIds(body?.titleIds);
  const r = await db.favorite.deleteMany({ where: { userKey, ...(ids.length ? { titleId: { in: ids } } : {}) } });
  bust();
  return Response.json({ ok: true, removed: r.count });
}
