/* Mobile (static-export) routing helpers — PURE functions, safe on the server.
 *
 * Split out of mobile-links.ts (v0.10.35): that module is "use client" because
 * of useRouteSlug()'s hooks, and Next 16 hard-throws when server code (e.g.
 * src/lib/notifications.ts building notification links) invokes a function
 * exported from a client module — which silently 500ed /api/notifications and
 * killed the unread badge on desktop. These helpers have no React imports, so
 * both the server and the client can use them.
 *
 * The export emits ONE shell per dynamic route (e.g. /title/_). A <Link> to
 * /title/<real-slug> has no exported payload → the router 404s and falls back
 * to a full page load of the SPA root (looks like "kicked back to home").
 * On mobile builds every dynamic link therefore targets the exported shell
 * with the real slug in the query string: /title/_?s=<slug>. Desktop
 * (Electron server) keeps real paths.
 *
 * NEXT_PUBLIC_NAMA_MOBILE is inlined by scripts/mobile-build.cjs at build time.
 */
export const IS_MOBILE = process.env.NEXT_PUBLIC_NAMA_MOBILE === "1";

export function titleHref(slug: string): string {
  return IS_MOBILE ? `/title/_?s=${encodeURIComponent(slug)}` : `/title/${slug}`;
}

export function watchHref(slug: string, ep?: number | string | null): string {
  if (IS_MOBILE) {
    const s = `s=${encodeURIComponent(slug)}`;
    return ep != null && ep !== "" ? `/watch/_?${s}&ep=${ep}` : `/watch/_?${s}`;
  }
  return ep != null && ep !== "" ? `/watch/${slug}?ep=${ep}` : `/watch/${slug}`;
}

export function personHref(name: string): string {
  return IS_MOBILE ? `/person/_?s=${encodeURIComponent(name)}` : `/person/${encodeURIComponent(name)}`;
}

export function collectionHref(slug: string): string {
  return IS_MOBILE ? `/collections/_?s=${encodeURIComponent(slug)}` : `/collections/${slug}`;
}
