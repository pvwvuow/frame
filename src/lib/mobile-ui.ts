"use client";

/* v0.15.0 — mobile player system helpers.
 *
 * Everything here uses pure-web APIs that Android WebView already supports,
 * so the whole mobile player P0 ships via the OTA web bundle WITHOUT a
 * native-rev bump: navigator.vibrate (haptics), navigator.wakeLock (screen),
 * screen.orientation.lock (fullscreen rotation), requestFullscreen (system
 * bars). Every call is guarded — on Electron/desktop browsers they no-op.
 *
 * v0.18.0 — seek step delegates to player-prefs (one choke point for the
 * settings sheet + gesture engine); adds lockPortrait, isCellular and
 * netInfo helpers for the new orientation/data-saver features.
 */

import { getSeekStepPref } from "@/lib/player-prefs";

type WakeSentinel = {
  release: () => Promise<void>;
  released?: boolean;
  addEventListener?: (type: string, cb: () => void) => void;
};
type WakeLockNav = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeSentinel> };
};
type OrientScreen = Screen & {
  orientation: Screen["orientation"] & {
    lock?: (o: "landscape" | "portrait" | "any") => Promise<void>;
    unlock?: () => void;
  };
};

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/** Light haptic tick — double-tap seek, lock engage, sheet open. */
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

let wakeSentinel: WakeSentinel | null = null;

/** Keep the screen on while playing. No-op when the API is missing. */
export async function acquireWakeLock(): Promise<void> {
  try {
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock || wakeSentinel) return;
    wakeSentinel = await nav.wakeLock.request("screen");
    wakeSentinel.addEventListener?.("release", () => {
      wakeSentinel = null;
    });
  } catch {
    wakeSentinel = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await wakeSentinel?.release();
  } catch {
    /* already released */
  }
  wakeSentinel = null;
}

/** Lock to landscape (used right after entering browser fullscreen —
 *  Android only honors the lock while fullscreen). */
export async function lockLandscape(): Promise<void> {
  try {
    await (screen as OrientScreen).orientation?.lock?.("landscape");
  } catch {
    /* device/OS refused (no fullscreen, rotation lock in OS) — sensor still works */
  }
}

export async function unlockOrientation(): Promise<void> {
  try {
    (screen as OrientScreen).orientation?.unlock?.();
  } catch {
    /* ignore */
  }
}

/** Fullscreen helpers — transient activation may be missing right after a
 *  route change, so callers must handle rejection (fall back to portrait). */
export async function enterFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el?.requestFullscreen) return false;
  try {
    await el.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

/** double-tap seek step (seconds) — default 10, changeable in the player
 *  settings sheet (v0.18.0). Delegates to player-prefs so the settings sheet
 *  and the gesture engine never drift apart. */
export function getSeekStep(): number {
  try {
    return getSeekStepPref();
  } catch {
    return 10;
  }
}

/** Lock to portrait — the «فقط پرتره» orientation setting. Android only
 *  honors the lock while fullscreen, same as lockLandscape. */
export async function lockPortrait(): Promise<void> {
  try {
    await (screen as OrientScreen).orientation?.lock?.("portrait");
  } catch {
    /* refused — sensor still works */
  }
}

/** v0.18.0 — cellular detection for the data-saver default quality pick. */
export function isCellular(): boolean {
  try {
    const c = (navigator as Navigator & {
      connection?: { type?: string; effectiveType?: string };
    }).connection;
    if (!c) return false;
    if (c.type) return c.type === "cellular";
    return /^(slow-)?2g$|^3g$/.test(c.effectiveType || "");
  } catch {
    return false;
  }
}

/** v0.18.0 — coarse downlink description for the stream-info panel. */
export function netInfo(): { type: string; downlink: number | null } {
  try {
    const c = (navigator as Navigator & {
      connection?: { type?: string; effectiveType?: string; downlink?: number };
    }).connection;
    return { type: c?.type || c?.effectiveType || "نامشخص", downlink: c?.downlink ?? null };
  } catch {
    return { type: "نامشخص", downlink: null };
  }
}
