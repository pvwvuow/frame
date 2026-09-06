"use client";

/* Polls the local stream proxy for the VTT extracted (so far) from an MKV's
 * embedded Persian SRT track and hands the growing VTT string to the player.
 * The proxy parses subtitle packets out of the byte stream that is already
 * flowing to the <video> element – no second download, no re-encoding.
 *
 * v0.10.12: faster first paint + seek kicks. The old fixed 2.5s cadence
 * added up to 2.5s of dead air before the first cues appeared and again
 * after every seek (the player had to wait for the next scheduled poll to
 * pick up the freshly scanned cues). Now: 900ms cadence until cues exist,
 * 1.6s while they keep growing, 8s once the file pass is complete, and a
 * kick() that fires an immediate poll — the player calls it on `seeked`. */
import { useCallback, useEffect, useRef, useState } from "react";
import { subsUrl, type ProxySubsResponse } from "./video-url";

export function useMkvSubs(rawUrl: string | null | undefined, proxyBase: string | null | undefined, enabled = true) {
  const [vtt, setVtt] = useState<string | null>(null);
  const [cueCount, setCueCount] = useState(0);
  const [info, setInfo] = useState<Pick<ProxySubsResponse, "found" | "probed" | "kinds" | "audio" | "audioOk" | "audioLabel"> | null>(null);
  const lastCount = useRef(0);
  const tickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setVtt(null);
    setCueCount(0);
    setInfo(null);
    lastCount.current = 0;
    if (!rawUrl || !proxyBase || !enabled) return;
    const url = subsUrl(rawUrl, proxyBase);
    if (!url) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const schedule = (wait: number) => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void tick();
      }, wait);
    };

    const tick = async () => {
      if (!alive || inFlight) return;
      inFlight = true;
      let wait = 1600;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as ProxySubsResponse;
          if (!alive) return;
          setInfo({ found: j.found, probed: j.probed, kinds: j.kinds, audio: j.audio, audioOk: j.audioOk, audioLabel: j.audioLabel });
          if (j.cues > 0 && j.vtt && j.cues !== lastCount.current) {
            lastCount.current = j.cues;
            setVtt(j.vtt);
            setCueCount(j.cues);
          }
          // v0.10.8: NEVER stop while the player is open. The old early-return
          // killed the poll as soon as one full pass reported `complete`, so
          // cues picked up by LATER seek passes never reached the <track>.
          if (j.complete && j.cues === lastCount.current) wait = 8000; // idle back-off
          else if (lastCount.current === 0) wait = 900; // no cues yet → find them fast
        }
      } catch {
        /* proxy briefly busy – retry */
      }
      inFlight = false;
      schedule(wait);
    };

    // kick: immediate poll (seek happened / theater opened) — collapses the
    // remaining wait so freshly scanned cues show up on the very next frame
    tickRef.current = () => {
      if (!alive) return;
      schedule(0);
    };
    void tick();

    return () => {
      alive = false;
      inFlight = false;
      tickRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [rawUrl, proxyBase, enabled]);

  const kick = useCallback(() => tickRef.current?.(), []);

  return { vtt, cueCount, info, kick };
}
