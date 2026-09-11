import { cookies } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import { db, ensureRuntimeSchema } from "@/lib/db";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/* v0.10.35 — per-account data spaces (جداسازی داده‌ی حساب‌ها)
 *
 * THE BUG: every piece of personal data (profile, watch history, watchlist,
 * favorites, ratings, collections) is keyed by the `nama_uid` cookie. That
 * cookie is a DEVICE id — assigned once by the proxy and never changed — so
 * when the user signed into a different cloud account, the new account kept
 * seeing the previous account's profile, continue-watching row and collections.
 *
 * THE FIX: each cloud account now owns a dedicated data space (its own
 * userKey) on this device, stored in the AccountSpace table:
 *
 *   attach { accountId }  →  cookie becomes the account's space:
 *     - known account      → its recorded uid (data comes back on re-login)
 *     - first attach AND the current space has data AND no other account
 *       claims it          → ADOPT the current space (seamless upgrade for
 *                            existing users + guest browsing continuity)
 *     - otherwise          → a fresh, deterministic, EMPTY space for that
 *                            account (the reported bug: account B must not
 *                            see account A's stuff)
 *
 *   reset  (sign-out)     →  cookie becomes a brand-new random guest uid, so
 *                            the signed-out UI no longer shows the account's
 *                            personal data. Re-attaching the account restores
 *                            everything (its rows stay in the local DB).
 *
 * The client (LibraryProvider / fullSync) calls this on every session change
 * BEFORE syncing, then reloads personal data. */

const COOKIE = "nama_uid";
const YEAR = 60 * 60 * 24 * 365;
const ACCOUNT_ID_RE = /^[A-Za-z0-9_-]{6,128}$/;

/* C-2 — کلید عمومی سابابیس (public-by-design)؛ فقط برای تأیید توکن کاربر
 * سمت سرور استفاده می‌شود. ثابت‌ها عمداً اینجا تکرار شده‌اند تا زنجیره‌ی
 * import سرور به ماژول‌های مرورگری (cloud.ts) کشیده نشود. */
const SUPABASE_URL = "https://emqsegjeiyimoyncbhfn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_m23eUV8cC-xqhqD-3P6Wsg_U5WsiM3E";

/** C-2 — اثبات مالکیت حساب: توکن دسترسی سابابیس باید به همان accountId
 * برسد؛ وگرنه هر کسی که یک UUID عمومی را بداند می‌توانست فضای داده‌ی
 * حساب را تصاحب کند (کوکیِ نام_uid روی فضای قربانی چرخانده می‌شد). */
async function verifyAccountToken(accessToken: string, accountId: string): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return false;
    const u = (await r.json()) as { id?: string; sub?: string } | null;
    return Boolean(u && (u.id === accountId || u.sub === accountId));
  } catch {
    return false;
  }
}

function accountSpaceUid(accountId: string): string {
  // deterministic per account → re-attaching after a wiped map still lands in
  // the same empty space instead of littering new ones
  return "a" + createHash("sha256").update(`frame:${accountId}`).digest("hex").slice(0, 24);
}

async function spaceHasData(uid: string): Promise<boolean> {
  const [profile, progress, list, favs, ratings, collections] = await Promise.all([
    db.userProfile.findUnique({ where: { userKey: uid }, select: { userKey: true } }),
    db.watchProgress.findFirst({ where: { userKey: uid }, select: { id: true } }),
    db.watchlist.findFirst({ where: { userKey: uid }, select: { id: true } }),
    db.favorite.findFirst({ where: { userKey: uid }, select: { id: true } }),
    db.userRating.findFirst({ where: { userKey: uid }, select: { id: true } }),
    db.userCollection.findFirst({ where: { userKey: uid }, select: { id: true } }),
  ]);
  return Boolean(profile || progress || list || favs || ratings || collections);
}

export async function GET() {
  /* C-2/C-3 — خروجی GET دیگر هرگز خودِ uid را برنمی‌گرداند (خواندنِ آن به
   * کلاینتِ مخرب اجازه‌ی ورود به فضای دیگران را می‌داد). هیچ مصرف‌کننده‌ای
   * در کلاینت دسکتاپ این فیلد را نمی‌خواند (بررسی شد). */
  const store = await cookies();
  const uid = store.get(COOKIE)?.value ?? "guest";
  return Response.json({ ok: true, space: uid === "guest" ? "guest" : "account" });
}

export async function POST(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  const b = (await req.json().catch(() => null)) as
    { accountId?: unknown; reset?: unknown; accessToken?: unknown } | null;
  const store = await cookies();
  const current = store.get(COOKIE)?.value ?? "guest";
  await ensureRuntimeSchema();

  /* sign-out (or any signed-out transition): a fresh guest uid so the
   * signed-out UI starts from an empty personal space — but ONLY when the
   * current space actually belongs to a known account. An already-guest uid
   * (e.g. boot after a previous sign-out) is kept, so data saved while
   * signed out survives restarts. */
  if (b?.reset) {
    const claimed = await db.accountSpace.findFirst({ where: { uid: current } });
    if (!claimed) return Response.json({ ok: true, switched: false });
    const fresh = randomUUID();
    if (fresh !== current) {
      store.set(COOKIE, fresh, { httpOnly: true, sameSite: "lax", path: "/", maxAge: YEAR });
      return Response.json({ ok: true, switched: true });
    }
    return Response.json({ ok: true, switched: false });
  }

  const accountId = typeof b?.accountId === "string" ? b.accountId : "";
  if (!ACCOUNT_ID_RE.test(accountId)) {
    return Response.json({ error: "invalid accountId" }, { status: 400 });
  }

  /* C-2 — چرخاندن فضای داده به یک حساب فقط با اثبات مالکیت: توکن دسترسی
   * سابابیس باید معتبر باشد و به همین accountId برسد. بدون آن → 403
   * (وگرنه POST با accountId قربانی، تصاحب کامل پروفایل/تاریخچه/لیست‌ها
   * بود). reset (خروج) اثبات نمی‌خواهد — چرخش به فضای مهمان نشت نمی‌دهد. */
  const accessToken = typeof b?.accessToken === "string" ? b.accessToken : "";
  if (!accessToken || !(await verifyAccountToken(accessToken, accountId))) {
    return Response.json({ error: "identity_proof_required" }, { status: 403 });
  }

  let target: string;
  const known = await db.accountSpace.findUnique({ where: { accountId } });
  if (known) {
    target = known.uid;
  } else {
    const claimedByOther = await db.accountSpace.findFirst({ where: { uid: current } });
    const adoptable = !claimedByOther && (await spaceHasData(current));
    target = adoptable ? current : accountSpaceUid(accountId);
    // first-writer-wins: a concurrent attach must not flip the mapping
    await db.accountSpace.upsert({ where: { accountId }, update: {}, create: { accountId, uid: target } });
    const settled = await db.accountSpace.findUnique({ where: { accountId } });
    target = settled?.uid ?? target;
  }

  const adopted = known === null && target === current;
  if (target !== current) {
    store.set(COOKIE, target, { httpOnly: true, sameSite: "lax", path: "/", maxAge: YEAR });
    return Response.json({ ok: true, switched: true, adopted });
  }
  return Response.json({ ok: true, switched: false, adopted });
}
