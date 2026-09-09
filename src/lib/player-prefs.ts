"use client";

/* v0.18.0 — player preference primitives (pure, node-testable).
 *
 * Every mobile-player preference lives in localStorage under a single key
 * namespace («nama-pref-*») so the settings sheet, the gesture engine and the
 * sleep timer all read/write through ONE choke point — and the pure helpers
 * (zoom key, data-saver variant pick, episodes manifest) are unit-tested in
 * scripts/test-mobile-player-e2e.mjs without a DOM.
 *
 * Cloud sync deliberately waits: the profile schema has no column for these
 * yet, and localStorage survives across sessions — the v4 prompt's «سینک
 * ابری» becomes a one-line swap here when the schema lands.
 */

export type OrientLock = "auto" | "portrait" | "landscape";
export type ZoomMode = "contain" | "cover" | "fill";

const K = {
  seekStep: "nama-seek-step",
  orientLock: "nama-pref-orient-lock",
  autoLock: "nama-pref-auto-lock",
  keepAwake: "nama-pref-keep-awake",
  dataSaver: "nama-pref-data-saver",
  subDelay: "nama-pref-sub-delay",
  subPos: "nama-pref-sub-pos",
  rate: "nama-rate",
};

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* private mode */
  }
}

/* ---- seek step (shared key with mobile-ui.getSeekStep) ------------------- */

export function getSeekStepPref(): number {
  const v = Number(lsGet(K.seekStep));
  return v === 5 || v === 10 || v === 15 || v === 30 ? v : 10;
}

export function setSeekStepPref(v: number): void {
  if (v === 5 || v === 10 || v === 15 || v === 30) lsSet(K.seekStep, String(v));
}

/* ---- simple on/off + enum prefs ------------------------------------------ */

export function getOrientLock(): OrientLock {
  const v = lsGet(K.orientLock);
  return v === "portrait" || v === "landscape" ? v : "auto";
}
export function setOrientLock(v: OrientLock): void {
  lsSet(K.orientLock, v);
}

export function getAutoLock(): boolean {
  return lsGet(K.autoLock) === "1";
}
export function setAutoLock(v: boolean): void {
  lsSet(K.autoLock, v ? "1" : "0");
}

export function getKeepAwake(): boolean {
  return lsGet(K.keepAwake) !== "0"; // default ON
}
export function setKeepAwake(v: boolean): void {
  lsSet(K.keepAwake, v ? "1" : "0");
}

export function getDataSaver(): boolean {
  return lsGet(K.dataSaver) === "1";
}
export function setDataSaver(v: boolean): void {
  lsSet(K.dataSaver, v ? "1" : "0");
}

export function getSubDelay(): number {
  const v = Number(lsGet(K.subDelay));
  return Number.isFinite(v) ? Math.max(-30, Math.min(30, v)) : 0;
}
export function setSubDelay(v: number): void {
  lsSet(K.subDelay, String(Math.max(-30, Math.min(30, v))));
}

export function getSubPos(): number {
  const v = Number(lsGet(K.subPos));
  return Number.isFinite(v) && v >= 10 && v <= 90 ? v : 85;
}
export function setSubPos(v: number): void {
  lsSet(K.subPos, String(Math.max(10, Math.min(90, Math.round(v)))));
}

export function getRatePref(): number {
  const v = Number(lsGet(K.rate));
  return Number.isFinite(v) && v >= 0.25 && v <= 3 ? v : 1;
}
export function setRatePref(v: number): void {
  if (v >= 0.25 && v <= 3) lsSet(K.rate, String(v));
}

/* ---- zoom mode per title -------------------------------------------------- */

export function zoomKey(contentKey: string | number): string {
  return `nama-zoom-${contentKey}`;
}

export function getZoomMode(contentKey: string | number): ZoomMode {
  const v = lsGet(zoomKey(contentKey));
  return v === "cover" || v === "fill" ? v : "contain";
}

export function setZoomMode(contentKey: string | number, m: ZoomMode): void {
  lsSet(zoomKey(contentKey), m);
}

export function nextZoomMode(m: ZoomMode): ZoomMode {
  return m === "contain" ? "cover" : m === "cover" ? "fill" : "contain";
}

/* ---- data saver: pick the best variant ≤720p ------------------------------
 *  Sources arrive best-first (catalog order is DESCENDING: 1080p → 720p → …,
 *  verified across the real shards). The data-saver pick is therefore the
 *  HIGHEST quality ≤ 720 — «sharpest cheap variant». Scanning all entries and
 *  keeping the max (first-wins on ties) also stays correct if a source list
 *  ever arrives unsorted; unparseable labels are treated as expensive. */

export function qNum(q: string | undefined): number {
  const n = parseInt(String(q ?? "").replace(/[^0-9]/g, ""), 10);
  // Real quality labels are ≥ 240 («240p»…«4320p»). Smaller extracts are junk
  // residue («4» from «4k-dx») and must count as EXPENSIVE, never data-saver picks.
  return Number.isFinite(n) && n >= 100 ? n : 9999;
}

export function pickDataSaverIdx(sources: { q?: string }[]): number {
  let pick = -1;
  let best = 0;
  for (let i = 0; i < sources.length; i++) {
    const n = qNum(sources[i]?.q);
    if (n <= 720 && n > best) { best = n; pick = i; }
  }
  return pick; // -1 → caller keeps the default pick
}

/* ---- native handoff episodes manifest (pure) ------------------------------
 *  The bridge accepts a lightweight manifest so PlayerActivity can render the
 *  episode list (seasons, watched ticks, progress) without any catalog
 *  access. One string per episode keeps the Capacitor intent cheap. */

export type ManifestEpisode = {
  id: number;
  season: number;
  number: number;
  name: string;
  thumbnail: string;
  watched: boolean;
  progressPct: number;
};

export type EpisodesManifest = {
  episodes: ManifestEpisode[];
  episodeIndex: number;
};

export function buildEpisodesManifest(
  episodes: { id: number; season: number; number: number; name: string; thumbnail: string }[],
  currentId: number | null | undefined,
  progress: Map<number, { position: number; duration: number }>
): EpisodesManifest {
  const list: ManifestEpisode[] = episodes.map((e) => {
    const p = progress.get(e.id);
    const pct = p && p.duration > 0 ? Math.min(100, Math.round((p.position / p.duration) * 100)) : 0;
    return { ...e, watched: pct >= 92, progressPct: pct };
  });
  const idx = list.findIndex((e) => e.id === currentId);
  return { episodes: list, episodeIndex: idx >= 0 ? idx : 0 };
}

/** serialize one episode for the intent extra: id␁season␁number␁name␁thumb␁watched␁pct */
export const MANIFEST_SEP = "\u0001";

export function serializeManifest(m: EpisodesManifest): string[] {
  return m.episodes.map((e) =>
    [String(e.id), String(e.season), String(e.number), e.name ?? "", e.thumbnail ?? "", e.watched ? "1" : "0", String(e.progressPct)].join(MANIFEST_SEP)
  );
}
