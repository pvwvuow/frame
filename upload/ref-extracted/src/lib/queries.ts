import { db } from "@/db";
import { titles, episodes, watchlist, watchProgress, reviews, type Title } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { and, desc, eq, ilike, inArray, ne, or, sql, arrayOverlaps } from "drizzle-orm";

export const GENRES = [
  "اکشن",
  "درام",
  "کمدی",
  "هیجان‌انگیز",
  "جنایی",
  "علمی‌تخیلی",
  "ترسناک",
  "عاشقانه",
  "ماجراجویی",
  "معمایی",
  "تاریخی",
  "جنگی",
  "حماسی",
  "نوآر",
];

export async function getFeatured() {
  await ensureSeeded();
  return db.select().from(titles).where(eq(titles.featured, true)).orderBy(desc(titles.trendingScore)).limit(5);
}

export async function getTrending(limit = 12) {
  await ensureSeeded();
  return db.select().from(titles).orderBy(desc(titles.trendingScore)).limit(limit);
}

export async function getNewest(limit = 12) {
  await ensureSeeded();
  return db.select().from(titles).orderBy(desc(titles.year), desc(titles.id)).limit(limit);
}

export async function getTopRated(limit = 12) {
  await ensureSeeded();
  return db.select().from(titles).orderBy(desc(titles.rating)).limit(limit);
}

export async function getByType(type: "movie" | "series", opts: { genre?: string; sort?: string } = {}) {
  await ensureSeeded();
  const conds = [eq(titles.type, type)];
  if (opts.genre) conds.push(arrayOverlaps(titles.genres, [opts.genre]));
  const order =
    opts.sort === "rating"
      ? desc(titles.rating)
      : opts.sort === "newest"
        ? desc(titles.year)
        : opts.sort === "views"
          ? desc(titles.views)
          : desc(titles.trendingScore);
  return db.select().from(titles).where(and(...conds)).orderBy(order);
}

export async function getByGenre(genre: string, limit = 12) {
  await ensureSeeded();
  return db
    .select()
    .from(titles)
    .where(arrayOverlaps(titles.genres, [genre]))
    .orderBy(desc(titles.rating))
    .limit(limit);
}

export async function getTitleBySlug(slug: string) {
  await ensureSeeded();
  const [t] = await db.select().from(titles).where(eq(titles.slug, slug)).limit(1);
  return t ?? null;
}

export async function getEpisodes(titleId: number) {
  return db.select().from(episodes).where(eq(episodes.titleId, titleId)).orderBy(episodes.season, episodes.number);
}

export async function getSimilar(t: Title, limit = 10) {
  return db
    .select()
    .from(titles)
    .where(and(ne(titles.id, t.id), arrayOverlaps(titles.genres, t.genres)))
    .orderBy(desc(titles.rating))
    .limit(limit);
}

export async function getReviews(titleId: number) {
  return db.select().from(reviews).where(eq(reviews.titleId, titleId)).orderBy(desc(reviews.createdAt));
}

export async function search(q: string, limit = 30) {
  await ensureSeeded();
  const term = `%${q.trim()}%`;
  if (!q.trim()) return [];
  return db
    .select()
    .from(titles)
    .where(
      or(
        ilike(titles.title, term),
        ilike(titles.titleEn, term),
        ilike(titles.director, term),
        ilike(titles.description, term),
        sql`array_to_string(${titles.cast}, ' ') ILIKE ${term}`,
        sql`array_to_string(${titles.genres}, ' ') ILIKE ${term}`
      )
    )
    .orderBy(desc(titles.trendingScore))
    .limit(limit);
}

export async function getWatchlistIds(userKey: string) {
  const rows = await db.select({ titleId: watchlist.titleId }).from(watchlist).where(eq(watchlist.userKey, userKey));
  return rows.map((r) => r.titleId);
}

export async function getWatchlist(userKey: string) {
  await ensureSeeded();
  return db
    .select({ title: titles, addedAt: watchlist.createdAt })
    .from(watchlist)
    .innerJoin(titles, eq(watchlist.titleId, titles.id))
    .where(eq(watchlist.userKey, userKey))
    .orderBy(desc(watchlist.createdAt));
}

export async function isInWatchlist(userKey: string, titleId: number) {
  const [row] = await db
    .select({ id: watchlist.id })
    .from(watchlist)
    .where(and(eq(watchlist.userKey, userKey), eq(watchlist.titleId, titleId)))
    .limit(1);
  return !!row;
}

export type ContinueItem = {
  title: Title;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
};

export async function getContinueWatching(userKey: string, limit = 12): Promise<ContinueItem[]> {
  await ensureSeeded();
  const rows = await db
    .select({
      title: titles,
      position: watchProgress.position,
      duration: watchProgress.duration,
      episodeId: watchProgress.episodeId,
      episodeName: episodes.name,
      episodeNumber: episodes.number,
      season: episodes.season,
    })
    .from(watchProgress)
    .innerJoin(titles, eq(watchProgress.titleId, titles.id))
    .leftJoin(episodes, eq(watchProgress.episodeId, episodes.id))
    .where(eq(watchProgress.userKey, userKey))
    .orderBy(desc(watchProgress.updatedAt))
    .limit(limit);
  return rows.filter((r) => r.duration > 0 && r.position / r.duration < 0.97);
}

export async function getProgressFor(userKey: string, titleId: number) {
  const [row] = await db
    .select()
    .from(watchProgress)
    .where(and(eq(watchProgress.userKey, userKey), eq(watchProgress.titleId, titleId)))
    .limit(1);
  return row ?? null;
}

export async function getProgressMap(userKey: string, titleIds: number[]) {
  if (!titleIds.length) return new Map<number, { position: number; duration: number }>();
  const rows = await db
    .select({ titleId: watchProgress.titleId, position: watchProgress.position, duration: watchProgress.duration })
    .from(watchProgress)
    .where(and(eq(watchProgress.userKey, userKey), inArray(watchProgress.titleId, titleIds)));
  return new Map(rows.map((r) => [r.titleId, { position: r.position, duration: r.duration }]));
}

export async function incrementViews(titleId: number) {
  await db
    .update(titles)
    .set({ views: sql`${titles.views} + 1` })
    .where(eq(titles.id, titleId));
}
