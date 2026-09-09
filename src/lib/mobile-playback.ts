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

import { classifyUrl, needsNativePlayer } from "./video-url";

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
