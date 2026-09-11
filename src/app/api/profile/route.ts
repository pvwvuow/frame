import { db } from "@/lib/db";
import { getProfile } from "@/lib/library";
import { getUserKey } from "@/lib/user";
import { revalidatePath } from "next/cache";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const QUALITIES = new Set(["auto", "4k", "1080p", "720p", "480p"]);
const SUBS = new Set(["fa", "en", "off"]);
const LANGS = new Set(["fa", "en"]);
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
/** آواتار آپلودی فقط به شکل data URL تصویر پذیرفته می‌شود (کلاینت به ۳۲۰×۳۲۰ JPEG کوچک می‌کند). */
const AVATAR_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_IMAGE_MAX = 400_000; // ~300KB binary — 15× بزرگ‌تر از خروجی معمول کلاینت

/* C-18 — رمز والدین هرگز از مرز API خارج نمی‌شود (فقط وجود/عدم وجودش) */
function publicProfile(p: Awaited<ReturnType<typeof getProfile>>) {
  const { parentalPin, ...rest } = p;
  return { ...rest, hasPin: Boolean(parentalPin) };
}

export async function GET() {
  const userKey = await getUserKey();
  return Response.json(publicProfile(await getProfile(userKey)));
}

export async function PATCH(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  const userKey = await getUserKey();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "invalid payload" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof b.displayName === "string") data.displayName = b.displayName.trim().slice(0, 40) || "کاربر نما";
  if (typeof b.avatar === "number") data.avatar = Math.max(0, Math.min(11, Math.round(b.avatar)));
  if (b.avatarImage === null) data.avatarImage = null;
  else if (typeof b.avatarImage === "string" && b.avatarImage.length <= AVATAR_IMAGE_MAX && AVATAR_IMAGE_RE.test(b.avatarImage)) data.avatarImage = b.avatarImage;
  for (const k of ["autoplay", "autoNext", "matureContent", "reduceMotion", "skipIntro", "dataSaver", "notifyNewEpisodes", "notifyRecommendations", "notifyContinue", "kidsMode"] as const) {
    if (typeof b[k] === "boolean") data[k] = b[k];
  }
  if (typeof b.quality === "string" && QUALITIES.has(b.quality)) data.quality = b.quality;
  if (typeof b.subtitle === "string" && SUBS.has(b.subtitle)) data.subtitle = b.subtitle;
  if (typeof b.language === "string" && LANGS.has(b.language)) data.language = b.language;
  if (typeof b.playbackSpeed === "number" && SPEEDS.has(b.playbackSpeed)) data.playbackSpeed = b.playbackSpeed;
  if (typeof b.volume === "number") data.volume = Math.max(0, Math.min(100, Math.round(b.volume)));
  if (typeof b.parentalPin === "string" && (b.parentalPin === "" || /^\d{4}$/.test(b.parentalPin))) data.parentalPin = b.parentalPin;

  await getProfile(userKey);
  const p = await db.userProfile.update({ where: { userKey }, data });
  revalidatePath("/profile");
  revalidatePath("/settings");
  return Response.json(publicProfile(p));
}

/** Danger zone – wipe all personal data. Body: { scope: "all" | "history" | "list" | "favorites" | "ratings" } */
export async function DELETE(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
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
  // v0.13.1 — user collections ride along with the full wipe. Their items
  // cascade in the DB; kept OUT of the Promise.all so item deletion always
  // finishes before/with the parents (no FK race).
  if (scope === "all") await db.userCollection.deleteMany({ where: { userKey } });
  ["/my-list", "/favorites", "/history", "/profile", "/settings"].forEach((p) => revalidatePath(p));
  return Response.json({ ok: true });
}
