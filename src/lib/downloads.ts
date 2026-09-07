"use client";

/* Download-manager client (v0.10.19) — a thin, hydration-safe wrapper over
 * window.nama.downloads with a tiny subscription store so several widgets
 * (page, buttons, badges) share one snapshot. Everything degrades to a no-op
 * on the web build. */
import { useEffect } from "react";
import type { DownloadItem, DownloadState } from "@/lib/platform";

type Listener = (s: DownloadState) => void;

let state: DownloadState = { dir: null, items: [] };
const listeners = new Set<Listener>();
let subscribed = false;
let fetched = false;

function emit() {
  for (const l of listeners) l(state);
}

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  const dl = typeof window !== "undefined" ? window.nama?.downloads : undefined;
  if (!dl) return;
  dl.onState((s) => {
    state = s;
    emit();
  });
  if (!fetched) {
    fetched = true;
    void dl
      .getState()
      .then((s) => {
        state = s;
        emit();
      })
      .catch(() => {});
  }
}

export function useDownloadState(onChange?: (s: DownloadState) => void) {
  useEffect(() => {
    subscribe();
    const l: Listener = (s) => onChange?.(s);
    listeners.add(l);
    l(state);
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function getDownloadState(): DownloadState {
  return state;
}

export function dlSupported(): boolean {
  return typeof window !== "undefined" && !!window.nama?.downloads;
}

export type EnqueueInput = {
  url: string;
  name: string;
  year?: number;
  kind?: "movie" | "series";
  season?: number;
  episode?: number;
  quality?: string;
  variant?: string;
  mb?: number;
  label?: string;
};

export type EnqueueResult = { ok: boolean; id?: string; dup?: boolean; error?: string; needDir?: boolean };

export function dlEnqueue(item: EnqueueInput): Promise<EnqueueResult> {
  const dl = typeof window !== "undefined" ? window.nama?.downloads : undefined;
  if (!dl) return Promise.resolve({ ok: false, error: "download-unsupported" });
  return dl.enqueue(item);
}

export const dlPause = (id: string) => window.nama?.downloads?.pause(id);
export const dlResume = (id: string) => window.nama?.downloads?.resume(id);
export const dlCancel = (id: string) => window.nama?.downloads?.cancel(id);
export const dlRemove = (id: string) => window.nama?.downloads?.remove(id);
export const dlChooseDir = (): Promise<string | null> => window.nama?.downloads?.chooseDir() ?? Promise.resolve(null);
export const dlOpenFolder = (id?: string | null) => void window.nama?.downloads?.openFolder(id ?? null);

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "—";
  return `${fmtBytes(bps)}/s`;
}

export type DlGroup = {
  active: DownloadItem[];
  queued: DownloadItem[];
  paused: DownloadItem[];
  completed: DownloadItem[];
  failed: DownloadItem[];
};

export function groupItems(items: DownloadItem[]): DlGroup {
  const g: DlGroup = { active: [], queued: [], paused: [], completed: [], failed: [] };
  for (const it of [...items].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))) {
    if (it.status === "downloading") g.active.push(it);
    else if (it.status === "queued") g.queued.push(it);
    else if (it.status === "paused") g.paused.push(it);
    else if (it.status === "completed") g.completed.push(it);
    else if (it.status === "failed") g.failed.push(it);
  }
  return g;
}
