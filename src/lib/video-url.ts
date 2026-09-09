"use client";

/* Local stream-proxy helpers (v0.10.18).
 *
 * The archive's releases are MKV files with the Persian SRT muxed INSIDE the
 * Matroska container (S_TEXT/UTF8, confirmed by probing). Chromium never
 * renders embedded Matroska subtitles, so the Electron main process runs a
 * tiny localhost proxy: /stream pipes the bytes to the <video> element 1:1
 * (Range intact) while a streaming EBML scanner collects the subtitle
 * packets; /subs returns the VTT gathered so far.
 *
 * v0.10.18: routing is no longer extension-ONLY. Known matroska extensions
 * always go through the proxy; extension-LESS/token URLs (redirectors,
 * /dl/<id> style links) go through it too — the proxy sniffs the EBML magic
 * and behaves as a pure 1:1 pipe for non-matroska content. Plain .mp4 and
 * friends keep the direct fast path.
 */

export type ProxySubsResponse = {
  found: boolean;
  cues: number;
  complete: boolean;
  vtt: string | null;
  /** header intelligence */
  probed?: boolean;
  kinds?: string[]; // subtitle CodecIDs seen in Tracks (incl. bitmap ones)
  audio?: string[]; // audio track CodecIDs in file order
  video?: string | null;
  /** is the first audio track decodable by Chromium? null = unknown yet */
  audioOk?: boolean | null;
  audioLabel?: string | null; // e.g. "DTS", "AC3 (Dolby Digital)"
  /** v0.10.18 diagnostics: content-sniffed Matroska + cue coverage [min,max]s */
  matroska?: boolean;
  cov?: [number, number] | null;
};

export type ProxyProbeResponse = Omit<ProxySubsResponse, "complete" | "vtt"> & { cues: number };

/** URLs whose container may carry an embedded (renderable-by-us) subtitle. */
export function isMkvUrl(url: string): boolean {
  return /\.mkv|\.mk3d|\.webm(\?|$)/i.test(url || "");
}

const KNOWN_VIDEO_EXT = /\.(mp4|m4v|mkv|mk3d|webm|avi|mov|wmv|mpg|mpeg|ts|flv)(\?|#|$)/i;

/* v0.16.1 — FIX «بعضی فیلم‌ها اصلاً پخش نمی‌شوند» (the fatal
 * «پخش این نسخه ممکن نشد» screen for a whole class of titles).
 *
 * Root cause: the Android runtime has NO Electron stream-proxy. Desktop
 * routes every extension-less/token URL (redirectors, /dl/<id> style) through
 * the proxy, which content-sniffs the real container — most are MKV SoftSub
 * releases. On Android the same URLs were fed RAW to the WebView <video>,
 * which cannot demux Matroska → instant error → the dead-link ladder burns
 * every variant → fatal. Same for legacy containers (.avi/.wmv/…) that the
 * WebView has no demuxer for at all.
 *
 * The classifier below is the single source of truth for «this URL must ride
 * the native Media3 player» (which sniffs containers itself and plays MKV,
 * AVI, TS, FLV… with real codecs). Only containers the WebView demuxes
 * reliably stay on the web path. Desktop never calls it with a live bridge
 * (nativeBridge() is null on Electron), so PC behavior is untouched. */

/** Containers the Android WebView plays reliably on its own. */
const WEBVIEW_SAFE_EXT = /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i;

/** Legacy/disguised containers that must go straight to the native player. */
const NATIVE_CONTAINER_EXT = /\.(avi|wmv|mpg|mpeg|ts|flv|mkv|mk3d)(\?|#|$)/i;

/** True when this URL needs the native Media3 player (WebView would fail).
 *  Rules, in order:
 *   - local: offline downloads always play natively
 *   - .mkv/.mk3d always (Matroska + the muxed Persian SRT)
 *   - extension-less/token http(s) URLs — container unknown; Media3 sniffs it
 *   - legacy containers (avi/wmv/mpg/mpeg/ts/flv) — no WebView demuxer
 *   - plain mp4/m4v/mov/webm/m3u8 stay on the light web path */
export function needsNativePlayer(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("local:")) return true;
  if (NATIVE_CONTAINER_EXT.test(url)) return true;
  if (/^https?:\/\//i.test(url) && !WEBVIEW_SAFE_EXT.test(url)) return true;
  return false;
}

/** Media src for a raw catalog URL – via the proxy for MKV (and any URL
 *  whose container the proxy must sniff), direct for plain video files. */
export function mediaSrc(rawUrl: string, proxyBase: string | null | undefined): string {
  if (!rawUrl) return rawUrl;
  // v0.12.0 — offline downloads carry a "local:" marker; the native player
  // consumes the path directly, the web player must never touch it
  if (rawUrl.startsWith("local:")) return rawUrl;
  if (!proxyBase) return rawUrl;
  if (isMkvUrl(rawUrl)) return `${proxyBase}/stream?u=${encodeURIComponent(rawUrl)}`;
  // extension-less / token URLs: let the proxy sniff the real container so
  // embedded subtitles survive disguise (its pipe is byte-transparent for
  // everything else)
  if (/^https?:\/\//i.test(rawUrl) && !KNOWN_VIDEO_EXT.test(rawUrl)) {
    return `${proxyBase}/stream?u=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

/** Poll endpoint for the subtitle data of a raw catalog URL. */
export function subsUrl(rawUrl: string, proxyBase: string | null | undefined): string | null {
  if (!proxyBase || !rawUrl) return null;
  return `${proxyBase}/subs?u=${encodeURIComponent(rawUrl)}`;
}

/** One-shot header probe (tracks/codecs) of a raw catalog URL. */
export function probeUrl(rawUrl: string, proxyBase: string | null | undefined): string | null {
  if (!proxyBase || !rawUrl) return null;
  return `${proxyBase}/probe?u=${encodeURIComponent(rawUrl)}`;
}

/** Cached proxy base ("" = electron but proxy down, undefined = unknown). */
let cachedProxyBase: string | null | undefined;

export async function loadProxyBase(): Promise<string | null | undefined> {
  if (cachedProxyBase !== undefined) return cachedProxyBase;
  try {
    const v = await window.nama?.proxyUrl?.();
    cachedProxyBase = v || null;
  } catch {
    cachedProxyBase = null;
  }
  return cachedProxyBase;
}
