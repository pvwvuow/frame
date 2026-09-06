"use client";

/* Local stream-proxy helpers (v0.10.5).
 *
 * The archive's «زیرنویس چسبیده» releases are MKV files with the Persian SRT
 * muxed INSIDE the container (S_TEXT/UTF8). Chromium never renders embedded
 * Matroska subtitles, so the Electron main process runs a tiny localhost
 * proxy: /stream pipes the bytes to the <video> element 1:1 (Range intact)
 * while a passive EBML scanner collects the subtitle packets; /subs returns
 * the VTT gathered so far. MP4/other containers play directly. */

export type ProxySubsResponse = {
  found: boolean;
  cues: number;
  complete: boolean;
  vtt: string | null;
  /** v0.10.6 header intelligence */
  probed?: boolean;
  kinds?: string[]; // subtitle CodecIDs seen in Tracks (incl. bitmap ones)
  audio?: string[]; // audio track CodecIDs in file order
  video?: string | null;
  /** is the first audio track decodable by Chromium? null = unknown yet */
  audioOk?: boolean | null;
  audioLabel?: string | null; // e.g. "DTS", "AC3 (Dolby Digital)"
};

export type ProxyProbeResponse = Omit<ProxySubsResponse, "complete" | "vtt"> & { cues: number };

/** URLs whose container may carry an embedded (renderable-by-us) subtitle. */
export function isMkvUrl(url: string): boolean {
  return /\.mkv|\.mk3d|\.webm(\?|$)/i.test(url || "");
}

/** Media src for a raw catalog URL – via the proxy for MKV, direct otherwise. */
export function mediaSrc(rawUrl: string, proxyBase: string | null | undefined): string {
  if (!rawUrl) return rawUrl;
  if (proxyBase && isMkvUrl(rawUrl)) return `${proxyBase}/stream?u=${encodeURIComponent(rawUrl)}`;
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
