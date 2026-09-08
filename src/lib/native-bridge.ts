"use client";

/* v0.12.0 — typed bridge to the Android NamaNative plugin (player, download
 * engine, OTA self-update). Every call is guarded: on Electron/browser the
 * capability checks simply return false and callers fall back. */

export type NamaInstallInfo = {
  versionName: string;
  nativeRev: number;
  otaVersion: string;
  hasNativePlayer: boolean;
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
  }) => Promise<{ positionMs: number; durationMs: number; ended: boolean; error?: string }>;
  download: (o: { id: string; url: string; dest: string }) => Promise<{ ok: boolean }>;
  downloadAction: (o: { id: string; action: "pause" | "resume" | "cancel" }) => Promise<{ ok: boolean }>;
  downloadFile: (o: { id: string; url: string; dest: string }) => Promise<{ ok: boolean }>;
  fileStat: (o: { path: string }) => Promise<{ exists: boolean; size: number; absPath: string }>;
  deleteFile: (o: { path: string }) => Promise<{ ok: boolean }>;
  applyBundle: (o: { zipPath: string; version: string }) => Promise<{ ok: boolean; path?: string }>;
  installApk: (o: { path: string }) => Promise<{ ok: boolean; needPermission?: boolean }>;
  addListener: (event: "namaDownload", cb: (e: NamaDownloadEvent) => void) => Promise<{ remove: () => void }> & { remove: () => void };
};

declare global {
  interface Window {
    NamaNative?: NamaNativeBridge;
    Capacitor?: { Plugins?: Record<string, unknown> };
  }
}

export function nativeBridge(): NamaNativeBridge | null {
  if (typeof window === "undefined") return null;
  return window.NamaNative ?? null;
}

/** Android app with the v0.12.0 native layer installed. */
export function isAndroidNative(): boolean {
  return nativeBridge() !== null;
}

/** MKV/MK3D (+ unknown-container streams) that the WebView <video> cannot
 *  demux — the exact reason «فیلم‌های زیرنویس‌دار پلی نمی‌شوند». Local
 *  offline downloads (local:<absPath>) always play natively too. */
export function needsNativePlayer(url: string): boolean {
  if (!url) return false;
  if (isLocalFile(url)) return true;
  return /\.mkv|\.mk3d/i.test(url);
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
