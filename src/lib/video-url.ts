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

/* v0.19.0 — WEB-FIRST ownership (rewrites the v0.16.1 premise).
 *
 * History: v0.16.1 assumed the WebView «cannot demux Matroska» and routed
 * every MKV + every extension-less/token URL straight to the native Media3
 * player. That handed ~the WHOLE catalog (the archive is MKV SoftSub/Dubbed
 * releases) to the player without the cinema — the user's «چند پلیر» +
 * «پیش‌فرض، پلیر بی‌سینما» complaints. The premise was wrong: Chromium's
 * demuxer sniffs BYTES, not extensions, and the desktop app has been playing
 * these exact MKVs through a 1:1 byte pipe into a <video> for years (the
 * Electron stream-proxy adds subtitles, not decoders).
 *
 * classifyUrl() is now the single source of truth:
 *   web      — reliable on the web player (mp4/m4v/mov/webm/m3u8)
 *   fragile  — web-FIRST (mkv/mk3d + token/unknown https); the native player
 *              is the FALLBACK when the <video> hard-fails (DTS/AC3 audio,
 *              x265 without hardware decode, disguised containers)
 *   native   — the WebView can never own it (local:, cleartext http:// in
 *              release builds, avi/wmv/mpg/mpeg/ts/flv — no demuxer)
 * Desktop never consults any of this for playback (nativeBridge() is null on
 * Electron; the proxy owns routing) — PC behavior is untouched. */

/** Containers the Android WebView plays reliably on its own. */
const WEBVIEW_SAFE_EXT = /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i;

/** Legacy containers with NO Chromium demuxer at all — a web attempt is a
 *  guaranteed dead fetch, so these alone stay preemptive-native. */
const NATIVE_CONTAINER_EXT = /\.(avi|wmv|mpg|mpeg|ts|flv)(\?|#|$)/i;

/** Matroska: Chromium DOES demux it (the desktop 1:1 proxy pipe proves the
 *  engine plays H.264/AAC-in-MKV every day) — but the codecs INSIDE vary
 *  (DTS/AC3 audio, x265), so MKV is web-FIRST with the native player kept
 *  as the fallback when the <video> hard-fails. */
const FRAGILE_CONTAINER_EXT = /\.(mkv|mk3d)(\?|#|$)/i;

export type UrlClass =
  | "web" // WebView plays it reliably — always the web player
  | "fragile" // web-FIRST; native is the fallback on a real decode failure
  | "native"; // WebView can never own it (local files, cleartext, no demuxer)

/** v0.19.0 — the ONE classification the mobile owner logic consumes.
 *  Replaces the old binary needsNativePlayer routing: the catalog is ~all
 *  MKV (SoftSub/Dubbed releases), so routing every .mkv straight to the
 *  native player handed ~the whole catalog to the player WITHOUT the cinema
 *  and the web player never got a chance. Web-first flips that: the user's
 *  default experience is the cinema-capable web player, and Media3 only
 *  steps in when Chromium genuinely cannot decode the stream. */
export function classifyUrl(url: string): UrlClass {
  if (!url) return "web"; // empty src — harmless, the player shows idle
  if (url.startsWith("local:")) return "native";
  if (/^http:\/\//i.test(url)) return "native"; // release WebView blocks cleartext (BEFORE the ext rules — even http mkv/mp4)
  if (FRAGILE_CONTAINER_EXT.test(url)) return "fragile";
  if (NATIVE_CONTAINER_EXT.test(url)) return "native";
  if (/^https?:\/\//i.test(url)) {
    return WEBVIEW_SAFE_EXT.test(url) ? "web" : "fragile"; // token/redirector: sniff on web first
  }
  return "web";
}

/** True when this URL needs the native Media3 player (WebView would fail).
 *  v0.19.0 — MKV and extension-less/token URLs are NO LONGER here (they ride
 *  the web player first — classifyUrl "fragile"); this predicate keeps the
 *  STRICT meaning «the WebView can never own this» for:
 *   - local: offline downloads always play natively
 *   - legacy containers (avi/wmv/mpg/mpeg/ts/flv) — no WebView demuxer
 *   - v0.17.0 — plain http:// (no TLS): release builds disable cleartext
 *  Used by the desktop player's (dead-on-Electron) handoff block and by the
 *  mobile «سوییچ به نسخه وب‌سازگار» flag, where the switch must land on a
 *  source GUARANTEED to play on the web — not merely web-first. */
export function needsNativePlayer(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("local:")) return true;
  if (NATIVE_CONTAINER_EXT.test(url)) return true;
  if (/^http:\/\//i.test(url)) return true;
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
