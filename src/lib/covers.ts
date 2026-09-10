/* v0.25.0 — display-time cover URL resolution (the on-demand images half).
 *
 * Two image sources exist:
 *  - LOCAL: /covers/{tt}/poster|backdrop.webp — only present after the user
 *    explicitly opts into the offline cover packs (Settings), which the
 *    native applyCoverPack merges into the live web root.
 *  - REMOTE: images.metahub.space URLs (posterUrl/backdropUrl, shipped in
 *    every lite record) — streamed per-<img> as the user scrolls, HTTP-cached
 *    by the WebView. This is the DEFAULT: no pack download, ever.
 *
 * The catalog's root-relative poster/backdrop paths stay untouched (hero-pick
 * validates them, the desktop seed rebase expects them); only the RENDERED
 * src flips, so installing a pack later instantly switches every image back
 * to the local copy (next <img> mount) with zero data-layer involvement.
 *
 * The global <img> error fallback (IMG_FALLBACK_SCRIPT in app/layout.tsx)
 * remains the last-resort safety net for records without posterUrl.
 */

const COVERS_REV_KEY = "frame.covers.rev"; // written by self-update.ts when a pack is fully merged

/** Revision of the locally-merged cover pack (0 = none → stream from metahub). */
export function coversLocalRev(): number {
  try {
    return Number(localStorage.getItem(COVERS_REV_KEY) || 0) || 0;
  } catch {
    return 0; // SSR / storage disabled → remote
  }
}

const isLocalCover = (p: string | null | undefined) => !!p && p.startsWith("/covers/");

type CoverSource = {
  poster?: string | null;
  backdrop?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

/** Poster URL for <img src>: local pack when installed, else metahub, else the
 *  catalog path (whose error handler still tries metahub → SVG placeholder). */
export function posterSrc(t: CoverSource): string {
  if (coversLocalRev() > 0 && isLocalCover(t.poster)) return t.poster as string;
  return t.posterUrl || t.poster || "";
}

/** Backdrop URL for <img src>: same pack-aware rule as posterSrc. */
export function backdropSrc(t: CoverSource): string {
  if (coversLocalRev() > 0 && isLocalCover(t.backdrop)) return t.backdrop as string;
  return t.backdropUrl || t.backdrop || "";
}
