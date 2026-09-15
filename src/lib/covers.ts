/* ART-3.0 (v0.36.0) — LOCAL-FIRST artwork resolution, rebuilt from scratch.
 *
 * The old pipeline was NETWORK-FIRST: posterSrc streamed metahub per-<img>
 * (or the rebased raw.githubusercontent cover path on cover-light desktop
 * installs) and only FELL BACK to local files after a pack was installed.
 * On Iranian networks both remote hosts fail in bulk — the user saw dark
 * cards while the same artwork sat in the release coverpacks on GitHub,
 * unreachable for no good reason.
 *
 * The resolution order is now LOCAL-FIRST, and every remote hop goes
 * through the paced same-origin relay so nothing opaque ever reaches the
 * service worker:
 *
 *   1. coversLocalRev() > 0  →  /covers/<tt>/poster|backdrop.webp
 *      (the desktop covers-store served through the /covers rewrite →
 *      /api/covers/file, or the Android web root after applyCoverPack)
 *   2. mobile lite records  →  posterUrl/backdropUrl (metahub, direct)
 *   3. desktop cover-light  →  absolute rebased poster (raw.githubusercontent)
 *      is never mounted directly; the tt id is derived and the request goes
 *      through /api/art?u=<metahub> — paced server-side, real statuses,
 *      disk-cached (FRAME_ART_CACHE) so it survives restarts
 *   4. root-relative /covers/…  (bundled-cover installs) unchanged
 *
 * rev bookkeeping (localStorage «frame.covers.rev») flips to >0 as soon as
 * the FIRST coverpack part merges on desktop (CoversSyncBridge) or the boot
 * script reads /api/covers/manifest — new <img> mounts then hit the local
 * store; store misses fall through the IMG_FALLBACK chain to the relay.
 */

const COVERS_REV_KEY = "frame.covers.rev"; // written by self-update.ts (Android), CoversSyncBridge (desktop)

/** Revision of the locally-merged cover pack (0 = none → remote paths).
 *
 * Resolution order: the pre-hydration global (window.__coversRev — inlined
 * by the root layout from the server-side manifest, so the SSR render and
 * the first client render AGREE and every <img> mounts local-first), then
 * the runtime-updated localStorage (Android self-update / desktop watcher),
 * then 0. */
export function coversLocalRev(): number {
  if (typeof window === "undefined") {
    // SSR: the root layout stamps the server-side manifest rev here
    return (globalThis as { __frameCoversRev?: number }).__frameCoversRev || 0;
  }
  const w = (window as { __coversRev?: number }).__coversRev;
  if (typeof w === "number" && w > 0) return w;
  try {
    return Number(localStorage.getItem(COVERS_REV_KEY) || 0) || 0;
  } catch {
    return 0; // storage disabled → remote
  }
}

/** Boot-time rev override (layout inline script + desktop watcher). */
export function setLocalCoversRev(rev: number) {
  if (rev <= 0) return;
  if (typeof window !== "undefined") {
    (window as { __coversRev?: number }).__coversRev = rev;
  } else {
    (globalThis as { __frameCoversRev?: number }).__frameCoversRev = rev;
  }
  try {
    localStorage.setItem(COVERS_REV_KEY, String(rev));
  } catch {
    /* ignore */
  }
}

/** tt id from any cover-ish string: root-relative (/covers/tt…/…), rebased
 *  absolute (https://raw.githubusercontent.com/.../covers/tt…/…), or metahub
 *  (…/poster/small/tt…/img). Substring match on purpose — the anchored
 *  variants silently broke on rebased desktop URLs. */
const TT_RE = /(tt\d{5,})/i;
export function ttIdOf(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    if (!v) continue;
    const m = TT_RE.exec(v);
    if (m) return m[1].toLowerCase();
  }
  return "";
}

const metahubPoster = (tt: string) => `https://images.metahub.space/poster/small/${tt}/img`;
const metahubBackdrop = (tt: string) => `https://images.metahub.space/background/medium/${tt}/img`;
const relayed = (u: string) => `/api/art?u=${encodeURIComponent(u)}`;
const localPoster = (tt: string) => `/covers/${tt}/poster.webp`;
const localBackdrop = (tt: string) => `/covers/${tt}/backdrop.webp`;

type CoverSource = {
  poster?: string | null;
  backdrop?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

/** Poster URL for <img src> — the ART-3.0 ladder (see module doc). */
export function posterSrc(t: CoverSource): string {
  if (coversLocalRev() > 0) {
    const tt = ttIdOf(t.poster, t.posterUrl);
    if (tt) return localPoster(tt);
  }
  if (t.posterUrl) return t.posterUrl;
  const poster = t.poster || "";
  if (!poster) return "";
  if (/^https?:\/\//i.test(poster)) {
    /* cover-light desktop / self-host: the rebased raw.githubusercontent
     * path is the WORST remote hop on Iranian networks — reroute the tt's
     * metahub art through the paced same-origin relay instead. */
    const tt = ttIdOf(poster, t.backdrop);
    if (tt) return relayed(metahubPoster(tt));
    return poster;
  }
  return poster;
}

/** Backdrop URL for <img src> — same ladder as posterSrc. */
export function backdropSrc(t: CoverSource): string {
  if (coversLocalRev() > 0) {
    const tt = ttIdOf(t.backdrop, t.backdropUrl);
    if (tt) return localBackdrop(tt);
  }
  if (t.backdropUrl) return t.backdropUrl;
  const backdrop = t.backdrop || "";
  if (!backdrop) return "";
  if (/^https?:\/\//i.test(backdrop)) {
    const tt = ttIdOf(backdrop, t.poster);
    if (tt) return relayed(metahubBackdrop(tt));
    return backdrop;
  }
  return backdrop;
}
