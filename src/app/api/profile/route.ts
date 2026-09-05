import { db } from "@/lib/db";
import { getProfile } from "@/lib/library";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const QUALITIES = new Set(["auto", "4k", "1080p", "720p", "480p"]);
const SUBS = new Set(["fa", "en", "off"]);

export async function GET() {
  const userKey = await getUserKey();
  return Response.json(await getProfile(userKey));
}

export async function PATCH(req: Request) {
  const userKey = await getUserKey();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "invalid payload" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof b.displayName === "string") data.displayName = b.displayName.trim().slice(0, 40) || "کاربر نما";
  if (typeof b.avatar === "number") data.avatar = Math.max(0, Math.min(11, Math.round(b.avatar)));
  for (const k of ["autoplay", "autoNext", "matureContent", "reduceMotion"] as const) {
    if (typeof b[k] === "boolean") data[k] = b[k];
  }
  if (typeof b.quality === "string" && QUALITIES.has(b.quality)) data.quality = b.quality;
  if (typeof b.subtitle === "string" && SUBS.has(b.subtitle)) data.subtitle = b.subtitle;

  await getProfile(userKey);
  const p = await db.userProfile.update({ where: { userKey }, data });
  revalidatePath("/profile");
  revalidatePath("/settings");
  return Response.json(p);
}

/** Danger zone – wipe all personal data. Body: { scope: "all" | "history" | "list" | "favorites" | "ratings" } */
export async function DELETE(req: Request) {
  const userKey = await getUserKey();
  const b = (await req.json().catch(() => null)) as { scope?: string } | null;
  const scope = b?.scope ?? "all";
  const ops: Promise<unknown>[] = [];
  if (scope === "all" || scope === "history") ops.push(db.watchProgress.deleteMany({ where: { userKey } }));
  if (scope === "all" || scope === "list") ops.push(db.watchlist.deleteMany({ where: { userKey } }));
  if (scope === "all" || scope === "favorites") ops.push(db.favorite.deleteMany({ where: { userKey } }));
  if (scope === "all" || scope === "ratings") ops.push(db.userRating.deleteMany({ where: { userKey } }));
  if (scope === "all") ops.push(db.userProfile.deleteMany({ where: { userKey } }));
  await Promise.all(ops);
  ["/my-list", "/favorites", "/history", "/profile", "/settings"].forEach((p) => revalidatePath(p));
  return Response.json({ ok: true });
}
