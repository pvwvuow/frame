/* v0.20.0 — IN-WEBVIEW Matroska scanner (the mobile half of the desktop
 * stream-proxy's EBML engine, electron/stream-proxy.cjs).
 *
 * WHY THIS EXISTS — the v0.19.x reports, root-caused:
 *  1. «پلیر اصلی کار نمی‌کنه»: on Android there is NO Electron proxy
 *     (NamaNativePlugin has no proxyUrl), so useSubs() always returned zero
 *     cues — the cinema-capable web player played the catalog with NO
 *     subtitles while the native player rendered them. For a Persian-movie
 *     app that IS «the main player doesn't work».
 *  2. AC3/DTS releases played as SILENT video in the web player (Chromium
 *     cannot decode them; the old design hid this by routing MKV to native
 *     preemptively, which the user rejected as «پلیر بی‌سینما»).
 *  3. Dead/geo-blocked MKV URLs burned the full 12s metadata watchdog
 *     before the ladder stepped.
 * The scanner fixes 1 (progressive cue extraction over ranged fetches) and
 * gives the player the bytes-level intelligence to fix 2 (audio codec) and
 * 3 (a dead head is a dead source — step the ladder immediately).
 *
 * TRANSPORT: the archive hosts send no CORS headers, so browser fetch() is
 * blocked inside the WebView. The reader transparently uses CapacitorHttp
 * (native OkHttp — no CORS, honors Range, follows redirects) when running
 * under Capacitor, and plain fetch elsewhere (dev browsers, Node tests).
 *
 * PURE LIBRARY — no React, no DOM. The byte-level core is a faithful port
 * of the desktop scanner (peekVint/three-state semantics, junk resync hunt,
 * per-track cue maps, marked-track vint normalisation) and is unit-tested
 * against REAL generated MKV files in scripts/test-mkv-web.mjs.
 */

export type ParsedCue = { s: number; e: number; t: string }; // milliseconds
/** raw in-store cue: the end is provisional (gap heuristic finalises it) */
type RawCue = { s: number; e: number | null; t: string };

/* ------------------------------------------------------------------ */
/* Uint8Array helpers (Buffer replacements)                            */
/* ------------------------------------------------------------------ */

function u8Concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u8IndexOf(buf: Uint8Array, needle: Uint8Array, from = 0): number {
  const n = needle.length;
  const last = buf.length - n;
  for (let i = Math.max(0, from); i <= last; i++) {
    let hit = true;
    for (let j = 0; j < n; j++) {
      if (buf[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

const asciiDec = new TextDecoder("ascii");
const utf8Dec = new TextDecoder("utf-8");

/* ------------------------------------------------------------------ */
/* EBML primitives (port of stream-proxy.cjs)                          */
/* ------------------------------------------------------------------ */

export type VintPeek = { st: "ok"; len: number; value: number } | { st: "partial" } | { st: "invalid" };

/** Peek an EBML vint WITHOUT consuming. "partial" = valid prefix, buffer
 *  ended mid-value → the caller must WAIT, never skip. "invalid" =
 *  structurally impossible → the stream is misaligned → caller may resync. */
export function peekVint(buf: Uint8Array, pos: number, keepMarker = false): VintPeek {
  const b0 = buf[pos];
  if (b0 === undefined) return { st: "partial" };
  if (b0 === 0) return { st: "invalid" };
  let len = 1;
  let mask = 0x80;
  while (!(b0 & mask)) {
    mask >>= 1;
    len += 1;
    if (len > 8) return { st: "invalid" };
  }
  if (pos + len > buf.length) return { st: "partial" };
  let val = keepMarker ? b0 : b0 & (mask - 1);
  for (let i = 1; i < len; i++) val = val * 256 + buf[pos + i];
  return { st: "ok", len, value: val };
}

export const ID = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  SEEKHEAD: 0x114d9b74,
  VOID: 0xec,
  INFO: 0x1549a966,
  TIMESTAMPSCALE: 0x2ad7b1,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  TRACK_LANGUAGE: 0x22b59c,
  TRACK_NAME: 0x536e,
  CLUSTER: 0x1f43b675,
  TIMECODE: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  CUES: 0x1c53bb6b,
} as const;

const KNOWN_IDS = new Set<number>(Object.values(ID));

const MAX_SKIP_VOID = 64 << 20;
const MAX_SKIP_ELEMENT = 4 << 20;
const MAX_SKIP_DEFER = 1 << 20;
const MAX_CUES_PER_TRACK = 20000;

/* --- codec support (Chromium/WebView media stack — no license codecs) --- */

const AUDIO_UNSUPPORTED = /^(A_AC3|A_EAC3|A_DTS(?!H)|A_DTS\/|A_TRUEHD|A_MLP|A_TTA|A_WAVPACK|A_REAL|A_QUICKTIME|A_MS\/ACM)/i;
const AUDIO_UNSUPPORTED_HD = /^A_DTS(HD|\/HD)?/i;

/** Can the WebView decode this Matroska audio CodecID? */
export function isAudioCodecSupported(codec: string): boolean {
  const c = String(codec || "").trim();
  if (!c) return true; // unknown → benefit of the doubt
  if (AUDIO_UNSUPPORTED_HD.test(c)) return false;
  return !AUDIO_UNSUPPORTED.test(c);
}

/** Can the WebView decode this Matroska video CodecID? HEVC is hardware-
 *  dependent (many devices CAN, old ones cannot) → treated "maybe" → the
 *  <video> error ladder owns the verdict. Only MPEG4/WMV-ish are hopeless. */
const VIDEO_UNSUPPORTED = /^(V_MS\/VFW|V_MPEG4\/MS|V_REAL|V_QUICKTIME|V_THEORA)/i;
export function isVideoCodecSupported(codec: string): boolean {
  const c = String(codec || "").trim();
  if (!c) return true;
  return !VIDEO_UNSUPPORTED.test(c);
}

export function audioCodecLabel(codec: string): string {
  const c = String(codec || "").toUpperCase();
  if (c.startsWith("A_EAC3")) return "E-AC3 (Dolby Digital Plus)";
  if (c.startsWith("A_AC3")) return "AC3 (Dolby Digital)";
  if (c.startsWith("A_DTS")) return "DTS";
  if (c.startsWith("A_TRUEHD") || c.startsWith("A_MLP")) return "TrueHD";
  return c.split("/")[0];
}

/** Track numbers appear in TWO encodings: TrackNumber stores a plain
 *  integer, block headers carry a marker-inclusive vint. Normalise. */
function markedTrackVint(n: number): number {
  if (n < 0x7f) return n | 0x80;
  if (n < 0x3fff) return n | 0x4000;
  if (n < 0x1fffff) return n | 0x200000;
  return n | 0x10000000;
}

/** Content sniff: EBML magic anywhere in the first 4KB (0 = not found). */
export function sniffEbml(buf: Uint8Array): number {
  if (!buf || buf.length < 4) return -1;
  const magic = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]);
  return u8IndexOf(buf, magic, 0);
}

/* ------------------------------------------------------------------ */
/* cue store (lite SubStore port)                                      */
/* ------------------------------------------------------------------ */

export type TextTrackInfo = { vint: number; codec: "utf8" | "webvtt" | "ass"; lang: string; name: string };

export class MkvCueStore {
  timestampScale = 1_000_000; // ns per tick (default 1ms)
  textTracks = new Map<number, TextTrackInfo>();
  trackCues = new Map<number, Map<string, RawCue>>();
  audioCodecs: string[] = [];
  videoCodec: string | null = null;
  kinds: string[] = [];
  probed = false;
  matroska = false;
  fileSize = 0;
  private served: number | null = null;

  registerTextTrack(vintNo: number, kind: "utf8" | "webvtt" | "ass", lang: string, name: string) {
    this.textTracks.set(vintNo, { vint: vintNo, codec: kind, lang: lang || "", name: name || "" });
    if (this.served == null || this.rank(this.textTracks.get(vintNo)) > this.rank(this.textTracks.get(this.served))) {
      this.served = vintNo;
    }
  }

  /** Persian-tagged tracks first, then UTF8 > WEBVTT > ASS. */
  rank(info: TextTrackInfo | undefined): number {
    if (!info) return -1;
    const persian =
      /^(fa|fas|per)([-_].*)?$/i.test(String(info.lang || "").trim()) ||
      /farsi|persian|فارسی|زیرنویس/i.test(String(info.name || ""));
    const codecRank = info.codec === "utf8" ? 4 : info.codec === "webvtt" ? 3 : 2;
    return (persian ? 10 : 0) + codecRank;
  }

  addCue(vintNo: number, startMs: number, text: string, endMs: number | null) {
    const s = Math.max(0, Math.round(startMs));
    const t = String(text || "").trim();
    if (!t) return;
    let map = this.trackCues.get(vintNo);
    if (!map) {
      map = new Map();
      this.trackCues.set(vintNo, map);
    }
    if (map.size > MAX_CUES_PER_TRACK) return;
    const e = endMs != null && endMs > s ? Math.round(endMs) : null;
    map.set(s + "|" + t, { s, e, t });
  }

  get servedTrack(): number | null {
    if (this.served != null) return this.served;
    // fall back to the first track that actually carries cues
    for (const [v, map] of this.trackCues) if (map.size) return v;
    return null;
  }

  /** The served track's cues, sorted, non-overlapping (SubOverlay contract:
   *  milliseconds; explicit end beats the heuristic gap). */
  cues(): ParsedCue[] {
    const v = this.servedTrack;
    if (v == null) return [];
    const map = this.trackCues.get(v);
    if (!map) return [];
    const list = [...map.values()].sort((a, b) => a.s - b.s);
    const out: ParsedCue[] = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c) continue;
      const next = list[i + 1];
      const end = c.e != null ? Math.min(c.e, c.s + 12000) : Math.min(next ? next.s - 1 : c.s + 6000, c.s + 6000);
      out.push({ s: c.s, e: Math.max(end, c.s + 500), t: c.t });
    }
    return out;
  }

  /** Coverage of the served track in whole seconds, or null when empty. */
  covSec(): [number, number] | null {
    const list = this.cues();
    if (!list.length) return null;
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return null;
    return [Math.floor(first.s / 1000), Math.ceil(last.e / 1000)];
  }

  /** Is the first audio track decodable by the WebView? null = unknown yet. */
  audioOk(): boolean | null {
    if (!this.audioCodecs.length) return null;
    return isAudioCodecSupported(this.audioCodecs[0]);
  }

  audioLabel(): string | null {
    return this.audioCodecs.length ? audioCodecLabel(this.audioCodecs[0]) : null;
  }

  /* ---- byte/time samples → position-aware backfill offsets ---- */
  private samples = new Map<number, number>(); // secBucket(2s) → byte offset

  sample(byteAbs: number, sec: number) {
    if (!(sec >= 0) || !(byteAbs >= 0)) return;
    const bucket = Math.round(sec / 2) * 2;
    if (this.samples.has(bucket)) return;
    if (this.samples.size >= 4096) {
      for (const k of this.samples.keys()) {
        if (Math.abs(k) % 4 === 0) continue;
        this.samples.delete(k);
        if (this.samples.size <= 2048) break;
      }
    }
    this.samples.set(bucket, byteAbs);
  }

  /** Estimated file byte offset for playback position `sec`. */
  offsetFor(sec: number, durSec: number): number | null {
    if (this.samples.size >= 2) {
      const keys = [...this.samples.keys()].sort((a, b) => a - b);
      const firstKey = keys[0];
      let prevB = firstKey != null ? this.samples.get(firstKey) : undefined;
      let prevK = firstKey ?? 0;
      if (prevB == null) return this.fallbackOffset(sec, durSec);
      for (let i = 1; i < keys.length; i++) {
        const k = keys[i];
        const b = k != null ? this.samples.get(k) : undefined;
        if (b == null) continue;
        if (k >= sec) {
          if (k === prevK) return b;
          const t = (sec - prevK) / (k - prevK);
          return Math.max(0, Math.floor(prevB + (b - prevB) * t));
        }
        prevK = k;
        prevB = b;
      }
      const kPrev2 = keys.length >= 2 ? keys[keys.length - 2] : keys[0];
      const bPrev2 = kPrev2 != null ? this.samples.get(kPrev2) : undefined;
      if (bPrev2 != null) {
        const spanK = Math.max(1, prevK - kPrev2);
        const slope = (prevB - bPrev2) / spanK; // bytes per second
        const est = Math.floor(prevB + slope * (sec - prevK));
        if (this.fileSize > 0) return Math.min(Math.max(0, est), Math.max(0, this.fileSize - 1));
        if (est >= 0) return est;
      }
    }
    return this.fallbackOffset(sec, durSec);
  }

  private fallbackOffset(sec: number, durSec: number): number | null {
    if (this.fileSize > 0 && durSec > 0 && sec > 0) {
      const frac = Math.min(0.98, sec / durSec);
      return Math.max(0, Math.floor(this.fileSize * frac) - (1 << 20));
    }
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* the scanner (faithful port of MkvScanner)                           */
/* ------------------------------------------------------------------ */

/* SRT-in-Matroska frames carry only a start time; the old proxy estimated
 * the end from the following cue. The store's cue() export applies the same
 * gap heuristic, so the frame parsers below produce start+text only. */
function srtFrameToText(raw: Uint8Array): string {
  const txt = utf8Dec.decode(raw);
  return txt.replace(/^[\s\uFEFF]+/, "").trim();
}

function assTimeToMs(t: string): number | null {
  const m = /(\d{1}):(\d{2}):(\d{2})[.,](\d{1,2})/.exec(String(t || ""));
  if (!m) return null;
  const cs = m[4].padEnd(2, "0");
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(cs) * 10;
}

/** ASS Dialogue line → { start, end, text } with inline-tag stripping. */
function assFrameToCue(raw: Uint8Array): { start: number; end: number | null; text: string } | null {
  const txt = utf8Dec.decode(raw);
  const line = txt.split("\n").find((l) => /^Dialogue:/i.test(l));
  if (!line) return null;
  const parts = line.slice(9).split(",");
  if (parts.length < 10) return null;
  const start = assTimeToMs(parts[1]);
  const end = assTimeToMs(parts[2]);
  if (start == null) return null;
  // Format=…,Text → everything after the 9th comma (re-join commas in text)
  const text = parts
    .slice(9)
    .join(",")
    .replace(/\{[^}]*\}/g, "") // override tags
    .replace(/\\N|\\n/g, "\n")
    .trim();
  if (!text) return null;
  return { start, end, text };
}

/** WEBVTT-in-Matroska frames: "NAME\nHH:MM:SS.mmm --> …\nPayload". */
function webvttFrameToText(raw: Uint8Array): string {
  const txt = utf8Dec.decode(raw);
  const lines = txt.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/-->/.test(lines[i])) {
      const out: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "") break;
        out.push(lines[j]);
      }
      const text = out.join("\n").replace(/<[^>]+>/g, "").trim();
      return text;
    }
  }
  return "";
}

export class MkvScanner {
  private buf: Uint8Array = new Uint8Array(0);
  private abs = 0;
  private pos = 0;
  private stack: { end: number }[] = [];
  private skipBytes = 0;
  private clusterTc = 0;
  private scaleMs = 1;
  private junk = 0;
  /** v0.20.0 SESSION FIX — a scanner opened MID-FILE (byteBase > 0) sees a
   *  window that starts inside a cluster/block; walking elements from there
   *  can parse a plausible fake claim and blind-skip the whole window (the
   *  «8 cues instead of 12» bug). Such a scanner MUST align to the first
   *  real cluster header before its first element walk, and keep hunting
   *  across feeds until it finds one. */
  private aligned: boolean;
  constructor(
    private store: MkvCueStore,
    private byteBase = 0
  ) {
    this.scaleMs = (store.timestampScale || 1_000_000) / 1e6;
    this.aligned = byteBase === 0;
  }

  feed(chunk: Uint8Array) {
    if (!chunk || !chunk.length) return;
    this.buf = this.buf.length ? u8Concat([this.buf, chunk]) : chunk;
    if (this.pos > 1 << 20) {
      this.buf = this.buf.subarray(this.pos);
      this.abs += this.pos;
      this.pos = 0;
    }
    if (!this.aligned && !this.hunt()) return; // need more bytes for the hunt
    try {
      this.run();
    } catch {
      if (this.pos < this.buf.length) this.pos += 1;
      try {
        this.run();
      } catch {
        this.pos = this.buf.length;
      }
    }
  }

  /** Cluster-magic hunt for unaligned (mid-file) scanners. Returns true once
   *  aligned; false keeps the tail (magic may straddle a chunk boundary). */
  private hunt(): boolean {
    const magic = Uint8Array.from([0x1f, 0x43, 0xb6, 0x75]);
    const idx = u8IndexOf(this.buf, magic, this.pos);
    if (idx >= 0) {
      this.pos = idx;
      this.stack.length = 0;
      this.skipBytes = 0;
      this.aligned = true;
      return true;
    }
    // keep only the last 3 bytes — a magic straddling the boundary survives
    const keep = Math.min(3, this.buf.length - this.pos);
    const dropped = this.buf.length - keep;
    this.buf = this.buf.subarray(dropped);
    this.abs += dropped;
    this.pos = 0;
    return false;
  }

  get fileOffset(): number {
    return this.byteBase + this.abs + this.pos;
  }

  private run() {
    for (;;) {
      if (this.skipBytes > 0) {
        const avail = this.buf.length - this.pos;
        if (avail <= 0) return;
        const n = Math.min(avail, this.skipBytes);
        this.pos += n;
        this.skipBytes -= n;
        continue;
      }
      while (
        this.stack.length &&
        this.stack[this.stack.length - 1].end >= 0 &&
        this.abs + this.pos >= this.stack[this.stack.length - 1].end
      ) {
        this.stack.pop();
      }
      const step = this.step();
      if (step !== "ok") return;
    }
  }

  private step(): "ok" | "more" {
    const buf = this.buf;
    const idV = peekVint(buf, this.pos, true);
    if (idV.st === "partial") return "more";
    if (idV.st === "invalid") return this.resync();
    const sizeV = peekVint(buf, this.pos + idV.len);
    if (sizeV.st === "partial") return "more";
    if (sizeV.st === "invalid") return this.resync();
    const el = {
      id: idV.value,
      dataStart: this.pos + idV.len + sizeV.len,
      size: sizeV.value,
      unknown: sizeV.value === (1 << (7 * sizeV.len)) - 1,
    };
    const elEndAbs = el.unknown ? -1 : this.abs + el.dataStart + el.size;
    const top = this.stack[this.stack.length - 1];
    if (top && top.end >= 0 && elEndAbs >= 0 && elEndAbs > top.end) return this.resync();

    if (KNOWN_IDS.has(el.id)) this.junk = 0;

    switch (el.id) {
      case ID.EBML:
      case ID.SEEKHEAD:
      case ID.CUES:
        return this.skipElement(el);
      case ID.VOID:
        return this.skipElement(el, true);
      case ID.INFO: {
        if (el.unknown || el.size > 1 << 16) return this.skipElement(el);
        if (el.dataStart + el.size > buf.length) return "more";
        this.parseInfo(buf.subarray(el.dataStart, el.dataStart + el.size));
        this.pos = el.dataStart + el.size;
        return "ok";
      }
      case ID.SEGMENT:
        this.stack.push({ end: elEndAbs });
        this.pos = el.dataStart;
        return "ok";
      case ID.TRACKS: {
        if (el.unknown || el.size > 4 << 20) return this.skipElement(el);
        if (el.dataStart + el.size > buf.length) return "more";
        this.parseTracks(buf.subarray(el.dataStart, el.dataStart + el.size));
        this.pos = el.dataStart + el.size;
        return "ok";
      }
      case ID.CLUSTER:
        this.clusterTc = 0;
        this.stack.push({ end: elEndAbs });
        this.pos = el.dataStart;
        return "ok";
      case ID.TIMECODE: {
        if (el.dataStart + el.size > buf.length) return "more";
        if (el.size >= 1 && el.size <= 8) {
          let tc = 0;
          for (let i = 0; i < el.size; i++) tc = tc * 256 + buf[el.dataStart + i];
          this.clusterTc = tc;
          this.store.sample(this.fileOffset, (tc * this.scaleMs) / 1000);
        }
        this.pos = el.dataStart + el.size;
        return "ok";
      }
      case ID.SIMPLE_BLOCK:
      case ID.BLOCK: {
        if (el.unknown || el.size > 32 << 20) return this.skipElement(el);
        if (el.dataStart + el.size > buf.length) return "more";
        this.parseBlock(buf, el.dataStart, el.size);
        this.pos = el.dataStart + el.size;
        return "ok";
      }
      case ID.BLOCK_GROUP:
        this.stack.push({ end: elEndAbs });
        this.pos = el.dataStart;
        return "ok";
      default: {
        this.junk += 1;
        if (this.junk >= 24) {
          this.junk = 0;
          return this.resync();
        }
        return this.skipElement(el);
      }
    }
  }

  private parseInfo(buf: Uint8Array) {
    let p = 0;
    while (p < buf.length - 1) {
      const idV = peekVint(buf, p, true);
      if (idV.st !== "ok") return;
      const sizeV = peekVint(buf, p + idV.len);
      if (sizeV.st !== "ok") return;
      const ds = p + idV.len + sizeV.len;
      if (idV.value === ID.TIMESTAMPSCALE && sizeV.value >= 1 && sizeV.value <= 8) {
        if (ds + sizeV.value > buf.length) return;
        let scale = 0;
        for (let i = 0; i < sizeV.value; i++) scale = scale * 256 + buf[ds + i];
        if (scale >= 1 && scale <= 1e9) {
          this.store.timestampScale = scale;
          this.scaleMs = scale / 1e6;
        }
      }
      p = ds + sizeV.value;
    }
  }

  private skipElement(el: { unknown: boolean; size: number; dataStart: number }, isVoid = false): "ok" | "more" {
    if (el.unknown) return this.resync();
    const cap = isVoid ? MAX_SKIP_VOID : MAX_SKIP_ELEMENT;
    if (el.size > cap) return this.resync();
    const avail = this.buf.length - el.dataStart;
    if (avail >= el.size) {
      this.pos = el.dataStart + el.size;
      return "ok";
    }
    // v0.20.0 SESSION HARDENING — the desktop proxy defers skips up to 1MB
    // and self-heals on the NEXT live-pipe chunk; a ranged session has no
    // infinite stream, so a MISALIGNED fake element (mid-cluster window
    // bytes that parse as a plausible big claim) could blind-consume the
    // remaining window and swallow every cue in it. Defer only SMALL
    // claims; anything bigger hunts the next real cluster header instead.
    if (el.size - avail <= MAX_SKIP_DEFER) {
      this.skipBytes = el.size - avail;
      this.pos = this.buf.length;
      return "ok";
    }
    return this.resync();
  }

  private resync(): "ok" | "more" {
    const magic = Uint8Array.from([0x1f, 0x43, 0xb6, 0x75]);
    const idx = u8IndexOf(this.buf, magic, this.pos + 1);
    if (idx >= 0) {
      this.pos = idx;
      this.stack.length = 0;
      this.skipBytes = 0;
      this.aligned = true;
      return "ok";
    }
    // misaligned with no cluster ahead in the buffer: hand control back to
    // the straddle-safe hunt (alive across feeds, unlike a one-shot resync)
    this.aligned = false;
    if (this.pos > 0) {
      this.buf = this.buf.subarray(this.pos);
      this.abs += this.pos;
      this.pos = 0;
    }
    return "more";
  }

  private parseTracks(buf: Uint8Array) {
    let p = 0;
    let trackNum: number | null = null;
    let trackType: number | null = null;
    let codec = "";
    let subLang = "";
    let subName = "";
    const flush = () => {
      if (trackNum != null && codec) {
        if (trackType === 0x11) {
          if (!this.store.kinds.includes(codec)) this.store.kinds.push(codec);
          const kind = /^S_TEXT\/(UTF8|ASCII)/i.test(codec)
            ? "utf8"
            : /^S_TEXT\/WEBVTT/i.test(codec)
              ? "webvtt"
              : /^S_TEXT\/(ASS|SSA)/i.test(codec)
                ? "ass"
                : null;
          if (kind) this.store.registerTextTrack(markedTrackVint(trackNum), kind, subLang, subName);
        } else if (trackType === 2) {
          if (!this.store.audioCodecs.includes(codec)) this.store.audioCodecs.push(codec);
        } else if (trackType === 1) {
          this.store.videoCodec = codec;
        }
      }
      trackNum = trackType = null;
      codec = "";
      subLang = "";
      subName = "";
    };
    while (p < buf.length - 1) {
      const idV = peekVint(buf, p, true);
      if (idV.st !== "ok") return;
      const sizeV = peekVint(buf, p + idV.len);
      if (sizeV.st !== "ok") return;
      const ds = p + idV.len + sizeV.len;
      if (idV.value === ID.TRACK_ENTRY) {
        flush();
        let q = ds;
        const qEnd = Math.min(ds + sizeV.value, buf.length);
        while (q < qEnd - 1) {
          const id2 = peekVint(buf, q, true);
          if (id2.st !== "ok") break;
          const sz2 = peekVint(buf, q + id2.len);
          if (sz2.st !== "ok") break;
          const d2 = q + id2.len + sz2.len;
          if (d2 + sz2.value > buf.length) break;
          if (id2.value === ID.TRACK_NUMBER) {
            let n = 0;
            for (let i = 0; i < sz2.value && i < 8; i++) n = n * 256 + buf[d2 + i];
            if (sz2.value === 1 && buf[d2] >= 0x80) n = buf[d2] & 0x7f;
            trackNum = n;
          } else if (id2.value === ID.TRACK_TYPE) trackType = buf[d2];
          else if (id2.value === ID.CODEC_ID) codec = asciiDec.decode(buf.subarray(d2, d2 + sz2.value));
          else if (id2.value === ID.TRACK_LANGUAGE) subLang = utf8Dec.decode(buf.subarray(d2, d2 + sz2.value));
          else if (id2.value === ID.TRACK_NAME) subName = utf8Dec.decode(buf.subarray(d2, d2 + sz2.value));
          q = d2 + sz2.value;
        }
      }
      p = ds + sizeV.value;
    }
    flush();
    if (this.store.textTracks.size || this.store.audioCodecs.length || this.store.videoCodec) {
      this.store.probed = true;
    }
  }

  /** SimpleBlock / Block header → subtitle frame when it belongs to a KNOWN
   *  text subtitle track. Layout: [track vint][timecode int16][flags u8]. */
  private parseBlock(buf: Uint8Array, start: number, size: number) {
    const tv = peekVint(buf, start, true);
    if (tv.st !== "ok" || tv.len > 8) return;
    if (tv.len + 3 > size) return;
    const track = tv.value;
    const info = this.store.textTracks.get(track);
    if (!info) return;
    const tcRel = (buf[start + tv.len] << 8) | buf[start + tv.len + 1];
    const flags = buf[start + tv.len + 2];
    const lacing = (flags >> 1) & 0x03;
    if (lacing !== 0) return;
    const frameStart = start + tv.len + 3;
    const frame = buf.subarray(frameStart, start + size);
    const base = Math.round((this.clusterTc + tcRel) * this.scaleMs);
    if (info.codec === "ass") {
      const cue = assFrameToCue(frame);
      if (!cue) return;
      this.store.addCue(track, cue.start != null ? cue.start : base, cue.text, cue.start != null ? cue.end : null);
    } else if (info.codec === "webvtt") {
      const text = webvttFrameToText(frame);
      if (text) this.store.addCue(track, base, text, null);
    } else {
      const text = srtFrameToText(frame);
      if (text) this.store.addCue(track, base, text, null);
    }
  }
}

/* ------------------------------------------------------------------ */
/* ranged reader — CapacitorHttp (no CORS) | fetch                     */
/* ------------------------------------------------------------------ */

export type RangeResponse = { ok: boolean; status: number; data: Uint8Array; total: number };

type CapHttpLike = {
  get(opts: { url: string; headers?: Record<string, string>; responseType?: string; readTimeout?: number }): Promise<{
    status: number;
    headers?: Record<string, string>;
    data?: unknown;
  }>;
};

function capacitorHttp(): CapHttpLike | null {
  const g = globalThis as unknown as { Capacitor?: { Plugins?: { CapacitorHttp?: CapHttpLike }; isNativePlatform?: () => boolean } };
  const cap = g.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.CapacitorHttp ?? null;
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function headerTotal(headers: Record<string, string> | undefined): number {
  if (!headers) return 0;
  const cr = headers["content-range"] ?? headers["Content-Range"] ?? "";
  const m = /\/(\d+)\s*$/.exec(cr);
  if (m) return Number(m[1]);
  const cl = headers["content-length"] ?? headers["Content-Length"];
  return cl ? Number(cl) : 0;
}

/** One ranged GET. Native (CapacitorHttp) when available — the archive
 *  hosts send no CORS headers, browser fetch() would be dead inside the
 *  WebView. Plain fetch elsewhere. */
export async function fetchRange(url: string, start: number, endInclusive: number): Promise<RangeResponse> {
  const range = `bytes=${start}-${endInclusive}`;
  const cap = capacitorHttp();
  if (cap) {
    try {
      const res = await cap.get({ url, headers: { Range: range }, responseType: "arraybuffer", readTimeout: 15000 });
      const d = res.data;
      let data: Uint8Array;
      if (d instanceof Uint8Array) data = d;
      else if (d instanceof ArrayBuffer) data = new Uint8Array(d);
      else if (typeof d === "string") data = b64ToU8(d);
      else data = new Uint8Array(0);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, data, total: headerTotal(res.headers) };
    } catch {
      return { ok: false, status: 0, data: new Uint8Array(0), total: 0 };
    }
  }
  try {
    const res = await fetch(url, { headers: { Range: range } });
    const buf = new Uint8Array(await res.arrayBuffer());
    return { ok: res.ok, status: res.status, data: buf, total: headerTotal(Object.fromEntries([...res.headers.entries()])) };
  } catch {
    return { ok: false, status: 0, data: new Uint8Array(0), total: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* header probe (cached, promise-deduped)                              */
/* ------------------------------------------------------------------ */

export type MkvProbe = {
  attempted: boolean; // a probe ran (vs. served from cache mid-flight)
  reachable: boolean; // HTTP-level success (status 2xx)
  status: number;
  matroska: boolean;
  probed: boolean; // Tracks element captured
  audioOk: boolean | null;
  audioLabel: string | null;
  videoCodec: string | null;
  subFound: boolean;
  kinds: string[];
  fileSize: number;
};

const HEAD_BYTES = 384 << 10; // EBML+SeekHead+Info+Tracks live here virtually always
const probeCache = new Map<string, Promise<MkvProbe>>();

/** Fetch the file head, sniff the container and read track intelligence.
 *  Cached per URL (a source is probed at most once per app session). */
export function probeMkvHead(url: string, force = false): Promise<MkvProbe> {
  if (!force && probeCache.has(url)) return probeCache.get(url)!;
  const p = (async (): Promise<MkvProbe> => {
    const base: MkvProbe = {
      attempted: true,
      reachable: false,
      status: 0,
      matroska: false,
      probed: false,
      audioOk: null,
      audioLabel: null,
      videoCodec: null,
      subFound: false,
      kinds: [],
      fileSize: 0,
    };
    const r = await fetchRange(url, 0, HEAD_BYTES - 1);
    if (!r.ok) return { ...base, status: r.status };
    const store = new MkvCueStore();
    store.matroska = sniffEbml(r.data) >= 0;
    const scanner = new MkvScanner(store, 0);
    scanner.feed(r.data);
    return {
      ...base,
      reachable: true,
      status: r.status,
      matroska: store.matroska,
      probed: store.probed,
      audioOk: store.audioOk(),
      audioLabel: store.audioLabel(),
      videoCodec: store.videoCodec,
      subFound: store.textTracks.size > 0,
      kinds: [...store.kinds],
      fileSize: r.total,
    };
  })();
  if (!force) probeCache.set(url, p);
  return p;
}

/* ------------------------------------------------------------------ */
/* progressive position-aware scan session                             */
/* ------------------------------------------------------------------ */

const SCAN_CHUNK = 768 << 10; // 768KB per ranged request
const SCAN_AHEAD_SEC = 45; // keep cues ≥45s ahead of the playhead
const SCAN_MAX_BYTES = 96 << 20; // absolute session budget (safety valve)

export type ScanState = "idle" | "probing" | "scanning" | "parked" | "done" | "dead" | "stopped";

/** Drives progressive ranged scans over a (possibly mid-file) Matroska
 *  stream and emits cues as they are extracted. ONE instance per source. */
export class MkvWebScan {
  private store = new MkvCueStore();
  private state: ScanState = "idle";
  private stopped = false;
  private bytes = 0;
  private lastCueCount = 0;
  private pos = 0; // playback position (seconds)
  private dur = 0; // duration (seconds) — feeds the proportional offset
  private playing = false;
  private loopPromise: Promise<void> | null = null;
  private cursor: number | null = null; // next file byte to scan
  private scannedHead = false;
  private dead = false;
  /** ONE scanner for the whole post-head pass — cluster-alignment and
   *  hunt state must survive chunk boundaries (a fresh scanner per chunk
   *  re-ran the misaligned-walk poison on every boundary). */
  private scanScanner: MkvScanner | null = null;

  constructor(
    readonly url: string,
    private onCues: (cues: ParsedCue[]) => void,
    private onState: (state: ScanState) => void = () => {},
    private getDur: () => number = () => 0
  ) {}

  private setState(s: ScanState) {
    this.state = s;
    this.onState(s);
  }

  get isDead() {
    return this.dead;
  }
  get state_() {
    return this.state;
  }
  get cueCount() {
    return this.lastCueCount;
  }

  /** Playback position + pause state feed the ahead-margin logic. */
  progress(sec: number, isPlaying: boolean) {
    this.pos = sec;
    this.playing = isPlaying;
    if ((this.state === "parked" || this.state === "done") && !this.stopped && !this.dead) {
      const cov = this.store.covSec();
      const covered = cov ? cov[1] : -1;
      if (!cov || (isPlaying && covered < sec + SCAN_AHEAD_SEC)) void this.pump();
    }
  }

  /** Initial position-aware start (resume mid-file). */
  start(startSec: number): void {
    if (this.stopped) return;
    this.pos = startSec;
    this.dur = this.getDur();
    void this.pump(true);
  }

  stop() {
    this.stopped = true;
    this.setState("stopped");
  }

  /** The full scan loop. Co-operative: chunked ranged fetches with a
   *  ahead-margin park, position-aware jump after the head pass. */
  private async pump(first = false): Promise<void> {
    if (this.loopPromise) return this.loopPromise;
    this.loopPromise = (async () => {
      try {
        if (!this.scannedHead) {
          this.setState("probing");
          const head = await fetchRange(this.url, 0, HEAD_BYTES - 1);
          if (this.stopped) return;
          if (!head.ok) {
            // 404 / 403 / 503 geo-block → this source is dead for the WEB
            // player regardless of codec (the <video> will hit the same wall)
            this.dead = true;
            this.setState("dead");
            return;
          }
          this.bytes += head.data.length;
          if (head.total) this.store.fileSize = head.total;
          this.store.matroska = sniffEbml(head.data) >= 0;
          if (!this.store.matroska) {
            this.dead = true; // not Matroska → nothing to extract; not an error
            this.setState("done");
            return;
          }
          new MkvScanner(this.store, 0).feed(head.data);
          this.scannedHead = true;
          this.emit();
          if (!this.store.probed) {
            // head captured but no Tracks yet (huge headers are rare) — keep
            // scanning linearly; parseTracks will fire on the way
          }
          this.cursor = head.data.length;
          if (!this.store.textTracks.size) {
            // no text subtitle track at all → nothing to scan for, ever
            this.setState("done");
            return;
          }
        }
        if (first && this.pos > 30) {
          const est = this.store.offsetFor(Math.max(0, this.pos - 10), this.getDur() || 0);
          this.cursor = est != null ? Math.max(HEAD_BYTES, est) : this.cursor;
        }
        this.setState("scanning");
        if (!this.scanScanner && this.cursor != null) {
          this.scanScanner = new MkvScanner(this.store, this.cursor); // hunt-first alignment
        }
        while (!this.stopped && !this.dead && this.bytes < SCAN_MAX_BYTES) {
          if (this.cursor == null) break;
          const r = await fetchRange(this.url, this.cursor, this.cursor + SCAN_CHUNK - 1);
          if (this.stopped) return;
          if (!r.ok) {
            // a mid-file 416 means EOF; any other error parks the scan
            if (r.status === 416) {
              this.setState("done");
              return;
            }
            this.setState("parked");
            return;
          }
          if (r.total) this.store.fileSize = r.total;
          this.bytes += r.data.length;
          this.scanScanner?.feed(r.data);
          this.cursor += r.data.length;
          this.emit();
          const cov = this.store.covSec();
          const covered = cov ? cov[1] : -1;
          if (covered >= this.pos + SCAN_AHEAD_SEC) {
            this.setState("parked");
            return; // enough cue runway; progress() resumes us when needed
          }
          if (r.data.length < SCAN_CHUNK && this.cursor >= (this.store.fileSize || Infinity)) {
            this.setState("done");
            return;
          }
        }
        if (!this.stopped && this.state !== "done" && this.state !== "dead") this.setState("parked");
      } finally {
        this.loopPromise = null;
      }
    })();
    return this.loopPromise;
  }

  private emit() {
    const cues = this.store.cues();
    if (cues.length !== this.lastCueCount) {
      this.lastCueCount = cues.length;
      this.onCues(cues);
    }
  }

  getStore(): MkvCueStore {
    return this.store;
  }
}
