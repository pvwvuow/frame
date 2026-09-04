import { db } from "@/db";
import { watchlist } from "@/db/schema";
import { getUserKey } from "@/lib/user";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as { titleId?: number } | null;
  const titleId = Number(body?.titleId);
  if (!titleId) return Response.json({ error: "titleId required" }, { status: 400 });

  const [existing] = await db
    .select({ id: watchlist.id })
    .from(watchlist)
    .where(and(eq(watchlist.userKey, userKey), eq(watchlist.titleId, titleId)))
    .limit(1);

  let inList: boolean;
  if (existing) {
    await db.delete(watchlist).where(eq(watchlist.id, existing.id));
    inList = false;
  } else {
    await db.insert(watchlist).values({ userKey, titleId }).onConflictDoNothing();
    inList = true;
  }
  revalidatePath("/my-list");
  return Response.json({ inList });
}
