"use client";

import { useParams, useSearchParams } from "next/navigation";
import { IS_MOBILE } from "./links";

/* Mobile (static-export) routing for dynamic routes — CLIENT half.
 * The pure path helpers live in links.ts (server-safe, no "use client") and
 * are re-exported here so existing client imports keep working. v0.10.35. */

export { IS_MOBILE, titleHref, watchHref, personHref, collectionHref } from "./links";

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
