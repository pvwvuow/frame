import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import type { Title as DbTitle } from "@prisma/client";

export type TitleView = Omit<DbTitle, "genres" | "cast"> & {
  genres: string[];
  cast: string[];
};

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

const hasGenre = (g: string) => `"${g}"`;

export async function getFeatured() {
  await ensureSeeded();
  const rows = await db.title.findMany({
    where: { featured: true },
    orderBy: { trendingScore: "desc" },
    take: 5,
  });
  return rows.map(pv);
}

export async function getTrending(limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { trendingScore: "desc" }, take: limit });
  return rows.map(pv);
}

export async function getNewest(limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({
    orderBy: [{ year: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(pv);
}

export async function getTopRated(limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { rating: "desc" }, take: limit });
  return rows.map(pv);
}

export async function getByType(
  type: "movie" | "series",
  opts: { genre?: string; sort?: string; year?: number; minRating?: number } = {}
) {
  await ensureSeeded();
  const orderBy =
    opts.sort === "rating"
      ? { rating: "desc" as const }
      : opts.sort === "newest"
        ? { year: "desc" as const }
        : opts.sort === "views"
          ? { views: "desc" as const }
          : { trendingScore: "desc" as const };
  const rows = await db.title.findMany({
    where: {
      type,
      ...(opts.genre ? { genres: { contains: hasGenre(opts.genre) } } : {}),
      ...(opts.year ? { year: opts.year } : {}),
      ...(opts.minRating ? { rating: { gte: opts.minRating } } : {}),
    },
    orderBy,
  });
  return rows.map(pv);
}

export async function getByGenre(genre: string, limit = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({
    where: { genres: { contains: hasGenre(genre) } },
    orderBy: { rating: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export async function getTitleBySlug(slug: string) {
  await ensureSeeded();
  const t = await db.title.findUnique({ where: { slug } });
  return t ? pv(t) : null;
}

export async function getEpisodes(titleId: number) {
  return db.episode.findMany({
    where: { titleId },
    orderBy: [{ season: "asc" }, { number: "asc" }],
  });
}

export async function getSimilar(t: TitleView, limit = 10) {
  const rows = await db.title.findMany({
    where: {
      id: { not: t.id },
      OR: t.genres.map((g) => ({ genres: { contains: hasGenre(g) } })),
    },
    orderBy: { rating: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export async function getReviews(titleId: number) {
  return db.review.findMany({
    where: { titleId },
    orderBy: { createdAt: "desc" },
  });
}

/* ------------------------------------------------------------------ */
/* search – forgiving, normalization-aware matching                    */
/*                                                                    */
/* The catalog is small (a few hundred rows), so instead of SQLite     */
/* LIKE (ASCII-only case folding, no Persian normalization, strict     */
/* word order) we score rows in JS:                                    */
/*   - Persian/Arabic folding: ي/ى→ی, ك→ک, أإآ→ا, ة→ه, ۰-۹↔0-9        */
/*   - separators are interchangeable: ZWNJ, space and punctuation     */
/*     all collapse, so «علمی‌تخیلی» matches "علمی تخیلی"              */
/*   - every whitespace-separated word must appear somewhere           */
/*     (title / English title / cast / director / genres), any order   */
/*   - hits on the title rank above hits on people/genres              */
/* ------------------------------------------------------------------ */

function normFa(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064A\u0649]/g, "\u06CC") // ي ى → ی
    .replace(/\u0643/g, "\u06A9") // ك → ک
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // آ أ إ → ا
    .replace(/\u0629/g, "\u0647") // ة → ه
    .replace(/[\u064B-\u065F\u0670]/g, "") // harakat / tanvin
    .replace(/[\u200B-\u200F\u2060]/g, " ") // ZWNJ & friends → space
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Compact key: normalized text with every separator removed, so "علمی
 *  تخیلی", «علمی‌تخیلی» and "علمیتخیلی" all produce the same key. */
function compactKey(s: string): string {
  return normFa(s).replace(/\s+/g, "");
}

type SearchIndexEntry = { row: DbTitle; primary: string; secondary: string };

let searchIndex: { at: number; count: number; entries: SearchIndexEntry[] } | null = null;
const SEARCH_TTL_MS = 30_000;

async function getSearchIndex(): Promise<SearchIndexEntry[]> {
  const now = Date.now();
  if (searchIndex && now - searchIndex.at < SEARCH_TTL_MS) {
    // cheap staleness guard: a catalog refresh adds/removes rows
    const count = await db.title.count();
    if (count === searchIndex.count) return searchIndex.entries;
  }
  const rows = await db.title.findMany();
  const entries = rows.map((row) => ({
    row,
    // \u0001 keeps adjacent fields from fusing into one false-match token
    primary: [compactKey(row.title), compactKey(row.titleEn)].join("\u0001"),
    secondary: [compactKey(row.director), compactKey(row.cast), compactKey(row.genres)].join("\u0001"),
  }));
  searchIndex = { at: now, count: rows.length, entries };
  return entries;
}

export async function search(q: string, limit = 30) {
  await ensureSeeded();
  const words = normFa(q).split(/\s+/).filter(Boolean).map((w) => compactKey(w));
  if (!words.length) return [];
  const entries = await getSearchIndex();
  const scored: { row: DbTitle; sc: number }[] = [];
  for (const { row, primary, secondary } of entries) {
    let inPrimary = 0;
    let miss = false;
    for (const w of words) {
      if (primary.includes(w)) inPrimary++;
      else if (!secondary.includes(w)) {
        miss = true;
        break;
      }
    }
    if (miss) continue;
    let sc = inPrimary * 8;
    if (inPrimary === words.length) sc += 100;
    if (primary.startsWith(words[0])) sc += 30;
    sc += (row.trendingScore || 0) / 100;
    scored.push({ row, sc });
  }
  scored.sort((a, b) => b.sc - a.sc || b.row.id - a.row.id);
  return scored.slice(0, limit).map((s) => pv(s.row));
}

export async function getWatchlistIds(userKey: string) {
  const rows = await db.watchlist.findMany({
    where: { userKey },
    select: { titleId: true },
  });
  return rows.map((r) => r.titleId);
}

export async function getWatchlist(userKey: string) {
  await ensureSeeded();
  const rows = await db.watchlist.findMany({
    where: { userKey },
    include: { title: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ title: pv(r.title), addedAt: r.createdAt }));
}

export async function isInWatchlist(userKey: string, titleId: number) {
  const count = await db.watchlist.count({ where: { userKey, titleId } });
  return count > 0;
}

export type ContinueItem = {
  title: TitleView;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
};

export async function getContinueWatching(userKey: string, limit = 12): Promise<ContinueItem[]> {
  await ensureSeeded();
  const rows = await db.watchProgress.findMany({
    where: { userKey },
    include: { title: true, episode: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows
    .filter((r) => r.duration > 0 && r.position / r.duration < 0.97)
    .map((r) => ({
      title: pv(r.title),
      position: r.position,
      duration: r.duration,
      episodeId: r.episodeId,
      episodeName: r.episode?.name ?? null,
      episodeNumber: r.episode?.number ?? null,
      season: r.episode?.season ?? null,
    }));
}

export async function getProgressFor(userKey: string, titleId: number) {
  const row = await db.watchProgress.findUnique({
    where: { userKey_titleId: { userKey, titleId } },
  });
  return row ?? null;
}

export async function getProgressMap(userKey: string, titleIds: number[]) {
  if (!titleIds.length) return new Map<number, { position: number; duration: number }>();
  const rows = await db.watchProgress.findMany({
    where: { userKey, titleId: { in: titleIds } },
    select: { titleId: true, position: true, duration: true },
  });
  return new Map(rows.map((r) => [r.titleId, { position: r.position, duration: r.duration }]));
}

export async function incrementViews(titleId: number) {
  await db.title.update({
    where: { id: titleId },
    data: { views: { increment: 1 } },
  });
}

export async function getByDirector(director: string, excludeId: number, limit = 8) {
  if (!director) return [];
  const rows = await db.title.findMany({
    where: { director, id: { not: excludeId } },
    orderBy: { rating: "desc" },
    take: limit,
  });
  return rows.map(pv);
}

export type GenreSummary = {
  genre: string;
  count: number;
  movies: number;
  series: number;
  covers: string[];
  avgRating: number;
};

export async function getGenreSummaries(): Promise<GenreSummary[]> {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { trendingScore: "desc" } });
  const all = rows.map(pv);
  return GENRES.map((genre) => {
    const items = all.filter((t) => t.genres.includes(genre));
    const avg = items.length ? items.reduce((a, t) => a + t.rating, 0) / items.length : 0;
    return {
      genre,
      count: items.length,
      movies: items.filter((t) => t.type === "movie").length,
      series: items.filter((t) => t.type === "series").length,
      covers: items.slice(0, 4).map((t) => t.poster),
      avgRating: Math.round(avg * 10) / 10,
    };
  }).filter((g) => g.count > 0);
}

export async function getCatalogStats(type: "movie" | "series") {
  await ensureSeeded();
  const [count, agg, top] = await Promise.all([
    db.title.count({ where: { type } }),
    db.title.aggregate({ where: { type }, _avg: { rating: true }, _sum: { views: true } }),
    db.title.findFirst({ where: { type }, orderBy: { trendingScore: "desc" } }),
  ]);
  return {
    count,
    avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
    totalViews: agg._sum.views ?? 0,
    top: top ? pv(top) : null,
  };
}

export async function getYears(type: "movie" | "series") {
  const rows = await db.title.findMany({ where: { type }, select: { year: true }, distinct: ["year"], orderBy: { year: "desc" } });
  return rows.map((r) => r.year);
}

/* ------------------------------------------------------------------ */
/*  Collections – editorial, rule-based shelves                        */
/* ------------------------------------------------------------------ */
export type Collection = {
  slug: string;
  title: string;
  tagline: string;
  hue: number;
  rule: (t: TitleView) => boolean;
  sort?: (a: TitleView, b: TitleView) => number;
};

export const COLLECTIONS: Collection[] = [
  { slug: "top-rated", title: "شاهکارها", tagline: "بالاترین امتیازهای نما", hue: 45, rule: (t) => t.rating >= 8, sort: (a, b) => b.rating - a.rating },
  { slug: "binge", title: "یک‌نفس تا صبح", tagline: "سریال‌هایی که نمی‌شود رها کرد", hue: 265, rule: (t) => t.type === "series", sort: (a, b) => b.trendingScore - a.trendingScore },
  { slug: "noir-nights", title: "شب‌های نوآر", tagline: "سایه، باران و رازهای شهر", hue: 210, rule: (t) => t.genres.some((g) => ["نوآر", "جنایی", "معمایی"].includes(g)) },
  { slug: "future", title: "سفر به آینده", tagline: "علمی‌تخیلی و فراتر از زمین", hue: 190, rule: (t) => t.genres.includes("علمی‌تخیلی") },
  { slug: "adrenaline", title: "آدرنالین", tagline: "اکشن و هیجان بی‌وقفه", hue: 5, rule: (t) => t.genres.some((g) => ["اکشن", "هیجان‌انگیز", "ماجراجویی"].includes(g)) },
  { slug: "epic", title: "حماسه‌های تاریخی", tagline: "روایت‌های بزرگ از گذشته", hue: 30, rule: (t) => t.genres.some((g) => ["تاریخی", "حماسی", "جنگی"].includes(g)) },
  { slug: "heart", title: "برای دل", tagline: "عاشقانه و درام", hue: 330, rule: (t) => t.genres.some((g) => ["عاشقانه", "درام"].includes(g)) },
  { slug: "short-watch", title: "کمتر از دو ساعت", tagline: "فیلم‌های جمع‌وجور برای امشب", hue: 150, rule: (t) => t.type === "movie" && t.duration > 0 && t.duration <= 120, sort: (a, b) => a.duration - b.duration },
  { slug: "family", title: "مناسب خانواده", tagline: "رده سنی پایین‌تر از +۱۶", hue: 100, rule: (t) => ["+3", "+7", "+13", "همه"].includes(t.ageRating) },
  { slug: "fresh", title: "تازه‌نفس", tagline: "محصولات دو سال اخیر", hue: 280, rule: (t) => t.year >= new Date().getFullYear() - 2, sort: (a, b) => b.year - a.year },
];

export async function getCollections(limitPer = 12) {
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { trendingScore: "desc" } });
  const all = rows.map(pv);
  return COLLECTIONS.map((c) => {
    const items = all.filter(c.rule).sort(c.sort ?? (() => 0)).slice(0, limitPer);
    return { slug: c.slug, title: c.title, tagline: c.tagline, hue: c.hue, count: all.filter(c.rule).length, items };
  }).filter((c) => c.items.length > 0);
}

export async function getCollection(slug: string) {
  const c = COLLECTIONS.find((x) => x.slug === slug);
  if (!c) return null;
  await ensureSeeded();
  const rows = await db.title.findMany({ orderBy: { trendingScore: "desc" } });
  const items = rows.map(pv).filter(c.rule).sort(c.sort ?? (() => 0));
  return { slug: c.slug, title: c.title, tagline: c.tagline, hue: c.hue, items };
}

/* ------------------------------------------------------------------ */
/*  People – director / cast pages                                      */
/* ------------------------------------------------------------------ */
export async function getByPerson(name: string) {
  await ensureSeeded();
  const rows = await db.title.findMany({
    where: { OR: [{ director: name }, { cast: { contains: `"${name}"` } }] },
    orderBy: { rating: "desc" },
  });
  const all = rows.map(pv);
  return {
    name,
    directed: all.filter((t) => t.director === name),
    acted: all.filter((t) => t.cast.includes(name)),
  };
}

export async function getPeopleIndex() {
  await ensureSeeded();
  const rows = await db.title.findMany({ select: { director: true, cast: true, poster: true, rating: true } });
  const map = new Map<string, { name: string; roles: Set<"director" | "actor">; count: number; cover: string; score: number }>();
  for (const r of rows) {
    let cast: string[] = [];
    try {
      cast = JSON.parse(r.cast || "[]");
    } catch {
      /* ignore */
    }
    const bump = (name: string, role: "director" | "actor") => {
      if (!name) return;
      const e = map.get(name) ?? { name, roles: new Set(), count: 0, cover: r.poster, score: 0 };
      e.roles.add(role);
      e.count += 1;
      e.score += r.rating;
      map.set(name, e);
    };
    bump(r.director, "director");
    cast.forEach((c) => bump(c, "actor"));
  }
  return Array.from(map.values())
    .map((e) => ({ ...e, roles: Array.from(e.roles), avg: Math.round((e.score / e.count) * 10) / 10 }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg);
}

/* ------------------------------------------------------------------ */
/*  Random pick – "امشب چی ببینم؟"                                     */
/* ------------------------------------------------------------------ */
export async function getRandomTitle(opts: { type?: "movie" | "series"; genre?: string; excludeIds?: number[] } = {}) {
  await ensureSeeded();
  const rows = await db.title.findMany({
    where: {
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.genre ? { genres: { contains: hasGenre(opts.genre) } } : {}),
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
    },
  });
  if (!rows.length) return null;
  return pv(rows[Math.floor(Math.random() * rows.length)]);
}
