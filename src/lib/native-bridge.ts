"use client";

/* v0.16.0 — typed bridge to the Android NamaNative plugin (player, download
 * engine, OTA self-update). Every call is guarded: on Electron/browser the
 * capability checks simply return false and callers fall back.
 *
 * v0.16.0 FIX — «فیلم‌های زیرنویس‌دار پخش نمی‌شوند»: the plugin was resolved
 * from window.NamaNative, which Capacitor NEVER injects — the bridge was dead
 * since v0.12.0 (no MKV handoff, no downloads, no updater). Native-registered
 * plugins live behind registerPlugin()/window.Capacitor.Plugins; the resolver
 * below now follows that contract, gated by isNativePlatform() so web/Electron
 * keep returning null. */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { needsNativePlayer as classifyNativeUrl } from "./video-url";

export type NamaInstallInfo = {
  versionName: string;
  nativeRev: number;
  otaVersion: string;
  hasNativePlayer: boolean;
  /** v0.16.0 — cover-pack revision this install currently carries */
  coversRev?: number;
};

export type NamaDownloadEvent = {
  id: string;
  type: "progress" | "done" | "error" | "paused" | "canceled";
  received: number;
  total: number;
  speed: number;
  status: string;
};

type NamaNativeBridge = {
  getInstallInfo: () => Promise<NamaInstallInfo>;
  playVideo: (o: {
    url: string;
    title?: string;
    subtitle?: string;
    positionMs?: number;
    subs?: { path: string; mime: string }[];
    /** v0.18.0 — episodes manifest so PlayerActivity renders its own sheet
     *  (seasons, watched ticks, progress) without catalog access */
    episodes?: {
      id: number;
      season: number;
      number: number;
      name: string;
      thumbnail: string;
      watched: boolean;
      progressPct: number;
    }[];
    episodeIndex?: number;
    /** v0.18.0 — poster for the native MediaSession metadata */
    poster?: string;
    /** v0.18.0 — double-tap seek step (seconds) for the native surface */
    seekStepSec?: number;
    /** v0.18.0 — a WebView-safe (mp4/m3u8) variant exists for this title →
     *  the native «سوییچ به نسخه وب‌سازگار» (cinema path) may offer itself */
    hasWebVariant?: boolean;
  }) => Promise<{
    positionMs: number;
    durationMs: number;
    ended: boolean;
    error?: string;
    /** v0.18.0 — the native episodes sheet picked another episode */
    switchToEpisodeId?: number;
    /** v0.18.0 — «سوییچ به نسخه وب‌سازگار» requested */
    switchToWeb?: boolean;
    /** v0.18.0 — native sleep timer «پایان همین قسمت» → no auto-next */
    suppressNext?: boolean;
  }>;
  download: (o: { id: string; url: string; dest: string }) => Promise<{ ok: boolean }>;
  downloadAction: (o: { id: string; action: "pause" | "resume" | "cancel" }) => Promise<{ ok: boolean }>;
  downloadFile: (o: { id: string; url: string; dest: string }) => Promise<{ ok: boolean }>;
  fileStat: (o: { path: string }) => Promise<{ exists: boolean; size: number; absPath: string }>;
  deleteFile: (o: { path: string }) => Promise<{ ok: boolean }>;
  applyBundle: (o: { zipPath: string; version: string }) => Promise<{ ok: boolean; path?: string }>;
  /** v0.16.0 — merge a covers pack zip (covers/** entries) into the current
   *  server base dir WITHOUT wiping anything else. Requires the web root to
   *  already be materialized (an applyBundle must have run) — otherwise the
   *  call rejects with "no-webroot" and the caller must apply the code
   *  bundle first. */
  applyCoverPack: (o: { zipPath: string; rev: number }) => Promise<{ ok: boolean; webroot?: string }>;
  /** v0.17.0 — open an https URL in the system browser. Replaces the old
   *  in-app APK download+install (REQUEST_INSTALL_PACKAGES) — the
   *  "dropper" pattern Google Play Protect flags as harmful. Full-APK
   *  updates now land in the browser like the first install. */
  openUrl: (o: { url: string }) => Promise<{ ok: boolean }>;
  addListener: (event: "namaDownload", cb: (e: NamaDownloadEvent) => void) => Promise<{ remove: () => void }> & { remove: () => void };
};

declare global {
  interface Window {
    NamaNative?: NamaNativeBridge;
    Capacitor?: { Plugins?: Record<string, unknown> };
  }
}

let cachedBridge: NamaNativeBridge | null | undefined;

export function nativeBridge(): NamaNativeBridge | null {
  if (typeof window === "undefined") return null;
  if (cachedBridge !== undefined) return cachedBridge;
  cachedBridge = resolveBridge();
  return cachedBridge;
}

function resolveBridge(): NamaNativeBridge | null {
  // Only the Android/Capacitor runtime carries the plugin. Electron and plain
  // browsers have no Capacitor at all → null (all callers fall back).
  try {
    if (!Capacitor?.isNativePlatform?.()) return window.NamaNative ?? null;
  } catch {
    return window.NamaNative ?? null;
  }
  // 1) modern contract — proxy to the natively-registered plugin
  try {
    const p = registerPlugin<NamaNativeBridge>("NamaNative");
    if (p) return p;
  } catch {
    /* fall through */
  }
  // 2) legacy exposure paths
  const legacy = (window as unknown as { Capacitor?: { Plugins?: Record<string, NamaNativeBridge> } }).Capacitor?.Plugins?.NamaNative;
  return legacy ?? window.NamaNative ?? null;
}

/** Android app with the v0.12.0 native layer installed. */
export function isAndroidNative(): boolean {
  return nativeBridge() !== null;
}

/* v0.16.3 — REAL bridge health. nativeBridge() only proves that @capacitor/core
 * built its Proxy — NOT that the native side actually registered the plugin
 * (the v0.12.0→v0.16.2 class of bug: an unregistered plugin still yields a
 * truthy Proxy whose every method rejects with «"NamaNative.x()" is not
 * implemented on android»). Ownership decisions must be based on a PROBE, so a
 * dead plugin falls back to the honest web path instead of burning the whole
 * variant ladder into a fake «اتصال برقرار نشد». */
let bridgeHealthy: boolean | undefined;

export async function probeNativeBridge(force = false): Promise<boolean> {
  if (bridgeHealthy !== undefined && !force) return bridgeHealthy;
  const b = nativeBridge();
  if (!b) return (bridgeHealthy = false);
  try {
    const info = await b.getInstallInfo();
    bridgeHealthy = !!info && info.hasNativePlayer === true;
  } catch (e) {
    console.error("[nama] NamaNative plugin unreachable:", e);
    bridgeHealthy = false;
  }
  return bridgeHealthy;
}

/** true only once a probe has PROVEN the plugin answers. Until then callers
 *  must treat ownership as unknown (see resolveOwner's "pending" state). */
export function isBridgeHealthy(): boolean {
  return bridgeHealthy === true;
}

/** MKV/MK3D (+ unknown-container streams, legacy containers, local offline
 *  downloads) that the WebView <video> cannot demux — the exact reason
 *  «فیلم‌های زیرنویس‌دار پلی نمی‌شوند» and «بعضی فیلم‌ها اصلاً پلی نمی‌شوند».
 *  v0.16.1 — the real classifier lives in video-url.ts (pure, node-testable);
 *  every non-WebView-safe URL now rides the native Media3 player, not just
 *  .mkv-extension ones. */
export function needsNativePlayer(url: string): boolean {
  return classifyNativeUrl(url);
}

/** Offline download marker: "local:" + the absolute file path on device. */
export function isLocalFile(url: string): boolean {
  return url.startsWith("local:");
}

export function localFilePath(url: string): string {
  return url.slice("local:".length);
}

let cachedInfo: NamaInstallInfo | null = null;

export async function getInstallInfo(force = false): Promise<NamaInstallInfo | null> {
  const b = nativeBridge();
  if (!b) return null;
  if (cachedInfo && !force) return cachedInfo;
  try {
    cachedInfo = await b.getInstallInfo();
    return cachedInfo;
  } catch {
    return null;
  }
}
