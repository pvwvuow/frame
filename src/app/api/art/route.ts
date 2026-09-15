/* v0.35.5 (IMG-CACHE-6) — /api/art: the PACED metahub art relay (desktop
 * standalone only; the static export has no server and never calls this).
 * v0.36.0 (ART-3.0) — the relay grew a DISK layer and a negative map:
 *
 *   1. art-cache hit (FRAME_ART_CACHE, sha1(url)-keyed) → served from disk,
 *      zero network. Everything the relay ever fetched SURVIVES restarts —
 *      artwork stops being per-session network luck and becomes local
 *      infrastructure, like the covers-store.
 *   2. negative map: an upstream failure remembers the url for 5 minutes →
 *      the burst behind a dead metahub settles in seconds instead of
 *      queueing every mount through the 12s timeout.
 *   3. upstream fetch — paced (4-concurrency gate), inflight de-dup, one
 *      429/5xx retry, 12s timeout; success writes the disk cache (atomic).
 *
 * WHY THIS EXISTS — the user's screenshots kept showing the same signature:
 * art whose <img> src is a DIRECT images.metahub.space url fails in bulk,
 * while the handful of images that reach metahub through the staggered
 * fallback chain DO render. Direct mounts fire ~100 metahub requests in one
 * burst, and the CDN throttles bursts on Iranian routes — the stragglers
 * succeed, the burst mostly does not. On top of that, the SW must store
 * metahub replies as OPAQUE no-cors responses whose real status is
 * redacted, so a 429/503 body gets cached like a real poster until the
 * page-side heal cleans it.
 *
 * ART-3.0 flips the default: posterSrc on cover-light desktop mounts the
 * RELAY url directly (the rebased raw.githubusercontent path is the worst
 * remote hop on these networks), so this route is the main artwork artery —
 * paced, real-status, disk-persistent.
 *
 * The SW allowlists /api/art (see public/sw.js) so successful relays are
 * cached cache-first under the SAME-ORIGIN key — basic responses carry real
 * bytes and real sizes (no opaque phantom-size quota padding either).
 *
 * Contract: 200 = image bytes. 502 = metahub unreachable/throttled (never
 * cached in SW — the page chain falls through to the SVG placeholder).
 * Anything else = misuse. */
import type { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { artCacheGet, artCacheKey, artCacheTrim, ART_CACHE_DIR } from "@/lib/cover-store";

export const dynamic = "force-dynamic";

const ALLOW_HOST_RE = /(^|\.)metahub\.space$/i;
const MAX_CONCURRENT = 4;
const FETCH_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 600;
const NEGATIVE_TTL_MS = 5 * 60_000;

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
/* failed urls (429/5xx/network) — remembered so a dead upstream does not
 * queue every later mount behind the full timeout */
const negative = new Map<string, number>();

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

function diskGet(key: string): { bytes: Buffer; type: string } | null {
  const p = artCacheGet(key);
  if (!p) return null;
  try {
    const bytes = fs.readFileSync(p);
    const type = path.extname(p) === ".webp"
      ? "image/webp"
      : path.extname(p) === ".png"
        ? "image/png"
        : path.extname(p) === ".gif"
          ? "image/gif"
          : path.extname(p) === ".svg"
            ? "image/svg+xml"
            : "image/jpeg";
    return { bytes, type };
  } catch {
    return null;
  }
}

function diskPut(key: string, bytes: Buffer, contentType: string): void {
  if (!ART_CACHE_DIR) return;
  const ext = /png/i.test(contentType)
    ? "png"
    : /webp/i.test(contentType)
      ? "webp"
      : /gif/i.test(contentType)
        ? "gif"
        : /svg/i.test(contentType)
          ? "svg"
          : "jpg";
  try {
    fs.mkdirSync(ART_CACHE_DIR, { recursive: true });
    const p = path.join(ART_CACHE_DIR, `${key}.${ext}`);
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, p);
    artCacheTrim();
  } catch {
    /* disk full / read-only — the relay still works, just uncached */
  }
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

  /* 1. disk cache — instant, restart-proof */
  const dkey = artCacheKey(key);
  const local = diskGet(dkey);
  if (local) return artResponse(local.bytes, local.type);

  /* 2. negative map — a recently-dead upstream fails fast */
  const badUntil = negative.get(key);
  if (badUntil && Date.now() < badUntil) {
    return new Response("upstream error (cooldown)", { status: 502 });
  }

  let shared = inflight.get(key);
  if (!shared) {
    shared = fetchArt(key).finally(() => inflight.delete(key));
    inflight.set(key, shared);
  }

  let upstream: Response;
  try {
    upstream = await shared;
  } catch {
    negative.set(key, Date.now() + NEGATIVE_TTL_MS);
    return new Response("upstream failed", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    try { await upstream.body?.cancel(); } catch { /* already consumed */ }
    negative.set(key, Date.now() + NEGATIVE_TTL_MS);
    return new Response("upstream error", { status: 502 });
  }

  /* buffer (images are tens-of-KB..low-MB) so the disk layer can keep a copy */
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch {
    negative.set(key, Date.now() + NEGATIVE_TTL_MS);
    return new Response("upstream failed", { status: 502 });
  }
  const ctype = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!bytes.length || bytes.length < 64 || /^text\/html/i.test(ctype)) {
    /* an HTML error page is not art — treat exactly like a failure */
    negative.set(key, Date.now() + NEGATIVE_TTL_MS);
    return new Response("upstream error", { status: 502 });
  }
  const realKey = artCacheKey(key);
  diskPut(realKey, bytes, ctype);
  return artResponse(bytes, ctype);
}

function artResponse(bytes: Buffer, type: string): Response {
  const headers = new Headers();
  headers.set("content-type", type);
  headers.set("content-length", String(bytes.length));
  /* content-addressed by tt id at the origin (metahub serves max-age=60d) —
   * a long window here is safe and keeps repeat mounts entirely local */
  headers.set("cache-control", "public, max-age=604800, stale-while-revalidate=2592000");
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}
