import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

  await db.watchProgress.upsert({
    where: { userKey_titleId: { userKey, titleId } },
    update: { position, duration, episodeId },
    create: { userKey, titleId, episodeId, position, duration },
  });

  return Response.json({ ok: true });
}
