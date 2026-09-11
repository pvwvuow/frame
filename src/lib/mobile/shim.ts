/* Mobile fetch shim — implements the desktop app's /api/* contract entirely
 * client-side (Dexie + the bundled catalog), so existing client components
 * (LibraryProvider, Player, CommandPalette, SettingsForm…) work unchanged.
 *
 * Installs itself at module load when running OUTSIDE Electron: in the
 * Capacitor WebView and in plain browsers (dev/testing on this branch).
 */

import {
  whenReady, getCatalogPage, search, getFullTitle, getEpisodes, getSimilar,
  getTitleLiteBySlug, liteById, liteBySlug, isReady, bumpViews, db,
  type LiteTitle,
} from "./db";
import {
  getLibrarySnapshot, toggleFavorite, addFavorites, removeFavorites, isFavorite,
  toggleWatchlist, patchWatchlist, removeWatchlist, isInWatchlist,
  upsertProgress, getProgressFor, removeProgress, setRating,
  addReview, getReviews, getProfile, patchProfile, wipeProfile,
  getUserStats, getNotifications, markNotificationRead, markAllNotificationsRead,
  listUserCollections, createUserCollection, renameUserCollection, deleteUserCollection,
  getCollectionItems, collectionsContaining, setCollectionItem, mergeCloudSnapshot,
  switchIdentity, getUserKey,
} from "./userdata";

type Handler = (ctx: { url: URL; method: string; body: Record<string, unknown>; seg: string[] }) => Promise<unknown> | unknown;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function readBody(init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    const raw = typeof init?.body === "string" ? init.body : "";
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** route table: "METHOD /api/path" → handler (:name = path segment) */
const routes: { method: string; pattern: string; handler: Handler }[] = [
  { method: "GET", pattern: "/api/health", handler: () => ({ ok: true, mobile: true, version: "android-1.0.0" }) },

  { method: "GET", pattern: "/api/library", handler: () => getLibrarySnapshot() },

  { method: "POST", pattern: "/api/favorites", handler: ({ body }) => toggleFavorite(Number(body.titleId), typeof body.value === "boolean" ? body.value : undefined).then((isF) => ({ isFavorite: isF })) },
  { method: "PUT", pattern: "/api/favorites", handler: ({ body }) => addFavorites(((body.titleIds as unknown[]) ?? []).map(Number).filter(Boolean)).then(() => ({ ok: true })) },
  { method: "DELETE", pattern: "/api/favorites", handler: ({ body }) => removeFavorites(((body.titleIds as unknown[]) ?? []).map(Number).filter(Boolean)).then(() => ({ ok: true })) },

  { method: "POST", pattern: "/api/watchlist", handler: ({ body }) => toggleWatchlist(Number(body.titleId), typeof body.value === "boolean" ? body.value : undefined).then((inList) => ({ inList })) },
  { method: "PATCH", pattern: "/api/watchlist", handler: ({ body }) => patchWatchlist({ titleId: Number(body.titleId), status: body.status as string | undefined, note: body.note as string | undefined, pinned: body.pinned as boolean | undefined, plannedDate: (body.plannedDate as string | null | undefined) ?? undefined }).then(() => ({ ok: true })) },
  { method: "DELETE", pattern: "/api/watchlist", handler: ({ body }) => removeWatchlist(body.titleId ? Number(body.titleId) : undefined).then(() => ({ ok: true })) },

  { method: "POST", pattern: "/api/progress", handler: ({ body }) => upsertProgress({ titleId: Number(body.titleId), episodeId: (body.episodeId as number | null) ?? null, position: Number(body.position ?? 0), duration: Number(body.duration ?? 0) }).then(() => ({ ok: true })) },
  { method: "GET", pattern: "/api/progress", handler: ({ url }) =>
      /* v0.27.0 (DATA-7) — per-episode progress map for the episodes sheet /
       * native manifest (previously 404'd on mobile: ticks were always empty). */
      db.progress
        .where("userKey").equals(getUserKey())
        .toArray()
        .then((rows) => {
          const titleId = Number(url.searchParams.get("titleId")) || 0;
          const list = rows
            .filter((r) => Number((r as { titleId: number }).titleId) === titleId)
            .map((r) => ({
              episodeId: ((r as { episodeId?: number | null }).episodeId ?? null) as number | null,
              position: Number((r as { position: number }).position),
              duration: Number((r as { duration: number }).duration),
            }));
          return { progress: list };
        }) },
  { method: "DELETE", pattern: "/api/progress", handler: ({ body }) => removeProgress(body.titleId ? Number(body.titleId) : body.titleIds ? (body.titleIds as unknown[]).map(Number) : undefined).then((removed) => ({ ok: true, removed })) },

  { method: "POST", pattern: "/api/rating", handler: ({ body }) => setRating(Number(body.titleId), Math.round(Number(body.score ?? 0))).then((score) => ({ score })) },

  { method: "GET", pattern: "/api/profile", handler: () => getProfile() },
  { method: "PATCH", pattern: "/api/profile", handler: ({ body }) => patchProfile(body) },
  { method: "DELETE", pattern: "/api/profile", handler: ({ body }) => wipeProfile(String(body.scope ?? "all")).then(() => ({ ok: true })) },

  /* v0.10.35 — per-account data spaces (same contract as the desktop route);
   * attached:true = the local rotation succeeded (cloud sync may proceed) */
  { method: "POST", pattern: "/api/identity", handler: ({ body }) =>
      switchIdentity(typeof body.accountId === "string" && body.accountId ? String(body.accountId) : null, Boolean(body.reset)).then((r) => ({ ...r, attached: true })) },
  { method: "GET", pattern: "/api/identity", handler: () => ({ uid: getUserKey(), mobile: true }) },

  { method: "GET", pattern: "/api/notifications", handler: async () => getNotifications() },
  { method: "POST", pattern: "/api/notifications", handler: ({ body }) => (body.all ? markAllNotificationsRead() : markNotificationRead(String(body.id ?? ""))).then(() => ({ ok: true })) },

  { method: "POST", pattern: "/api/reviews", handler: ({ body }) => addReview({ titleId: Number(body.titleId), author: String(body.author ?? ""), rating: Number(body.rating ?? 0), body: String(body.body ?? "") }) },

  /* user collections (v0.10.32) — same contract as the desktop routes */
  { method: "GET", pattern: "/api/collections", handler: () => listUserCollections() },
  { method: "POST", pattern: "/api/collections", handler: ({ body }) => createUserCollection(String(body.name ?? "")).then((r) => ({ ...r, duplicate: false })) },
  { method: "PATCH", pattern: "/api/collections", handler: ({ body }) => renameUserCollection(Number(body.id), String(body.name ?? "")).then(() => ({ ok: true })) },
  { method: "DELETE", pattern: "/api/collections", handler: ({ body }) => deleteUserCollection(Number(body.id)).then(() => ({ ok: true })) },

  { method: "GET", pattern: "/api/collections/items", handler: ({ url, body }) => {
      const sp = url.searchParams;
      if (sp.get("titleId")) return collectionsContaining(Number(sp.get("titleId"))).then((collectionIds) => ({ collectionIds }));
      return getCollectionItems(Number(body.collectionId ?? sp.get("collectionId")));
    } },
  { method: "POST", pattern: "/api/collections/items", handler: ({ body }) => setCollectionItem(Number(body.collectionId), Number(body.titleId), typeof body.value === "boolean" ? body.value : undefined) },

  /* settings cards that need the Node server — graceful "disabled" states */
  { method: "GET", pattern: "/api/source/sync", handler: () => ({ ok: true, running: false, configured: false, mobile: true, lastSync: null, items: [] }) },
  { method: "POST", pattern: "/api/source/sync", handler: () => ({ ok: false, error: "mobile-unsupported", message: "به‌روزرسانی از منبع در نسخه اندروید فعلاً غیرفعال است" }) },
  { method: "POST", pattern: "/api/catalog/sync", handler: () => ({ ok: false, skipped: false, error: "remote-catalog-disabled" }) },

  /* v0.10.32 FIX: the cloud→device merge now REALLY runs on Android —
   * the snapshot from Supabase lands in Dexie, so an account's
   * favorites/watchlist/ratings/collections show up on mobile too.
   * v0.13.0: the snapshot carries STABLE slugs (see mergeCloudSnapshot). */
  { method: "POST", pattern: "/api/cloud/merge", handler: ({ body }) => mergeCloudSnapshot(body as unknown as Parameters<typeof mergeCloudSnapshot>[0]).then((r) => ({ ok: true, ...r })) },

  /* v0.13.0 — id ↔ slug translation over the lite index (same contract as
   * the desktop /api/title/cloud-key route; the cloud layer calls this on
   * every push/pull and must exist on Android too). */
  { method: "POST", pattern: "/api/title/cloud-key", handler: ({ body }) => cloudKeyLookup(body) },
  { method: "GET", pattern: "/api/title/cloud-key", handler: ({ url }) =>
      cloudKeyLookup({
        ids: (url.searchParams.get("ids") ?? "").split(",").map(Number).filter(Boolean),
        slugs: (url.searchParams.get("slugs") ?? "").split(",").map(decodeURIComponent).filter(Boolean),
      }) },

  { method: "GET", pattern: "/api/stats", handler: () => getUserStats() },
];

/** v0.13.0 — id ↔ slug translation over the lite index (mirrors the desktop
 *  /api/title/cloud-key route). Episode ids follow the stable
 *  (title, season, number) formula, so they decode arithmetically. */
async function cloudKeyLookup(body: { ids?: unknown; episodeIds?: unknown; slugs?: unknown }) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const episodeIds = Array.isArray(body.episodeIds) ? body.episodeIds.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const slugs = Array.isArray(body.slugs) ? body.slugs.map((s) => String(s).trim()).filter(Boolean) : [];
  const seen = new Set<number>();
  const titles: { id: number; slug: string; title: string }[] = [];
  const push = (t: LiteTitle | null) => {
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      titles.push({ id: t.id, slug: t.slug, title: t.title });
    }
  };
  for (const id of ids) push(liteById(id));
  for (const s of slugs) push(liteBySlug(s));
  const episodes = episodeIds.map((id) => ({
    id,
    /* inverse of episodeId(): titleId * 100_000 + season * 1000 + number */
    season: Math.floor((id % 100_000) / 1000),
    number: id % 1000,
  }));
  return { titles, episodes };
}

async function handleTitleSlug(seg: string[]): Promise<unknown> {
  const slug = decodeURIComponent(seg[2] ?? "");
  const lite = await getTitleLiteBySlug(slug);
  if (!lite) return json({ error: "not found" }, 404);
  const [full, episodes, similar, inList, progress, reviews] = await Promise.all([
    getFullTitle(lite.id),
    lite.type === "series" ? getEpisodes(lite.id) : Promise.resolve([]),
    getSimilar(lite, 8),
    isInWatchlist(lite.id),
    getProgressFor(lite.id),
    getReviews(lite.id),
  ]);
  const userScore = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  return {
    title: full,
    episodes: episodes.map((e) => ({ id: e.id, season: e.season, number: e.number, name: e.name, synopsis: e.synopsis, duration: e.duration, thumbnail: e.thumbnail })),
    similar,
    inList,
    progress: progress ? { position: progress.position, duration: progress.duration, episodeId: progress.episodeId } : null,
    reviewCount: reviews.length,
    userScore,
    /* mobile-only: the desktop renders reviews server-side */
    reviews,
    favorite: await isFavorite(lite.id),
  };
}

async function handleCatalogQuery(url: URL): Promise<unknown> {
  const sp = url.searchParams;
  const type = sp.get("type") === "series" ? "series" : "movie";
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const limit = Math.min(120, Math.max(1, Number(sp.get("limit") ?? 48) || 48));
  const pageNo = offset > 0 ? Math.floor(offset / limit) : page;
  const { items, total } = await getCatalogPage(
    type,
    { genre: sp.get("genre") || undefined, sort: sp.get("sort") || undefined, year: sp.get("year") ? Number(sp.get("year")) : undefined, minRating: sp.get("rating") ? Number(sp.get("rating")) : undefined },
    pageNo,
    limit
  );
  const progress: Record<string, { position: number; duration: number }> = {};
  return { items, total, progress };
}

/** Match "/api/title/:slug" style patterns against concrete segments. */
function matchRoute(method: string, seg: string[]): { handler: Handler; seg: string[] } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const pat = r.pattern.split("/").filter(Boolean);
    if (pat.length !== seg.length) continue;
    const matched: string[] = [];
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i].startsWith(":")) matched.push(seg[i]);
      else if (pat[i] !== seg[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, seg: matched };
  }
  return null;
}

let installed = false;

export function installMobileShim() {
  if (installed || typeof window === "undefined") return;
  /* leave Electron alone */
  if (window.nama?.isElectron || /\bElectron\//i.test(navigator.userAgent)) return;
  installed = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/api/")) return origFetch(input as RequestInfo, init);

    const u = new URL(url, window.location.origin);
    const seg = u.pathname.split("/").filter(Boolean);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = await readBody(init);

    await whenReady();

    try {
      /* /api/title/[slug] */
      if (seg[0] === "api" && seg[1] === "title" && seg.length >= 3 && method === "GET") {
        return json(await handleTitleSlug(seg));
      }
      /* /api/catalog (paged) */
      if (seg[0] === "api" && seg[1] === "catalog" && seg.length === 2 && method === "GET") {
        return json(await handleCatalogQuery(u));
      }
      /* /api/search */
      if (seg[0] === "api" && seg[1] === "search" && method === "GET") {
        const rows = await search(u.searchParams.get("q") ?? "", 30);
        return json(rows);
      }
      /* /api/darkroom/search — mobile stub until the darkroom engine ships */
      if (seg[0] === "api" && seg[1] === "darkroom" && method === "GET") {
        return json({ results: [], mobile: true, error: "mobile-unsupported" });
      }
      const m = matchRoute(method, seg);
      if (m) return json(await m.handler({ url: u, method, body, seg: m.seg }));
      return json({ error: "not-found", path: u.pathname }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  };
}

/** kick off catalog init early (called from CatalogGate) */
export function primeCatalog(): void {
  void whenReady();
}
