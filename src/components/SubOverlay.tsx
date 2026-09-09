"use client";

/* نما – Subtitles v3 overlay renderer (v0.10.18).
 *
 * WHY NOT A <track>/TextTrack ANYMORE: the native TextTrack chain (VTTCue
 * appends + mode juggling across re-keyed <video> elements) was the least
 * reliable part of the old subtitle pipeline — a missed re-seed after a
 * quality switch silently killed the subtitles for the rest of the movie.
 * The cues we extract are already plain data, so we RENDER them ourselves:
 * a binary search over the sorted cue list per animation frame, one div.
 * No mode races, no cue limits, no re-seed effects, identical styling in
 * the theater and the floating window, and RTL Persian text renders exactly
 * as the rest of the app.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ParsedCue } from "@/lib/media";

const cueEndSec = (c: ParsedCue) => (c.e != null ? c.e : c.s + 6000) / 1000;

export default function SubOverlay({
  cues,
  videoRef,
  on,
  size = "m",
  pip = false,
}: {
  cues: ParsedCue[];
  videoRef: RefObject<HTMLVideoElement | null>;
  on: boolean;
  size?: "s" | "m" | "l" | "xl";
  /** smaller paddings/baseline for the floating PiP window */
  pip?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const keyRef = useRef<string | null>("");

  useEffect(() => {
    if (!on || cues.length === 0) {
      if (keyRef.current !== "") {
        keyRef.current = "";
        setText(null);
      }
      return;
    }
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v) {
        const t = v.currentTime;
        // binary search: the last cue that starts at or before t
        let lo = 0;
        let hi = cues.length - 1;
        let hit = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (cues[mid].s / 1000 <= t) {
            hit = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        let line: string | null = null;
        if (hit >= 0) {
          const c = cues[hit];
          if (t <= cueEndSec(c)) line = c.t;
          else {
            // hit ended — a next cue may already be active (overlap)
            const nxt = cues[hit + 1];
            if (nxt && nxt.s / 1000 <= t && t <= cueEndSec(nxt)) line = nxt.t;
          }
        }
        if (line !== keyRef.current) {
          keyRef.current = line;
          setText(line);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cues, on, videoRef]);

  if (!on || !text) return null;
  return (
    <div className={`sub-overlay${pip ? " sub-overlay--pip" : ""}`} data-subsize={size} aria-live="polite">
      <div className="sub-overlay__text" dir="rtl">
        {text}
      </div>
    </div>
  );
}
