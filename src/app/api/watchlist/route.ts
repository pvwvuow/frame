import { db } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });

  const existing = await db.watchlist.findUnique({
    where: { userKey_titleId: { userKey, titleId } },
    select: { id: true },
  });

  let inList: boolean;
  if (existing) {
    await db.watchlist.delete({ where: { id: existing.id } });
    inList = false;
  } else {
    try {
      await db.watchlist.create({ data: { userKey, titleId } });
    } catch {
      /* already exists */
    }
    inList = true;
  }
  revalidatePath("/my-list");
  return Response.json({ inList });
}
