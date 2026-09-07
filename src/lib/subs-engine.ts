"use client";

/* نما – Subtitles v3 engine (v0.10.18) – the ONE subtitle pipeline both the
 * theater player and the floating PiP window share.
 *
 * WHY A REWRITE: the old chain (useMkvSubs poll → VTT string → one
 * programmatic TextTrack per element → VTTCue appends → mode juggling)
 * failed in the field no matter how the proxy was patched:
 *   • the TextTrack mode/cues chain was order-dependent across FIVE effects
 *     and duplicated (drifting) in Player.tsx and PipClient.tsx;
 *   • a track that re-keyed with the <video> (quality switch, retry, PiP
 *     handoff) had to be re-seeded by racing effects — miss one and the
 *     subtitles silently disappeared for the rest of the movie;
 *   • polls did not tell the proxy WHERE playback was, so the proxy could
 *     never recover coverage gaps around the watched position.
 *
 * The engine now:
 *   1. polls /subs with the CURRENT playback position (pos) and duration
 *      (dur) so the proxy can position-aware-backfill (see stream-proxy);
 *   2. parses the returned VTT into a plain, sorted ParsedCue[] — no
 *      TextTrack, no VTTCue, no mode races. Rendering is done by the
 *      SubOverlay component (binary search over cues per frame);
 *   3. keeps the cadence adaptive (0.7s until cues exist → 1.5s while they
 *      grow → 6s once complete) and kicks instantly on seek;
 *   4. aborts everything (fetch + timer) the moment the hook stops — no
 *      stray /subs request can outlive a closed player.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { subsUrl, type ProxySubsResponse } from "./video-url";
import { parseVtt, type ParsedCue } from "./media";

export type SubStatus = {
  found: boolean;
  probed: boolean;
  /** content-sniffed Matroska (v0.10.18 diagnostics) */
  matroska: boolean;
  cueCount: number;
  /** [minSec, maxSec] coverage of the served track, or null */
  cov: [number, number] | null;
  kinds: string[];
  audio: string[];
  audioOk: boolean | null;
  audioLabel: string | null;
};

const EMPTY_STATUS: SubStatus = {
  found: false,
  probed: false,
  matroska: false,
  cueCount: 0,
  cov: null,
  kinds: [],
  audio: [],
  audioOk: null,
  audioLabel: null,
};

/**
 * Poll the local proxy for the subtitle cues of `rawUrl`.
 * `getPos`/`getDur` are read fresh on every tick (never re-trigger the
 * effect) so the proxy can backfill around the watched position.
 */
export function useSubs(
  rawUrl: string | null | undefined,
  proxyBase: string | null | undefined,
  enabled: boolean,
  getPos?: () => number,
  getDur?: () => number
) {
  const [cues, setCues] = useState<ParsedCue[]>([]);
  const [status, setStatus] = useState<SubStatus>(EMPTY_STATUS);
  // fresh getters on every render, synced in an effect (never during render)
  const posRef = useRef<(() => number) | undefined>(getPos);
  const durRef = useRef<(() => number) | undefined>(getDur);
  useEffect(() => {
    posRef.current = getPos;
    durRef.current = getDur;
  });
  const kickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setCues([]);
    setStatus(EMPTY_STATUS);
    if (!rawUrl || !proxyBase || !enabled) return;
    const url = subsUrl(rawUrl, proxyBase);
    if (!url) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let lastCount = 0;
    // abort the in-flight poll the moment this hook stops (theater closed,
    // quality switch) — no stray /subs request outliving the player
    const ctl = new AbortController();

    const apply = (j: ProxySubsResponse) => {
      setStatus({
        found: !!j.found,
        probed: !!j.probed,
        matroska: !!j.matroska,
        cueCount: j.cues ?? 0,
        cov: Array.isArray(j.cov) && j.cov.length === 2 ? [j.cov[0], j.cov[1]] : null,
        kinds: j.kinds ?? [],
        audio: j.audio ?? [],
        audioOk: j.audioOk ?? null,
        audioLabel: j.audioLabel ?? null,
      });
      if (j.cues > 0 && j.vtt && j.cues !== lastCount) {
        lastCount = j.cues;
        const parsed = parseVtt(j.vtt);
        if (parsed.length > 1) parsed.sort((a, b) => a.s - b.s);
        setCues(parsed);
      }
    };

    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      let wait = 1500;
      try {
        const pos = posRef.current ? posRef.current() : 0;
        const dur = durRef.current ? durRef.current() : 0;
        const p = Number.isFinite(pos) ? Math.max(0, Math.round(pos * 1000) / 1000) : 0;
        const d = Number.isFinite(dur) ? Math.max(0, Math.round(dur * 1000) / 1000) : 0;
        const r = await fetch(`${url}&pos=${p}&dur=${d}`, { cache: "no-store", signal: ctl.signal });
        if (!alive) return;
        if (r.ok) {
          const j = (await r.json()) as ProxySubsResponse;
          if (!alive) return;
          apply(j);
          if (lastCount === 0) wait = 700; // no cues yet → find them fast
          else if (j.complete && j.cues === lastCount) wait = 6000; // idle back-off
        }
      } catch {
        /* proxy briefly busy or aborted with the player – retry only if alive */
      }
      inFlight = false;
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void tick();
      }, wait);
    };

    // kick: immediate poll (seek happened / player opened) — collapses the
    // remaining wait so freshly scanned cues show up on the very next beat
    kickRef.current = () => {
      if (!alive) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void tick();
    };
    void tick();

    return () => {
      alive = false;
      inFlight = false;
      kickRef.current = null;
      if (timer) clearTimeout(timer);
      ctl.abort(); // kill any in-flight /subs fetch
    };
  }, [rawUrl, proxyBase, enabled]);

  const kick = useCallback(() => kickRef.current?.(), []);

  return { cues, status, kick };
}
