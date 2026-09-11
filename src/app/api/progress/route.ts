import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** v0.18.0 — per-title progress LIST (episodes sheet watched-ticks + progress
 *  bars + the native handoff manifest). One row per watched episode. */
export async function GET(req: Request) {
  const userKey = await getUserKey();
  const titleId = Number(new URL(req.url).searchParams.get("titleId"));
  if (!titleId || !Number.isFinite(titleId)) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const rows = await db.watchProgress.findMany({
    where: { userKey, titleId },
    select: { episodeId: true, position: true, duration: true },
  });
  return Response.json({
    progress: rows.map((r) => ({
      episodeId: r.episodeId,
      position: r.position,
      duration: r.duration,
    })),
  });
}

export async function POST(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as {
    titleId?: number;
    episodeId?: number | null;
    position?: number;
    duration?: number;
  } | null;

  const titleId = Number(body?.titleId);
  const position = Number(body?.position ?? 0);
  const duration = Number(body?.duration ?? 0);
  const episodeId = body?.episodeId ? Number(body.episodeId) : null;
  if (!titleId || !Number.isFinite(position) || !Number.isFinite(duration)) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  /* C-20 — سقف منطقی مقادیر (۱e308 قبلاً پاس می‌شد) + اتصال episodeId به
   * titleId: اپیزودِ حساب دیگری نباید در ادامه‌ی تماشای این عنوان بنشیند. */
  const pos = Math.max(0, Math.min(position, 86_400 * 20));
  const dur = Math.max(0, Math.min(duration, 86_400 * 20));
  let epId: number | null = null;
  if (episodeId) {
    const ep = await db.episode.findFirst({ where: { id: episodeId, titleId }, select: { id: true } });
    epId = ep?.id ?? null;
  }

  await db.watchProgress.upsert({
    where: { userKey_titleId: { userKey, titleId } },
    update: { position: pos, duration: dur, episodeId: epId },
    create: { userKey, titleId, episodeId: epId, position: pos, duration: dur },
  });

  return Response.json({ ok: true });
}

/** Remove one entry from history or clear everything. Body: { titleId?: number } */
export async function DELETE(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; titleIds?: number[] } | null;
  const ids = Array.isArray(body?.titleIds)
    ? body.titleIds.map(Number).filter(Boolean).slice(0, 1000)
    : body?.titleId
      ? [Number(body.titleId)]
      : [];
  const r = await db.watchProgress.deleteMany({ where: { userKey, ...(ids.length ? { titleId: { in: ids } } : {}) } });
  return Response.json({ ok: true, removed: r.count });
}
