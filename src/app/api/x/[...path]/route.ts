import type { Title as DbTitle } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { getUserKey } from "@/lib/user";
import {
  getWatchlistIds,
  getContinueWatching,
  getProgressFor,
  getEpisodeProgress,
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

/** /covers/{tt}/… → metahub URL (the desktop installer ships no covers, so
 *  the client's posterSrc/backdropSrc stream artwork remotely by default). */
const ttOf = (p: string): string => {
  const m = /^\/covers\/(tt\d+)\//.exec(p || "");
  return m ? m[1] : "";
};
const metahub = (tt: string, kind: string): string =>
  tt ? `https://images.metahub.space/${kind}/${tt}/img` : "";

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
  // v0.25.0 — remote cover URLs (posterSrc/backdropSrc prefer them)
  posterUrl: metahub(ttOf(t.poster), "poster/small"),
  backdropUrl: metahub(ttOf(t.backdrop), "background/medium"),
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
  // real add-date when the DB row has one (null rows → ""), «جدیدترین‌ها» sort
  createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : "",
});

const noStore = { "Cache-Control": "no-store" };
const ok = (data: unknown) => Response.json(data, { headers: noStore });
const num = (v: string | null): number => Math.max(0, Number(v ?? 0) || 0);

/* A-3 — فقط ستون‌های سبکِ lite از DB خوانده می‌شوند؛ description/sources/cast
 * (چند-KB برای هر ردیف × ۱۴,۸۷۴) روی سیم نمی‌روند که بعداً دور ریخته شوند.
 * خروجی از ~۱۲-۱۴MB به ~۵-۷MB و پارس/serialize هم سبک‌تر می‌شود. */
const LITE_SELECT = {
  id: true,
  slug: true,
  title: true,
  titleEn: true,
  type: true,
  year: true,
  rating: true,
  duration: true,
  genres: true,
  poster: true,
  backdrop: true,
  quality: true,
  country: true,
  ageRating: true,
  views: true,
  featured: true,
  trendingScore: true,
  director: true,
  cast: true,
  createdAt: true,
} satisfies Record<string, true>;
type LiteRow = { [K in keyof typeof LITE_SELECT]: unknown } & { createdAt: Date | string };
const liteOfRow = (t: LiteRow) =>
  liteOf(t as unknown as DbTitle);

/** A-16 — wrapper خطا: هر پرتاب‌شدگی (DB قفل‌شده، merge در جریان، ورودی خراب…)
 *  به‌جای صفحه‌ی HTML 500 که res.json() کلاینت را می‌شکند، با JSON ۵۰۳ پاس
 *  داده می‌شود؛ جزئیات فقط در لاگ سرور می‌ماند. */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    return await handleX(req, ctx);
  } catch (e) {
    console.error("[api/x] request failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}

async function handleX(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  await ensureSeeded();
  const { path } = await ctx.params;
  const [head, arg] = path;
  const sp = new URL(req.url).searchParams;
  const userKey = await getUserKey();

  switch (head) {
    /* in-memory lite index — the desktop counterpart of the shard catalog */
    case "lite": {
      const rows = await db.title.findMany({ orderBy: { id: "asc" }, select: LITE_SELECT });
      const movies = rows.filter((r) => r.type !== "series").length;
      /* v0.25.0 — real per-title episode/season counts (one groupBy; feeds
       * the hero's zero-episode rule + list badges on desktop too) */
      const epGroups = await db.episode.groupBy({ by: ["titleId", "season"], _count: { _all: true } });
      const epCount = new Map<number, { ep: number; se: number }>();
      for (const g of epGroups) {
        const cur = epCount.get(g.titleId) ?? { ep: 0, se: 0 };
        cur.ep += g._count._all;
        cur.se += 1;
        epCount.set(g.titleId, cur);
      }
      return ok({
        manifest: {
          format: "frame-lite",
          // A-25 — length alone collides between different catalogs; the
          // newest add-date adds a cheap identity dimension.
          version: `db-${rows.length}-${Math.max(...rows.map((r) => {
            const ms = r.createdAt instanceof Date ? r.createdAt.getTime() : Date.parse(String(r.createdAt ?? ""));
            return Number.isFinite(ms) ? ms : 0;
          }), 0)}`,
          generatedAt: new Date().toISOString(),
          counts: { titles: rows.length, movies, series: rows.length - movies, episodes: 0 },
          shardSize: 0,
          shardCount: 0,
        },
        titles: rows.map((r) => {
          const c = epCount.get(r.id);
          return { ...liteOfRow(r), episodeCount: c?.ep ?? 0, seasonCount: c?.se ?? 0 };
        }),
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
      // v0.29.0 (NEW-DATA-10) — per-account reviews
      return ok(await getReviews(Number(sp.get("titleId")) || 0, userKey));

    case "progress": {
      const titleId = Number(sp.get("titleId")) || 0;
      const epParam = Number(sp.get("episodeId")) || 0;
      // v0.27.0 (DATA-7) — ?episodeId= returns THAT episode's position
      // (per-episode resume); without it the title-level row is returned
      // (the continue-watching pointer), exactly as before.
      if (epParam) {
        const ep = await getEpisodeProgress(userKey, titleId, epParam).catch(() => null);
        return ok(ep ? { titleId, episodeId: ep.episodeId, position: ep.position, duration: ep.duration, updatedAt: new Date(ep.updatedAt).toISOString() } : null);
      }
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
