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

import { needsNativePlayer } from "./video-url";

export type PlaybackOwner = "web" | "native" | "pending" | "unsupported";

/** ONE declarative decision of who owns playback for the active source.
 *  Made at render time: native-owned sources never mount the WebView
 *  element at all, so no phantom fetches and no WebView errors for them.
 *
 *  v0.16.3 — hasBridge is tri-state: `null` means the native plugin health
 *  probe is still in flight (Capacitor's registerPlugin() yields a truthy
 *  Proxy even for a DEAD plugin, so "looks like a bridge" proves nothing).
 *    - probe in flight + native URL → "pending": mount NEITHER the WebView
 *      <video> (a phantom MKV fetch would fire a fake error and burn the
 *      ladder) NOR hand off. The probe is a single fast IPC — milliseconds.
 *    - probe PROVED the plugin dead + native URL → "unsupported": the caller
 *      shows the honest «پلیر نیتیو در این نسخه در دسترس نیست — اپ را آپدیت
 *      کنید» screen. WebView-safe sources still play ("web"). */
export function resolveOwner(opts: {
  hasBridge: boolean | null;
  cinemaActive: boolean;
  proxyReady: boolean;
  url: string;
}): PlaybackOwner {
  if (!opts.proxyReady) return "pending";
  if (opts.cinemaActive) return "web"; // cinema beats ride the web <video>
  const native = needsNativePlayer(opts.url);
  if (opts.hasBridge === null) return native ? "pending" : "web"; // probing
  if (!opts.hasBridge) return native ? "unsupported" : "web"; // probed dead
  return native ? "native" : "web";
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
