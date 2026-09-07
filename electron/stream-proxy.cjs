/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * نما – local stream proxy with MKV subtitle extraction (v0.10.18 – Subs v3)
 *
 * WHY: the archive's releases are Matroska encodes with the Persian SRT/ASS
 * muxed INSIDE (S_TEXT/*). Chromium never renders embedded MKV subtitle
 * tracks, so the Electron main process runs a tiny localhost proxy:
 *
 *   GET /stream?u=<encoded remote url>   byte-transparent pipe (Range is
 *                                        forwarded 1:1) that also feeds a
 *                                        streaming EBML scanner
 *   GET /subs?u=<url>&pos=<s>&dur=<s>    JSON { found, cues, complete, vtt,
 *                                        cov, matroska, … } – the VTT built
 *                                        from the subtitle packets collected
 *                                        so far
 *   GET /probe?u=<url>                   one-shot header intelligence
 *   GET /ping                            liveness + stats
 *
 * v0.10.18 – COMPLETE REWRITE of the extraction pipeline. The passive
 * scanner of v0.10.5–0.10.17 had four structural failure modes that kept
 * producing the «زیرنویس پخش نمی‌شود» reports no matter how many patches
 * landed on top:
 *
 *   1. CHUNK-BOUNDARY DATA LOSS – a Matroska element ID straddling the end
 *      of the receive buffer made the vint reader return null, which the
 *      old step() treated as garbage and RESYNCED, silently dropping every
 *      byte up to the next cluster header (subtitle blocks included). The
 *      rewritten reader distinguishes "need more bytes" (partial vint at
 *      the buffer tail) from "true garbage" (invalid vint) and only resyncs
 *      for the latter. A zero-loss parser: feeding a file one byte at a
 *      time now extracts every cue.
 *   2. FRAGILE LIFETIME – one caught exception used to set scanner.dead and
 *      kill extraction for the rest of the pass. The new parser cannot
 *      throw past a single byte step.
 *   3. EXTENSION GATING – extraction only ran for *.mkv/*.webm URLs or
 *      Matroska content-types; token/redirect URLs without an extension
 *      played with no subtitles at all. Detection is now CONTENT-BASED: the
 *      EBML magic (1A 45 DF A3) is sniffed at stream start and remembered
 *      per-URL, and the renderer routes extension-less URLs through the
 *      proxy for exactly this reason.
 *   4. ONE SHOT TRACK CHOICE – the extractor followed a single track picked
 *      from header metadata alone; releases with eng+fas tracks and no
 *      language tags regularly followed the ENGLISH one. The scanner now
 *      extracts EVERY text track into per-track cue maps and /subs picks
 *      the track whose text actually contains Persian script.
 *
 * New in v0.10.18: POSITION-AWARE BACKFILL. Cues only existed for byte
 * ranges that happened to flow through the scanner, so resumes and odd
 * Chromium fetch orders left permanent gaps. /subs now carries the playback
 * position; when the collected coverage does not reach pos+45s, the proxy
 * actively fetches a bounded byte window at the estimated file offset
 * (learned byte/time samples first, content-length proportion second) and
 * extracts from it. Budget-capped per URL, abort-aware, never while a full
 * pass is complete.
 *
 * Kept from v0.10.6/0.10.17: header intelligence (/probe, audioOk for the
 * DTS/AC3 silent-audio guard), TimestampScale handling, live track-number
 * healing, the self-healing head scan for Tracks discovery, and the
 * background-download leak fix (upstream destroyed the moment the player
 * disconnects).
 */
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT = 30000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/* vint readers                                                       */
/* ------------------------------------------------------------------ */

/** Peek an EBML vint WITHOUT consuming. Distinguishes the three cases the
 *  old code conflated (the root cause of the v0.10.18 rewrite):
 *  - "ok"      → { len, value }
 *  - "partial" → the bytes that exist are a valid vint PREFIX but the
 *                buffer ended mid-value → the caller must WAIT, never skip
 *  - "invalid" → structurally impossible (0x00 first byte, > 8 bytes) →
 *                the stream is misaligned → the caller may resync */
function peekVint(buf, pos, keepMarker = false) {
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

const ID = {
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
};
const KNOWN_IDS = new Set(Object.values(ID));

/* --- codec support table (Chromium's bundled ffmpeg, no license codecs) ---
 * Electron = Chromium media stack: AAC/MP3/Opus/Vorbis/FLAC/PCM decode fine,
 * but AC-3 / E-AC-3 / DTS / TrueHD / MLP are NOT licensed in → a Matroska
 * file carrying them as the FIRST audio track plays with picture but NO
 * sound. Chromium's demuxer always picks the first audio track of the file,
 * so `audioOk` is decided from audioCodecs[0]. */
const AUDIO_UNSUPPORTED = /^(A_AC3|A_EAC3|A_DTS(?!H)|A_DTS\/|A_TRUEHD|A_MLP|A_TTA|A_WAVPACK|A_REAL|A_QUICKTIME|A_MS\/ACM)/i;
const AUDIO_UNSUPPORTED_HD = /^A_DTS(HD|\/HD)?/i;

/** Does Chromium's bundled ffmpeg decode this Matroska CodecID? */
function isAudioCodecSupported(codec) {
  const c = String(codec || "").trim();
  if (!c) return true; // unknown → give the file the benefit of the doubt
  if (AUDIO_UNSUPPORTED_HD.test(c)) return false;
  return !AUDIO_UNSUPPORTED.test(c);
}

/** Human-readable name for the toast (Persian UI shows the latin tag). */
function audioCodecLabel(codec) {
  const c = String(codec || "").toUpperCase();
  if (c.startsWith("A_EAC3")) return "E-AC3 (Dolby Digital Plus)";
  if (c.startsWith("A_AC3")) return "AC3 (Dolby Digital)";
  if (c.startsWith("A_DTS")) return "DTS";
  if (c.startsWith("A_TRUEHD") || c.startsWith("A_MLP")) return "TrueHD";
  return c.split("/")[0];
}

function idWidth(v) {
  return v >= 0x10000000 ? 4 : v >= 0x100000 ? 3 : v >= 0x1000 ? 2 : 1;
}

/** Track numbers appear in TWO encodings: the TrackNumber element stores a
 *  plain big-endian integer (0x02), while SimpleBlock headers carry it as a
 *  marker-inclusive vint (0x82). Normalise both to the marked value. */
function markedTrackVint(n) {
  if (n < 0x7f) return n | 0x80;
  if (n < 0x3fff) return n | 0x4000;
  if (n < 0x1fffff) return n | 0x200000;
  return n | 0x10000000;
}

/** Content sniff: EBML magic anywhere in the first 4KB (0 = not found). */
function sniffEbml(buf) {
  if (!buf || buf.length < 4) return -1;
  const magic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const n = Math.min(buf.length, 4096);
  const idx = buf.subarray(0, n).indexOf(magic);
  return idx;
}

/* ------------------------------------------------------------------ */
/* per-URL cue store                                                  */
/* ------------------------------------------------------------------ */

const MAX_CUES_PER_TRACK = 20000;
/** v0.10.18 skip sanity: a REAL element we skip never exceeds a few MB
 *  (VOID padding ≤ 64MB, Cues/SeekHead/Attachments ≤ 4MB) and a deferred
 *  skip never trusts more than 1MB of unverified bytes — mid-junk bytes
 *  routinely parse as a valid vint claiming megabytes, and blindly deferring
 *  swallowed the ENTIRE remaining stream (every cue after it lost). */
const MAX_SKIP_VOID = 64 << 20;
const MAX_SKIP_ELEMENT = 4 << 20;
const MAX_SKIP_DEFER = 1 << 20;
const BACKFILL_BUDGET = 48 << 20; // total active-scan bytes per URL
const BACKFILL_WINDOW = 5 << 20; // bytes per active scan
const BACKFILL_MIN_GAP_MS = 4000;

class SubStore {
  constructor(url) {
    this.url = url;
    this.key = crypto.createHash("sha1").update(url).digest("hex");
    /** v0.10.18 – cues per text track (marker-inclusive track vint →
     *  Map<startMs|text, {s,e,t}>). Every renderable text track is
     *  extracted; the SERVED one is chosen separately (metadata first,
     *  Persian-script content detection when tags are missing). */
    this.trackCues = new Map();
    /** legacy-compat view: the CHOSEN track's cues (what /subs serves) */
    this.cues = new Map();
    this.found = false; // a renderable TEXT subtitle track exists
    this.assOnly = false;
    /** all subtitle codec ids seen in Tracks (incl. bitmap ones) */
    this.kinds = [];
    /** audio track CodecIDs in file order (Chromium plays index 0) */
    this.audioCodecs = [];
    this.videoCodec = null;
    this.probed = false; // header info (tracks) captured at least once
    /** marker-inclusive track number of the SERVED text subtitle track
     *  (shared across all range-requests of this URL – a seek pass starts
     *  mid-file without a Tracks element, it must still recognise subtitle
     *  blocks) */
    this.trackNumber = null;
    /** marker-inclusive track numbers of ALL text subtitle tracks →
     *  { codec, lang, name } */
    this.textTracks = new Map();
    this.complete = false; // a full-file (bytes=0-) pass finished
    this.vttCache = null;
    this.vttCount = -1;
    this.touched = Date.now();
    /** self-healing head-scan state (see /subs) */
    this.scanning = false;
    this.scanTries = 0;
    /** Matroska TimestampScale (nanoseconds per tick, default 1ms).
     *  Block timecodes are raw ticks; cue times must be ms. */
    this.timestampScale = 1000000;
    /* ---- v0.10.18 state ---- */
    this.matroska = false; // content-sniffed EBML magic seen
    this.notMatroska = false; // sniffed a NON-matroska head – never scan again
    this.fileSize = 0; // from content-range totals
    /** byte/time samples: secBucket(2s) → absolute byte offset of a cluster
     *  timecode. Feeds the backfill offset estimate. */
    this.samples = new Map();
    this.backfillBudget = BACKFILL_BUDGET;
    this.lastBackfill = 0;
    this.backfilling = false;
  }

  /** Register a text subtitle track seen in Tracks. The provisional SERVED
   *  pick is re-ranked on every registration (persian-tagged first, then
   *  UTF8 > WEBVTT > ASS) — a later ASS registration must never steal the
   *  pick from an earlier UTF8 one, and vice versa. */
  registerTextTrack(vintNo, kind, lang, name) {
    this.textTracks.set(vintNo, { codec: kind, lang: lang || "", name: name || "" });
    this.found = true;
    const anyPlain = [...this.textTracks.values()].some((t) => t.codec === "utf8" || t.codec === "webvtt");
    this.assOnly = !anyPlain;
    if (this.trackNumber == null || this.rankTrack(this.textTracks.get(vintNo)) > this.rankTrack(this.textTracks.get(this.trackNumber))) {
      this.chooseTrack(vintNo);
    }
  }

  /** Metadata rank: Persian-tagged tracks first, then UTF8 > WEBVTT > ASS. */
  rankTrack(info) {
    const persian =
      /^(fa|fas|per)([-_].*)?$/i.test(String(info?.lang || "").trim()) ||
      /farsi|persian|فارسی|زیرنویس/i.test(String(info?.name || ""));
    const codecRank = info?.codec === "utf8" ? 4 : info?.codec === "webvtt" ? 3 : 2; // ass=2
    return (persian ? 10 : 0) + codecRank;
  }

  /** Serve a different track: rebuild the legacy view + invalidate caches. */
  chooseTrack(vintNo) {
    if (vintNo == null || vintNo === this.trackNumber) return;
    const src = this.trackCues.get(vintNo);
    this.trackNumber = vintNo;
    this.cues = new Map(src || []);
    this.vttCache = null;
    this.vttCount = -1;
    this.touched = Date.now();
  }

  /** Extracted-cue sink. Cues land in their per-track map; the chosen
   *  track's map is mirrored into the legacy `cues` view. */
  addTrackCue(vintNo, startMs, text, endMs = null) {
    const s = Math.max(0, Math.round(startMs));
    const t = String(text || "").trim();
    if (!t) return;
    let map = this.trackCues.get(vintNo);
    if (!map) {
      map = new Map();
      this.trackCues.set(vintNo, map);
    }
    if (map.size > MAX_CUES_PER_TRACK) return; // safety valve
    const e = endMs != null && endMs > s ? Math.round(endMs) : null;
    const key = s + "|" + t;
    if (map.has(key)) return;
    const cue = { s, e, t };
    map.set(key, cue);
    if (this.trackNumber == null) {
      this.trackNumber = vintNo; // first track that actually carries cues
      this.cues = new Map();
    }
    if (vintNo === this.trackNumber) this.cues.set(key, cue);
    this.vttCache = null;
    this.touched = Date.now();
  }

  /** When header metadata gave no Persian signal, let the CONTENT decide:
   *  the track whose text actually contains Arabic/Persian script wins. */
  maybePickByContent() {
    if (this.trackCues.size <= 1) return;
    if (this.trackNumber != null && this.rankTrack(this.textTracks.get(this.trackNumber)) >= 10) return; // tagged persian – trust it
    let best = null;
    let bestScore = -1;
    for (const [v, map] of this.trackCues) {
      if (!map.size) continue;
      let fa = 0;
      let n = 0;
      for (const c of map.values()) {
        if (n >= 60) break;
        n += 1;
        if (/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(c.t)) fa += 1;
      }
      const info = this.textTracks.get(v) || { codec: "utf8", lang: "", name: "" };
      const score = (fa / Math.max(1, n) >= 0.2 ? 100 : 0) + Math.min(1, map.size / 1000) + this.rankTrack(info) / 100;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (best != null && best !== this.trackNumber) this.chooseTrack(best);
  }

  /** Is the first audio track decodable by Chromium? null = no info yet. */
  audioOk() {
    if (!this.audioCodecs.length) return null;
    return isAudioCodecSupported(this.audioCodecs[0]);
  }

  /** VTT built from collected cues, sorted, non-overlapping. */
  vtt() {
    if (this.vttCache !== null && this.vttCount === this.cues.size) return this.vttCache;
    const list = [...this.cues.values()].sort((a, b) => a.s - b.s);
    const out = ["WEBVTT", ""];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const next = list[i + 1];
      // explicit end (ASS carries one) beats the heuristic gap
      let end = c.e != null ? Math.min(c.e, c.s + 12000) : null;
      if (end == null) end = Math.min(next ? next.s - 1 : c.s + 6000, c.s + 6000);
      out.push(`${ts(c.s)} --> ${ts(Math.max(end, c.s + 500))}`);
      out.push(c.t.replace(/\n+/g, "\n"));
      out.push("");
    }
    this.vttCache = out.join("\n");
    this.vttCount = this.cues.size;
    return this.vttCache;
  }

  /** Coverage of the served track in whole seconds, or null when empty. */
  covSec() {
    let min = Infinity;
    let max = -Infinity;
    for (const c of this.cues.values()) {
      if (c.s < min) min = c.s;
      const e = c.e != null ? c.e : c.s;
      if (e > max) max = e;
    }
    if (max < 0) return null;
    return { min: Math.floor(min / 1000), max: Math.ceil(max / 1000) };
  }

  /** Record the absolute byte offset of a cluster timecode (backfill map). */
  sample(byteAbs, sec) {
    if (!(sec >= 0) || !(byteAbs >= 0)) return;
    const bucket = Math.round(sec / 2) * 2;
    if (this.samples.has(bucket)) return;
    if (this.samples.size >= 4096) {
      // thin out: keep every other bucket (coarse but still usable)
      for (const k of this.samples.keys()) {
        if (Math.abs(k) % 4 === 0) continue;
        this.samples.delete(k);
        if (this.samples.size <= 2048) break;
      }
    }
    this.samples.set(bucket, byteAbs);
  }

  /** Estimated file byte offset for playback position `sec`.
   *  1) interpolate/extrapolate the learned byte/time samples
   *  2) fall back to content-length proportion (needs dur) */
  offsetFor(sec, durSec) {
    if (this.samples.size >= 2) {
      const keys = [...this.samples.keys()].sort((a, b) => a - b);
      let prevK = keys[0];
      let prevB = this.samples.get(prevK);
      for (let i = 1; i < keys.length; i++) {
        const k = keys[i];
        const b = this.samples.get(k);
        if (k >= sec) {
          if (k === prevK) return b;
          const t = (sec - prevK) / (k - prevK);
          return Math.max(0, Math.floor(prevB + (b - prevB) * t));
        }
        prevK = k;
        prevB = b;
      }
      // beyond the last sample → extrapolate with the last segment's slope
      const kPrev2 = keys.length >= 2 ? keys[keys.length - 2] : keys[0];
      const bPrev2 = this.samples.get(kPrev2);
      const spanK = Math.max(1, prevK - kPrev2);
      const slope = (prevB - bPrev2) / spanK; // bytes per second
      const est = Math.floor(prevB + slope * (sec - prevK));
      if (this.fileSize > 0) return Math.min(Math.max(0, est), Math.max(0, this.fileSize - 1));
      if (est >= 0) return est;
    }
    if (this.fileSize > 0 && durSec > 0 && sec > 0) {
      const frac = Math.min(0.98, sec / durSec);
      return Math.max(0, Math.floor(this.fileSize * frac) - (1 << 20));
    }
    return null;
  }
}

function ts(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
}

/** LRU of per-URL stores (subtitle text is small; 30 titles is nothing). */
class StoreCache {
  constructor(cap = 30) {
    this.cap = cap;
    this.map = new Map();
  }
  get(url) {
    let st = this.map.get(url);
    if (!st) {
      st = new SubStore(url);
      this.map.set(url, st);
    }
    st.touched = Date.now();
    if (this.map.size > this.cap) {
      let oldest = null;
      let oldestT = Infinity;
      for (const [k, v] of this.map) {
        if (v.touched < oldestT) {
          oldestT = v.touched;
          oldest = k;
        }
      }
      if (oldest) this.map.delete(oldest);
    }
    return st;
  }
}

/* ------------------------------------------------------------------ */
/* frame → text (SRT / ASS-SSA / WEBVTT)                              */
/* ------------------------------------------------------------------ */

/** MKV S_TEXT/UTF8 frames usually carry full SRT entries (index + clock
 *  line + text); some muxers store bare text. Return the usable text. */
function srtFrameToText(raw) {
  let text = raw.toString("utf8").replace(/\r/g, "").replace(/\u0000+$/, "");
  const lines = text.split("\n");
  const arrow = lines.findIndex((l) => l.includes("-->"));
  if (arrow >= 0) text = lines.slice(arrow + 1).join("\n");
  else if (lines.length > 1 && /^\d+$/.test(lines[0].trim())) text = lines.slice(1).join("\n");
  text = text.replace(/<[^>]+>/g, "").trim();
  return text;
}

/** H:MM:SS.cc / H:MM:SS.mmm → ms (ASS uses centiseconds). */
function assTimeToMs(t) {
  const m = /^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(String(t || "").trim());
  if (!m) return null;
  const frac = m[4].length === 1 ? Number(m[4]) * 100 : m[4].length === 2 ? Number(m[4]) * 10 : Number(m[4]);
  return ((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) + frac;
}

/** ASS/SSA frame → { start, end, text } | null.
 *  Matroska stores the fields AFTER the "Dialogue:" marker (some muxers keep
 *  the full line). Format: Layer,Start,End,Style,Name,ML,MR,MV,Effect,Text.
 *  Override blocks {\…} and drawing commands are stripped, \N → newline. */
function assFrameToCue(raw) {
  let text = raw.toString("utf8").replace(/\r/g, "").replace(/\u0000+$/, "");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let start = null;
  let end = null;
  const parts = [];
  for (const line of lines) {
    if (/^\[Events?\]/i.test(line) || /^Format\s*:/i.test(line) || /^;/i.test(line) || /^\[/i.test(line)) continue;
    let l = /^Dialogue\s*:\s*/i.test(line) ? line.replace(/^Dialogue\s*:\s*/i, "") : line;
    // full Dialogue line → pull the timing out of it
    const head = l.split(",");
    if (head.length >= 9 && /^(\d+:)/.test(head[1]) && /^(\d+:)/.test(head[2])) {
      start = assTimeToMs(head[1]);
      end = assTimeToMs(head[2]);
      l = head.slice(9).join(","); // Text field (may contain commas)
    }
    l = l.replace(/\{[^}]*\}/g, ""); // {\an8}{\i1}… override tags
    if (!l) continue;
    parts.push(l.replace(/\\N/gi, "\n").replace(/\\[nh]/gi, " ").trim());
  }
  const body = parts.filter(Boolean).join("\n").replace(/\n{2,}/g, "\n").trim();
  if (!body) return null;
  return { start, end, text: body };
}

/** S_TEXT/WEBVTT frames → plain cue text (strip the WEBVTT header + timing). */
function webvttFrameToText(raw) {
  let text = raw.toString("utf8").replace(/\r/g, "").replace(/\u0000+$/, "");
  const lines = text.split("\n");
  const arrow = lines.findIndex((l) => l.includes("-->"));
  if (arrow >= 0) text = lines.slice(arrow + 1).join("\n");
  return text.replace(/<[^>]+>/g, "").replace(/^WEBVTT.*$/m, "").trim();
}

/* ------------------------------------------------------------------ */
/* streaming EBML scanner (v2 – zero loss)                            */
/* ------------------------------------------------------------------ */

class MkvScanner {
  /** @param {SubStore} store @param {number} byteBase absolute file offset
   *  of the FIRST byte this scanner will see (range-request start). */
  constructor(store, byteBase = 0) {
    this.store = store;
    this.buf = Buffer.alloc(0);
    this.abs = 0; // absolute offset of buf[0] within THIS stream
    this.pos = 0; // cursor inside buf
    /** container stack: {end} absolute end, -1 = unknown size */
    this.stack = [];
    this.skipBytes = 0; // remaining bytes to silently consume
    this.clusterTc = 0;
    /** ms per block-timecode tick (TimestampScale / 1e6) */
    this.scaleMs = (store.timestampScale || 1000000) / 1e6;
    this.byteBase = byteBase;
    /** consecutive unknown-element skips — see step(): too many in a row
     *  means the parser is WALKING GARBAGE (misaligned inside filler/junk
     *  that happens to parse as tiny valid vints) and must re-hunt for the
     *  next cluster header instead of blindly stepping over it. */
    this.junk = 0;
  }

  feed(chunk) {
    if (!chunk || !chunk.length) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    // compact when the consumed prefix grows large
    if (this.pos > 1 << 20) {
      this.buf = this.buf.subarray(this.pos);
      this.abs += this.pos;
      this.pos = 0;
    }
    // a single malformed step can never kill the pass: skip one byte and
    // carry on (the old scanner set dead=true here and went blind forever)
    try {
      this.run();
    } catch {
      if (this.pos < this.buf.length) this.pos += 1;
      try {
        this.run();
      } catch {
        this.pos = this.buf.length; // give up on this buffer only
      }
    }
  }

  end() {
    /* nothing – cues stay in the store */
  }

  get cursor() {
    // stream-relative cursor (stack/container math is byteBase-agnostic)
    return this.abs + this.pos;
  }

  get fileOffset() {
    // absolute offset of the cursor within the FILE (range-request base +)
    return this.byteBase + this.abs + this.pos;
  }

  run() {
    for (;;) {
      if (this.skipBytes > 0) {
        const avail = this.buf.length - this.pos;
        if (avail <= 0) return;
        const n = Math.min(avail, this.skipBytes);
        this.pos += n;
        this.skipBytes -= n;
        continue;
      }
      // pop finished containers
      while (this.stack.length && this.stack[this.stack.length - 1].end >= 0 && this.cursor >= this.stack[this.stack.length - 1].end) {
        this.stack.pop();
      }
      const step = this.step();
      if (step !== "ok") return; // need-more
    }
  }

  /** One element attempt. Returns "ok" (consumed something) | "more".
   *  THE v0.10.18 FIX: a vint that is merely unfinished at the buffer tail
   *  returns "more" — the old code resynced and DROPPED every byte up to
   *  the next cluster header, silently losing subtitle blocks. */
  step() {
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

    // sanity: element must not cross its parent (unless sizes unknown)
    const top = this.stack[this.stack.length - 1];
    if (top && top.end >= 0 && elEndAbs >= 0 && elEndAbs > top.end) return this.resync();

    if (KNOWN_IDS.has(el.id)) {
      this.junk = 0;
    }

    switch (el.id) {
      case ID.EBML:
      case ID.SEEKHEAD:
      case ID.CUES:
        return this.skipElement(el);
      case ID.VOID:
        return this.skipElement(el, true);
      case ID.INFO: {
        // small header element → read TimestampScale (cue-time correctness)
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
          // v0.10.18: remember where in the FILE this playback second lives
          // (feeds the position-aware backfill offset estimate)
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
        // v0.10.18: a RUN of unknown elements means we are misaligned inside
        // bytes that happen to parse as tiny vints (mid-filler, mid-junk).
        // The old scanner stepped over them 7 bytes at a time and could walk
        // PAST a cluster header whose position never aligned with the stride
        // — cues after it were lost forever. Re-hunt instead.
        this.junk += 1;
        if (this.junk >= 24) {
          this.junk = 0;
          return this.resync();
        }
        return this.skipElement(el);
      }
    }
  }

  /** Info children → TimestampScale (nanoseconds per tick). */
  parseInfo(buf) {
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

  /** Wait-or-walk skip: consumes the element when its bytes are available. */
  skipElement(el, isVoid = false) {
    if (el.unknown) {
      // unknown size and uninteresting → cannot walk blindly; drop to resync
      return this.resync();
    }
    const cap = isVoid ? MAX_SKIP_VOID : MAX_SKIP_ELEMENT;
    if (el.size > cap) return this.resync(); // garbage masquerading as an element
    const avail = this.buf.length - el.dataStart;
    if (avail >= el.size) {
      this.pos = el.dataStart + el.size;
      return "ok";
    }
    // consume what's here, defer the rest — but never trust more than
    // MAX_SKIP_DEFER of unverified bytes: re-entering the stream later
    // re-validates (a real VOID re-syncs to the next cluster; fake sizes
    // re-sync out of the garbage)
    this.skipBytes = Math.min(el.size - avail, MAX_SKIP_DEFER);
    this.pos = this.buf.length;
    return "ok";
  }

  /** Find the next cluster header in the buffer and continue from there. */
  resync() {
    const magic = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const idx = this.buf.indexOf(magic, this.pos + 1);
    if (idx >= 0) {
      this.pos = idx;
      this.stack.length = 0; // flat re-entry at cluster level
      this.skipBytes = 0;
      return "ok";
    }
    // drop the consumed prefix; keep the tail so a magic straddling the
    // chunk boundary is still found on the next feed
    if (this.pos > 0) {
      this.buf = this.buf.subarray(this.pos);
      this.abs += this.pos;
      this.pos = 0;
    }
    return "more";
  }

  /** TrackEntry children → record every track; remember ALL text subtitle
   *  tracks (UTF8/WEBVTT/ASS/SSA — plus S_TEXT/ASCII treated as UTF8) and
   *  audio/video codecs. The SERVED track is picked by metadata now and by
   *  content later (maybePickByContent) when tags are missing. */
  parseTracks(buf) {
    let p = 0;
    let trackNum = null;
    let trackType = null;
    let codec = "";
    let subLang = "";
    let subName = "";
    const flush = () => {
      if (trackNum != null && codec) {
        if (trackType === 0x11) {
          if (!this.store.kinds.includes(codec)) this.store.kinds.push(codec);
          const vint = markedTrackVint(trackNum);
          const kind = /^S_TEXT\/(UTF8|ASCII)/i.test(codec)
            ? "utf8"
            : /^S_TEXT\/WEBVTT/i.test(codec)
              ? "webvtt"
              : /^S_TEXT\/(ASS|SSA)/i.test(codec)
                ? "ass"
                : null;
          if (kind) this.store.registerTextTrack(vint, kind, subLang, subName);
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
        // walk the entry inline
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
            // plain big-endian integer…
            let n = 0;
            for (let i = 0; i < sz2.value && i < 8; i++) n = n * 256 + buf[d2 + i];
            // …but tolerate muxers that wrote a marker-inclusive vint
            if (sz2.value === 1 && buf[d2] >= 0x80) n = buf[d2] & 0x7f;
            trackNum = n;
          } else if (id2.value === ID.TRACK_TYPE) trackType = buf[d2];
          else if (id2.value === ID.CODEC_ID) codec = buf.subarray(d2, d2 + sz2.value).toString("ascii");
          else if (id2.value === ID.TRACK_LANGUAGE) subLang = buf.subarray(d2, d2 + sz2.value).toString("utf8");
          else if (id2.value === ID.TRACK_NAME) subName = buf.subarray(d2, d2 + sz2.value).toString("utf8");
          q = d2 + sz2.value;
        }
      }
      p = ds + sizeV.value;
    }
    flush();
    if (this.store.textTracks.size || this.store.audioCodecs.length || this.store.videoCodec) {
      this.store.probed = true; // header intelligence captured
    }
  }

  /** SimpleBlock / Block header → subtitle frame when it belongs to a KNOWN
   *  text subtitle track. Layout: [track vint][timecode int16][flags u8].
   *  v0.10.18: EVERY text track is extracted (per-track maps) — the served
   *  one is decided by metadata + Persian-script content, not by mux order.
   *  The store is read LIVE, so a pass that started before Tracks was ever
   *  seen (resumed playback, self-healing head scan) starts recognising
   *  subtitle blocks the moment the store learns them. */
  parseBlock(buf, start, size) {
    const tv = peekVint(buf, start, true);
    if (tv.st !== "ok" || tv.len > 8) return;
    if (tv.len + 3 > size) return;
    const track = tv.value;
    const info = this.store.textTracks.get(track);
    if (!info) return; // not (yet) known to be a text subtitle track
    const tcRel = buf.readInt16BE(start + tv.len);
    const flags = buf[start + tv.len + 2];
    const lacing = (flags >> 1) & 0x03;
    if (lacing !== 0) return; // subtitles are never laced in practice
    const frameStart = start + tv.len + 3;
    const frame = buf.subarray(frameStart, start + size);
    const kind = typeof info === "object" ? info.codec : info;
    // raw ticks × ms-per-tick — default scale is exactly 1ms (factor 1)
    const base = Math.round((this.clusterTc + tcRel) * this.scaleMs);
    if (kind === "ass") {
      const cue = assFrameToCue(frame);
      if (!cue) return;
      this.store.addTrackCue(track, cue.start != null ? cue.start : base, cue.text, cue.start != null ? cue.end : null);
    } else if (kind === "webvtt") {
      const text = webvttFrameToText(frame);
      if (text) this.store.addTrackCue(track, base, text, null);
    } else {
      const text = srtFrameToText(frame);
      if (text) this.store.addTrackCue(track, base, text, null);
    }
  }
}

/* ------------------------------------------------------------------ */
/* the proxy server                                                   */
/* ------------------------------------------------------------------ */

const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

function isMatroska(url, contentType) {
  if (/video\/(x-)?matroska|video\/webm/i.test(contentType || "")) return true;
  return /\.mkv|\.mk3d|\.webm(\?|$)/i.test(url || "");
}

/** Capture the file size out of a content-range header value. */
function noteFileSize(store, contentRange) {
  const m = /\/(\d+)\s*$/.exec(String(contentRange || ""));
  if (m) {
    const total = Number(m[1]);
    if (Number.isFinite(total) && total > 0) store.fileSize = total;
  }
}

/** v0.10.18 – POSITION-AWARE BACKFILL: when the served track's cue
 *  coverage does not reach the watched position, actively scan a bounded
 *  byte window at the estimated offset. Budget-capped per URL, spaced out,
 *  and killed the moment the polling client disconnects. */
function maybeBackfill(store, target, posSec, durSec, onUp) {
  if (!/^https?:\/\//i.test(target)) return;
  if (!store.found || !store.probed) return; // need Tracks + a text track
  if (store.complete) return; // a full pass already covered the file
  if (store.backfilling) return;
  if (store.backfillBudget <= (1 << 20)) return;
  if (Date.now() - store.lastBackfill < BACKFILL_MIN_GAP_MS) return;
  if (!(posSec > 0)) return;
  if (durSec > 0 && posSec > durSec - 2) return; // at EOF
  const cov = store.covSec();
  if (cov && cov.max >= posSec + 45) return; // already covered ahead
  const off = store.offsetFor(Math.max(0, posSec - 5), durSec);
  if (off == null) return;
  const start = Math.max(0, Math.min(off, Math.max(0, (store.fileSize || Infinity) - 1)));
  const end = start + BACKFILL_WINDOW;
  store.backfilling = true;
  store.lastBackfill = Date.now();
  proxyFetch(target, `bytes=${start}-${end}`, 0)
    .then((up) => {
      onUp(up);
      noteFileSize(store, up.headers["content-range"]);
      const scanner = new MkvScanner(store, start);
      const finish = () => {
        store.backfilling = false;
        try {
          up.destroy();
        } catch {
          /* already gone */
        }
      };
      up.on("data", (chunk) => {
        store.backfillBudget = Math.max(0, store.backfillBudget - chunk.length);
        try {
          scanner.feed(chunk);
        } catch {
          /* keep going – extraction must never break the proxy */
        }
        const cov2 = store.covSec();
        if (cov2 && cov2.max >= posSec + 90) finish(); // far enough ahead
      });
      up.on("end", finish);
      up.on("close", finish);
      up.on("error", finish);
    })
    .catch(() => {
      store.backfilling = false;
    });
}

function startStreamProxy(log, opts = {}) {
  const stores = new StoreCache(30);
  const stats = { streams: 0, errors: 0, cues: 0, backfills: 0 };

  const server = http.createServer((req, res) => {
    const peer = req.socket.remoteAddress || "";
    if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer)) {
      res.writeHead(403).end();
      return;
    }
    let u;
    try {
      u = new URL(req.url, "http://localhost");
    } catch {
      res.writeHead(400).end();
      return;
    }

    if (u.pathname === "/subs" || u.pathname === "/ping") {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      if (u.pathname === "/ping") return res.end(JSON.stringify({ ok: true, stats }));
      const target = u.searchParams.get("u") || "";
      const store = stores.get(target);
      const posSec = Number(u.searchParams.get("pos") || 0) || 0;
      const durSec = Number(u.searchParams.get("dur") || 0) || 0;

      /* SELF-HEALING HEADER SCAN. Cue recognition needs Tracks (the subtitle
       * track numbers) which lives at the FILE HEAD. Any /subs poll on an
       * unprobed URL kicks a one-shot ranged head scan so the track header
       * lands in the shared store no matter how playback started. The
       * v0.10.18 scan is content-sniffed (extension-less token URLs work)
       * and hard-capped (8MB fed, 5 tries) so a broken file cannot trigger
       * endless or oversized head fetches. */
      if (!store.probed && !store.scanning && store.scanTries < 5 && /^https?:\/\//i.test(target)) {
        store.scanning = true;
        store.scanTries += 1;
        const settle = () => {
          store.scanning = false;
        };
        proxyFetch(target, "bytes=0-6291455", 0)
          .then((up) => {
            noteFileSize(store, up.headers["content-range"]);
            let scanner = null;
            let fed = 0;
            let snuffed = false; // decided "not matroska"
            const stop = () => {
              try {
                up.destroy();
              } catch {
                /* already gone */
              }
              settle();
            };
            up.on("data", (chunk) => {
              if (snuffed) return;
              if (!scanner) {
                const idx = sniffEbml(chunk);
                if (idx < 0) {
                  if (chunk.length >= 64) {
                    store.notMatroska = true;
                    store.probed = true; // nothing more to learn here
                    snuffed = true;
                    stop();
                  }
                  return;
                }
                store.matroska = true;
                scanner = new MkvScanner(store, 0);
                try {
                  scanner.feed(chunk.subarray(idx));
                } catch {
                  /* keep going */
                }
                fed = chunk.length;
                if (store.probed) stop();
                return;
              }
              fed += chunk.length;
              try {
                scanner.feed(chunk);
              } catch {
                stop();
                return;
              }
              if (store.probed || fed > (8 << 20)) stop(); // Tracks parsed (or cap) – that's all we need
            });
            up.on("end", settle);
            up.on("close", settle);
            up.on("error", settle);
          })
          .catch(settle);
      }

      // serve whichever text track actually carries Persian text when the
      // header tags were missing (v0.10.18 content pick)
      store.maybePickByContent();

      // v0.10.18 position-aware backfill (fire-and-forget, abort-aware)
      let backfillUp = null;
      res.on("close", () => {
        if (backfillUp) {
          try {
            backfillUp.destroy();
          } catch {
            /* ignore */
          }
        }
      });
      maybeBackfill(store, target, posSec, durSec, (up) => {
        backfillUp = up;
        stats.backfills += 1;
      });

      const cues = store.cues.size;
      stats.cues = cues;
      const cov = store.covSec();
      return res.end(
        JSON.stringify({
          found: store.found,
          cues,
          complete: store.complete,
          vtt: cues > 0 ? store.vtt() : null,
          // header intelligence
          probed: store.probed,
          kinds: store.kinds,
          audio: store.audioCodecs,
          video: store.videoCodec,
          audioOk: store.audioOk(),
          audioLabel: store.audioCodecs.length ? audioCodecLabel(store.audioCodecs[0]) : null,
          // v0.10.18 diagnostics
          matroska: store.matroska,
          cov: cov ? [cov.min, cov.max] : null,
        })
      );
    }

    /* GET /probe?u=<url> – header intelligence without disturbing playback:
     * a short ranged fetch (the head contains EBML+Tracks for virtually
     * every release) runs through the same scanner; results land in the
     * shared per-URL store, so a later /stream pass keeps accumulating cues
     * without redoing the work. Responds as soon as Tracks is parsed. */
    if (u.pathname === "/probe") {
      const target = u.searchParams.get("u") || "";
      if (!/^https?:\/\//i.test(target)) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad url" }));
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      const store = stores.get(target);
      const answer = () =>
        res.end(
          JSON.stringify({
            probed: store.probed,
            kinds: store.kinds,
            audio: store.audioCodecs,
            video: store.videoCodec,
            audioOk: store.audioOk(),
            audioLabel: store.audioCodecs.length ? audioCodecLabel(store.audioCodecs[0]) : null,
            cues: store.cues.size,
            found: store.found,
          })
        );
      if (store.probed || store.notMatroska) return answer();
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          answer();
        }
      };
      const guard = setTimeout(done, 12000); // never hang the caller
      let probeUp = null;
      // client gone → stop the head scan too (no background download)
      res.on("close", () => {
        clearTimeout(guard);
        if (!settled && probeUp) {
          try {
            probeUp.destroy();
          } catch {
            /* ignore */
          }
        }
      });
      proxyFetch(target, "bytes=0-6291455", 0)
        .then((up) => {
          probeUp = up;
          noteFileSize(store, up.headers["content-range"]);
          let scanner = null;
          let fed = 0;
          const stop = () => {
            try {
              up.destroy();
            } catch {
              /* already gone */
            }
            done();
          };
          up.on("data", (chunk) => {
            if (!scanner) {
              const idx = sniffEbml(chunk);
              if (idx < 0) {
                if (chunk.length >= 64) {
                  store.notMatroska = true;
                  store.probed = true;
                  stop();
                }
                return;
              }
              store.matroska = true;
              scanner = new MkvScanner(store, 0);
              try {
                scanner.feed(chunk.subarray(idx));
              } catch {
                /* keep going */
              }
              fed = chunk.length;
              if (store.probed) stop();
              return;
            }
            fed += chunk.length;
            try {
              scanner.feed(chunk);
            } catch {
              stop();
              return;
            }
            if (store.probed || fed > (8 << 20)) stop();
          });
          up.on("end", done);
          up.on("close", done);
          up.on("error", done);
        })
        .catch(() => {
          clearTimeout(guard);
          done();
        });
      res.on("close", () => {
        clearTimeout(guard);
        settled = true; // client gone – stop quietly
      });
      return;
    }

    if (u.pathname !== "/stream") {
      res.writeHead(404).end();
      return;
    }

    const target = u.searchParams.get("u") || "";
    if (!/^https?:\/\//i.test(target)) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("bad url");
      return;
    }

    const range = req.headers.range;
    const rangeStart = (() => {
      const m = /^bytes=(\d+)-/.exec(String(range || "").trim());
      return m ? Number(m[1]) : 0;
    })();
    const isFullPass = !range || /^bytes=0(?:-\d*)?$/.test(String(range).trim());

    /* v0.10.17 — BACKGROUND-DOWNLOAD LEAK FIX. When the <video> element goes
     * away (theater closed, quality switch, window reload, PiP handoff)
     * Chromium aborts its socket — but this handler never noticed and kept
     * pumping the upstream response to the very last byte: the movie kept
     * DOWNLOADING in the background long after the player was closed. The
     * upstream is destroyed the moment the downstream client disappears —
     * including while the upstream headers are still in flight. */
    let up = null; // upstream response once its headers arrive
    let upstreamReq = null; // upstream request (abortable during redirects)
    let clientGone = false;
    const killUpstream = () => {
      if (up) {
        try {
          up.destroy();
        } catch {
          /* ignore */
        }
      }
      if (upstreamReq) {
        try {
          upstreamReq.destroy();
        } catch {
          /* ignore */
        }
      }
    };
    const onClientGone = () => {
      if (res.writableEnded) return; // normal completion — nothing to kill
      if (clientGone) return;
      clientGone = true;
      killUpstream();
    };
    res.on("close", onClientGone);
    req.on("error", onClientGone);

    proxyFetch(target, range, 0, (r) => {
      upstreamReq = r;
      if (clientGone) r.destroy(); // aborted before the socket even opened
    })
      .then((upRes) => {
        if (clientGone) {
          try {
            upRes.destroy();
          } catch {
            /* ignore */
          }
          return;
        }
        up = upRes;
        const headers = {};
        for (const h of PASS_HEADERS) {
          if (up.headers[h] !== undefined) headers[h] = up.headers[h];
        }
        headers["access-control-allow-origin"] = "*";
        headers["cache-control"] = "no-store";
        res.writeHead(up.statusCode, headers);

        const store = stores.get(target);
        noteFileSize(store, up.headers["content-range"]);
        // v0.10.18: CONTENT-BASED scanner attach. Known-matroska URLs always
        // scan; unknown URLs scan only when the pass starts at byte 0 and
        // the EBML magic sniffs — extension-less token URLs included.
        let scanner = null;
        if (store.matroska) scanner = new MkvScanner(store, rangeStart);
        stats.streams += 1;

        up.on("data", (chunk) => {
          if (!scanner && !store.notMatroska && rangeStart === 0) {
            const idx = sniffEbml(chunk);
            if (idx >= 0) {
              store.matroska = true;
              scanner = new MkvScanner(store, 0);
              try {
                scanner.feed(chunk.subarray(idx));
              } catch {
                /* keep going */
              }
              return;
            }
            if (chunk.length >= 64) store.notMatroska = true;
          }
          if (scanner) {
            try {
              scanner.feed(chunk);
            } catch {
              scanner = null;
            }
          }
        });
        up.on("end", () => {
          if (scanner) scanner.end();
          if (isFullPass) {
            store.complete = true;
            store.maybePickByContent();
          }
        });
        up.on("error", () => {
          stats.errors += 1;
          res.destroy();
        });
        up.pipe(res);
      })
      .catch((err) => {
        stats.errors += 1;
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
          res.end(`proxy error: ${err && err.message ? err.message : err}`);
        } else res.destroy();
      });
  });

  // never let an idle socket hang the app
  server.requestTimeout = 0;
  server.headersTimeout = 30000;

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port || 0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => server.close(),
        stats: () => stats,
      });
    });
  });
}

/** http(s) GET with Range passthrough and manual redirects.
 *  `onRequest` (optional) receives the outgoing ClientRequest as soon as it
 *  exists, so callers can abort even before the response headers arrive. */
function proxyFetch(url, range, depth, onRequest) {
  return new Promise((resolve, reject) => {
    if (depth > MAX_REDIRECTS) return reject(new Error("too many redirects"));
    let mod;
    try {
      mod = /^https:/i.test(url) ? https : http;
    } catch (e) {
      return reject(e);
    }
    const headers = { "user-agent": UA, accept: "*/*", "accept-encoding": "identity" };
    if (range) headers.range = range;
    const req = mod.get(url, { headers, rejectUnauthorized: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(proxyFetch(next, range, depth + 1, onRequest));
      }
      resolve(res);
    });
    if (typeof onRequest === "function") onRequest(req);
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error("upstream timeout")));
  });
}

module.exports = { startStreamProxy, MkvScanner, SubStore, StoreCache, srtFrameToText, assFrameToCue, assTimeToMs, isAudioCodecSupported, audioCodecLabel, sniffEbml };
