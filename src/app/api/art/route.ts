/* v0.35.5 (IMG-CACHE-6) — /api/art: the PACED metahub art relay (desktop
 * standalone only; the static export has no server and never calls this).
 *
 * WHY THIS EXISTS — the user's screenshots kept showing the same signature:
 * art whose <img> src is a DIRECT images.metahub.space url fails in bulk,
 * while the handful of images that reach metahub through the staggered
 * fallback chain (catalog path → 404 → metahub swap) DO render. Direct
 * posterSrc/backdropSrc mounts fire ~100 metahub requests in one burst, and
 * the CDN throttles bursts on Iranian routes — the stragglers succeed, the
 * burst mostly does not. On top of that, the SW must store metahub replies
 * as OPAQUE no-cors responses whose real status is redacted, so a 429/503
 * body gets cached like a real poster until the page-side heal cleans it.
 *
 * This relay fixes both: the fetch happens SERVER-SIDE (real status codes —
 * nothing opaque ever reaches the SW bucket under this key), paced through
 * a small concurrency gate so a page mount turns into a polite queue
 * instead of a burst, with one retry on 429/5xx, inflight de-duplication
 * for identical urls, and long cache headers on success.
 *
 * The SW allowlists /api/art (see public/sw.js) so successful relays are
 * cached cache-first under the SAME-ORIGIN key — basic responses carry real
 * bytes and real sizes (no opaque phantom-size quota padding either).
 *
 * Contract: 200 = image bytes. 502 = metahub unreachable/throttled (never
 * cached — the page chain falls through to the SVG placeholder). Anything
 * else = misuse. */
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ALLOW_HOST_RE = /(^|\.)metahub\.space$/i;
const MAX_CONCURRENT = 4;
const FETCH_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 600;

/* module-scope gate (one per server process) */
let active = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

/* identical urls arriving together share one upstream fetch */
const inflight = new Map<string, Promise<Response>>();

async function fetchArt(url: string): Promise<Response> {
  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      await acquire();
      try {
        return await fetch(url, {
          signal: ctrl.signal,
          redirect: "follow",
          headers: { accept: "image/*,*/*;q=0.8" },
          cache: "no-store",
        });
      } finally {
        release();
      }
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await attempt();
  /* burst throttling (429) and edge hiccups (5xx) get ONE paced retry */
  if (res.status === 429 || res.status >= 500) {
    try { await res.body?.cancel(); } catch { /* already consumed */ }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    res = await attempt();
  }
  return res;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new Response("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad u", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOW_HOST_RE.test(target.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const key = target.toString();
  let shared = inflight.get(key);
  if (!shared) {
    shared = fetchArt(key).finally(() => inflight.delete(key));
    inflight.set(key, shared);
  }

  let upstream: Response;
  try {
    upstream = await shared;
  } catch {
    return new Response("upstream failed", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    try { await upstream.body?.cancel(); } catch { /* already consumed */ }
    return new Response("upstream error", { status: 502 });
  }

  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") ?? "image/jpeg");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);
  /* content-addressed by tt id at the origin (metahub serves max-age=60d) —
   * a long window here is safe and keeps repeat mounts entirely local */
  headers.set("cache-control", "public, max-age=604800, stale-while-revalidate=2592000");
  return new Response(upstream.body, { status: 200, headers });
}
