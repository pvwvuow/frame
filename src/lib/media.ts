"use client";

/* نما – shared media & cue helpers (v0.10.18)
 *
 * WHY THIS EXISTS
 * 1) Chromium keeps a DETACHED <video>/<audio> element playing until GC
 *    collects it. React unmount (modal close, theater close, quality re-key)
 *    removes the element from the DOM without pausing it → the film keeps
 *    playing «در پس‌زمینه» — the classic bug report. Every place that lets a
 *    media element go must stopMediaEl() it first.
 * 2) Subtitle cue plumbing: parseVtt() turns the proxy's VTT into a plain
 *    sorted cue list and srtToVtt() converts user-loaded SRT files. Since
 *    v0.10.18 cues are rendered by the SubOverlay component directly — the
 *    old programmatic-TextTrack helpers (applyVttToTrack/clearTrackCues)
 *    are gone with that whole fragile chain.
 */

/** Stop a (possibly already detached) media element for good: pause, drop
 *  the source and reset. Safe to call on detached elements — that is the
 *  point: pausing an orphaned element is the only way to silence it. */
export function stopMediaEl(el?: HTMLMediaElement | null) {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  try {
    el.removeAttribute("src");
    el.load();
  } catch {
    /* ignore */
  }
}

export type ParsedCue = { s: number; e: number; t: string };

function tcToMs(h: string, m: string, s: string, f: string): number {
  return Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000 + Number(f.padEnd(3, "0"));
}

/** Minimal VTT parser for the cue lists WE generate (local proxy output and
 *  converted SRT files). Format: one `HH:MM:SS.mmm --> HH:MM:SS.mmm` line
 *  followed by text lines up to a blank line. */
export function parseVtt(vtt: string): ParsedCue[] {
  const out: ParsedCue[] = [];
  const lines = String(vtt || "").replace(/\r/g, "").split("\n");
  const re = /(\d{1,}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,}):(\d{2}):(\d{2})[.,](\d{1,3})/;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const s = tcToMs(m[1], m[2], m[3], m[4]);
    const e = Math.max(s + 1, tcToMs(m[5], m[6], m[7], m[8]));
    const text: string[] = [];
    let j = i + 1;
    for (; j < lines.length && lines[j].trim() !== ""; j++) text.push(lines[j]);
    i = j - 1; // continue right after the consumed block
    const t = text.join("\n").replace(/<[^>]+>/g, "").trim();
    if (t) out.push({ s, e, t });
  }
  return out;
}

/** SRT → WebVTT (the parser above only understands VTT timings). */
export function srtToVtt(input: string): string {
  const body = input
    .replace(/\r+\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/<[^>]+>/g, "");
  return `WEBVTT\n\n${body}`;
}
