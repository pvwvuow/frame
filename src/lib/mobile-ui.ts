"use client";

/* v0.15.0 — mobile player system helpers.
 *
 * Everything here uses pure-web APIs that Android WebView already supports,
 * so the whole mobile player P0 ships via the OTA web bundle WITHOUT a
 * native-rev bump: navigator.vibrate (haptics), navigator.wakeLock (screen),
 * screen.orientation.lock (fullscreen rotation), requestFullscreen (system
 * bars). Every call is guarded — on Electron/desktop browsers they no-op.
 */

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

/** double-tap seek step (seconds) — default 10, changeable in a later
 *  settings sheet; kept in localStorage so it survives without a schema. */
export function getSeekStep(): number {
  try {
    const v = Number(localStorage.getItem("nama-seek-step"));
    if (v === 5 || v === 10 || v === 15 || v === 30) return v;
  } catch {
    /* ignore */
  }
  return 10;
}
