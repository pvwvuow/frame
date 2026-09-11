/* v0.16.2 — mobile playback ownership + race-proof failure ladder.
 *
 * Structural rework («بازنگری کامل ساختار پخش فیلم در موبایل»). The old
 * pipeline had three structural diseases the user experienced as «پیام اتصال
 * برقرار نشد روی فیلمی که دارد پخش می‌شود»:
 *
 *  1. NO OWNERSHIP MODEL — whether the WebView <video> or the native Media3
 *     player owned playback was decided by a post-commit effect flipping
 *     nativeActive. The WebView element mounted with the src first and
 *     fetched in phantom (and on every nativeActive flip it REMOUNTED —
 *     after a fatal that remount is what plays behind the overlay).
 *  2. NO MEDIA HALT ON FATAL — setFatal(true) never stopped the <video>;
 *     the 90%-black overlay stayed over LIVE playback (audio kept running).
 *  3. UNPROOFED LADDER — Chromium routinely fires `error` twice around a
 *     source swap; the dead-link ladder counted both, burned errCount and
 *     hit fatal while a LATER source was already playing fine. Native
 *     results had no generation guard either, so a stale activity result
 *     could advance the ladder a second time.
 *
 * The primitives below are pure + node-testable; PlayerMobile consumes them.
 */

import { classifyUrl, needsNativePlayer, type UrlClass } from "./video-url";

export type PlaybackOwner = "web" | "native" | "pending" | "unsupported";

/** ONE declarative decision of who owns playback for the active source.
 *  Made at render time: native-owned sources never mount the WebView
 *  element at all, so no phantom fetches and no WebView errors for them.
 *
 *  v0.16.3 — hasBridge is tri-state: `null` means the native plugin health
 *  probe is still in flight (Capacitor's registerPlugin() yields a truthy
 *  Proxy even for a DEAD plugin, so "looks like a bridge" proves nothing).
 *
 *  v0.19.0 — WEB-FIRST auto routing (the v0.18.1 «هوشمند» flipped):
 *    - classifyUrl "web" AND "fragile" → the WEB player, bridge-independent.
 *      Fragile (mkv/token URLs) mounts the WebView and lets Chromium sniff
 *      the BYTES — if it plays (most H.264/AAC MKVs do), the user gets the
 *      cinema-capable player for the whole catalog; if the <video>
 *      hard-fails, the ladder walks and the EXHAUSTION fallback hands the
 *      best still-untried source to native (wired in PlayerMobile).
 *    - classifyUrl "native" (local:, cleartext, avi/wmv/ts…) → the native
 *      player when the probe proved the bridge alive, «unsupported» when it
 *      proved it dead, «pending» while probing.
 *  The user's engine override (v0.18.1) still wins over all of it, and
 *  cinema still beats every engine (the watch-party rides the <video>). */
export function resolveOwner(opts: {
  hasBridge: boolean | null;
  cinemaActive: boolean;
  proxyReady: boolean;
  url: string;
  /** v0.18.1 — user's player-engine choice (player-prefs.getPlayerEngine).
   *  "auto" (default/undefined) = the web-first routing below.
   *  "native" = the user FORCED the native player for every source:
   *    - probe in flight → "pending" (never mount the WebView on a guess,
   *      the flip to native right after would double-start playback)
   *    - bridge alive → "native" for EVERY url (Media3 plays mp4/m3u8 too)
   *    - bridge PROBED dead → honest fallback: web for WebView-safe sources,
   *      "unsupported" for the ones only native could ever decode.
   *  cinemaActive is checked BEFORE the engine: the watch-party always rides
   *  the web <video>, whatever the preference says. */
  engine?: "auto" | "native";
}): PlaybackOwner {
  if (!opts.proxyReady) return "pending";
  if (opts.cinemaActive) return "web"; // cinema beats ride the web <video>
  const native = needsNativePlayer(opts.url);
  if (opts.engine === "native") {
    if (opts.hasBridge === null) return "pending";
    if (opts.hasBridge) return "native";
    return native ? "unsupported" : "web";
  }
  // v0.19.0 — auto: the class decides. Only the «WebView can never» class
  // depends on the bridge probe; mkv/token URLs are web-first either way.
  const cls = classifyUrl(opts.url);
  if (cls !== "native") return "web";
  if (opts.hasBridge === null) return "pending"; // probing
  return opts.hasBridge ? "native" : "unsupported";
}

/** Duplicate-error echo guard: Chromium may deliver two error events for the
 *  same source (the fetch that failed + the swap abort). One ladder step per
 *  source per window — the second echo is ignored. */
export function shouldLadderAdvance(
  last: { idx: number; at: number } | null,
  curIdx: number,
  now: number
): boolean {
  if (!last) return true;
  return !(last.idx === curIdx && now - last.at < 1500);
}

/** The ONLY ladder terminator: the next index is out of range, or the sanity
 *  cap (one failure per source) is somehow exceeded. */
export function isLadderExhausted(nextIdx: number, len: number, errCount: number): boolean {
  return nextIdx >= len || errCount > len;
}

/** Same message within 5s is an echo, not news — kills the «پشت سر هم»
 *  repeated toasts. */
export function isDuplicateNotice(
  last: { msg: string; at: number } | null,
  msg: string,
  now: number
): boolean {
  return !!last && last.msg === msg && now - last.at < 5000;
}

/** v0.19.2 — how long the open path waits for <video> metadata before the
 *  source is declared dead and the ladder steps (the metadata watchdog).
 *  A hung/slow host used to leave the spinner up FOREVER — Chromium can keep
 *  a stalled fetch far beyond any patience without ever firing `error`.
 *  The localStorage hook exists for the E2E suite only (a real 12s hang
 *  test would dominate the run); production always uses the 12s default. */
export function metaWatchdogMs(): number {
  try {
    const n = Number((globalThis as { localStorage?: Storage }).localStorage?.getItem("nama-meta-watchdog-ms"));
    if (Number.isFinite(n) && n >= 250) return n;
  } catch {
    /* no storage — default */
  }
  return 12000;
}

/* ------------------------------------------------------------------ */
/* v0.21.1 — the byte-preflight verdict + the smart ladder landing       */
/* ------------------------------------------------------------------ */

/** What the byte-preflight of ONE candidate source decides BEFORE the
 *  <video> burns the metadata watchdog on it. Pure — fully node-testable.
 *  The probe shape is the awaitable MkvProbe minus diagnostics. */
export type PreflightProbe = {
  reachable: boolean;
  status: number;
  matroska: boolean;
  audioOk: boolean | null;
  mse: { supported: boolean } | null;
};

export type PreflightAction =
  | { action: "keep" } // the web player keeps this source as-is
  | { action: "mse" } // the fMP4 transport should own it from the start
  | { action: "native"; reason: string } // hand off to Media3 immediately
  | { action: "next" } // proven-dead source — step the ladder NOW
  | { action: "wait" }; // inconclusive — let the element try

/** v0.26.0 — is this HTTP status a TRANSIENT server-side failure? The
 *  archive's dl hosts (dls*.aparatchi-dlcenter.top — ≈100% of the catalog's
 *  URLs) answer 503 to non-Iranian IPs and under rate limit; the old code
 *  read any status ≥ 400 as «source dead for good» and burned the whole
 *  variant ladder on a healthy-but-rate-limited CDN (the real root cause of
 *  the Breaking Bad / Planet Earth 1 complaints). 5xx → callers retry with
 *  backoff BEFORE the verdict; 4xx (403/404/410…) is a property of the URL
 *  itself → immediate next. Kept PURE (node-testable); the actual retry loop
 *  lives beside the fetches (mkv-web.fetchRangeRetry5xx) and in the native
 *  player (PlayerActivity's ERROR_CODE_IO_BAD_HTTP_STATUS handler). */
export function isTransientServerStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

/** v0.26.0 — backoff before 5xx retry `attempt` (1-based), matching the
 *  native player's cadence: ~700ms then ~1500ms (2 retries max). */
export function serverRetryBackoffMs(attempt: number): number {
  return attempt === 1 ? 700 : 1500;
}

export function preflightDecision(
  p: PreflightProbe,
  opts: { preferMse: boolean; bridgeOk: boolean | null; engine: "auto" | "native" }
): PreflightAction {
  if (!p.reachable) {
    // 403/404 → dead for the web player AND the element will hit the same
    // wall (4xx = the URL itself is the problem → immediate next).
    // v0.26.0 — a 5xx verdict only reaches here AFTER the probe has already
    // retried twice with backoff (fetchRangeRetry5xx / the native player's
    // ERROR_CODE_IO_BAD_HTTP_STATUS retries): the server really is refusing
    // this source right now. Anything else (status 0) is a transport hiccup
    // → wait.
    return p.status >= 400 ? { action: "next" } : { action: "wait" };
  }
  if (!p.matroska) return { action: "keep" }; // token URL hiding an mp4 → element path
  if (opts.engine !== "auto") return { action: "keep" }; // the engine override path owns it
  if (opts.preferMse && p.mse?.supported) return { action: "mse" };
  if (p.audioOk === false) {
    // AC3/DTS/… first-audio: a silent film IS «پلیر اصلی کار نمی‌کنه» — hand
    // to Media3 when the bridge is proven alive; re-run lands here once the
    // probe resolves (bridgeOk in deps), null keeps waiting.
    return opts.bridgeOk ? { action: "native", reason: "audio" } : { action: "wait" };
  }
  return { action: "keep" }; // healthy Matroska → the web player keeps it
}

/** v0.21.1 — the ladder must LAND on a web-ownable source. After a web
 *  failure, stepping to srcIdx+1 blindly lands on codec-native MKVs
 *  (classifyUrl "native") — a guaranteed second failure plus another 12s
 *  burn. Returns the next index > `from` whose class is web-ownable, or
 *  -1 when only native-class sources remain (the fallback rung takes over). */
export function nextWebIdxSkippingNative(classes: UrlClass[], from: number): number {
  for (let i = from + 1; i < classes.length; i++) {
    if (classes[i] !== "native") return i;
  }
  return -1;
}
