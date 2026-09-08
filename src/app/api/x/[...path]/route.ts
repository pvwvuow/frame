import type { Title as DbTitle } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { getUserKey } from "@/lib/user";
import {
  getWatchlistIds,
  getContinueWatching,
  getProgressFor,
  getProgressMap,
  isInWatchlist,
  getEpisodes,
  getReviews,
} from "@/lib/queries";
import {
  getFavoriteRows,
  getMyListRows,
  getHistory,
  isFavorite,
  getUserScore,
  getUserStats,
} from "@/lib/library";

export const dynamic = "force-dynamic";

/* Desktop-only data bridge (v0.10.31).
 *
 * The Android merge moved the shared client pages (home, search, my-list,
 * favorites, history, profile…) onto the mobile data layer, which reads a
 * bundled shard catalog into IndexedDB. The desktop installer intentionally
 * does NOT ship public/catalog (~69MB), so on Electron that layer must be
 * fed from the local Prisma DB instead. These endpoints mirror the exact
 * response shapes the mobile (Dexie) implementations return, so the client
 * code is platform-agnostic.
 *
 * Android never hits /api/x/* — it uses Dexie + the fetch shim.
 */

const J = (s: string): string[] => {
  try {
    const p = JSON.parse(s || "[]");
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
};

/** Project a full DbTitle row to the "lite" list shape the mobile layer uses. */
const liteOf = (t: DbTitle) => ({
  id: t.id,
  slug: t.slug,
  title: t.title,
  titleEn: t.titleEn,
  type: t.type === "series" ? ("series" as const) : ("movie" as const),
  year: t.year,
  rating: t.rating,
  duration: t.duration,
  description: "",
  genres: J(t.genres),
  poster: t.poster,
  backdrop: t.backdrop,
  quality: t.quality,
  country: t.country,
  ageRating: t.ageRating,
  views: t.views,
  featured: t.featured,
  trendingScore: t.trendingScore,
  director: t.director,
  cast: J(t.cast),
  videoUrl: "",
  trailerUrl: null as string | null,
  sources: "[]",
  createdAt: "",
});

const noStore = { "Cache-Control": "no-store" };
const ok = (data: unknown) => Response.json(data, { headers: noStore });
const num = (v: string | null): number => Math.max(0, Number(v ?? 0) || 0);

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  await ensureSeeded();
  const { path } = await ctx.params;
  const [head, arg] = path;
  const sp = new URL(req.url).searchParams;
  const userKey = await getUserKey();

  switch (head) {
    /* in-memory lite index — the desktop counterpart of the shard catalog */
    case "lite": {
      const rows = await db.title.findMany({ orderBy: { id: "asc" } });
      const movies = rows.filter((r) => r.type !== "series").length;
      return ok({
        manifest: {
          format: "frame-lite",
          version: `db-${rows.length}`,
          generatedAt: new Date().toISOString(),
          counts: { titles: rows.length, movies, series: rows.length - movies, episodes: 0 },
          shardSize: 0,
          shardCount: 0,
        },
        titles: rows.map(liteOf),
      });
    }

    /* full record by id (getFullTitle) */
    case "full": {
      const id = Number(arg);
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      const row = await db.title.findUnique({ where: { id } });
      if (!row) return ok({ title: null, episodes: [] });
      const episodes = await db.episode.findMany({
        where: { titleId: id },
        orderBy: [{ season: "asc" }, { number: "asc" }],
      });
      return ok({
        title: {
          ...liteOf(row),
          description: row.description,
          videoUrl: row.videoUrl,
          trailerUrl: row.trailerUrl ?? null,
          sources: row.sources,
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
        },
        episodes,
      });
    }

    /* episodes of a title (getEpisodes) */
    case "episodes": {
      const id = Number(arg);
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      const episodes = await db.episode.findMany({
        where: { titleId: id },
        orderBy: [{ season: "asc" }, { number: "asc" }],
      });
      return ok(episodes);
    }

    /* rich user rows */
    case "favorites":
      return ok(await getFavoriteRows(userKey));

    case "list":
      return ok(await getMyListRows(userKey));

    case "history":
      return ok(await getHistory(userKey));

    case "continue":
      return ok(await getContinueWatching(userKey, Math.min(48, Math.max(1, num(sp.get("limit")) || 12))));

    case "stats":
      return ok(await getUserStats(userKey));

    case "score":
      return ok(await getUserScore(userKey, Number(sp.get("titleId")) || 0));

    case "reviews":
      return ok(await getReviews(Number(sp.get("titleId")) || 0));

    case "progress": {
      const titleId = Number(sp.get("titleId")) || 0;
      const r = await getProgressFor(userKey, titleId);
      return ok(r ? { titleId, episodeId: r.episodeId ?? null, position: r.position, duration: r.duration, updatedAt: "" } : null);
    }

    case "progress-map": {
      const ids = (sp.get("ids") ?? "")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter(Boolean)
        .slice(0, 500);
      const m = await getProgressMap(userKey, ids);
      return ok(Object.fromEntries(m));
    }

    case "watchlist-ids":
      return ok(await getWatchlistIds(userKey));

    case "is-favorite":
      return ok(await isFavorite(userKey, Number(sp.get("titleId")) || 0));

    case "in-watchlist":
      return ok(await isInWatchlist(userKey, Number(sp.get("titleId")) || 0));

    default:
      return Response.json({ error: "not-found", path: `/${["api", "x", ...path].join("/")}` }, { status: 404 });
  }
}
