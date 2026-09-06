"use client";

/* نما – shared media & subtitle-track helpers (v0.10.12)
 *
 * WHY THIS EXISTS
 * 1) Chromium keeps a DETACHED <video>/<audio> element playing until GC
 *    collects it. React unmount (modal close, theater close, quality re-key)
 *    removes the element from the DOM without pausing it → the film keeps
 *    playing «در پس‌زمینه» — the classic bug report. Every place that lets a
 *    media element go must stopMediaEl() it first.
 * 2) The player needs stable subtitles. Swapping a <track> element on every
 *    poll flickers and loses the track when the video re-keys. Instead we
 *    keep ONE programmatic TextTrack per video element and feed it cues
 *    incrementally (VTTCue API) — zero flicker, survives re-keys.
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

/** Add every cue of `vtt` that the keys-set does not hold yet. Returns how
 *  many cues were added. The keys set belongs to ONE track on ONE element —
 *  reset it whenever the track is recreated. */
export function applyVttToTrack(tt: TextTrack, vtt: string, keys: Set<string>): number {
  const cues = parseVtt(vtt);
  let added = 0;
  for (const c of cues) {
    const key = `${c.s}|${c.t}`;
    if (keys.has(key)) continue;
    keys.add(key);
    try {
      tt.addCue(new VTTCue(c.s / 1000, c.e / 1000, c.t));
      added += 1;
    } catch {
      keys.delete(key);
    }
  }
  return added;
}

/** Programmatic TextTracks cannot be removed — empty them instead (used when
 *  a user-loaded subtitle file replaces the extracted MKV cues). */
export function clearTrackCues(tt: TextTrack | null) {
  if (!tt || !tt.cues) return;
  // snapshot: removeCue mutates the live list while we iterate it
  const list: TextTrackCue[] = [];
  for (let i = 0; i < tt.cues.length; i++) {
    const c = tt.cues[i];
    if (c) list.push(c);
  }
  for (const c of list) {
    try {
      tt.removeCue(c);
    } catch {
      /* already gone */
    }
  }
}

/** SRT → WebVTT (the TextTrack cue parser only understands VTT timings). */
export function srtToVtt(input: string): string {
  const body = input
    .replace(/\r+\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/<[^>]+>/g, "");
  return `WEBVTT\n\n${body}`;
}
