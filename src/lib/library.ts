import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import type { TitleView } from "@/lib/queries";
import type { Title as DbTitle } from "@prisma/client";
import { LIST_STATUSES, type ListStatus } from "@/lib/library-shared";

export { LIST_STATUSES };
export type { ListStatus };

function pv(t: DbTitle): TitleView {
  let genres: string[] = [];
  let cast: string[] = [];
  try {
    genres = JSON.parse(t.genres || "[]");
    cast = JSON.parse(t.cast || "[]");
  } catch {
    /* ignore */
  }
  return { ...t, genres, cast };
}

/* ------------------------------------------------------------------ */
/* Library snapshot (used by the client-side LibraryProvider)          */
/* ------------------------------------------------------------------ */
export type LibrarySnapshot = {
  watchlist: { titleId: number; status: ListStatus }[];
  favorites: number[];
  ratings: { titleId: number; score: number }[];
  profile: { displayName: string; avatar: number; reduceMotion: boolean; kidsMode: boolean; hasPin: boolean };
};

export async function getLibrarySnapshot(userKey: string): Promise<LibrarySnapshot> {
  const [wl, fav, rt, profile] = await Promise.all([
    db.watchlist.findMany({ where: { userKey }, select: { titleId: true, status: true } }),
    db.favorite.findMany({ where: { userKey }, select: { titleId: true } }),
    db.userRating.findMany({ where: { userKey }, select: { titleId: true, score: true } }),
    getProfile(userKey),
  ]);
  return {
    watchlist: wl.map((w) => ({ titleId: w.titleId, status: w.status as ListStatus })),
    favorites: fav.map((f) => f.titleId),
    ratings: rt,
    profile: { displayName: profile.displayName, avatar: profile.avatar, reduceMotion: profile.reduceMotion, kidsMode: profile.kidsMode, hasPin: !!profile.parentalPin },
  };
}

/* ------------------------------------------------------------------ */
/* My list (rich rows)                                                 */
/* ------------------------------------------------------------------ */
export type ListRow = {
  title: TitleView;
  status: ListStatus;
  note: string;
  pinned: boolean;
  addedAt: string;
  updatedAt: string;
  progress: { position: number; duration: number; episodeId: number | null } | null;
  isFavorite: boolean;
  myScore: number | null;
};

export async function getMyListRows(userKey: string): Promise<ListRow[]> {
  await ensureSeeded();
  const rows = await db.watchlist.findMany({
    where: { userKey },
    include: { title: true },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  const ids = rows.map((r) => r.titleId);
  const [prog, favs, ratings] = await Promise.all([
    db.watchProgress.findMany({ where: { userKey, titleId: { in: ids } }, select: { titleId: true, position: true, duration: true, episodeId: true } }),
    db.favorite.findMany({ where: { userKey, titleId: { in: ids } }, select: { titleId: true } }),
    db.userRating.findMany({ where: { userKey, titleId: { in: ids } }, select: { titleId: true, score: true } }),
  ]);
  const pm = new Map(prog.map((p) => [p.titleId, p]));
  const fs = new Set(favs.map((f) => f.titleId));
  const rm = new Map(ratings.map((r) => [r.titleId, r.score]));
  return rows.map((r) => ({
    title: pv(r.title),
    status: r.status as ListStatus,
    note: r.note,
    pinned: r.pinned,
    addedAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    progress: pm.has(r.titleId)
      ? { position: pm.get(r.titleId)!.position, duration: pm.get(r.titleId)!.duration, episodeId: pm.get(r.titleId)!.episodeId }
      : null,
    isFavorite: fs.has(r.titleId),
    myScore: rm.get(r.titleId) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */
export type FavoriteRow = { title: TitleView; addedAt: string; inList: boolean; myScore: number | null };

export async function getFavoriteRows(userKey: string): Promise<FavoriteRow[]> {
  await ensureSeeded();
  const rows = await db.favorite.findMany({ where: { userKey }, include: { title: true }, orderBy: { createdAt: "desc" } });
  const ids = rows.map((r) => r.titleId);
  const [wl, ratings] = await Promise.all([
    db.watchlist.findMany({ where: { userKey, titleId: { in: ids } }, select: { titleId: true } }),
    db.userRating.findMany({ where: { userKey, titleId: { in: ids } }, select: { titleId: true, score: true } }),
  ]);
  const ws = new Set(wl.map((w) => w.titleId));
  const rm = new Map(ratings.map((r) => [r.titleId, r.score]));
  return rows.map((r) => ({ title: pv(r.title), addedAt: r.createdAt.toISOString(), inList: ws.has(r.titleId), myScore: rm.get(r.titleId) ?? null }));
}

export async function isFavorite(userKey: string, titleId: number) {
  return (await db.favorite.count({ where: { userKey, titleId } })) > 0;
}

export async function getUserScore(userKey: string, titleId: number) {
  const r = await db.userRating.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
  return r?.score ?? null;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */
export type HistoryRow = {
  title: TitleView;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
  updatedAt: string;
  finished: boolean;
};

export async function getHistory(userKey: string): Promise<HistoryRow[]> {
  await ensureSeeded();
  const rows = await db.watchProgress.findMany({
    where: { userKey },
    include: { title: true, episode: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => ({
    title: pv(r.title),
    position: r.position,
    duration: r.duration,
    episodeId: r.episodeId,
    episodeName: r.episode?.name ?? null,
    episodeNumber: r.episode?.number ?? null,
    season: r.episode?.season ?? null,
    updatedAt: r.updatedAt.toISOString(),
    finished: r.duration > 0 && r.position / r.duration >= 0.97,
  }));
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */
export async function getProfile(userKey: string) {
  const p = await db.userProfile.findUnique({ where: { userKey } });
  if (p) return p;
  return db.userProfile.upsert({ where: { userKey }, update: {}, create: { userKey } });
}

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

export async function getUserStats(userKey: string): Promise<UserStats> {
  await ensureSeeded();
  const [wl, favs, hist, ratings, profile] = await Promise.all([
    db.watchlist.findMany({ where: { userKey }, include: { title: { select: { genres: true } } } }),
    db.favorite.findMany({ where: { userKey }, include: { title: { select: { genres: true } } } }),
    db.watchProgress.findMany({ where: { userKey }, select: { position: true } }),
    db.userRating.count({ where: { userKey } }),
    getProfile(userKey),
  ]);
  const gc = new Map<string, number>();
  const bump = (g: string) => gc.set(g, (gc.get(g) ?? 0) + 1);
  [...wl, ...favs].forEach((r) => {
    try {
      (JSON.parse(r.title.genres || "[]") as string[]).forEach(bump);
    } catch {
      /* ignore */
    }
  });
  return {
    listCount: wl.length,
    favCount: favs.length,
    watchedCount: wl.filter((w) => w.status === "watched").length,
    historyCount: hist.length,
    ratingCount: ratings,
    minutesWatched: Math.round(hist.reduce((a, h) => a + h.position, 0) / 60),
    topGenres: [...gc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count })),
    memberSince: profile.createdAt.toISOString(),
  };
}
