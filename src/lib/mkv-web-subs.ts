"use client";

/* v0.20.0 — mobile web-player subtitles, WITHOUT the Electron proxy.
 *
 * The cinema-capable web player on Android used to have ZERO embedded
 * subtitles (useSubs() needs window.nama.proxyUrl(), which only Electron
 * implements). The native player renders them → users called the web
 * player «کار نمی‌کند». This hook runs the in-WebView Matroska scanner
 * (mkv-web.ts) over ranged native HTTP and feeds the SAME ParsedCue[]
 * pipeline (SubOverlay) the proxy path feeds on desktop.
 *
 * Lifecycle per source:
 *   - enabled flips on (player open, web owner, MKV-ish, subs on) → a
 *     MkvWebScan session probes the head (Tracks + audio intelligence)
 *     and starts a position-aware progressive scan.
 *   - progress() every 3s + kick() on seek keep ≥45s of cue runway ahead
 *     of the playhead; the session parks between top-ups (mobile data).
 *   - source change / close → scan.stop().
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MkvWebScan, type ParsedCue, type ScanState } from "./mkv-web";

export type MkvWebStatus = {
  state: ScanState;
  cueCount: number;
  /** header intelligence (mirror of the proxy's SubStatus fields) */
  probed: boolean;
  subFound: boolean;
  matroska: boolean;
  kinds: string[];
  audio: string[];
  audioOk: boolean | null;
  audioLabel: string | null;
  videoCodec: string | null;
  fileSize: number;
  cov: [number, number] | null;
};

const EMPTY: MkvWebStatus = {
  state: "idle",
  cueCount: 0,
  probed: false,
  subFound: false,
  matroska: false,
  kinds: [],
  audio: [],
  audioOk: null,
  audioLabel: null,
  videoCodec: null,
  fileSize: 0,
  cov: null,
};

export function useMkvWebSubs(
  rawUrl: string | null | undefined,
  enabled: boolean,
  getPosition?: () => number,
  getIsPlaying?: () => boolean,
  getDuration?: () => number
) {
  const [cues, setCues] = useState<ParsedCue[]>([]);
  const [status, setStatus] = useState<MkvWebStatus>(EMPTY);
  const posRef = useRef(getPosition);
  const playRef = useRef(getIsPlaying);
  const durRef = useRef(getDuration);
  useEffect(() => {
    posRef.current = getPosition;
    playRef.current = getIsPlaying;
    durRef.current = getDuration;
  });
  const scanRef = useRef<MkvWebScan | null>(null);

  useEffect(() => {
    setCues([]);
    setStatus(EMPTY);
    if (!rawUrl || !enabled) return;
    let alive = true;
    const scan = new MkvWebScan(
      rawUrl,
      (list) => {
        if (alive) setCues(list);
      },
      (state) => {
        if (!alive) return;
        const st = scan.getStore();
        setStatus({
          state,
          cueCount: scan.cueCount,
          probed: st.probed,
          subFound: st.textTracks.size > 0,
          matroska: st.matroska,
          kinds: [...st.kinds],
          audio: [...st.audioCodecs],
          audioOk: st.audioOk(),
          audioLabel: st.audioLabel(),
          videoCodec: st.videoCodec,
          fileSize: st.fileSize,
          cov: st.covSec(),
        });
      },
      () => durRef.current?.() ?? 0
    );
    scanRef.current = scan;
    scan.start(posRef.current?.() ?? 0);
    const tick = setInterval(() => {
      if (!alive) return;
      scan.progress(posRef.current?.() ?? 0, playRef.current?.() ?? false);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(tick);
      scanRef.current = null;
      scan.stop();
    };
  }, [rawUrl, enabled]);

  /** Immediate position flush — the `seeked` listener path. isPlaying is
   *  forced so a parked session wakes for the new position at once. */
  const kick = useCallback(() => {
    scanRef.current?.progress(posRef.current?.() ?? 0, true);
  }, []);

  return { cues, status, kick };
}
