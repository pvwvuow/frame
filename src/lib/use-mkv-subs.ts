"use client";

/* Polls the local stream proxy for the VTT extracted (so far) from an MKV's
 * embedded Persian SRT track and hands the growing VTT string to the player.
 * The proxy parses subtitle packets out of the byte stream that is already
 * flowing to the <video> element – no second download, no re-encoding. */
import { useEffect, useRef, useState } from "react";
import { subsUrl, type ProxySubsResponse } from "./video-url";

export function useMkvSubs(rawUrl: string | null | undefined, proxyBase: string | null | undefined, enabled = true) {
  const [vtt, setVtt] = useState<string | null>(null);
  const [cueCount, setCueCount] = useState(0);
  const [info, setInfo] = useState<Pick<ProxySubsResponse, "found" | "probed" | "kinds" | "audio" | "audioOk" | "audioLabel"> | null>(null);
  const lastCount = useRef(0);

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

    const tick = async () => {
      if (!alive) return;
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
          if (j.complete && j.cues === lastCount.current) {
            return; // nothing more will arrive
          }
        }
      } catch {
        /* proxy briefly busy – retry */
      }
      timer = setTimeout(tick, 2500);
    };
    void tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [rawUrl, proxyBase, enabled]);

  return { vtt, cueCount, info };
}
