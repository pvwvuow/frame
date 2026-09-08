/* Mobile data layer — Dexie schema, first-run catalog import, in-memory lite
 * index and the catalog query surface (mirrors src/lib/queries.ts).
 *
 * The Android build has no Node server: the catalog ships as JSON shards
 * (public/catalog/mobile/) and is imported into IndexedDB on first launch.
 * After that, list queries run from a ~5MB in-memory "lite" index while full
 * records (description/sources/episodes) are fetched per-title on demand.
 */

export type LiteTitle = {
  id: number;
  slug: string;
  title: string;
  titleEn: string;
  type: "movie" | "series";
  year: number;
  rating: number;
  duration: number;
  description: string;
  genres: string[];
  poster: string;
  backdrop: string;
  videoUrl: string;
  trailerUrl: string | null;
  quality: string;
  country: string;
  ageRating: string;
  sources: string;
  views: number;
  featured: boolean;
  trendingScore: number;
  director: string;
  cast: string[];
  createdAt: string;
};

export type EpisodeRec = {
  id: number;
  titleId: number;
  season: number;
  number: number;
  name: string;
  synopsis: string;
  duration: number;
  videoUrl: string;
  sources: string;
  thumbnail: string;
};

export type TitleView = LiteTitle;

export type CatalogManifest = {
  format: string;
  version: string;
  generatedAt: string;
  counts: { titles: number; movies: number; series: number; episodes: number };
  shardSize: number;
  shardCount: number;
};

import Dexie from "dexie";
import { isElectron } from "@/lib/platform";

/* ------------------------------------------------------------------ */
/* Dexie database                                                      */
/* ------------------------------------------------------------------ */

export const db = new Dexie("frame-mobile") as Dexie & {
  titles: Dexie.Table<Record<string, unknown>, number>;
  kv: Dexie.Table<{ key: string; value: unknown }, string>;
  favorites: Dexie.Table<Record<string, unknown>, number>;
  watchlist: Dexie.Table<Record<string, unknown>, number>;
  progress: Dexie.Table<Record<string, unknown>, number>;
  ratings: Dexie.Table<Record<string, unknown>, number>;
  reviews: Dexie.Table<Record<string, unknown>, number>;
  notificationsRead: Dexie.Table<{ id: string; userKey: string; at: string }, string>;
  profiles: Dexie.Table<Record<string, unknown>, string>;
  ucollections: Dexie.Table<Record<string, unknown>, number>;
  ucitems: Dexie.Table<Record<string, unknown>, number>;
};

db.version(1).stores({
  titles: "id, slug, type",
  kv: "key",
  favorites: "++id, [userKey+titleId], userKey, titleId",
  watchlist: "++id, [userKey+titleId], userKey, titleId",
  progress: "++id, [userKey+titleId], userKey, titleId",
  ratings: "++id, [userKey+titleId], userKey, titleId",
  reviews: "++id, titleId",
  notificationsRead: "id, userKey",
  profiles: "userKey",
});

/* v2 (v0.10.32): user collections — synced with the account like favorites */
db.version(2).stores({
  ucollections: "++id, [userKey+name], userKey, name",
  ucitems: "++id, [collectionId+titleId], collectionId, titleId",
});

/* stable episode ids derived from (title, season, number) */
export const episodeId = (titleId: number, season: number, number: number) => titleId * 100_000 + season * 1000 + number;

/* ------------------------------------------------------------------ */
/* Import + lite index                                                 */
/* ------------------------------------------------------------------ */

const MANIFEST_KEY = "catalog:manifest";
const LITE_KEY = (v: string) => `catalog:lite:v${v}`;

let lite: LiteTitle[] = [];
let byId = new Map<number, LiteTitle>();
let bySlug = new Map<string, LiteTitle>();
let manifest: CatalogManifest | null = null;
let initPromise: Promise<void> | null = null;

export const isReady = () => lite.length > 0;
export const currentManifest = () => manifest;
export const whenReady = () => initPromise ?? Promise.resolve();

export type ImportProgress = { done: number; total: number; phase: "check" | "download" | "index" | "done" };

/** True inside Electron (desktop build). The desktop installer ships no shard
 * catalog (public/catalog is ~69MB, excluded from the package), so there the
 * data layer is fed from the local API instead: /api/x/lite + rich endpoints
 * (see src/app/api/x/[...path]/route.ts). Android/browser keep Dexie+shards. */
export function isDesktopRuntime(): boolean {
  return isElectron();
}

/** Import (or fast-load) the catalog. Safe to call multiple times. */
export function initCatalog(onProgress?: (p: ImportProgress) => void): Promise<void> {
  if (!initPromise) initPromise = doInit(onProgress).catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

/** Make sure the lite index is loaded before an in-memory query runs.
 * Normally a no-op (CatalogGate imports before mounting the app); on the
 * desktop the gate passes through immediately and warms up in parallel, so
 * early queries await the same init promise here instead of reading empty. */
async function ensureReady(): Promise<void> {
  if (lite.length) return;
  await initCatalog();
}

async function doInit(onProgress?: (p: ImportProgress) => void): Promise<void> {
  const p = onProgress ?? (() => {});
  if (isDesktopRuntime()) {
    p({ done: 0, total: 1, phase: "check" });
    const r = await fetch("/api/x/lite", { cache: "no-cache" }).then((res) => res.json()) as { manifest: CatalogManifest; titles: LiteTitle[] };
    lite = r.titles ?? [];
    reindex();
    manifest = r.manifest ?? null;
    p({ done: 1, total: 1, phase: "done" });
    return;
  }
  const remote = await fetch("/catalog/mobile/manifest.json", { cache: "no-cache" }).then((r) => r.json()) as CatalogManifest;

  const stored = await db.kv.get(MANIFEST_KEY);
  const storedManifest = stored?.value as CatalogManifest | undefined;
  if (storedManifest && storedManifest.version === remote.version) {
    const hit = await db.kv.get(LITE_KEY(remote.version));
    if (hit) {
      lite = hit.value as LiteTitle[];
      reindex();
      manifest = storedManifest;
      p({ done: 1, total: 1, phase: "done" });
      return;
    }
  }

  // full import
  p({ done: 0, total: remote.shardCount + 1, phase: "download" });
  const collected: LiteTitle[] = [];
  await db.titles.clear();
  for (let s = 0; s < remote.shardCount; s++) {
    const name = `full-${String(s).padStart(2, "0")}.json`;
    const rows = await fetch(`/catalog/mobile/${name}`, { cache: "force-cache" }).then((r) => r.json()) as Record<string, unknown>[];
    const clean = rows.map((t, i) => sanitizeTitle(t, s * remote.shardSize + i + 1));
    await db.titles.bulkPut(clean);
    for (const t of clean) collected.push(toLite(t));
    p({ done: s + 1, total: remote.shardCount + 1, phase: "download" });
  }

  lite = collected;
  reindex();
  manifest = remote;
  await db.kv.bulkPut([
    { key: MANIFEST_KEY, value: remote },
    { key: LITE_KEY(remote.version), value: lite },
  ]);
  p({ done: remote.shardCount + 1, total: remote.shardCount + 1, phase: "done" });
}

type CatalogTitle = {
  id: number; slug: string; title: string; titleEn: string; type: string; year: number; rating: number;
  duration: number; description: string; genres: string[]; poster: string; backdrop: string;
  videoUrl: string; trailerUrl?: string | null; director: string; cast: string[]; country: string;
  ageRating: string; quality: string; sources: string; featured: boolean; trendingScore: number;
  views: number; source?: string; episodes?: Record<string, unknown>[];
};

/** Normalize one JSON title: parse genres/cast, assign episode ids, fill defaults. */
function sanitizeTitle(t: Record<string, unknown>, fallbackId: number): CatalogTitle {
  const arr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } }
    return [];
  };
  const id = Number(t.id) || fallbackId;
  const eps = Array.isArray(t.episodes) ? (t.episodes as Record<string, unknown>[]) : [];
  const episodes = eps
    .map((e) => {
      const season = Number(e.season) || 1;
      const number = Number(e.number) || 0;
      return {
        id: episodeId(id, season, number),
        titleId: id,
        season,
        number,
        name: String(e.name ?? `قسمت ${number}`),
        synopsis: String(e.synopsis ?? ""),
        duration: Number(e.duration) || 45,
        videoUrl: String(e.videoUrl ?? ""),
        sources: typeof e.sources === "string" ? e.sources : JSON.stringify(e.sources ?? []),
        thumbnail: String(e.thumbnail ?? ""),
      };
    })
    .sort((a, b) => a.season - b.season || a.number - b.number);
  return {
    id,
    slug: String(t.slug ?? ""),
    title: String(t.title ?? ""),
    titleEn: String(t.titleEn ?? ""),
    type: t.type === "series" ? "series" : "movie",
    year: Number(t.year) || 0,
    rating: Number(t.rating) || 0,
    duration: Number(t.duration) || 0,
    description: String(t.description ?? ""),
    genres: arr(t.genres),
    poster: String(t.poster ?? ""),
    backdrop: String(t.backdrop ?? ""),
    videoUrl: String(t.videoUrl ?? ""),
    trailerUrl: t.trailerUrl ? String(t.trailerUrl) : null,
    director: String(t.director ?? ""),
    cast: arr(t.cast),
    country: String(t.country ?? "ایران"),
    ageRating: String(t.ageRating ?? "+13"),
    quality: String(t.quality ?? "4K"),
    sources: typeof t.sources === "string" ? t.sources : JSON.stringify(t.sources ?? []),
    featured: !!t.featured,
    trendingScore: Number(t.trendingScore) || 0,
    views: Number(t.views) || 0,
    source: String(t.source ?? "demo"),
    episodes,
  };
}

function toLite(t: CatalogTitle): LiteTitle {
  return {
    id: t.id, slug: t.slug, title: t.title, titleEn: t.titleEn,
    type: t.type as "movie" | "series", year: t.year, rating: t.rating, duration: t.duration,
    description: "", genres: t.genres, poster: t.poster, backdrop: t.backdrop, quality: t.quality,
    country: t.country, ageRating: t.ageRating, views: t.views, featured: t.featured,
    trendingScore: t.trendingScore, director: t.director, cast: t.cast,
    videoUrl: "", trailerUrl: null, sources: "[]", createdAt: "",
  };
}

function reindex() {
  byId = new Map(lite.map((t) => [t.id, t]));
  bySlug = new Map(lite.map((t) => [t.slug, t]));
}

/* ------------------------------------------------------------------ */
/* Full record access                                                  */
/* ------------------------------------------------------------------ */

export async function getFullTitle(id: number): Promise<TitleView | null> {
  if (isDesktopRuntime()) {
    const r = await fetch(`/api/x/full/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { title: TitleView | null; episodes?: EpisodeRec[] };
    return j.title ?? null;
  }
  const l = byId.get(id);
  if (!l) return null;
  const full = (await db.titles.get(id)) as unknown as CatalogTitle | undefined;
  if (!full) return null;
  return {
    ...l,
    description: full.description ?? "",
    videoUrl: full.videoUrl ?? "",
    trailerUrl: full.trailerUrl ?? null,
    sources: full.sources ?? "[]",
    createdAt: manifest?.generatedAt ?? new Date().toISOString(),
  };
}

export async function getEpisodes(titleId: number): Promise<EpisodeRec[]> {
  if (isDesktopRuntime()) {
    const r = await fetch(`/api/x/episodes/${titleId}`, { cache: "no-store" });
    if (!r.ok) return [];
    return (await r.json()) as EpisodeRec[];
  }
  const full = (await db.titles.get(titleId)) as unknown as CatalogTitle | undefined;
  return (full?.episodes as unknown as EpisodeRec[]) ?? [];
}

/* ------------------------------------------------------------------ */
/* Catalog queries (mirrors src/lib/queries.ts)                        */
/* ------------------------------------------------------------------ */

export const GENRES = [
  "اکشن", "درام", "کمدی", "هیجان‌انگیز", "جنایی", "علمی‌تخیلی", "ترسناک", "عاشقانه",
  "ماجراجویی", "معمایی", "تاریخی", "جنگی", "حماسی", "نوآر",
];

export type CatalogQuery = { genre?: string; sort?: string; year?: number; minRating?: number };
export type TitleListItem = LiteTitle;

const bySort = (sort?: string) => {
  switch (sort) {
    case "rating": return (a: LiteTitle, b: LiteTitle) => b.rating - a.rating || b.id - a.id;
    case "newest": return (a: LiteTitle, b: LiteTitle) => b.year - a.year || b.id - a.id;
    case "views": return (a: LiteTitle, b: LiteTitle) => b.views - a.views || b.id - a.id;
    case "name": return (a: LiteTitle, b: LiteTitle) => a.title.localeCompare(b.title, "fa");
    default: return (a: LiteTitle, b: LiteTitle) => b.trendingScore - a.trendingScore || b.id - a.id;
  }
};

const matches = (t: LiteTitle, opts: CatalogQuery) =>
  (!opts.genre || t.genres.includes(opts.genre)) &&
  (!opts.year || t.year === opts.year) &&
  (!opts.minRating || t.rating >= opts.minRating);

export async function getFeatured(): Promise<TitleView[]> {
  await ensureReady();
  const rows = lite.filter((t) => t.featured).sort(bySort("trending")).slice(0, 5);
  const full = await Promise.all(rows.map((r) => getFullTitle(r.id)));
  return full.filter((t): t is TitleView => t !== null);
}

export async function getTrending(limit = 12): Promise<LiteTitle[]> {
  await ensureReady();
  return [...lite].sort(bySort("trending")).slice(0, limit);
}

export async function getNewest(limit = 12): Promise<LiteTitle[]> {
  await ensureReady();
  return [...lite].sort(bySort("newest")).slice(0, limit);
}

export async function getTopRated(limit = 12): Promise<LiteTitle[]> {
  await ensureReady();
  return [...lite].sort(bySort("rating")).slice(0, limit);
}

export async function getByType(
  type: "movie" | "series",
  opts: { genre?: string; sort?: string; year?: number; minRating?: number; limit?: number } = {}
): Promise<LiteTitle[]> {
  await ensureReady();
  const rows = lite.filter((t) => t.type === type && matches(t, opts)).sort(bySort(opts.sort));
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export async function getCatalogPage(
  type: "movie" | "series",
  opts: CatalogQuery,
  page = 0,
  pageSize = 48
): Promise<{ items: TitleListItem[]; total: number }> {
  await ensureReady();
  const rows = lite.filter((t) => t.type === type && matches(t, opts)).sort(bySort(opts.sort));
  return { items: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length };
}

export async function getByGenre(genre: string, limit = 12): Promise<LiteTitle[]> {
  await ensureReady();
  return lite.filter((t) => t.genres.includes(genre)).sort(bySort("rating")).slice(0, limit);
}

export async function getByDirector(director: string, excludeId: number, limit = 8): Promise<LiteTitle[]> {
  await ensureReady();
  if (!director) return [];
  return lite.filter((t) => t.director === director && t.id !== excludeId).sort(bySort("rating")).slice(0, limit);
}

export async function getTitleLiteBySlug(slug: string): Promise<LiteTitle | null> {
  await ensureReady();
  return bySlug.get(slug) ?? null;
}

export async function getSimilar(t: Pick<LiteTitle, "id" | "genres">, limit = 10): Promise<LiteTitle[]> {
  await ensureReady();
  return lite
    .filter((x) => x.id !== t.id && x.genres.some((g) => t.genres.includes(g)))
    .sort(bySort("rating"))
    .slice(0, limit);
}

/* search – same scoring as the desktop search (Persian normalization) */
function normFa(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064A\u0649]/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/\u0629/g, "\u0647")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\u200B-\u200F\u2060]/g, " ")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
const compactKey = (s: string) => normFa(s).replace(/\s+/g, "");

let searchEntries: { primary: string; secondary: string }[] | null = null;
function buildSearchEntries() {
  if (searchEntries) return searchEntries;
  searchEntries = lite.map((t) => ({
    primary: [compactKey(t.title), compactKey(t.titleEn)].join("\u0001"),
    secondary: [compactKey(t.director), compactKey(t.cast.join("\u0001")), compactKey(t.genres.join("\u0001"))].join("\u0001"),
  }));
  return searchEntries;
}

export async function search(q: string, limit = 30): Promise<LiteTitle[]> {
  await ensureReady();
  const words = normFa(q).split(/\s+/).filter(Boolean).map(compactKey);
  if (!words.length) return [];
  const entries = buildSearchEntries();
  const scored: { idx: number; sc: number }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { primary, secondary } = entries[i];
    let inPrimary = 0;
    let miss = false;
    for (const w of words) {
      if (primary.includes(w)) inPrimary++;
      else if (!secondary.includes(w)) { miss = true; break; }
    }
    if (miss) continue;
    const row = lite[i];
    let sc = inPrimary * 8;
    if (inPrimary === words.length) sc += 100;
    if (primary.startsWith(words[0])) sc += 30;
    sc += (row.trendingScore || 0) / 100;
    scored.push({ idx: i, sc });
  }
  scored.sort((a, b) => b.sc - a.sc || lite[b.idx].id - lite[a.idx].id);
  return scored.slice(0, limit).map((s) => lite[s.idx]);
}

export type GenreSummary = { genre: string; count: number; movies: number; series: number; covers: string[]; avgRating: number };

export async function getGenreSummaries(): Promise<GenreSummary[]> {
  await ensureReady();
  return GENRES.map((genre) => {
    const items = lite.filter((t) => t.genres.includes(genre));
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
  await ensureReady();
  const rows = lite.filter((t) => t.type === type);
  const avg = rows.length ? rows.reduce((a, t) => a + t.rating, 0) / rows.length : 0;
  const top = [...rows].sort(bySort("trending"))[0] ?? null;
  return {
    count: rows.length,
    avgRating: Math.round(avg * 10) / 10,
    totalViews: rows.reduce((a, t) => a + t.views, 0),
    top,
  };
}

export async function getYears(type: "movie" | "series"): Promise<number[]> {
  await ensureReady();
  const set = new Set<number>();
  for (const t of lite) if (t.type === type && t.year) set.add(t.year);
  return [...set].sort((a, b) => b - a);
}

/* collections – editorial, rule-based shelves */
export type Collection = {
  slug: string; title: string; tagline: string; hue: number;
  rule: (t: LiteTitle) => boolean;
  sort?: (a: LiteTitle, b: LiteTitle) => number;
};

export const COLLECTIONS: Collection[] = [
  { slug: "top-rated", title: "شاهکارها", tagline: "بالاترین امتیازهای فریم", hue: 45, rule: (t) => t.rating >= 8, sort: (a, b) => b.rating - a.rating },
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
  await ensureReady();
  return COLLECTIONS.map((c) => {
    const all = lite.filter(c.rule);
    const items = [...all].sort(c.sort ?? (() => 0)).slice(0, limitPer);
    return { slug: c.slug, title: c.title, tagline: c.tagline, hue: c.hue, count: all.length, items };
  }).filter((c) => c.items.length > 0);
}

export async function getCollection(slug: string) {
  await ensureReady();
  const c = COLLECTIONS.find((x) => x.slug === slug);
  if (!c) return null;
  const items = lite.filter(c.rule).sort(c.sort ?? (() => 0));
  return { slug: c.slug, title: c.title, tagline: c.tagline, hue: c.hue, items };
}

/* people */
export async function getByPerson(name: string) {
  await ensureReady();
  const rows = lite.filter((t) => t.director === name || t.cast.includes(name)).sort(bySort("rating"));
  return {
    name,
    directed: rows.filter((t) => t.director === name),
    acted: rows.filter((t) => t.cast.includes(name)),
  };
}

export async function getPeopleIndex() {
  await ensureReady();
  const map = new Map<string, { name: string; roles: Set<"director" | "actor">; count: number; cover: string; score: number }>();
  for (const r of lite) {
    const bump = (name: string, role: "director" | "actor") => {
      if (!name) return;
      const e = map.get(name) ?? { name, roles: new Set(), count: 0, cover: r.poster, score: 0 };
      e.roles.add(role);
      e.count += 1;
      e.score += r.rating;
      map.set(name, e);
    };
    bump(r.director, "director");
    r.cast.forEach((c) => bump(c, "actor"));
  }
  return Array.from(map.values())
    .map((e) => ({ ...e, roles: Array.from(e.roles), avg: Math.round((e.score / e.count) * 10) / 10 }))
    .sort((a, b) => b.count - a.count || b.avg - a.avg);
}

export async function getRankings(type?: "movie" | "series", limit = 100): Promise<LiteTitle[]> {
  await ensureReady();
  return lite
    .filter((t) => (!type || t.type === type) && t.views >= 5_000)
    .sort((a, b) => b.rating - a.rating || b.views - a.views)
    .slice(0, limit);
}

export async function getRandomTitle(opts: { type?: "movie" | "series"; genre?: string; excludeIds?: number[] } = {}): Promise<LiteTitle | null> {
  await ensureReady();
  const ex = new Set(opts.excludeIds ?? []);
  const rows = lite.filter(
    (t) => (!opts.type || t.type === opts.type) && (!opts.genre || t.genres.includes(opts.genre)) && !ex.has(t.id)
  );
  return rows.length ? rows[Math.floor(Math.random() * rows.length)] : null;
}

/** Views counter is session-local on mobile (the APK catalog is read-only). */
const viewBumps = new Map<number, number>();
export function bumpViews(titleId: number) {
  viewBumps.set(titleId, (viewBumps.get(titleId) ?? 0) + 1);
}
export function viewsOf(t: LiteTitle): number {
  return t.views + (viewBumps.get(t.id) ?? 0);
}
