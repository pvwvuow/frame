"use client";

/* v0.12.0 — offline downloads for the Android app (تماشای آفلاین).
 *
 * The video bytes live in the app's private storage via the NamaNative
 * download engine (Range resume, pause/resume/cancel, ~2 concurrent jobs).
 * This module is the index: Dexie records + event fan-out for the UI, and
 * the lookup /watch uses to play a downloaded file without any network.
 *
 * Files are stored as <id><ext> under files/downloads/ and always play in
 * the native player (hardware codecs; the WebView never touches the file).
 */

import { db } from "./mobile/db";
import { nativeBridge, type NamaDownloadEvent } from "./native-bridge";

/** v0.27.0 (DATA-13) — downloads belong to ONE account. The active data-space
 * key (same value the rest of the user-data layer uses) scopes every record. */
function activeUserKey(): string {
  try {
    const active = localStorage.getItem("frame.acct.active");
    if (active) return active;
  } catch {
    /* ignore */
  }
  try {
    const m = document.cookie.match(/(?:^|;\s*)nama_uid=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "guest";
  } catch {
    return "guest";
  }
}

export type DownloadRecord = {
  id: string;
  titleId: number;
  title: string;
  slug: string;
  poster: string;
  type: "movie" | "series";
  episodeId: number | null;
  episodeLabel: string | null;
  url: string;
  quality: string;
  variant: string;
  status: "queued" | "downloading" | "paused" | "completed" | "failed";
  received: number;
  total: number;
  speed: number;
  dest: string; // relative path under filesDir
  createdAt: number;
  /** v0.27.0 (DATA-13) — owning data space on this device */
  userKey?: string;
};

const MAX_ACTIVE = 2;

/* ---------------- event fan-out ---------------- */
type Listener = (records: DownloadRecord[]) => void;
const listeners = new Set<Listener>();
let wired = false;

function broadcast() {
  void listDownloads().then((rows) => {
    for (const l of listeners) {
      try {
        l(rows);
      } catch {
        /* ignore */
      }
    }
  });
}

function wire() {
  const b = nativeBridge();
  if (!b || wired) return;
  wired = true;
  void b.addListener("namaDownload", (e: NamaDownloadEvent) => {
    void onEvent(e);
  });
}

async function onEvent(e: NamaDownloadEvent) {
  const rec = await db.dlitems.get(e.id);
  if (!rec) return;
  if (e.type === "progress") {
    await db.dlitems.update(e.id, { received: e.received, total: e.total || rec.total, speed: e.speed, status: "downloading" });
  } else if (e.type === "done") {
    await db.dlitems.update(e.id, { status: "completed", received: e.total || rec.total, total: e.total || rec.total, speed: 0 });
  } else if (e.type === "paused") {
    await db.dlitems.update(e.id, { status: "paused", speed: 0 });
  } else if (e.type === "error") {
    await db.dlitems.update(e.id, { status: "failed", speed: 0 });
  }
  broadcast();
}

/* ---------------- queries ---------------- */

export async function listDownloads(): Promise<DownloadRecord[]> {
  const uk = activeUserKey();
  const rows = (await db.dlitems.toArray()) as unknown as DownloadRecord[];
  // v0.27.0 (DATA-13) — per-account: rows from another account (or legacy
  // rows stamped by the v5 migration for a DIFFERENT account) never leak
  return rows
    .filter((r) => !r.userKey || r.userKey === uk)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDownloadFor(titleId: number, episodeId: number | null): Promise<DownloadRecord | null> {
  const uk = activeUserKey();
  const all = (await db.dlitems.where("titleId").equals(titleId).toArray()) as unknown as DownloadRecord[];
  const rows = all.filter((r) => (r.episodeId ?? null) === (episodeId ?? null) && (!r.userKey || r.userKey === uk));
  if (!rows.length) return null;
  // completed first, then the most recent attempt
  const rank = (r: DownloadRecord) => (r.status === "completed" ? 2 : 1);
  return [...rows].sort((a, b) => rank(b) - rank(a) || b.createdAt - a.createdAt)[0] ?? rows[0];
}

/* ---------------- actions ---------------- */

export function dlSupported(): boolean {
  return nativeBridge() !== null;
}

export async function enqueueDownload(input: {
  titleId: number;
  title: string;
  slug: string;
  poster: string;
  type: "movie" | "series";
  episodeId: number | null;
  episodeLabel: string | null;
  url: string;
  quality: string;
  variant: string;
}): Promise<{ ok: boolean; dup?: boolean; error?: string }> {
  const b = nativeBridge();
  if (!b) return { ok: false, error: "unsupported" };
  if (!input.url) return { ok: false, error: "no-source" };
  wire();
  const existing = ((await db.dlitems.where("titleId").equals(input.titleId).toArray()) as unknown as DownloadRecord[]).filter(
    (r) => (r.episodeId ?? null) === (input.episodeId ?? null)
  );
  if (existing.some((e) => (e as unknown as DownloadRecord).status !== "failed")) return { ok: true, dup: true };
  const ext = (/\.mp4(\?|$)/i.test(input.url) ? ".mp4" : ".mkv");
  const id = `dl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const dest = `downloads/${id}${ext}`;
  const rec: DownloadRecord = {
    ...input,
    id,
    dest,
    status: "queued",
    received: 0,
    total: 0,
    speed: 0,
    createdAt: Date.now(),
    userKey: activeUserKey(),
  };
  await db.dlitems.put(rec as unknown as Record<string, unknown>);
  // respect MAX_ACTIVE: extras stay queued until a slot frees (the engine
  // itself runs whatever it is given; we only start up to MAX_ACTIVE)
  const active = (await db.dlitems.where("status").anyOf("downloading", "queued").toArray()) as unknown as DownloadRecord[];
  const starting = active.filter((r) => r.status === "downloading").length;
  if (starting < MAX_ACTIVE) {
    await b.download({ id, url: input.url, dest });
    await db.dlitems.update(id, { status: "downloading" });
  }
  broadcast();
  return { ok: true };
}

export async function pauseDownload(id: string) {
  await nativeBridge()?.downloadAction({ id, action: "pause" });
  await db.dlitems.update(id, { status: "paused", speed: 0 });
  broadcast();
}

export async function resumeDownload(id: string) {
  const rec = (await db.dlitems.get(id)) as unknown as DownloadRecord | undefined;
  const b = nativeBridge();
  if (!rec || !b) return;
  // v0.26.0 — DOUBLE-START GUARD (the UI half): a resume tap on an ACTIVE row
  // used to call b.download again with the same id — the native engine then
  // ran TWO threads into one dest.part with different Range offsets and the
  // partial file ended up corrupt. An active row only rebinds the progress
  // listeners and leaves the engine thread alone. (The native side also
  // refuses a second thread for a live job — alreadyRunning — so boot-resume
  // and stale rows stay safe either way.)
  if (rec.status === "downloading") {
    wire();
    broadcast();
    return;
  }
  const stat = await b.fileStat({ path: rec.dest });
  if (stat.exists) {
    // already fully on disk → mark complete
    await db.dlitems.update(id, { status: "completed" });
    broadcast();
    return;
  }
  await b.download({ id, url: rec.url, dest: rec.dest });
  await db.dlitems.update(id, { status: "downloading" });
  broadcast();
}

export async function cancelDownload(id: string) {
  await nativeBridge()?.downloadAction({ id, action: "cancel" });
  await db.dlitems.delete(id);
  broadcast();
}

export async function removeDownload(id: string) {
  const rec = (await db.dlitems.get(id)) as unknown as DownloadRecord | undefined;
  if (rec) {
    await nativeBridge()?.downloadAction({ id, action: "cancel" });
    await nativeBridge()?.deleteFile({ path: rec.dest });
  }
  await db.dlitems.delete(id);
  broadcast();
}

/** Kick the queue after boot: resume rows that were mid-flight (THIS account's only). */
export async function resumeQueueOnBoot() {
  const b = nativeBridge();
  if (!b) return;
  wire();
  const uk = activeUserKey();
  const rows = ((await db.dlitems.where("status").anyOf("downloading", "queued").toArray()) as unknown as DownloadRecord[]).filter((r) => !r.userKey || r.userKey === uk);
  let started = 0;
  for (const r of rows) {
    if (started >= MAX_ACTIVE) break;
    const stat = await b.fileStat({ path: r.dest });
    if (stat.exists && r.total > 0 && stat.size >= r.total) {
      await db.dlitems.update(r.id, { status: "completed" });
      continue;
    }
    await b.download({ id: r.id, url: r.url, dest: r.dest });
    await db.dlitems.update(r.id, { status: "downloading" });
    started++;
  }
  if (rows.length) broadcast();
}

/* ---------------- formatting ---------------- */

export function fmtBytes(n: number): string {
  if (!n || n <= 0) return "۰";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("fa-IR", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

export function fmtSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  return `${fmtBytes(bytesPerSec)}/ثانیه`;
}
