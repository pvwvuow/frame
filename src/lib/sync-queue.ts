"use client";

/* v0.27.0 — the OFFLINE-SAFE sync queue + deletion tombstones.
 *
 * THE BUG CLASS (user-review DATA-1/2/3/4/12/16): every cloud push used to be
 * fire-and-forget. Offline (VPN down, subway, …) the push failed SILENTLY,
 * the UI still said «ذخیره شد», and on the next pull the union-merge
 * RESURRECTED whatever the user had just removed — the «چرا فیلمی که پاک
 * کردم دوباره برگشت؟» report. Deletions also never reached the OTHER device
 * (nothing is ever deleted by a merge), so two devices could resurrect each
 * other's rows forever.
 *
 * THE FIX, in two halves:
 *
 * 1) PENDING-OP QUEUE (localStorage, both platforms): when a cloud push
 *    fails (or the app is offline), the op lands here instead of vanishing.
 *    `flushSyncOps()` runs on `online` / interval / after every fullSync and
 *    replays the ops against Supabase. Ops carry the `uid` they were created
 *    under; a different account's ops are dropped, never replayed.
 *
 * 2) TOMBSTONES: a removal records {kind, key, at}. The merge layer (desktop
 *    /api/cloud/merge + mobile mergeCloudSnapshot) consults them to
 *    (a) skip re-adding tombstoned keys from the cloud snapshot and
 *    (b) delete local rows that are OLDER than the tombstone.
 *    Cross-device propagation rides the existing `user_events` cloud table
 *    (type "sync_del") — zero Supabase schema changes. Tombstones are
 *    short-lived (TTL below) and cleared when the active account changes.
 *
 * Everything is plain JSON in localStorage — no Dexie schema bump needed and
 * it works identically on Electron (desktop) and Android (WebView).
 */

export type SyncOpKind =
  | "favorite"
  | "watchlist"
  | "rating"
  | "progress"
  | "progress-del"
  | "collection-del"
  | "collection-rename"
  | "collection-item-del";

export type SyncOp = {
  id: string;
  kind: SyncOpKind;
  uid: string;
  at: string;
  /** favorite/watchlist/rating: {slug,title,value|status|score} */
  /** progress: rows[] already slug-resolved · *-del/collection-*: key fields */
  payload: Record<string, unknown>;
};

export type Tombstone = { kind: "favorite" | "watchlist" | "rating" | "progress" | "collection"; key: string; at: string };

const OPS_KEY = "frame.sync.ops";
const TOMB_KEY = "frame.sync.tomb";
const EV_CURSOR_KEY = "frame.sync.evCursor";

const OPS_CAP = 1000;
const TOMB_CAP = 2000;
const TOMB_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — after that the queued delete has flushed (or the cloud row is stale anyway)

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

/* ------------------------------------------------------------------ */
/* Pending ops                                                         */
/* ------------------------------------------------------------------ */

export function getSyncOps(): SyncOp[] {
  try {
    const raw = JSON.parse(lsGet(OPS_KEY) ?? "[]") as SyncOp[];
    return Array.isArray(raw) ? raw.filter((o) => o && typeof o.kind === "string") : [];
  } catch {
    return [];
  }
}

export function countSyncOps(): number {
  return getSyncOps().length;
}

export function enqueueSyncOp(kind: SyncOpKind, uid: string, payload: Record<string, unknown>): void {
  const ops = getSyncOps();
  // one pending op per (kind,slug/name) — the newest wins (idempotent replay)
  const sig = `${kind}:${String(payload.slug ?? payload.name ?? payload.from ?? "")}`;
  const kept = ops.filter((o) => `${o.kind}:${String(o.payload.slug ?? o.payload.name ?? o.payload.from ?? "")}` !== sig);
  kept.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    kind,
    uid,
    at: new Date().toISOString(),
    payload,
  });
  lsSet(OPS_KEY, JSON.stringify(kept.slice(-OPS_CAP)));
}

export function removeSyncOps(ids: string[]): void {
  if (!ids.length) return;
  const gone = new Set(ids);
  lsSet(OPS_KEY, JSON.stringify(getSyncOps().filter((o) => !gone.has(o.id))));
}

/** Drop ops that belong to ANOTHER account (never replay A's deletes as B). */
export function dropOpsForOtherUids(activeUid: string): void {
  lsSet(OPS_KEY, JSON.stringify(getSyncOps().filter((o) => !o.uid || o.uid === activeUid)));
}

/* ------------------------------------------------------------------ */
/* Tombstones                                                          */
/* ------------------------------------------------------------------ */

function loadTombs(): Tombstone[] {
  try {
    const raw = JSON.parse(lsGet(TOMB_KEY) ?? "[]") as Tombstone[];
    if (!Array.isArray(raw)) return [];
    const min = Date.now() - TOMB_TTL_MS;
    return raw.filter((t) => t && typeof t.key === "string" && (Date.parse(t.at) || 0) > min);
  } catch {
    return [];
  }
}

function saveTombs(t: Tombstone[]): void {
  lsSet(TOMB_KEY, JSON.stringify(t.slice(-TOMB_CAP)));
}

/** Record a LOCAL deletion so the next pull cannot resurrect the row. */
export function recordTombstone(kind: Tombstone["kind"], key: string): void {
  if (!key) return;
  const at = new Date().toISOString();
  const tombs = loadTombs().filter((t) => !(t.kind === kind && t.key === key));
  tombs.push({ kind, key, at });
  saveTombs(tombs);
}

export function peekTombstone(kind: Tombstone["kind"], key: string): Tombstone | null {
  return loadTombs().find((t) => t.kind === kind && t.key === key) ?? null;
}

/** A deliberate re-ADD clears the tombstone (the user changed their mind). */
export function clearTombstone(kind: Tombstone["kind"], key: string): void {
  saveTombs(loadTombs().filter((t) => !(t.kind === kind && t.key === key)));
}

export function clearAllTombstones(): void {
  lsSet(TOMB_KEY, "[]");
}

/** True when the tombstone is NEWER than the cloud row (=> the delete wins). */
export function tombstoneNewerThan(kind: Tombstone["kind"], key: string, rowTs: unknown): boolean {
  const t = peekTombstone(kind, key);
  if (!t) return false;
  const rt = typeof rowTs === "number" ? rowTs : Date.parse(String(rowTs ?? "")) || 0;
  return (Date.parse(t.at) || 0) >= rt;
}

/* ------------------------------------------------------------------ */
/* Cross-device deletion events cursor                                 */
/* ------------------------------------------------------------------ */

export type EvCursor = { uid: string; at: string };

export function readEvCursor(): EvCursor | null {
  try {
    const raw = JSON.parse(lsGet(EV_CURSOR_KEY) ?? "null") as EvCursor | null;
    return raw && typeof raw.uid === "string" ? raw : null;
  } catch {
    return null;
  }
}

export function writeEvCursor(c: EvCursor): void {
  lsSet(EV_CURSOR_KEY, JSON.stringify(c));
}
