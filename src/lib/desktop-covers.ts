"use client";

/* ART-3.0 (v0.36.0) — renderer side of the desktop coverpack sync.
 *
 * The Electron main process downloads/merges the coverpack parts; this tiny
 * helper watches its progress and flips the LOCAL-FIRST artwork switch as
 * soon as the first part lands:
 *
 *   - localStorage «frame.covers.rev» = the merged rev (same key the Android
 *     self-update writes), which posterSrc/backdropSrc gate on
 *   - a «frame-covers-rev» DOM event sointerested panels can refresh
 *
 * No router.refresh(), no reload: existing mounts keep their (SW-cached)
 * relayed art pixel-identical; every NEW mount after the flip hits the local
 * store directly.
 */
import { bridge } from "./platform";
import { setLocalCoversRev } from "./covers";

type Manifestish = { rev?: number; files?: number; bytes?: number; parts?: number[]; totalParts?: number };

/** Live sync state from the shell (null on web/Android or older builds). */
export async function coversSyncState() {
  return (await bridge()?.covers?.status()) ?? null;
}

/** Manual «دانلود بستهٔ تصاویر» trigger — false when a run is already active. */
export async function startCoversSyncNow(): Promise<boolean> {
  const r = await bridge()?.covers?.syncNow();
  return !!r?.started;
}

/** Watch shell progress; returns an unsubscribe (null when not applicable). */
export function watchCoversSync(cb?: (s: { phase: string; message: string; rev: number; part: number; totalParts: number; received: number; total: number; error: string }) => void): () => void {
  const b = bridge();
  if (!b?.covers) return () => {};
  return b.covers.onProgress((s) => {
    // the FIRST merged part (or any completed sync) makes the store usable —
    // flip the artwork switch immediately; new <img> mounts go local-first.
    if (s.rev > 0) setLocalCoversRev(s.rev);
    try {
      window.dispatchEvent(new CustomEvent("frame-covers-rev", { detail: s }));
    } catch {
      /* ignore */
    }
    cb?.(s);
  });
}

/** Store numbers for the settings panels (manifest route; null on export). */
export async function fetchCoversManifest(): Promise<Manifestish | null> {
  try {
    const r = await fetch("/api/covers/manifest", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Manifestish;
  } catch {
    return null;
  }
}
