import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
  const row = await db.review.create({
    data: { titleId, author, rating, body: text },
  });
  if (body?.slug) revalidatePath(`/title/${body.slug}`);
  return Response.json(row);
}
