/* Mobile user-data layer — mirrors src/lib/library.ts + src/lib/notifications.ts
 * on top of Dexie. Every response shape matches the desktop API routes so the
 * existing client components (LibraryProvider, SettingsForm, HistoryList…)
 * keep working through the fetch shim unchanged. */

import { db, episodeId, getEpisodes, getFullTitle, getTitleLiteBySlug, isDesktopRuntime, type LiteTitle } from "./db";
import { LIST_STATUSES, type ListStatus } from "@/lib/library-shared";
import type { TitleView } from "./db";
import { titleHref, watchHref } from "@/lib/links";

export { LIST_STATUSES };
export type { ListStatus };

const json = (v: unknown, fb: string) => {
  try { const p = JSON.parse(v as string); return Array.isArray(p) ? p : fb ? JSON.parse(fb) : []; } catch { return []; }
};

/* Desktop runtime: the shared pages call these functions directly, but on
 * Electron the data lives in the local Prisma DB (NOT in Dexie — the desktop
 * installer ships no shard catalog). Each function therefore has a thin
 * branch that talks to the real API / the /api/x bridge, keeping desktop and
 * Android on one code path with platform-correct storage underneath. */
const srv = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) throw new Error(`API ${url} → ${r.status}`);
  return (await r.json()) as T;
};
const srvPost = <T,>(url: string, body: unknown, method = "POST"): Promise<T> =>
  srv<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** userKey from the same cookie the desktop server reads (nama_uid).
 *  v0.10.35: per-account data spaces — when an identity attach happened, the
 *  ACTIVE space (per cloud account) wins over the raw device cookie, mirroring
 *  the desktop /api/identity route so switching accounts gives each account
 *  its own profile / history / collections on Android too. */
export function getUserKey(): string {
  const active = lsGet(ACCT_ACTIVE);
  if (active) return active;
  if (typeof document === "undefined") return "guest";
  const m = document.cookie.match(/(?:^|;\s*)nama_uid=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "guest";
}

/* ---- v0.10.35 — per-account data spaces (mobile side of /api/identity) ---- */

const ACCT_ACTIVE = "frame.acct.active";
const ACCT_MAP = "frame.acct.map";

function lsGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
function readAcctMap(): Record<string, string> {
  try { return JSON.parse(lsGet(ACCT_MAP) ?? "{}") as Record<string, string>; } catch { return {}; }
}

/** deterministic empty space for a brand-new account on this device */
function accountSpaceUid(accountId: string): string {
  let h = 5381;
  for (let i = 0; i < accountId.length; i++) h = ((h << 5) + h + accountId.charCodeAt(i)) >>> 0;
  return "a" + h.toString(36) + "x" + accountId.length.toString(36);
}

async function spaceHasData(uid: string): Promise<boolean> {
  const [p, prog, wl, fav, rt, cols] = await Promise.all([
    db.profiles.get(uid),
    db.progress.where("userKey").equals(uid).first(),
    db.watchlist.where("userKey").equals(uid).first(),
    db.favorites.where("userKey").equals(uid).first(),
    db.ratings.where("userKey").equals(uid).first(),
    db.ucollections.where("userKey").equals(uid).first(),
  ]);
  return Boolean(p || prog || wl || fav || rt || cols);
}

/** Same contract as the desktop POST /api/identity route:
 *  - attach(accountId): known account → its recorded space (data returns on
 *    re-login); first attach + current space unclaimed + has data → ADOPT the
 *    current space (seamless upgrade / guest continuity); otherwise a fresh
 *    empty space so a second account never sees the first account's data.
 *  - reset (sign-out): a fresh guest space, but only when the current space
 *    belongs to a mapped account — signed-out data survives restarts. */
export async function switchIdentity(accountId: string | null, reset = false): Promise<{ switched: boolean }> {
  const current = getUserKey();
  const map = readAcctMap();
  const claimed = Object.values(map).includes(current);

  if (reset || !accountId) {
    if (!claimed) return { switched: false };
    const fresh = "guest-" + Math.random().toString(36).slice(2, 10);
    lsSet(ACCT_ACTIVE, fresh);
    return { switched: true };
  }

  const known = map[accountId];
  if (known) {
    if (known === current) return { switched: false };
    lsSet(ACCT_ACTIVE, known);
    return { switched: true };
  }

  const hasData = await spaceHasData(current);
  const target = !claimed && hasData ? current : accountSpaceUid(accountId);
  map[accountId] = target;
  lsSet(ACCT_MAP, JSON.stringify(map));
  lsSet(ACCT_ACTIVE, target);
  return { switched: target !== current };
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
  if (isDesktopRuntime()) {
    const row = await srv<Partial<ProfileRow>>("/api/profile");
    return { ...DEFAULT_PROFILE(userKey), ...row } as ProfileRow;
  }
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
  if (isDesktopRuntime()) {
    const row = await srvPost<Partial<ProfileRow>>("/api/profile", b, "PATCH");
    return { ...DEFAULT_PROFILE(userKey), ...row } as ProfileRow;
  }
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
  try {
    // v0.12.0 — local profile touch timestamp drives the newer-wins cloud sync
    localStorage.setItem("frame.profile.touched", new Date().toISOString());
  } catch {
    /* ignore */
  }
  return next;
}

export async function wipeProfile(scope: string, userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/profile", { scope }, "DELETE");
    return;
  }
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
  collections: { name: string; items: number[] }[];
  profile: { displayName: string; avatar: number; avatarImage: string | null; reduceMotion: boolean; kidsMode: boolean; hasPin: boolean };
  /* v0.12.0 — history + full profile ride along for the cloud push */
  progress: { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[];
  profileFull: Record<string, unknown>;
};

export async function getLibrarySnapshot(userKey = getUserKey()): Promise<LibrarySnapshot> {
  if (isDesktopRuntime()) return srv<LibrarySnapshot>("/api/library");
  const user = userKey || "guest";
  const [wl, fav, rt, cols, profile, progress] = await Promise.all([
    db.watchlist.where("userKey").equals(user).toArray(),
    db.favorites.where("userKey").equals(user).toArray(),
    db.ratings.where("userKey").equals(user).toArray(),
    listUserCollections(user),
    getProfile(user),
    db.progress.where("userKey").equals(user).toArray(),
  ]);
  const itemsOf = async (id: number) =>
    (await db.ucitems.where("collectionId").equals(id).toArray()).map((i) => Number((i as { titleId: number }).titleId));
  const collections = [] as { name: string; items: number[] }[];
  for (const c of cols) collections.push({ name: c.name, items: await itemsOf(c.id) });
  const { userKey: _uk, ...profileFull } = profile as Record<string, unknown>;
  return {
    watchlist: wl.map((w) => ({ titleId: Number(w.titleId), status: String(w.status) as ListStatus })),
    favorites: fav.map((f) => Number(f.titleId)),
    ratings: rt.map((r) => ({ titleId: Number(r.titleId), score: Number(r.score) })),
    collections,
    profile: {
      displayName: profile.displayName,
      avatar: profile.avatar,
      avatarImage: profile.avatarImage ?? null,
      reduceMotion: profile.reduceMotion,
      kidsMode: profile.kidsMode,
      hasPin: !!profile.parentalPin,
    },
    progress: (progress as unknown as { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[])
      .slice(0, 500)
      .map((p) => ({ titleId: Number(p.titleId), episodeId: p.episodeId ?? null, position: Number(p.position), duration: Number(p.duration), updatedAt: String(p.updatedAt) })),
    profileFull,
  };
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */

export async function toggleFavorite(titleId: number, value?: boolean, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) {
    const d = await srvPost<{ isFavorite: boolean }>("/api/favorites", { titleId, value });
    return d.isFavorite;
  }
  const user = userKey || "guest";
  const existing = await db.favorites.where("[userKey+titleId]").equals([user, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (!wanted && existing) await db.favorites.delete((existing as { id: number }).id);
  if (wanted && !existing) await db.favorites.add({ userKey: user, titleId, createdAt: now() });
  return wanted;
}

export async function addFavorites(titleIds: number[], userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/favorites", { titleIds }, "PUT");
    return;
  }
  const user = userKey || "guest";
  const have = new Set((await db.favorites.where("userKey").equals(user).toArray()).map((f) => Number(f.titleId)));
  const rows = titleIds.filter((id) => !have.has(id)).map((titleId) => ({ userKey: user, titleId, createdAt: now() }));
  if (rows.length) await db.favorites.bulkAdd(rows);
}

export async function removeFavorites(titleIds?: number[], userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    if (!titleIds?.length) await srvPost("/api/profile", { scope: "favorites" }, "DELETE");
    else await srvPost("/api/favorites", { titleIds }, "DELETE");
    return;
  }
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
  if (isDesktopRuntime()) return srv<boolean>(`/api/x/is-favorite?titleId=${titleId}`);
  const user = userKey || "guest";
  return (await db.favorites.where("[userKey+titleId]").equals([user, titleId]).count()) > 0;
}

/* ------------------------------------------------------------------ */
/* Watchlist                                                           */
/* ------------------------------------------------------------------ */

const STATUSES = new Set(["planned", "watching", "watched"]);

export async function toggleWatchlist(titleId: number, value?: boolean, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) {
    const d = await srvPost<{ inList: boolean }>("/api/watchlist", { titleId, value });
    return d.inList;
  }
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
  if (isDesktopRuntime()) {
    await srvPost("/api/watchlist", b, "PATCH");
    return;
  }
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
  if (isDesktopRuntime()) {
    await srvPost("/api/watchlist", titleId ? { titleIds: [titleId] } : {}, "DELETE");
    return;
  }
  const user = userKey || "guest";
  if (!titleId) return;
  const row = await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first();
  if (row) await db.watchlist.delete((row as { id: number }).id);
}

export async function isInWatchlist(titleId: number, userKey = getUserKey()): Promise<boolean> {
  if (isDesktopRuntime()) return srv<boolean>(`/api/x/in-watchlist?titleId=${titleId}`);
  const user = userKey || "guest";
  return (await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).count()) > 0;
}

export async function getWatchlistIds(userKey = getUserKey()): Promise<number[]> {
  if (isDesktopRuntime()) return srv<number[]>("/api/x/watchlist-ids");
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
  if (isDesktopRuntime()) {
    await srvPost("/api/progress", { titleId: b.titleId, episodeId: b.episodeId ?? null, position: b.position, duration: b.duration });
    return;
  }
  const user = userKey || "guest";
  const existing = await db.progress.where("[userKey+titleId]").equals([user, b.titleId]).first();
  const row = { userKey: user, titleId: b.titleId, episodeId: b.episodeId ? Number(b.episodeId) : null, position: b.position, duration: b.duration, updatedAt: now() };
  if (existing) await db.progress.put({ ...row, id: (existing as { id: number }).id });
  else await db.progress.add(row);
}

export async function getProgressFor(titleId: number, userKey = getUserKey()): Promise<ProgressRow | null> {
  if (isDesktopRuntime()) return srv<ProgressRow | null>(`/api/x/progress?titleId=${titleId}`);
  const user = userKey || "guest";
  const row = await db.progress.where("[userKey+titleId]").equals([user, titleId]).first();
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return { titleId: Number(r.titleId), episodeId: (r.episodeId as number | null) ?? null, position: Number(r.position), duration: Number(r.duration), updatedAt: String(r.updatedAt) };
}

export async function getProgressMap(titleIds: number[], userKey = getUserKey()): Promise<Map<number, { position: number; duration: number }>> {
  if (isDesktopRuntime()) {
    if (!titleIds.length) return new Map();
    const obj = await srv<Record<string, { position: number; duration: number }>>(`/api/x/progress-map?ids=${titleIds.join(",")}`);
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
  }
  const user = userKey || "guest";
  const out = new Map<number, { position: number; duration: number }>();
  for (const id of titleIds) {
    const r = await getProgressFor(id, user);
    if (r) out.set(id, { position: r.position, duration: r.duration });
  }
  return out;
}

export async function removeProgress(titleId?: number | number[], userKey = getUserKey()): Promise<number> {
  if (isDesktopRuntime()) {
    const body = Array.isArray(titleId) ? { titleIds: titleId } : titleId ? { titleId } : {};
    const d = await srvPost<{ removed: number }>("/api/progress", body, "DELETE");
    return d.removed;
  }
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
  if (isDesktopRuntime()) {
    const d = await srvPost<{ score: number | null }>("/api/rating", { titleId, score });
    return d.score;
  }
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
  if (isDesktopRuntime()) return srv<number | null>(`/api/x/score?titleId=${titleId}`);
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
  if (isDesktopRuntime()) return srv<ListRow[]>("/api/x/list");
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
  if (isDesktopRuntime()) return srv<FavoriteRow[]>("/api/x/favorites");
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
  if (isDesktopRuntime()) return srv<HistoryRow[]>("/api/x/history");
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
  if (isDesktopRuntime()) return srv<ContinueItem[]>(`/api/x/continue?limit=${limit}`);
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
  if (isDesktopRuntime()) return srvPost<ReviewRow>("/api/reviews", b);
  const row = { titleId: b.titleId, author: b.author.slice(0, 80), rating: Math.min(10, Math.max(1, Math.round(b.rating))), body: b.body.slice(0, 2000), createdAt: now() };
  const id = await db.reviews.add({ ...row } as Record<string, unknown>);
  return { ...row, id: Number(id) };
}

export async function getReviews(titleId: number): Promise<ReviewRow[]> {
  if (isDesktopRuntime()) return srv<ReviewRow[]>(`/api/x/reviews?titleId=${titleId}`);
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
  if (isDesktopRuntime()) return srv<UserStats>("/api/x/stats");
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
  if (isDesktopRuntime()) return srv<Notification[]>("/api/notifications");
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
  if (isDesktopRuntime()) {
    await srvPost("/api/notifications", { id });
    return;
  }
  const user = userKey || "guest";
  if (await db.notificationsRead.get(id)) return;
  await db.notificationsRead.put({ id, userKey: user, at: now() });
}

export async function markAllNotificationsRead(userKey = getUserKey()): Promise<void> {
  if (isDesktopRuntime()) {
    await srvPost("/api/notifications", { all: true });
    return;
  }
  const items = await getNotifications(userKey);
  const user = userKey || "guest";
  await db.notificationsRead.bulkPut(items.filter((n) => !n.read).map((n) => ({ id: n.id, userKey: user, at: now() })));
}

/* episode id helper re-export for the watch page */
export { episodeId, getFullTitle, getTitleLiteBySlug, json };

/* ------------------------------------------------------------------ */
/* User collections (v0.10.32) — کالکشن‌های شخصی، سینک با اکانت        */
/* Desktop → real /api/collections* routes (Prisma).                   */
/* Mobile  → Dexie (the fetch shim serves the same endpoints).         */
/* ------------------------------------------------------------------ */

export type UCollection = {
  id: number;
  name: string;
  count: number;
  posters: string[];
  movies: number;
  series: number;
  createdAt: string;
  updatedAt: string;
};

export async function listUserCollections(userKey = getUserKey()): Promise<UCollection[]> {
  if (isDesktopRuntime()) return srv<UCollection[]>("/api/collections");
  const user = userKey || "guest";
  const cols = await db.ucollections.where("userKey").equals(user).toArray();
  const out: UCollection[] = [];
  for (const c of cols) {
    const id = Number((c as { id: number }).id);
    const items = await db.ucitems.where("collectionId").equals(id).toArray();
    const ids = items.map((i) => Number((i as { titleId: number }).titleId));
    const posters: string[] = [];
    let movies = 0;
    let series = 0;
    for (const tid of ids.slice(0, 30)) {
      const t = (await db.titles.get(tid)) as Record<string, unknown> | undefined;
      if (t?.poster) posters.push(String(t.poster));
      if (t?.type === "series") series++;
      else movies++;
    }
    out.push({
      id,
      name: String((c as { name: string }).name),
      count: ids.length,
      posters: posters.slice(0, 6),
      movies,
      series,
      createdAt: String((c as { createdAt: string }).createdAt ?? now()),
      updatedAt: String((c as { updatedAt: string }).updatedAt ?? now()),
    });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createUserCollection(name: string, userKey = getUserKey()): Promise<{ id: number; name: string }> {
  const clean = String(name ?? "").trim().slice(0, 60);
  if (!clean) throw new Error("name required");
  if (isDesktopRuntime()) return srvPost<{ id: number; name: string }>("/api/collections", { name: clean });
  const user = userKey || "guest";
  const dupe = await db.ucollections.where("[userKey+name]").equals([user, clean]).first();
  if (dupe) return { id: Number((dupe as { id: number }).id), name: clean };
  const id = await db.ucollections.add({ userKey: user, name: clean, createdAt: now(), updatedAt: now() });
  return { id: Number(id), name: clean };
}

export async function renameUserCollection(id: number, name: string, userKey = getUserKey()): Promise<void> {
  const clean = String(name ?? "").trim().slice(0, 60);
  if (!id || !clean) throw new Error("id + name required");
  if (isDesktopRuntime()) {
    await srvPost("/api/collections", { id, name: clean }, "PATCH");
    return;
  }
  await db.ucollections.update(id, { name: clean, updatedAt: now() });
}

export async function deleteUserCollection(id: number, userKey = getUserKey()): Promise<void> {
  if (!id) return;
  if (isDesktopRuntime()) {
    await srv("/api/collections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    return;
  }
  await db.ucitems.where("collectionId").equals(id).delete();
  await db.ucollections.delete(id);
}

/** Full item rows of one user collection (grid-ready). */
export async function getCollectionItems(collectionId: number, userKey = getUserKey()): Promise<TitleView[]> {
  if (!collectionId) return [];
  if (isDesktopRuntime()) return srv<TitleView[]>(`/api/collections/items?collectionId=${collectionId}`);
  const rows = await db.ucitems.where("collectionId").equals(collectionId).toArray();
  const ids = rows.map((r) => Number((r as { titleId: number }).titleId));
  const out: TitleView[] = [];
  for (const id of ids) {
    const t = (await db.titles.get(id)) as unknown as TitleView | undefined;
    if (t) out.push(t);
  }
  return out.reverse(); // newest first (ucitems were added ascending)
}

/** Which of MY collections contain this title → ids (for the picker checkmarks). */
export async function collectionsContaining(titleId: number, userKey = getUserKey()): Promise<number[]> {
  if (!titleId) return [];
  if (isDesktopRuntime()) return srv<{ collectionIds: number[] }>(`/api/collections/items?titleId=${titleId}`).then((d) => d.collectionIds);
  const user = userKey || "guest";
  const mine = await db.ucollections.where("userKey").equals(user).toArray();
  const out: number[] = [];
  for (const c of mine) {
    const id = Number((c as { id: number }).id);
    const hit = await db.ucitems.where("[collectionId+titleId]").equals([id, titleId]).count();
    if (hit > 0) out.push(id);
  }
  return out;
}

/** Add/remove a title in a collection → { inCollection, items } (items = current ids, for the cloud push). */
export async function setCollectionItem(
  collectionId: number,
  titleId: number,
  value?: boolean,
  userKey = getUserKey()
): Promise<{ inCollection: boolean; items: number[] }> {
  if (!collectionId || !titleId) throw new Error("collectionId + titleId required");
  if (isDesktopRuntime()) return srvPost<{ inCollection: boolean; items: number[] }>("/api/collections/items", { collectionId, titleId, value });
  const existing = await db.ucitems.where("[collectionId+titleId]").equals([collectionId, titleId]).first();
  const wanted = typeof value === "boolean" ? value : !existing;
  if (wanted && !existing) await db.ucitems.add({ collectionId, titleId, addedAt: now() });
  if (!wanted && existing) await db.ucitems.delete((existing as { id: number }).id);
  await db.ucollections.update(collectionId, { updatedAt: now() });
  const rows = await db.ucitems.where("collectionId").equals(collectionId).toArray();
  return { inCollection: wanted, items: rows.map((r) => Number((r as { titleId: number }).titleId)) };
}

/* ------------------------------------------------------------------ */
/* Cloud → Dexie merge (v0.10.32)                                      */
/* The mobile shim serves POST /api/cloud/merge with this — Supabase    */
/* snapshot rows land in IndexedDB, so an account's library shows up    */
/* on Android too (cloud fills gaps, local wins, nothing is deleted).   */
/* ------------------------------------------------------------------ */

export type CloudMergeBody = {
  favorites?: number[];
  watchlist?: { titleId: number; status: string }[];
  ratings?: { titleId: number; score: number }[];
  collections?: { name: string; items: number[] }[];
  progress?: { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string }[];
};

export async function mergeCloudSnapshot(
  body: CloudMergeBody,
  userKey = getUserKey()
): Promise<{ favoritesAdded: number; listAdded: number; ratingsAdded: number; collectionsAdded: number; collectionItemsAdded: number; progressApplied: number }> {
  const user = userKey || "guest";
  let favoritesAdded = 0;
  let listAdded = 0;
  let ratingsAdded = 0;
  let collectionsAdded = 0;
  let collectionItemsAdded = 0;

  // favorites
  for (const id of (body.favorites ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0)) {
    const ex = await db.favorites.where("[userKey+titleId]").equals([user, id]).count();
    if (!ex) {
      await db.favorites.add({ userKey: user, titleId: id, createdAt: now() });
      favoritesAdded++;
    }
  }

  // watchlist
  for (const row of body.watchlist ?? []) {
    const titleId = Number(row?.titleId);
    const status = String(row?.status ?? "");
    if (!titleId || Number.isNaN(titleId) || !STATUSES.has(status)) continue;
    const ex = await db.watchlist.where("[userKey+titleId]").equals([user, titleId]).first();
    if (!ex) {
      await db.watchlist.add({ userKey: user, titleId, status, note: "", pinned: false, createdAt: now(), updatedAt: now() });
      listAdded++;
    }
  }

  // ratings (fill gaps only)
  for (const row of body.ratings ?? []) {
    const titleId = Number(row?.titleId);
    const score = Number(row?.score);
    if (!titleId || Number.isNaN(titleId) || !Number.isFinite(score) || score < 1 || score > 10) continue;
    const ex = await db.ratings.where("[userKey+titleId]").equals([user, titleId]).first();
    if (!ex) {
      await db.ratings.add({ userKey: user, titleId, score: Math.round(score), updatedAt: now() });
      ratingsAdded++;
    }
  }

  // collections (matched by name)
  for (const col of body.collections ?? []) {
    const name = String(col?.name ?? "").trim().slice(0, 60);
    const items = (col?.items ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!name) continue;
    let row = await db.ucollections.where("[userKey+name]").equals([user, name]).first();
    if (!row) {
      const id = await db.ucollections.add({ userKey: user, name, createdAt: now(), updatedAt: now() });
      row = { id } as Record<string, unknown>;
      collectionsAdded++;
    }
    const colId = Number((row as { id: number }).id);
    for (const titleId of items) {
      const ex = await db.ucitems.where("[collectionId+titleId]").equals([colId, titleId]).count();
      if (!ex) {
        await db.ucitems.add({ collectionId: colId, titleId, addedAt: now() });
        collectionItemsAdded++;
      }
    }
  }

  // watch progress (v0.12.0) — NEWER WINS per title
  const toTs = (v: unknown): number => (typeof v === "number" ? v : Date.parse(String(v)) || 0);
  let progressApplied = 0;
  for (const row of body.progress ?? []) {
    const titleId = Number(row?.titleId);
    const position = Number(row?.position ?? 0);
    const duration = Number(row?.duration ?? 0);
    if (!titleId || Number.isNaN(titleId) || !Number.isFinite(position)) continue;
    const incomingTs = toTs(row?.updatedAt) || 0;
    const ex = await db.progress.where("[userKey+titleId]").equals([user, titleId]).first();
    if (!ex) {
      await db.progress.add({ userKey: user, titleId, episodeId: row?.episodeId ? Number(row.episodeId) : null, position, duration, updatedAt: new Date(incomingTs || Date.now()).toISOString() });
      progressApplied++;
    } else {
      const exRow = ex as unknown as { id: number; updatedAt: string; episodeId: number | null };
      if (incomingTs > toTs(exRow.updatedAt) + 500) {
        await db.progress.put({ ...exRow, episodeId: row?.episodeId ? Number(row.episodeId) : exRow.episodeId, position, duration, updatedAt: new Date(incomingTs || Date.now()).toISOString() });
        progressApplied++;
      }
    }
  }

  return { favoritesAdded, listAdded, ratingsAdded, collectionsAdded, collectionItemsAdded, progressApplied };
}
