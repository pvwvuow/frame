import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

/** Set personal score. Body: { titleId, score: 0-10 } (0 removes) */
export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number; score?: number } | null;
  const titleId = Number(body?.titleId);
  const score = Math.round(Number(body?.score ?? 0));
  if (!titleId || !Number.isFinite(score) || score < 0 || score > 10) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  if (score === 0) {
    await db.userRating.deleteMany({ where: { userKey, titleId } });
    return Response.json({ score: null });
  }
  await db.userRating.upsert({
    where: { userKey_titleId: { userKey, titleId } },
    update: { score },
    create: { userKey, titleId, score },
  });
  return Response.json({ score });
}
