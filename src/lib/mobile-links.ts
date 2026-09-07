"use client";

import { useParams, useSearchParams } from "next/navigation";

/* Mobile (static-export) routing for dynamic routes.
 *
 * The export emits ONE shell per dynamic route (e.g. /title/_). A <Link> to
 * /title/<real-slug> has no exported payload → the router 404s and falls back
 * to a full page load of the SPA root (looks like "kicked back to home").
 * On mobile builds every dynamic link therefore targets the exported shell
 * with the real slug in the query string: /title/_?s=<slug>. The client pages
 * read it back via useRouteSlug(). Desktop (Electron server) keeps real paths.
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

/** Real route param for the current page: useParams on desktop, ?s= on mobile. */
export function useRouteSlug(key: "slug" | "name" = "slug"): string {
  const params = useParams<Record<string, string | string[]>>();
  const sp = useSearchParams();
  if (!IS_MOBILE) {
    const v = params?.[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  }
  return sp.get("s") ?? "";
}
