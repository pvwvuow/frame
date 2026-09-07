"use client";

import { useEffect, useState } from "react";

export type PipPayload = {
  titleId: number;
  slug: string;
  title: string;
  subtitle?: string;
  src: string;
  sources?: { q: string; v: string; url: string; mb?: number }[];
  poster: string;
  startAt: number;
  episode: { id: number; season: number; number: number; name: string; videoUrl: string; thumbnail: string } | null;
  nextEpisode: { id: number; season: number; number: number; name: string; videoUrl: string; thumbnail: string } | null;
  episodes: { id: number; season: number; number: number; name: string; videoUrl: string; thumbnail: string }[];
  currentTime?: number;
  volume?: number;
  muted?: boolean;
  rate?: number;
  srcIdx?: number;
};

export type NamaPipBridge = {
  /** opens a NEW floating window → { id } | "max" | "invalid" (v0.10.19) */
  open: (payload: PipPayload) => Promise<{ id: number } | "max" | "invalid">;
  /** close a specific window (by id) or, from inside a float, itself */
  close: (id?: number) => void;
  expand: (currentTime: number, srcIdx: number) => void;
  pin: (on: boolean) => void;
  time: (t: number) => void;
  next: () => void;
  getState: () => Promise<(PipPayload & { id: number }) | null>;
  onState: (cb: (p: PipPayload) => void) => () => void;
  onExpand: (cb: (p: { id: number; payload: PipPayload }) => void) => () => void;
  onClosed: (cb: (p: { id: number }) => void) => () => void;
  onTime: (cb: (p: { id: number; t: number }) => void) => () => void;
  onSync: (cb: (p: { id: number; state: PipPayload }) => void) => () => void;
};

export type DownloadItem = {
  id: string;
  url: string;
  name: string;
  year: number;
  kind: "movie" | "series";
  season: number;
  episode: number;
  quality: string;
  variant: string;
  mb: number;
  label: string;
  status: "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";
  received: number;
  total: number;
  speed: number;
  error: string | null;
  filePath?: string;
  createdAt?: number;
  completedAt?: number;
};

export type DownloadState = { dir: string | null; items: DownloadItem[] };

export type NamaDownloadsBridge = {
  getState: () => Promise<DownloadState>;
  enqueue: (item: {
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
  }) => Promise<{ ok: boolean; id?: string; dup?: boolean; error?: string; needDir?: boolean }>;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  chooseDir: () => Promise<string | null>;
  setDir: (dir: string) => Promise<boolean>;
  openFolder: (id?: string | null) => Promise<boolean>;
  onState: (cb: (s: DownloadState) => void) => () => void;
};

export type NamaBridge = {
  isElectron: true;
  platform: NodeJS.Platform;
  version: string;
  getInfo: () => Promise<{ version: string; electron: string; chrome: string; node: string; platform: string; arch: string; dataDir: string; dbPath: string }>;
  checkForUpdates: () => Promise<{ status: "available" | "not-available" | "error" | "disabled"; version?: string; message?: string }>;
  installUpdate?: () => Promise<boolean>;
  openDataDir: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  proxyUrl?: () => Promise<string>;
  pip?: NamaPipBridge;
  downloads?: NamaDownloadsBridge;
  window: { minimize: () => void; maximize: () => void; close: () => void; isMaximized: () => Promise<boolean>; toggleFullscreen: () => void };
  onNavigate: (cb: (path: string) => void) => () => void;
  onUpdateStatus: (cb: (s: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
  setBadge: (count: number) => void;
};

declare global {
  interface Window {
    nama?: NamaBridge;
    __namaPopGuard?: boolean;
  }
}

/** Synchronous check – only safe inside effects/event handlers. */
export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  if (window.nama?.isElectron) return true;
  return /\bElectron\//i.test(navigator.userAgent);
}

/** Hydration-safe hook: `false` on the server and during the first client render. */
export function useIsElectron(): boolean {
  const [el, setEl] = useState(false);
  useEffect(() => setEl(isElectron()), []);
  return el;
}

export const bridge = () => (typeof window !== "undefined" ? window.nama : undefined);
