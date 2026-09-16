/* ART-3.1 (v0.37.1) — LOCAL-FIRST artwork resolution, hardened.
 *
 * The ART-3.0 ladder (v0.36.0) fixed network-first bulk failures on Iranian
 * networks. v0.37.0's cinema hero then exposed TWO residual holes:
 *
 *   HOLE 1 — the empty src. The desktop bridge (/api/x → liteOf) derives
 *   posterUrl/backdropUrl from the DB poster/backdrop via an ANCHORED
 *   /^\/covers\/(tt\d+)\// match; rebased-absolute or empty rows produced
 *   posterUrl:"" — and when the poster column itself is empty, posterSrc
 *   returned "" → <img src=""> renders Chromium's broken-image GLYPH and
 *   fires NO error event, so the layout IMG_FALLBACK chain (which always
 *   ends on a placeholder) never sees it. The user's screenshot: a black
 *   hero plate with the tiny glyph and no placeholder.
 *
 *   HOLE 2 — the direct metahub mount. posterSrc mounted posterUrl
 *   (liteOf's DIRECT images.metahub.space url) as-is, while every card that
 *   FAILED into the chain got healed onto the paced same-origin relay
 *   (/api/art). Result on Iranian routes: chain-fed images alive, direct
 *   mounts dark — the exact asymmetry the user keeps screenshotting.
 *
 * The ladder is now (never returns "" — the terminal is an inline-SVG
 * placeholder in the same key-art language as the chain's):
 *
 *   1. coversLocalRev() > 0  →  /covers/<tt>/poster|backdrop.webp
 *      (desktop covers-store via the /covers rewrite → /api/covers/file,
 *      or the Android web root after applyCoverPack)
 *   2. posterUrl/backdropUrl — mounted through relayed() UNCONDITIONALLY,
 *      mirroring ART-3.0's case-3 semantics: the paced relay on desktop and
 *      web deploys; on Android the fetch shim 404s it and the IMG_FALLBACK
 *      chain rescues to the direct metahub mount (no server there — same
 *      as v0.36).
 *   3. poster field absolute http(s) → the tt's metahub art via relayed();
 *      a non-metahub absolute WITHOUT any tt stays direct (source-CDN art).
 *   4. root-relative /covers/…  (bundled-cover installs) unchanged.
 *   5. NOTHING known → inline-SVG placeholder (never "", never a glyph).
 *
 * The tt is resolved from ANY identifying field (poster, posterUrl,
 * backdrop, backdropUrl, slug) — a row whose poster is empty but whose
 * backdrop/slug carries the IMDb id still names its metahub art.
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

const metahubPosterSize = (tt: string, size: "small" | "medium" | "large") =>
  `https://images.metahub.space/poster/${size}/${tt}/img`;
const metahubPoster = (tt: string) => metahubPosterSize(tt, "small");
const metahubBackdrop = (tt: string) => `https://images.metahub.space/background/medium/${tt}/img`;
const relayed = (u: string) => `/api/art?u=${encodeURIComponent(u)}`;
const localPoster = (tt: string) => `/covers/${tt}/poster.webp`;
const localBackdrop = (tt: string) => `/covers/${tt}/backdrop.webp`;

/* ART-3.1 — desktop renderer? The Electron preload injects window.nama
 * before any page script, and every posterSrc consumer mounts client-side
 * (the home page is a client component; its imgs never exist in SSR HTML),
 * so this needs no SSR bookkeeping. On the desktop every REMOTE metahub
 * mount goes through the paced same-origin relay — the direct mount is the
 * burst-throttled hop the relay was built to eliminate. Android/browser
 * keep the direct mount first-try (the IMG_FALLBACK chain remains the
 * safety net). */
const desktopRelay = (): boolean =>
  typeof window !== "undefined" &&
  !!(window as { nama?: { isElectron?: boolean } }).nama?.isElectron;
const artSrc = (metahubUrl: string): string => (desktopRelay() ? relayed(metahubUrl) : metahubUrl);

/* ---- ART-3.1 terminal placeholder (never-"" guarantee) --------------------
 * The same «فریم» key-art the layout IMG_FALLBACK chain ends on, as static
 * data URIs. An empty <img src> fires NO error event, so the chain cannot
 * rescue it — the src helpers therefore never emit "". */

const phSvg = (title: string, wide: boolean): string => {
  const w = wide ? 640 : 300;
  const h = wide ? 360 : 450;
  const ls = title.length <= 20 ? [title] : (() => {
    const mid = Math.floor(title.length / 2);
    let best = -1;
    for (let i = 0; i < title.length; i++) {
      if (title[i] === " ") {
        if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
      }
    }
    return best < 0 ? [title] : [title.slice(0, best), title.slice(best + 1)];
  })();
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fs = ls.length > 1 ? 17 : title.length > 14 ? 15 : 19;
  const ty = h * 0.6 - (ls.length - 1) * fs * 0.65;
  const txt = ls
    .map((l, i) => `<text x="${w / 2}" y="${ty + i * fs * 1.3}" text-anchor="middle" font-family="Vazirmatn,Tahoma,sans-serif" font-size="${fs}" font-weight="700" fill="#cfc9bd" direction="rtl">${esc(l)}</text>`)
    .join("");
  const r = w * (wide ? 0.075 : 0.1);
  const cy = h * 0.36;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#191320"/><stop offset="0.55" stop-color="#0d0b12"/><stop offset="1" stop-color="#231a10"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w / 2}" cy="${cy}" r="${r}" fill="none" stroke="#e5b84b" stroke-opacity="0.45" stroke-width="2"/>` +
    `<path d="M ${w / 2 - r * 0.55} ${cy - r * 0.8} L ${w / 2 + r * 0.9} ${cy} L ${w / 2 - r * 0.55} ${cy + r * 0.8} Z" fill="#e5b84b" fill-opacity="0.5"/>` +
    txt +
    `</svg>`
  );
};

/** The terminal key-art placeholder — the same visual the layout
 *  IMG_FALLBACK chain ends on. `title` personalizes it («کیهان: یک سفر
 *  شخصی» instead of a bare «فریم»). Never fails, never empty. */
export function artPlaceholder(title?: string | null, wide = false): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(phSvg(title || "فریم", wide))}`;
}
const POSTER_PLACEHOLDER = artPlaceholder(null, false);
const BACKDROP_PLACEHOLDER = artPlaceholder(null, true);

type CoverSource = {
  poster?: string | null;
  backdrop?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  /* lite rows and full records both carry the slug; tt-slugs (tt…-hash) name
   * the art when every cover field is empty (v0.37.1) */
  slug?: string | null;
};

/** The IMDb id from ANY identifying field of the row (ART-3.1 cross-field
 *  tt): poster, posterUrl, backdrop, backdropUrl, slug. A row whose poster
 *  is empty but whose backdrop carries /covers/tt… still names its art. */
export function artTtOf(t: CoverSource): string {
  return ttIdOf(t.poster, t.posterUrl, t.backdrop, t.backdropUrl, t.slug);
}

/** Poster URL for <img src> — the ART-3.1 ladder (see module doc). */
export function posterSrc(t: CoverSource): string {
  const tt = artTtOf(t);
  if (coversLocalRev() > 0 && tt) return localPoster(tt);
  if (t.posterUrl) return artSrc(t.posterUrl);
  const poster = t.poster || "";
  if (!poster) return tt ? artSrc(metahubPoster(tt)) : POSTER_PLACEHOLDER;
  if (/^https?:\/\//i.test(poster)) {
    /* cover-light desktop / self-host: the rebased raw.githubusercontent
     * path is the WORST remote hop on Iranian networks — reroute the tt's
     * metahub art through the paced same-origin relay instead. */
    if (tt) return relayed(metahubPoster(tt));
    return poster;
  }
  return poster;
}

/** Backdrop URL for <img src> — same ladder as posterSrc. */
export function backdropSrc(t: CoverSource): string {
  const tt = artTtOf(t);
  if (coversLocalRev() > 0 && tt) return localBackdrop(tt);
  if (t.backdropUrl) return artSrc(t.backdropUrl);
  const backdrop = t.backdrop || "";
  if (!backdrop) return tt ? artSrc(metahubBackdrop(tt)) : BACKDROP_PLACEHOLDER;
  if (/^https?:\/\//i.test(backdrop)) {
    if (tt) return relayed(metahubBackdrop(tt));
    return backdrop;
  }
  return backdrop;
}

/* ---- ART-3.1 healing ladders (per-swap, self-contained) -------------------
 * The layout IMG_FALLBACK chain is PER-ELEMENT once-only (data-rw/fb2/mh/
 * mhp/fb flags): an <img> that RE-MOUNTS different srcs over its lifetime —
 * the cinema hero reuses ONE poster element for every slide and re-points
 * it on every light-on — is healed exactly once, after which every later
 * failure stays a permanent broken-image glyph. v0.37.0's hero shipped
 * exactly that signature.
 *
 * The ladder is the same chain as data, re-runnable per swap:
 *   1. posterSrc(t)        — local pack → paced relay → direct (platform rules)
 *   2. the direct metahub mount (or the relay, when step 1 was local) —
 *      a different route than step 1
 *   3. the terminal title-keyed SVG placeholder — never fails, never empty
 * Elements driven by a ladder opt OUT of the global chain with
 * data-fb="1" so the two systems never fight over the same element. */

export function posterLadder(t: CoverSource, title?: string | null): string[] {
  const out: string[] = [];
  const first = posterSrc(t);
  if (first) out.push(first);
  const tt = artTtOf(t);
  if (tt) {
    const second = first.startsWith("/covers/")
      ? relayed(metahubPoster(tt))
      : metahubPoster(tt);
    if (!out.includes(second)) out.push(second);
  }
  const terminal = artPlaceholder(title, false);
  if (!out.includes(terminal)) out.push(terminal);
  return out;
}

export function backdropLadder(t: CoverSource, title?: string | null): string[] {
  const out: string[] = [];
  const first = backdropSrc(t);
  if (first) out.push(first);
  const tt = artTtOf(t);
  if (tt) {
    const second = first.startsWith("/covers/")
      ? relayed(metahubBackdrop(tt))
      : metahubBackdrop(tt);
    if (!out.includes(second)) out.push(second);
  }
  const terminal = artPlaceholder(title, true);
  if (!out.includes(terminal)) out.push(terminal);
  return out;
}

/* ---- v0.38.0 — the HERO plate ladder (high-res) ---------------------------
 * The cinema hero projects the poster onto a ~490–650 CSS-px plate (bigger on
 * high-DPI), while every art source the regular ladder reaches is sized for
 * CARDS: the local pack poster is width 300 (scripts/mobile-covers.cjs) and
 * the metahub small variant is 300×450 — measured soft by the user
 * («یکم بی‌کیفیت هستن حس میکنم پوسترها»). Metahub variants, probed live:
 * small 300×450 / medium 500×750 / large 780×1170 — the plate gets LARGE.
 *
 * Five hero images, paced relay + SW + relay disk-cache: the first boot pays
 * ~250KB per title once, every later light-on is local. Cards keep the
 * regular ladder (small/medium is right for a 150px card) — this ladder is
 * for the big plate only.
 *
 *   desktop: relay(large) → direct large → relay(medium) → posterSrc head
 *            (local pack / platform rules / source-CDN) → titled placeholder
 *   web/Android: large → medium → posterSrc head → placeholder
 * (direct-after-relay covers a dead relay; the medium rung covers a title
 * whose large variant is missing upstream; posterSrc is the offline floor.) */
export function heroPosterLadder(t: CoverSource, title?: string | null): string[] {
  const out: string[] = [];
  const push = (u?: string | null) => {
    if (u && !out.includes(u)) out.push(u);
  };
  const tt = artTtOf(t);
  if (tt) {
    const large = metahubPosterSize(tt, "large");
    const medium = metahubPosterSize(tt, "medium");
    if (desktopRelay()) {
      push(relayed(large));
      push(large);
      push(relayed(medium));
    } else {
      push(large);
      push(medium);
    }
  }
  push(posterSrc(t));
  const terminal = artPlaceholder(title, false);
  push(terminal);
  return out;
}
