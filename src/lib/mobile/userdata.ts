/* Mobile user-data layer — mirrors src/lib/library.ts + src/lib/notifications.ts
 * on top of Dexie. Every response shape matches the desktop API routes so the
 * existing client components (LibraryProvider, SettingsForm, HistoryList…)
 * keep working through the fetch shim unchanged. */

import { db, episodeId, getEpisodes, getFullTitle, getTitleLiteBySlug, type LiteTitle } from "./db";
import { LIST_STATUSES, type ListStatus } from "@/lib/library-shared";
import type { TitleView } from "./db";
import { titleHref, watchHref } from "@/lib/mobile-links";

export { LIST_STATUSES };
export type { ListStatus };

const json = (v: unknown, fb: string) => {
  try { const p = JSON.parse(v as string); return Array.isArray(p) ? p : fb ? JSON.parse(fb) : []; } catch { return []; }
};

/** userKey from the same cookie the desktop server reads (nama_uid). */
export function getUserKey(): string {
  if (typeof document === "undefined") return "guest";
  const m = document.cookie.match(/(?:^|;\s*)nama_uid=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "guest";
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export type ProfileRow = {
  userKey: string;
  displayName: string;
  avatar: number;
  avatarImage: string | null;
  autoplay: boolean;
  autoNext: boolean;
  quality: string;
  subtitle: string;
  matureContent: boolean;
  reduceMotion: boolean;
  skipIntro: boolean;
  playbackSpeed: number;
  volume: number;
  dataSaver: boolean;
  notifyNewEpisodes: boolean;
  notifyRecommendations: boolean;
  notifyContinue: boolean;
  kidsMode: boolean;
  parentalPin: string;
  language: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_PROFILE = (userKey: string): ProfileRow => ({
  userKey,
  displayName: "کاربر نما",
  avatar: 0,
  avatarImage: null,
  autoplay: true,
  autoNext: true,
  quality: "auto",
  subtitle: "fa",
  matureContent: true,
  reduceMotion: false,
  skipIntro: true,
  playbackSpeed: 1,
  volume: 80,
  dataSaver: false,
  notifyNewEpisodes: true,
  notifyRecommendations: true,
  notifyContinue: true,
  kidsMode: false,
  parentalPin: "",
  language: "fa",
  createdAt: now(),
  updatedAt: now(),
});

export async function getProfile(userKey = getUserKey()): Promise<ProfileRow> {
  const row = await db.profiles.get(userKey);
  if (row) return { ...DEFAULT_PROFILE(userKey), ...(row as object) } as ProfileRow;
  const fresh = DEFAULT_PROFILE(userKey);
  await db.profiles.put({ ...fresh } as Record<string, unknown>);
  return fresh;
}

const QUALITIES = new Set(["auto", "4k", "1080p", "720p", "480p"]);
const SUBS = new Set(["fa", "en", "off"]);
const LANGS = new Set(["fa", "en"]);
const SPEEDS = new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

export async function patchProfile(b: Record<string, unknown>, userKey = getUserKey()): Promise<ProfileRow> {
  const cur = await getProfile(userKey);
  const next: ProfileRow = { ...cur, updatedAt: now() };
  if (typeof b.displayName === "string") next.displayName = b.displayName.trim().slice(0, 40) || "کاربر نما";
  if (typeof b.avatar === "number") next.avatar = Math.max(0, Math.min(11, Math.round(b.avatar)));
  if (b.avatarImage === null) next.avatarImage = null;
  else if (typeof b.avatarImage === "string" && b.avatarImage.length <= 400_000 && /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(b.avatarImage)) next.avatarImage = b.avatarImage;
  for (const k of ["autoplay", "autoNext", "matureContent", "reduceMotion", "skipIntro", "dataSaver", "notifyNewEpisodes", "notifyRecommendations", "notifyContinue", "kidsMode"] as const) {
    if (typeof b[k] === "boolean") next[k] = b[k] as boolean;
  }
  if (typeof b.quality === "string" && QUALITIES.has(b.quality)) next.quality = b.quality;
  if (typeof b.subtitle === "string" && SUBS.has(b.subtitle)) next.subtitle = b.subtitle;
  if (typeof b.language === "string" && LANGS.has(b.language)) next.language = b.language;
  if (typeof b.playbackSpeed === "number" && SPEEDS.has(b.playbackSpeed)) next.playbackSpeed = b.playbackSpeed;
  if (typeof b.volume === "number") next.volume = Math.max(0, Math.min(100, Math.round(b.volume)));
  if (typeof b.parentalPin === "string" && (b.parentalPin === "" || /^\d{4}$/.test(b.parentalPin))) next.parentalPin = b.parentalPin;
  await db.profiles.put({ ...next } as Record<string, unknown>);
  return next;
}

export async function wipeProfile(scope: string, userKey = getUserKey()): Promise<void> {
  const ops: Promise<unknown>[] = [];
  if (scope === "all" || scope === "history") ops.push(db.progress.where("userKey").equals(userKey).delete());
  if (scope === "all" || scope === "list") ops.push(db.watchlist.where("userKey").equals(userKey).delete());
  if (scope === "all" || scope === "favorites") ops.push(db.favorites.where("userKey").equals(userKey).delete());
  if (scope === "all" || scope === "ratings") ops.push(db.ratings.where("userKey").equals(userKey).delete());
  if (scope === "all") ops.push(db.profiles.delete(userKey));
  await Promise.all(ops);
}

/* ------------------------------------------------------------------ */
/* Snapshot (GET /api/library)                                         */
/* ------------------------------------------------------------------ */

export type LibrarySnapshot = {
  watchlist: { titleId: number; status: ListStatus }[];
  favorites: number[];
  ratings: { titleId: number; score: number }[];
  profile: { displayName: string; avatar: number; avatarImage: string | null; reduceMotion: boolean; kidsMode: boolean; hasPin: boolean };
};

export async function getLibrarySnapshot(userKey = getUserKey()): Promise<LibrarySnapshot> {
  const user = userKey || "guest";
  const [wl, fav, rt, profile] = await Promise.all([
    db.watchlist.where("userKey").equals(user).toArray(),
    db.favorites.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).toArray(),
    getProfile(user),
  ]);
  return {
    watchlist: wl.map((w) => ({ titleId: Number(w.titleId), status: String(w.status) as ListStatus })),
    favorites: fav.map((f) => Number(f.titleId)),
    ratings: rt.map((r) => ({ titleId: Number(r.titleId), score: Number(r.score) })),
    profile: {
      displayName: profile.displayName,
      avatar: profile.avatar,
      avatarImage: profile.avatarImage ?? null,
      reduceMotion: profile.reduceMotion,
      kidsMode: profile.kidsMode,
      hasPin: !!profile.parentalPin,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */

export async function toggleFavorite(titleId: number, value?: boolean, userKey = getUserKey()): Promise<boolean> {
  const user = userKey || "guest";
  const existing = await db.favorites.where("[userKey+titleId]").equals([user, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (!wanted && existing) await db.favorites.delete((existing as { id: number }).id);
  if (wanted && !existing) await db.favorites.add({ userKey: user, titleId, createdAt: now() });
  return wanted;
}

export async function addFavorites(titleIds: number[], userKey = getUserKey()): Promise<void> {
  const user = userKey || "guest";
  const have = new Set((await db.favorites.where("userKey").equals(user).toArray()).map((f) => Number(f.titleId)));
  const rows = titleIds.filter((id) => !have.has(id)).map((titleId) => ({ userKey: user, titleId, createdAt: now() }));
  if (rows.length) await db.favorites.bulkAdd(rows);
}

export async function removeFavorites(titleIds?: number[], userKey = getUserKey()): Promise<void> {
  const user = userKey || "guest";
  if (!titleIds?.length) {
    await db.favorites.where("userKey").equals(user).delete();
    return;
  }
  for (const id of titleIds) {
    const row = await db.favorites.where("[userKey+titleId]").equals([user, id]).first();
    if (row) await db.favorites.delete((row as { id: number }).id);
  }
}

export async function isFavorite(titleId: number, userKey = getUserKey()): Promise<boolean> {
  const user = userKey || "guest";
  return (await db.favorites.where("[userKey+titleId]").equals([user, titleId]).count()) > 0;
}

/* ------------------------------------------------------------------ */
/* Watchlist                                                           */
/* ------------------------------------------------------------------ */

const STATUSES = new Set(["planned", "watching", "watched"]);

export async function toggleWatchlist(titleId: number, value?: boolean, userKey = getUserKey()): Promise<boolean> {
  const user = userKey || "guest";
  const existing = await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (!wanted && existing) await db.watchlist.delete((existing as { id: number }).id);
  if (wanted && !existing) await db.watchlist.add({ userKey: user, titleId, status: "planned", note: "", pinned: false, createdAt: now(), updatedAt: now() });
  return wanted;
}

export async function patchWatchlist(
  b: { titleId: number; status?: string; note?: string; pinned?: boolean; plannedDate?: string | null },
  userKey = getUserKey()
): Promise<void> {
  const user = userKey || "guest";
  const existing = await db.watchlist.where("[userKey+titleId]").equals([user, b.titleId]).first();
  const base = (existing as Record<string, unknown> | undefined) ?? { userKey: user, titleId: b.titleId, status: "planned", note: "", pinned: false, createdAt: now() };
  const next = { ...base, updatedAt: now() } as Record<string, unknown>;
  if (b.status && STATUSES.has(b.status)) next.status = b.status;
  if (typeof b.note === "string") next.note = b.note.slice(0, 500);
  if (typeof b.pinned === "boolean") next.pinned = b.pinned;
  if (b.plannedDate !== undefined) next.plannedDate = b.plannedDate || null;
  if (existing) await db.watchlist.put(next);
  else await db.watchlist.add(next);
}

export async function removeWatchlist(titleId?: number, userKey = getUserKey()): Promise<void> {
  const user = userKey || "guest";
  if (!titleId) return;
  const row = await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first();
  if (row) await db.watchlist.delete((row as { id: number }).id);
}

export async function isInWatchlist(titleId: number, userKey = getUserKey()): Promise<boolean> {
  const user = userKey || "guest";
  return (await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).count()) > 0;
}

export async function getWatchlistIds(userKey = getUserKey()): Promise<number[]> {
  const user = userKey || "guest";
  const rows = await db.watchlist.where("userKey").equals(user).toArray();
  return rows.map((r) => Number(r.titleId));
}

/* ------------------------------------------------------------------ */
/* Progress / history                                                  */
/* ------------------------------------------------------------------ */

export type ProgressRow = { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string };

export async function upsertProgress(
  b: { titleId: number; episodeId?: number | null; position: number; duration: number },
  userKey = getUserKey()
): Promise<void> {
  const user = userKey || "guest";
  const existing = await db.progress.where("[userKey+titleId]").equals([user, b.titleId]).first();
  const row = { userKey: user, titleId: b.titleId, episodeId: b.episodeId ? Number(b.episodeId) : null, position: b.position, duration: b.duration, updatedAt: now() };
  if (existing) await db.progress.put({ ...row, id: (existing as { id: number }).id });
  else await db.progress.add(row);
}

export async function getProgressFor(titleId: number, userKey = getUserKey()): Promise<ProgressRow | null> {
  const user = userKey || "guest";
  const row = await db.progress.where("[userKey+titleId]").equals([user, titleId]).first();
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return { titleId: Number(r.titleId), episodeId: (r.episodeId as number | null) ?? null, position: Number(r.position), duration: Number(r.duration), updatedAt: String(r.updatedAt) };
}

export async function getProgressMap(titleIds: number[], userKey = getUserKey()): Promise<Map<number, { position: number; duration: number }>> {
  const user = userKey || "guest";
  const out = new Map<number, { position: number; duration: number }>();
  for (const id of titleIds) {
    const r = await getProgressFor(id, user);
    if (r) out.set(id, { position: r.position, duration: r.duration });
  }
  return out;
}

export async function removeProgress(titleId?: number | number[], userKey = getUserKey()): Promise<number> {
  const user = userKey || "guest";
  const ids = Array.isArray(titleId) ? titleId : titleId ? [titleId] : [];
  if (!ids.length) {
    const all = await db.progress.where("userKey").equals(user).toArray();
    await db.progress.where("userKey").equals(user).delete();
    return all.length;
  }
  let n = 0;
  for (const id of ids) {
    const row = await db.progress.where("[userKey+titleId]").equals([user, id]).first();
    if (row) { await db.progress.delete((row as { id: number }).id); n++; }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

export async function setRating(titleId: number, score: number, userKey = getUserKey()): Promise<number | null> {
  const user = userKey || "guest";
  if (score === 0) {
    await db.ratings.where("[userKey+titleId]").equals([user, titleId]).delete();
    return null;
  }
  const existing = await db.ratings.where("[userKey+titleId]").equals([user, titleId]).first();
  const row = { userKey: user, titleId, score, updatedAt: now() };
  if (existing) await db.ratings.put({ ...row, id: (existing as { id: number }).id });
  else await db.ratings.add(row);
  return score;
}

export async function getUserScore(titleId: number, userKey = getUserKey()): Promise<number | null> {
  const user = userKey || "guest";
  const row = await db.ratings.where("[userKey+titleId]").equals([user, titleId]).first();
  return row ? Number((row as { score: number }).score) : null;
}

/* ------------------------------------------------------------------ */
/* Rich rows (my list / favorites / history)                           */
/* ------------------------------------------------------------------ */

export type ListRow = {
  title: LiteTitle & Partial<TitleView>;
  status: ListStatus;
  note: string;
  pinned: boolean;
  addedAt: string;
  updatedAt: string;
  plannedDate: string | null;
  progress: { position: number; duration: number; episodeId: number | null } | null;
  isFavorite: boolean;
  myScore: number | null;
};

export async function getMyListRows(userKey = getUserKey()): Promise<ListRow[]> {
  const user = userKey || "guest";
  const rows = await db.watchlist.where("userKey").equals(user).toArray();
  const ids = rows.map((r) => Number(r.titleId));
  const titles = await Promise.all(ids.map((id) => db.titles.get(id) as Promise<Record<string, unknown> | undefined>));
  const liteById = new Map<number, LiteTitle>();
  titles.forEach((t) => {
    if (t) liteById.set(Number(t.id), t as unknown as LiteTitle);
  });
  const [prog, favs, rats] = await Promise.all([
    Promise.all(ids.map((id) => getProgressFor(id, user))),
    db.favorites.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).toArray(),
  ]);
  const pm = new Map<number, ProgressRow>();
  prog.forEach((p) => p && pm.set(p.titleId, p));
  const fs = new Set(favs.map((f) => Number(f.titleId)));
  const rm = new Map<number, number>(rats.map((r) => [Number(r.titleId), Number(r.score)]));
  const sorted = [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return sorted.map((r) => {
    const titleId = Number(r.titleId);
    const t = liteById.get(titleId);
    const p = pm.get(titleId) ?? null;
    return {
      title: (t ?? { id: titleId, slug: "", title: "؟", titleEn: "", type: "movie", year: 0, rating: 0, duration: 0, genres: [], poster: "", backdrop: "", quality: "", country: "", ageRating: "", views: 0, featured: false, trendingScore: 0, director: "", cast: [] }) as LiteTitle & Partial<TitleView>,
      status: String(r.status) as ListStatus,
      note: String(r.note ?? ""),
      pinned: !!r.pinned,
      addedAt: String(r.createdAt ?? now()),
      updatedAt: String(r.updatedAt ?? now()),
      plannedDate: r.plannedDate ? String(r.plannedDate).slice(0, 10) : null,
      progress: p ? { position: p.position, duration: p.duration, episodeId: p.episodeId } : null,
      isFavorite: fs.has(titleId),
      myScore: rm.get(titleId) ?? null,
    };
  });
}

export type FavoriteRow = { title: LiteTitle & Partial<TitleView>; addedAt: string; inList: boolean; myScore: number | null };

export async function getFavoriteRows(userKey = getUserKey()): Promise<FavoriteRow[]> {
  const user = userKey || "guest";
  const rows = await db.favorites.where("userKey").equals(user).toArray();
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const out: FavoriteRow[] = [];
  for (const f of rows) {
    const titleId = Number(f.titleId);
    const t = (await db.titles.get(titleId)) as unknown as LiteTitle | undefined;
    if (!t) continue;
    const [inList, myScore] = await Promise.all([isInWatchlist(titleId, user), getUserScore(titleId, user)]);
    out.push({ title: t as LiteTitle & Partial<TitleView>, addedAt: String(f.createdAt), inList, myScore });
  }
  return out;
}

export type HistoryRow = {
  title: LiteTitle & Partial<TitleView>;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
  updatedAt: string;
  finished: boolean;
};

export async function getHistory(userKey = getUserKey()): Promise<HistoryRow[]> {
  const user = userKey || "guest";
  const rows = await db.progress.where("userKey").equals(user).toArray();
  rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const out: HistoryRow[] = [];
  for (const r of rows) {
    const titleId = Number(r.titleId);
    const t = (await db.titles.get(titleId)) as unknown as LiteTitle | undefined;
    if (!t) continue;
    const episodeId = (r.episodeId as number | null) ?? null;
    let episodeName: string | null = null;
    let episodeNumber: number | null = null;
    let season: number | null = null;
    if (episodeId && t.type === "series") {
      const eps = await getEpisodes(titleId);
      const ep = eps.find((e) => e.id === episodeId);
      if (ep) { episodeName = ep.name; episodeNumber = ep.number; season = ep.season; }
    }
    const position = Number(r.position);
    const duration = Number(r.duration);
    out.push({
      title: t as LiteTitle & Partial<TitleView>,
      position, duration, episodeId, episodeName, episodeNumber, season,
      updatedAt: String(r.updatedAt),
      finished: duration > 0 && position / duration >= 0.97,
    });
  }
  return out;
}

export type ContinueItem = {
  title: LiteTitle & Partial<TitleView>;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
};

export async function getContinueWatching(limit = 12, userKey = getUserKey()): Promise<ContinueItem[]> {
  const rows = await getHistory(userKey);
  return rows
    .filter((r) => r.duration > 0 && r.position / r.duration < 0.97)
    .slice(0, limit)
    .map(({ title, position, duration, episodeId, episodeName, episodeNumber, season }) => ({
      title, position, duration, episodeId, episodeName, episodeNumber, season,
    }));
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export type ReviewRow = { id: number; titleId: number; author: string; rating: number; body: string; createdAt: string };

export async function addReview(b: { titleId: number; author: string; rating: number; body: string }): Promise<ReviewRow> {
  const row = { titleId: b.titleId, author: b.author.slice(0, 80), rating: Math.min(10, Math.max(1, Math.round(b.rating))), body: b.body.slice(0, 2000), createdAt: now() };
  const id = await db.reviews.add({ ...row } as Record<string, unknown>);
  return { ...row, id: Number(id) };
}

export async function getReviews(titleId: number): Promise<ReviewRow[]> {
  const rows = await db.reviews.where("titleId").equals(titleId).toArray();
  return (rows as unknown as ReviewRow[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ------------------------------------------------------------------ */
/* Stats (profile page)                                                */
/* ------------------------------------------------------------------ */

export type UserStats = {
  listCount: number;
  favCount: number;
  watchedCount: number;
  historyCount: number;
  ratingCount: number;
  minutesWatched: number;
  topGenres: { genre: string; count: number }[];
  memberSince: string;
};

export async function getUserStats(userKey = getUserKey()): Promise<UserStats> {
  const user = userKey || "guest";
  const [wl, favs, hist, ratingCount, profile] = await Promise.all([
    db.watchlist.where("userKey").equals(user).toArray(),
    db.favorites.where("userKey").equals(user).toArray(),
    db.progress.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).count(),
    getProfile(user),
  ]);
  const gc = new Map<string, number>();
  const bump = (g: string) => gc.set(g, (gc.get(g) ?? 0) + 1);
  const enrich = async (rows: Record<string, unknown>[]) => {
    for (const r of rows) {
      const t = (await db.titles.get(Number(r.titleId))) as unknown as { genres?: string[] } | undefined;
      (t?.genres ?? []).forEach(bump);
    }
  };
  await enrich(wl);
  await enrich(favs);
  return {
    listCount: wl.length,
    favCount: favs.length,
    watchedCount: wl.filter((w) => w.status === "watched").length,
    historyCount: hist.length,
    ratingCount,
    minutesWatched: Math.round(hist.reduce((a, h) => a + Number(h.position), 0) / 60),
    topGenres: [...gc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([genre, count]) => ({ genre, count })),
    memberSince: profile.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Notifications (derived on the fly, mirrors lib/notifications.ts)    */
/* ------------------------------------------------------------------ */

export type Notification = { id: string; kind: "episode" | "continue" | "recommend" | "new" | "system"; title: string; body: string; href: string; image?: string; at: string; read?: boolean };

export async function getNotifications(userKey = getUserKey()): Promise<Notification[]> {
  const user = userKey || "guest";
  const [profile, list, cont] = await Promise.all([getProfile(user), getMyListRows(user), getContinueWatching(6, user)]);
  const out: Notification[] = [];
  const nowMs = Date.now();

  if (profile.notifyNewEpisodes) {
    const series = list.filter((r) => r.title.type === "series" && r.status !== "watched").slice(0, 8);
    for (const r of series) {
      const eps = await getEpisodes(r.title.id);
      const last = eps[eps.length - 1];
      if (!last) continue;
      out.push({
        id: `ep-${last.id}`,
        kind: "episode",
        title: `قسمت ${last.number} فصل ${last.season} «${r.title.title}»`,
        body: last.name,
        href: watchHref(r.title.slug, last.id),
        image: last.thumbnail || r.title.backdrop,
        at: new Date(nowMs - 1000 * 60 * 60 * (2 + (last.id % 20))).toISOString(),
      });
    }
  }

  if (profile.notifyContinue) {
    for (const c of cont) {
      const pct = c.duration ? Math.round((c.position / c.duration) * 100) : 0;
      out.push({
        id: `cont-${c.title.id}`,
        kind: "continue",
        title: `ادامه‌ی «${c.title.title}»`,
        body: c.episodeName ? `قسمت ${c.episodeNumber} · ${pct}٪ دیده‌اید` : `${pct}٪ دیده‌اید؛ از همان‌جا ادامه دهید`,
        href: watchHref(c.title.slug, c.episodeId),
        image: c.title.backdrop,
        at: new Date(nowMs - 1000 * 60 * 60 * 26).toISOString(),
      });
    }
  }

  if (profile.notifyRecommendations) {
    const counts = new Map<string, number>();
    list.forEach((r) => r.title.genres.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) {
      const { getSimilar } = await import("./db");
      const pool = list.length ? await getSimilar(list[0].title, 6) : [];
      for (const t of pool.slice(0, 3)) {
        out.push({
          id: `rec-${t.id}`,
          kind: "recommend",
          title: `پیشنهاد برای شما: «${t.title}»`,
          body: top,
          href: titleHref(t.slug),
          image: t.poster,
          at: new Date(nowMs - 1000 * 60 * 60 * 40).toISOString(),
        });
      }
    }
  }

  const { getNewest, currentManifest } = await import("./db");
  const manifestAt = currentManifest()?.generatedAt ?? new Date().toISOString();
  for (const t of await getNewest(4)) {
    out.push({
      id: `new-${t.id}`,
      kind: "new",
      title: `تازه اضافه شد: «${t.title}»`,
      body: `${t.type === "series" ? "سریال" : "فیلم"} · ${t.year} · ${t.genres.slice(0, 2).join("، ")}`,
      href: titleHref(t.slug),
      image: t.poster,
      at: manifestAt,
    });
  }

  out.push({
    id: "sys-welcome",
    kind: "system",
    title: "به فریم خوش آمدید",
    body: "از تنظیمات می‌توانید نوع اعلان‌هایی که دریافت می‌کنید را شخصی‌سازی کنید.",
    href: "/settings#notifications",
    at: profile.createdAt,
  });

  const reads = new Set((await db.notificationsRead.where("userKey").equals(user).toArray()).map((r) => r.id));
  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at)).map((n) => ({ ...n, read: reads.has(n.id) }));
}

export async function markNotificationRead(id: string, userKey = getUserKey()): Promise<void> {
  const user = userKey || "guest";
  if (await db.notificationsRead.get(id)) return;
  await db.notificationsRead.put({ id, userKey: user, at: now() });
}

export async function markAllNotificationsRead(userKey = getUserKey()): Promise<void> {
  const items = await getNotifications(userKey);
  const user = userKey || "guest";
  await db.notificationsRead.bulkPut(items.filter((n) => !n.read).map((n) => ({ id: n.id, userKey: user, at: now() })));
}

/* episode id helper re-export for the watch page */
export { episodeId, getFullTitle, getTitleLiteBySlug, json };
