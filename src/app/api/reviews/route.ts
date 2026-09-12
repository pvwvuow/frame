import { db, ensureRuntimeSchema } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  await ensureRuntimeSchema();
  const body = (await req.json().catch(() => null)) as {
    titleId?: number;
    slug?: string;
    author?: string;
    rating?: number;
    body?: string;
  } | null;

  const titleId = Number(body?.titleId);
  const author = (body?.author ?? "").trim().slice(0, 80);
  const rating = Math.min(10, Math.max(1, Math.round(Number(body?.rating ?? 0))));
  const text = (body?.body ?? "").trim().slice(0, 2000);
  if (!titleId || !author || !text || !rating) {
    return Response.json({ error: "همه‌ی فیلدها الزامی است" }, { status: 400 });
  }
  // v0.29.0 (NEW-DATA-10) — reviews belong to ONE data space on this device
  const userKey = await getUserKey();
  const row = await db.review.create({
    data: { titleId, author, rating, body: text, userKey },
  });
  if (body?.slug) revalidatePath(`/title/${body.slug}`);
  return Response.json(row);
}
