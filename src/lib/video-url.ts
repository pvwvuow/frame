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
