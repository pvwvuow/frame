"use client";

import { useEffect, useState } from "react";

export type NamaBridge = {
  isElectron: true;
  platform: NodeJS.Platform;
  version: string;
  getInfo: () => Promise<{ version: string; electron: string; chrome: string; node: string; platform: string; arch: string; dataDir: string; dbPath: string }>;
  checkForUpdates: () => Promise<{ status: "available" | "not-available" | "error" | "disabled"; version?: string; message?: string }>;
  openDataDir: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
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
