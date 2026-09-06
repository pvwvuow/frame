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
  open: (payload: PipPayload) => Promise<string>;
  close: () => void;
  expand: (currentTime: number, srcIdx: number) => void;
  pin: (on: boolean) => void;
  time: (t: number) => void;
  next: () => void;
  getState: () => Promise<PipPayload | null>;
  onState: (cb: (p: PipPayload) => void) => () => void;
  onExpand: (cb: (p: PipPayload) => void) => () => void;
  onClosed: (cb: () => void) => () => void;
  onTime: (cb: (t: number) => void) => () => void;
  onSync: (cb: (p: PipPayload) => void) => () => void;
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
  window: { minimize: () => void; maximize: () => void; close: () => void; isMaximized: () => Promise<boolean>; toggleFullscreen: () => void };
  onNavigate: (cb: (path: string) => void) => () => void;
  onUpdateStatus: (cb: (s: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
  setBadge: (count: number) => void;
};

declare global {
  interface Window {
    nama?: NamaBridge;
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
