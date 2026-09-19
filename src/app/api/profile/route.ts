import { db, ensureRuntimeSchema } from "@/lib/db";
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

/* S04 (audit v0.49) — تغییر/حذف پین والدین فقط با اثبات پین فعلی. تلاش‌های
 * ناموفق در حافظه‌ی همین پروسه شمرده می‌شوند: ۵ خطا در پنجره‌ی ۱۰ دقیقه‌ای ⇒
 * قفل ۱۰ دقیقه‌ای برای همان userKey. تلاش موفق شمارنده را پاک می‌کند. */
const PIN_ATTEMPTS_WINDOW_MS = 10 * 60_000;
const PIN_ATTEMPTS_MAX = 5;
const PIN_LOCK_MS = 10 * 60_000;
const pinAttempts = new Map<string, { count: number; firstAt: number; lockUntil: number }>();

function pinLocked(userKey: string): boolean {
  const a = pinAttempts.get(userKey);
  return !!a && a.lockUntil > Date.now();
}

function bumpPinAttempts(userKey: string): void {
  const now = Date.now();
  const a = pinAttempts.get(userKey);
  if (!a || now - a.firstAt > PIN_ATTEMPTS_WINDOW_MS) {
    pinAttempts.set(userKey, { count: 1, firstAt: now, lockUntil: 0 });
    return;
  }
  a.count += 1;
  if (a.count >= PIN_ATTEMPTS_MAX) {
    a.lockUntil = now + PIN_LOCK_MS;
    a.count = 0;
    a.firstAt = now;
  }
}

function clearPinAttempts(userKey: string): void {
  pinAttempts.delete(userKey);
}

/* C-18 — رمز والدین هرگز از مرز API خارج نمی‌شود (فقط وجود/عدم وجودش) */
function publicProfile(p: Awaited<ReturnType<typeof getProfile>>) {
  const { parentalPin, ...rest } = p;
  // v0.27.0 (DATA-10) — the stored JSON blob is served as an OBJECT
  let playerPrefs: unknown;
  if (p.playerPrefs) {
    try {
      playerPrefs = JSON.parse(p.playerPrefs);
    } catch {
      playerPrefs = undefined;
    }
  }
  return { ...rest, ...(playerPrefs !== undefined ? { playerPrefs } : {}), hasPin: Boolean(parentalPin) };
}

export async function GET() {
  await ensureRuntimeSchema(); // v0.27.0 — UserProfile.playerPrefs on old DBs
  const userKey = await getUserKey();
  return Response.json(publicProfile(await getProfile(userKey)));
}

export async function PATCH(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  await ensureRuntimeSchema(); // v0.27.0 — UserProfile.playerPrefs on old DBs
  const userKey = await getUserKey();
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "invalid payload" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof b.displayName === "string") data.displayName = b.displayName.trim().slice(0, 40) || "کاربر نما";
  if (typeof b.avatar === "number") data.avatar = Math.max(0, Math.min(11, Math.round(b.avatar)));
  if (b.avatarImage === null) data.avatarImage = null;
  else if (typeof b.avatarImage === "string" && b.avatarImage.length <= AVATAR_IMAGE_MAX && AVATAR_IMAGE_RE.test(b.avatarImage)) data.avatarImage = b.avatarImage;
  for (const k of ["autoplay", "autoNext", "matureContent", "reduceMotion", "skipIntro", "dataSaver", "notifyNewEpisodes", "notifyRecommendations", "notifyContinue", "notifySystem", "kidsMode"] as const) {
    if (typeof b[k] === "boolean") data[k] = b[k];
  }
  if (typeof b.quality === "string" && QUALITIES.has(b.quality)) data.quality = b.quality;
  if (typeof b.subtitle === "string" && SUBS.has(b.subtitle)) data.subtitle = b.subtitle;
  if (typeof b.language === "string" && LANGS.has(b.language)) data.language = b.language;
  if (typeof b.playbackSpeed === "number" && SPEEDS.has(b.playbackSpeed)) data.playbackSpeed = b.playbackSpeed;
  if (typeof b.volume === "number") data.volume = Math.max(0, Math.min(100, Math.round(b.volume)));
  // S04 (audit v0.49) — قبلاً هر body‌ای می‌توانست پین موجود را عوض/حذف کند
  // بدون دانستن پین فعلی. حالا: اگر پینی هست، مقدار currentPin باید عیناً
  // همان باشد؛ در غیر این صورت ۴۰۳ + شمارش تلاش (قفل بعد از ۵ خطا).
  if (typeof b.parentalPin === "string" && (b.parentalPin === "" || /^\d{4}$/.test(b.parentalPin))) {
    const cur = await getProfile(userKey);
    if (cur.parentalPin) {
      if (pinLocked(userKey)) return Response.json({ error: "too many attempts; try later" }, { status: 429 });
      if (b.currentPin !== cur.parentalPin) {
        bumpPinAttempts(userKey);
        return Response.json({ error: "wrong current pin" }, { status: 403 });
      }
      clearPinAttempts(userKey);
    }
    data.parentalPin = b.parentalPin;
  }
  // v0.27.0 (DATA-10) — synced player prefs blob (zoom/sub-delay maps…)
  if (b.playerPrefs && typeof b.playerPrefs === "object") {
    try {
      const pp = JSON.stringify(b.playerPrefs);
      if (pp.length <= 200_000) data.playerPrefs = pp;
    } catch {
      /* ignore malformed */
    }
  }

  await getProfile(userKey);
  const p = await db.userProfile.update({ where: { userKey }, data });
  revalidatePath("/profile");
  revalidatePath("/settings");
  return Response.json(publicProfile(p));
}

/** Danger zone – wipe personal data. Body: { scope: "all" | "history" | "list" | "favorites" | "ratings" }.
 *  D06 (audit v0.49) — scope now MUST be explicit and valid: a broken body or
 *  a missing scope used to fall back to "all" and wipe EVERYTHING. Invalid ⇒ 400, nothing deleted.
 *  D06 — "all" now covers every user-owned table: it also clears
 *  WatchEpisodeProgress, the user's own Reviews and their NotificationEvents
 *  (all three were silently missed before). */
const WIPE_SCOPES = new Set(["all", "history", "list", "favorites", "ratings"]);

export async function DELETE(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  const userKey = await getUserKey();
  const b = (await req.json().catch(() => null)) as { scope?: string } | null;
  const scope = typeof b?.scope === "string" ? b.scope : "";
  if (!WIPE_SCOPES.has(scope)) return Response.json({ error: "invalid scope" }, { status: 400 });
  const ops: Promise<unknown>[] = [];
  if (scope === "all" || scope === "history") {
    ops.push(db.watchProgress.deleteMany({ where: { userKey } }));
    ops.push(db.watchEpisodeProgress.deleteMany({ where: { userKey } })); // D06 — per-episode positions ride with history
  }
  if (scope === "all" || scope === "list") ops.push(db.watchlist.deleteMany({ where: { userKey } }));
  if (scope === "all" || scope === "favorites") ops.push(db.favorite.deleteMany({ where: { userKey } }));
  if (scope === "all" || scope === "ratings") ops.push(db.userRating.deleteMany({ where: { userKey } }));
  if (scope === "all") {
    ops.push(db.userProfile.deleteMany({ where: { userKey } }));
    ops.push(db.review.deleteMany({ where: { userKey } })); // D06 — only rows OWNED by this userKey (legacy null-userKey rows stay)
    ops.push(db.notificationEvent.deleteMany({ where: { userKey } })); // D06
  }
  await Promise.all(ops);
  // v0.13.1 — user collections ride along with the full wipe. Their items
  // cascade in the DB; kept OUT of the Promise.all so item deletion always
  // finishes before/with the parents (no FK race).
  if (scope === "all") await db.userCollection.deleteMany({ where: { userKey } });
  ["/my-list", "/favorites", "/history", "/profile", "/settings"].forEach((p) => revalidatePath(p));
  return Response.json({ ok: true });
}
