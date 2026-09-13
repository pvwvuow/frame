import { db, ensureRuntimeSchema } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { getProfile } from "@/lib/library";
import { watchHref } from "@/lib/links";
import { faDigits } from "@/lib/format";

/* v0.31.0 (NOTIF-1) — LOCAL NOTIFICATION ENGINE
 *
 * The old implementation re-derived notifications on every GET from the live
 * catalog and FAKED their timestamps (now − 2..22h) — nothing was persisted,
 * nothing was really "new", there was no grouping, no read state, no expiry
 * and no way to ever push to the Android status bar.
 *
 * The engine below BUILDS events into the NotificationEvent table by
 * comparing the user's snapshot (max known episode id per series) against the
 * catalog, then the UI simply reads the stored events:
 *
 *   1) قسمت‌های جدید — series the user is watching (progress) or has in the
 *      watchlist (status ≠ watched): episodes whose id is past the snapshot
 *      max are NEW; grouped per title+season into ONE event
 *      («۳ قسمت جدید از X») whose click lands on the earliest new episode.
 *   2) ادامه تماشا — progress rows parked between 2% and 95% for >72h get a
 *      single reminder per title+episode (72h rate limit is inherent: the
 *      row's updatedAt only satisfies the rule 72h after the last pause).
 *   3) system — Frame's own notices (welcome).
 *
 * Anti-spam is structural:
 *   • deterministic ids (ep:{titleId}:{season}:{maxNewId}) + upsert → a
 *     re-scan NEVER duplicates an event;
 *   • first scan for an account only SEEDS the snapshot (baseline) so the
 *     whole catalog is not announced as «new» on upgrade;
 *   • unread events expire after 30 days, read ones 7 days after reading;
 *   • the status-bar dispatcher (client, Android only) applies the daily cap,
 *     quiet hours and per-category switches — the in-app center is complete.
 */

export type Notification = {
  id: string;
  kind: "episode" | "continue" | "system";
  title: string;
  body: string;
  href: string;
  image?: string;
  at: string; // ISO — the moment the engine CREATED the event
  read: boolean;
  /** episode events: how many new episodes this single card groups */
  count?: number;
};

export type NotificationPush = {
  id: string;
  kind: "episode" | "continue" | "system";
  title: string;
  body: string;
  href: string;
  image?: string;
};

const CONTINUE_AFTER_MS = 72 * 60 * 60 * 1000; // 72h پارک شده
const UNREAD_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 روز
const READ_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 روز بعد از خواندن
const SCAN_THROTTLE_MS = 10 * 60 * 1000; // اسکن خودکار حداکثر هر ۱۰ دقیقه

type Snapshot = { maxEp: Record<string, number> };

const snapKey = (userKey: string) => `notif:snap:${userKey}`;
const scanKey = (userKey: string) => `notif:scan:${userKey}`;

function safeParse<T>(raw: string | null | undefined, fb: T): T {
  try {
    return JSON.parse(raw ?? "") as T;
  } catch {
    return fb;
  }
}

/** «۵، ۶ و ۸» از [5,6,8] — اعداد فارسی، جداکننده‌ی آخر « و » */
function faList(nums: number[]): string {
  const s = nums.map((n) => faDigits(n));
  if (s.length <= 1) return s[0] ?? "";
  return s.slice(0, -1).join("، ") + " و " + s[s.length - 1];
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * اسکن محلی برای یک حساب. هر بار اجرا:
 *  ۱) سریال‌های کاندید = لیست من (غیر watched) ∪ دارای پیشرفت تماشا
 *  ۲) نسبت به اسنپ‌شات (بیشینه‌ی id قسمت دیده‌شده‌ی هر سریال) قسمت‌های تازه را پیدا می‌کند
 *  ۳) به‌ازای هر فصل یک رویداد گروهی می‌سازد
 *  ۴) یادآوری‌های ادامه تماشا (>72h، ۲٪..۹۵٪) را تازه می‌کند
 *  ۵) اسنپ‌شات را به‌روز می‌کند
 * اولین اجرا فقط baseline می‌سازد و اعلانی نمی‌سازد.
 */
export async function runScan(userKey: string): Promise<void> {
  await ensureRuntimeSchema();
  const [profile, list, progress] = await Promise.all([
    getProfile(userKey),
    db.watchlist.findMany({ where: { userKey }, include: { title: true } }),
    db.watchProgress.findMany({ where: { userKey }, include: { title: true } }),
  ]);
  const now = Date.now();
  const nowDate = new Date();
  const expires = new Date(now + UNREAD_TTL_MS);

  // سریال‌های «تمام‌شده» از هر دو دسته خارج می‌شوند
  const watched = new Set(list.filter((r) => r.status === "watched").map((r) => r.titleId));

  const series = new Map<number, { slug: string; name: string; poster: string; backdrop: string }>();
  for (const r of list) {
    if (r.title.type === "series" && !watched.has(r.titleId)) {
      series.set(r.titleId, { slug: r.title.slug, name: r.title.title, poster: r.title.poster, backdrop: r.title.backdrop });
    }
  }
  for (const p of progress) {
    if (p.title.type === "series" && !watched.has(p.titleId) && !series.has(p.titleId)) {
      series.set(p.titleId, { slug: p.title.slug, name: p.title.title, poster: p.title.poster, backdrop: p.title.backdrop });
    }
  }
  const ids = [...series.keys()];

  // snapshot
  const prevRow = await db.syncState.findUnique({ where: { key: snapKey(userKey) } });
  const prev: Snapshot = safeParse(prevRow?.value, { maxEp: {} });
  const firstRun = !prevRow;
  const next: Snapshot = { maxEp: { ...prev.maxEp } };

  // --- 1) قسمت‌های جدید ---
  if (profile.notifyNewEpisodes && ids.length) {
    const maxes = await db.episode.groupBy({ by: ["titleId"], _max: { id: true }, where: { titleId: { in: ids } } });
    for (const m of maxes) {
      const max = m._max.id;
      if (max == null) continue;
      const tid = m.titleId;
      const known = next.maxEp[String(tid)];
      next.maxEp[String(tid)] = Math.max(known ?? 0, max);
      if (firstRun || known == null || max <= known) continue; // baseline / بی‌تغییر

      const newEps = await db.episode.findMany({
        where: { titleId: tid, id: { gt: known } },
        orderBy: [{ season: "asc" }, { number: "asc" }],
      });
      const t = series.get(tid);
      if (!t || !newEps.length) continue;
      const bySeason = new Map<number, typeof newEps>();
      for (const e of newEps) {
        const arr = bySeason.get(e.season) ?? [];
        arr.push(e);
        bySeason.set(e.season, arr);
      }
      for (const [season, eps] of bySeason) {
        const numbers = eps.map((e) => e.number);
        const maxId = Math.max(...eps.map((e) => e.id));
        const first = eps[0];
        const count = eps.length;
        const evId = `ep:${tid}:${season}:${maxId}`;
        const title = count === 1 ? `قسمت ${faDigits(numbers[0])} فصل ${faDigits(season)} «${t.name}»` : `${faDigits(count)} قسمت جدید از «${t.name}»`;
        const body = count === 1 ? first.name || "همین حالا قابل تماشاست" : `فصل ${faDigits(season)} · قسمت‌های ${faList(numbers)}`;
        const data = JSON.stringify({ season, numbers, epIds: eps.map((e) => e.id), count });
        await db.notificationEvent.upsert({
          where: { id: evId },
          create: { id: evId, userKey, kind: "episode", titleId: tid, title, body, href: watchHref(t.slug, first.id), image: first.thumbnail || t.poster, data, createdAt: nowDate, expiresAt: expires },
          update: { title, body, href: watchHref(t.slug, first.id), image: first.thumbnail || t.poster, data },
        });
      }
    }
  }

  // --- 2) ادامه تماشا ---
  if (profile.notifyContinue) {
    const rows = progress.filter((p) => !watched.has(p.titleId));
    // شماره‌ی قسمت‌های نیمه‌کاره برای متن رویداد (یک کوئری برای همه)
    const epIds = [...new Set(rows.map((p) => p.episodeId).filter((x): x is number => x != null))];
    const epNum = new Map<number, { number: number; season: number }>();
    if (epIds.length) {
      const eps = await db.episode.findMany({ where: { id: { in: epIds } }, select: { id: true, number: true, season: true } });
      for (const e of eps) epNum.set(e.id, { number: e.number, season: e.season });
    }
    for (const p of rows) {
      const dur = p.duration || 0;
      const pos = p.position || 0;
      if (dur <= 0 || pos <= 0) continue;
      const pct = pos / dur;
      if (pct < 0.02 || pct >= 0.95) continue;
      if (now - +new Date(p.updatedAt) < CONTINUE_AFTER_MS) continue;
      const t = p.title;
      const pctText = `${faDigits(Math.round(pct * 100))}٪`;
      const evId = `cont:${p.titleId}:${p.episodeId ?? 0}`;
      const title = `ادامه‌ی «${t.title}»`;
      const ep = p.episodeId != null ? epNum.get(p.episodeId) : undefined;
      const body = ep ? `قسمت ${faDigits(ep.number)} فصل ${faDigits(ep.season)} · ${pctText} دیده‌اید؛ از همان‌جا ادامه بده` : `${pctText} دیده‌اید؛ از همان‌جا ادامه بده`;
      const data = JSON.stringify({ pct: Math.round(pct * 100) });
      await db.notificationEvent.upsert({
        where: { id: evId },
        create: { id: evId, userKey, kind: "continue", titleId: p.titleId, title, body, href: watchHref(t.slug, p.episodeId), image: t.backdrop || t.poster, data, createdAt: nowDate, expiresAt: expires },
        update: { title, body, href: watchHref(t.slug, p.episodeId), image: t.backdrop || t.poster, data },
      });
    }
  }

  // --- 3) خوش‌آمد (یک‌بار برای همیشه) ---
  if (profile.notifySystem) {
    const evId = `sys:${userKey}`;
    const exists = await db.notificationEvent.findUnique({ where: { id: evId }, select: { id: true } });
    if (!exists) {
      await db.notificationEvent.create({
        data: { id: evId, userKey, kind: "system", titleId: null, title: "به فریم خوش آمدید", body: "از تنظیمات می‌توانید نوع اعلان‌هایی که دریافت می‌کنید را شخصی‌سازی کنید.", href: "/settings#notifications", image: null, data: "{}", createdAt: nowDate, expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000) },
      });
    }
  }

  await db.syncState.upsert({ where: { key: snapKey(userKey) }, update: { value: JSON.stringify(next) }, create: { key: snapKey(userKey), value: JSON.stringify(next) } });
}

/** اسکن برای همه‌ی حساب‌های شناخته‌شده روی دستگاه — بعد از پایان همگام‌سازی کاتالوگ. */
export async function scanAllUsers(): Promise<void> {
  await ensureRuntimeSchema();
  const [ps, ws, prs] = await Promise.all([
    db.userProfile.findMany({ select: { userKey: true } }),
    db.watchlist.findMany({ distinct: ["userKey"], select: { userKey: true } }),
    db.watchProgress.findMany({ distinct: ["userKey"], select: { userKey: true } }),
  ]);
  const users = new Set<string>();
  for (const x of [...ps, ...ws, ...prs]) if (x.userKey) users.add(x.userKey);
  for (const u of users) {
    try {
      await runScan(u);
    } catch (e) {
      console.error("[notif] scan failed for", u, e);
    }
  }
}

/** GET سالم: اسکن خودکار ولی محدودشده (حداکثر هر ۱۰ دقیقه برای هر حساب). */
export async function maybeScan(userKey: string): Promise<void> {
  await ensureRuntimeSchema();
  const last = await db.syncState.findUnique({ where: { key: scanKey(userKey) } }).catch(() => null);
  const at = last ? Number(last.value) || 0 : 0;
  if (Date.now() - at < SCAN_THROTTLE_MS) return;
  await db.syncState.upsert({ where: { key: scanKey(userKey) }, update: { value: String(Date.now()) }, create: { key: scanKey(userKey), value: String(Date.now()) } });
  try {
    await runScan(userKey);
  } catch (e) {
    console.error("[notif] throttled scan failed:", e);
  }
}

/* ------------------------------------------------------------------ */
/* Read model                                                          */
/* ------------------------------------------------------------------ */

/** انقضا: خوانده‌نشده ۳۰ روز، خوانده‌شده ۷ روز بعد از خواندن. */
async function purgeExpired(userKey: string): Promise<void> {
  const now = Date.now();
  await db.notificationEvent.deleteMany({
    where: {
      userKey,
      OR: [{ readAt: { not: null, lt: new Date(now - READ_TTL_MS) } }, { readAt: null, createdAt: { lt: new Date(now - UNREAD_TTL_MS) } }],
    },
  });
}

export async function getNotifications(userKey: string): Promise<Notification[]> {
  await ensureSeeded();
  await ensureRuntimeSchema();
  await purgeExpired(userKey);
  const rows = await db.notificationEvent.findMany({ where: { userKey }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => {
    const data = safeParse<{ count?: number }>(r.data, {});
    return {
      id: r.id,
      kind: (r.kind === "episode" || r.kind === "continue" ? r.kind : "system") as Notification["kind"],
      title: r.title,
      body: r.body,
      href: r.href,
      image: r.image ?? undefined,
      at: new Date(r.createdAt).toISOString(),
      read: r.readAt != null,
      count: data.count,
    };
  });
}

/** متن رویدادها برای نوتیفیکیشن استاتوس‌بار (فقط تازه‌ها، در same shape). */
export function toPush(items: Notification[], withinMs = 5 * 60 * 1000): NotificationPush[] {
  const min = Date.now() - withinMs;
  return items
    .filter((n) => !n.read && +new Date(n.at) >= min)
    .map(({ id, kind, title, body, href, image }) => ({ id, kind, title, body, href, image }));
}
