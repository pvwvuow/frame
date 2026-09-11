import { db, ensureRuntimeSchema } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** v0.18.0 — per-title progress LIST (episodes sheet watched-ticks + progress
 *  bars + the native handoff manifest). v0.27.0 (DATA-7): rows come from the
 *  per-episode table too, so every watched episode gets its own tick. */
export async function GET(req: Request) {
  await ensureRuntimeSchema();
  const userKey = await getUserKey();
  const titleId = Number(new URL(req.url).searchParams.get("titleId"));
  if (!titleId || !Number.isFinite(titleId)) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const [rows, epRows] = await Promise.all([
    db.watchProgress.findMany({
      where: { userKey, titleId },
      select: { episodeId: true, position: true, duration: true },
    }),
    db.watchEpisodeProgress.findMany({
      where: { userKey, titleId },
      select: { episodeId: true, position: true, duration: true },
    }).catch(() => []),
  ]);
  const merged = new Map<string, { episodeId: number | null; position: number; duration: number }>();
  for (const r of [...rows, ...epRows]) {
    merged.set(`${r.episodeId ?? "t"}`, { episodeId: r.episodeId ?? null, position: r.position, duration: r.duration });
  }
  return Response.json({
    progress: [...merged.values()].map((r) => ({
      episodeId: r.episodeId,
      position: r.position,
      duration: r.duration,
    })),
  });
}

export async function POST(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  await ensureRuntimeSchema();
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

  // v0.27.0 (DATA-7) — the per-EPISODE row too: finishing S02E01 no longer
  // erases S01E03. The title row above stays the continue-watching pointer.
  if (epId) {
    await db.watchEpisodeProgress.upsert({
      where: { userKey_titleId_episodeId: { userKey, titleId, episodeId: epId } },
      update: { position: pos, duration: dur },
      create: { userKey, titleId, episodeId: epId, position: pos, duration: dur },
    });
  }

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
  // v0.27.0 (DATA-7) — the per-episode rows ride along
  await db.watchEpisodeProgress.deleteMany({ where: { userKey, ...(ids.length ? { titleId: { in: ids } } : {}) } }).catch(() => undefined);
  return Response.json({ ok: true, removed: r.count });
}
