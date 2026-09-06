/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * نما – local stream proxy with passive MKV subtitle extraction (v0.10.5)
 *
 * WHY: the archive's «زیرنویس چسبیده» files are Matroska encodes with the
 * Persian SRT *muxed inside* (S_TEXT/UTF8, confirmed by probing). Chromium
 * never renders embedded MKV subtitle tracks, so users saw the video without
 * any subtitles. Re-encoding is impossible; downloading every file twice is
 * unacceptable.
 *
 * HOW: a 127.0.0.1-only proxy sits between the remote file and the
 * <video> element:
 *
 *   GET /stream?u=<encoded remote url>   byte-transparent pipe (Range is
 *                                        forwarded 1:1) that also feeds a
 *                                        streaming EBML scanner
 *   GET /subs?u=<encoded remote url>     JSON { found, cues, complete, vtt }
 *                                        – the VTT built from the subtitle
 *                                        packets collected so far
 *
 * The scanner parses SeekHead/Info/Tracks/Cluster/SimpleBlock on the fly and
 * extracts S_TEXT/UTF8 **and S_TEXT/ASS·SSA·WEBVTT** frames (v0.10.6: the
 * archive muxes both formats; ASS is the common one for Persian fan-subs).
 * Subtitle blocks are interleaved with video packets, so cues accumulate for
 * the byte ranges that actually flow through – linear playback covers the
 * whole file, and seeks simply fill in the gaps they stream through. Cue
 * stores are shared per-URL, deduped, and LRU-capped.
 *
 * v0.10.6 also answers "why does this video have no sound?": Chromium ships
 * without AC3/EAC3/DTS/TrueHD decoders, so an MKV whose first audio track is
 * one of those plays SILENTLY. The scanner records every track's CodecID and
 * the proxy reports `audioOk` (plus the raw codec ids) via /subs and the new
 * /probe endpoint (a 2.5MB ranged fetch that reads the header without
 * touching the playback stream). The player uses that to auto-switch to a
 * variant it can actually play.
 */
const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT = 30000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/* tiny vint helpers                                                  */
/* ------------------------------------------------------------------ */

/** Reads an EBML vint. `keepMarker` keeps the length-marker bits (used for
 *  element IDs and track numbers, which ARE the marker-inclusive value). */
function readVint(buf, pos, keepMarker = false) {
  const b0 = buf[pos];
  if (b0 === undefined || b0 === 0) return null;
  let len = 1;
  let mask = 0x80;
  while (!(b0 & mask)) {
    mask >>= 1;
    len += 1;
    if (len > 8) return null;
  }
  if (pos + len > buf.length) return null;
  let val = keepMarker ? b0 : b0 & (mask - 1);
  for (let i = 1; i < len; i++) val = val * 256 + buf[pos + i];
  return { value: val, len };
}

const ID = {
  EBML: 0x1a45dfa3,
  SEGMENT: 0x18538067,
  SEEKHEAD: 0x114d9b74,
  VOID: 0xec,
  INFO: 0x1549a966,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  CLUSTER: 0x1f43b675,
  TIMECODE: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  CUES: 0x1c53bb6b,
};

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

/* ------------------------------------------------------------------ */
/* per-URL cue store                                                  */
/* ------------------------------------------------------------------ */

class SubStore {
  constructor(url) {
    this.url = url;
    this.key = crypto.createHash("sha1").update(url).digest("hex");
    /** @type {Map<string, {s:number, e:number|null, t:string}>} startMs|text → cue */
    this.cues = new Map();
    this.found = false; // a renderable TEXT subtitle track exists
    this.assOnly = false;
    /** all subtitle codec ids seen in Tracks (incl. bitmap ones) */
    this.kinds = [];
    /** audio track CodecIDs in file order (Chromium plays index 0) */
    this.audioCodecs = [];
    this.videoCodec = null;
    this.probed = false; // header info (tracks) captured at least once
    /** marker-inclusive track number of the preferred TEXT subtitle track
     *  (shared across all range-requests of this URL – a seek pass starts
     *  mid-file without a Tracks element, it must still recognise subtitle
     *  blocks) */
    this.trackNumber = null;
    /** marker-inclusive track numbers of ALL text subtitle tracks */
    this.textTracks = new Map(); // vint → codec
    this.complete = false; // a full-file (bytes=0-) pass finished
    this.vttCache = null;
    this.vttCount = -1;
    this.touched = Date.now();
  }

  addCue(startMs, text, endMs = null) {
    const s = Math.max(0, Math.round(startMs));
    const t = String(text || "").trim();
    if (!t) return;
    const e = endMs != null && endMs > s ? Math.round(endMs) : null;
    const key = s + "|" + t;
    if (this.cues.has(key)) return;
    if (this.cues.size > 20000) return; // safety valve
    this.cues.set(key, { s, e, t });
    this.vttCache = null;
    this.touched = Date.now();
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
/* streaming EBML scanner                                             */
/* ------------------------------------------------------------------ */

class MkvScanner {
  /** @param {SubStore} store */
  constructor(store) {
    this.store = store;
    this.buf = Buffer.alloc(0);
    this.abs = 0; // absolute offset of buf[0]
    this.pos = 0; // cursor inside buf
    /** container stack: {end} absolute end, -1 = unknown size */
    this.stack = [];
    this.skipBytes = 0; // remaining bytes to silently consume
    this.clusterTc = 0;
    this.subTrack = store.trackNumber ?? null; // marker-inclusive preferred text track
    this.dead = false;
  }

  feed(chunk) {
    if (this.dead || !chunk || !chunk.length) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    // compact when the consumed prefix grows large
    if (this.pos > 1 << 20) {
      this.buf = this.buf.subarray(this.pos);
      this.abs += this.pos;
      this.pos = 0;
    }
    try {
      this.run();
    } catch {
      this.dead = true; // never let extraction break playback
    }
  }

  end() {
    /* nothing – cues stay in the store */
  }

  get cursor() {
    return this.abs + this.pos;
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
      if (step !== "ok") return; // need-more (or dead)
    }
  }

  /** One element attempt. Returns "ok" (consumed something) | "more". */
  step() {
    const buf = this.buf;
    const idV = readVint(buf, this.pos, true);
    if (!idV) {
      // possibly garbage → resync to the next cluster header
      return this.resync();
    }
    const sizeV = readVint(buf, this.pos + idV.len);
    if (!sizeV) return "more";
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

    switch (el.id) {
      case ID.EBML:
      case ID.SEEKHEAD:
      case ID.INFO:
      case ID.CUES:
      case ID.VOID:
        return this.skipElement(el);
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
      default:
        return this.skipElement(el);
    }
  }

  /** Wait-or-walk skip: consumes the element when its bytes are available. */
  skipElement(el) {
    if (el.unknown) {
      // unknown size and uninteresting → cannot walk blindly; drop to resync
      return this.resync();
    }
    const avail = this.buf.length - el.dataStart;
    if (avail >= el.size) {
      this.pos = el.dataStart + el.size;
      return "ok";
    }
    // consume what's here, defer the rest
    this.skipBytes = el.size - avail;
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

  /** TrackEntry children → record every track; pick the best TEXT subtitle
   *  track (UTF8 > WEBVTT > ASS > SSA) and remember audio/video codecs. */
  parseTracks(buf) {
    let p = 0;
    let trackNum = null;
    let trackType = null;
    let codec = "";
    const flush = () => {
      if (trackNum != null && codec) {
        if (trackType === 0x11) {
          if (!this.store.kinds.includes(codec)) this.store.kinds.push(codec);
          const vint = markedTrackVint(trackNum);
          if (/^S_TEXT\/UTF8/i.test(codec)) this.store.textTracks.set(vint, "utf8");
          else if (/^S_TEXT\/WEBVTT/i.test(codec)) this.store.textTracks.set(vint, "webvtt");
          else if (/^S_TEXT\/ASS/i.test(codec)) this.store.textTracks.set(vint, "ass");
          else if (/^S_TEXT\/SSA/i.test(codec)) this.store.textTracks.set(vint, "ass");
        } else if (trackType === 2) {
          if (!this.store.audioCodecs.includes(codec)) this.store.audioCodecs.push(codec);
        } else if (trackType === 1) {
          this.store.videoCodec = codec;
        }
      }
      trackNum = trackType = null;
      codec = "";
    };
    while (p < buf.length - 1) {
      const idV = readVint(buf, p, true);
      if (!idV) return;
      const sizeV = readVint(buf, p + idV.len);
      if (!sizeV) return;
      const ds = p + idV.len + sizeV.len;
      if (idV.value === ID.TRACK_ENTRY) {
        flush();
        // walk the entry inline
        let q = ds;
        const qEnd = Math.min(ds + sizeV.value, buf.length);
        while (q < qEnd - 1) {
          const id2 = readVint(buf, q, true);
          if (!id2) break;
          const sz2 = readVint(buf, q + id2.len);
          if (!sz2) break;
          const d2 = q + id2.len + sz2.len;
          if (id2.value === ID.TRACK_NUMBER) {
            // plain big-endian integer…
            let n = 0;
            for (let i = 0; i < sz2.value && i < 8; i++) n = n * 256 + buf[d2 + i];
            // …but tolerate muxers that wrote a marker-inclusive vint
            if (sz2.value === 1 && buf[d2] >= 0x80) n = buf[d2] & 0x7f;
            trackNum = n;
          } else if (id2.value === ID.TRACK_TYPE) trackType = buf[d2];
          else if (id2.value === ID.CODEC_ID) codec = buf.subarray(d2, d2 + sz2.value).toString("ascii");
          q = d2 + sz2.value;
        }
      }
      p = ds + sizeV.value;
    }
    flush();
    this.pickPreferredTrack();
    if (this.store.textTracks.size || this.store.audioCodecs.length || this.store.videoCodec) {
      this.store.probed = true; // header intelligence captured
    }
  }

  /** Choose the subtitle track the extractor follows: UTF8 first, then
   *  WEBVTT, then ASS/SSA (converted). Remember the choice in the shared
   *  store so seek-only passes recognise the same track. */
  pickPreferredTrack() {
    if (!this.store.textTracks.size) return;
    const rank = (c) => (c === "utf8" ? 4 : c === "webvtt" ? 3 : 2); // ass=2
    let bestV = null;
    let bestR = -1;
    for (const [v, c] of this.store.textTracks) {
      const r = rank(c);
      if (r > bestR) {
        bestR = r;
        bestV = v;
      }
    }
    if (bestV != null) {
      this.subTrack = bestV;
      this.store.trackNumber = bestV;
      this.store.found = true;
      const anyPlain = [...this.store.textTracks.values()].some((c) => c === "utf8");
      this.store.assOnly = !anyPlain;
    }
  }

  /** SimpleBlock / Block header → subtitle frame when it belongs to a text
   *  subtitle track. Layout: [track vint][timecode int16][flags u8][frames…]. */
  parseBlock(buf, start, size) {
    if (this.subTrack == null) return; // tracks not seen yet (or no text sub)
    const tv = readVint(buf, start, true);
    if (!tv || tv.len > 8) return;
    if (tv.len + 3 > size) return;
    const track = tv.value;
    const tcRel = buf.readInt16BE(start + tv.len);
    const flags = buf[start + tv.len + 2];
    const lacing = (flags >> 1) & 0x03;
    if (track !== this.subTrack) return;
    if (lacing !== 0) return; // subtitles are never laced in practice
    const frameStart = start + tv.len + 3;
    const frame = buf.subarray(frameStart, start + size);
    const kind = this.store.textTracks.get(track) || "utf8";
    const base = this.clusterTc + tcRel;
    if (kind === "ass") {
      const cue = assFrameToCue(frame);
      if (!cue) return;
      this.store.addCue(cue.start != null ? cue.start : base, cue.text, cue.end != null ? (cue.start != null ? cue.end : null) : null);
    } else if (kind === "webvtt") {
      const text = webvttFrameToText(frame);
      if (text) this.store.addCue(base, text);
    } else {
      const text = srtFrameToText(frame);
      if (text) this.store.addCue(base, text);
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

function startStreamProxy(log, opts = {}) {
  const stores = new StoreCache(30);
  const stats = { streams: 0, errors: 0, cues: 0 };

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
      const cues = store.cues.size;
      stats.cues = cues;
      return res.end(
        JSON.stringify({
          found: store.found,
          cues,
          complete: store.complete,
          vtt: cues > 0 ? store.vtt() : null,
          // v0.10.6 header intelligence (filled once Tracks has been scanned)
          probed: store.probed,
          kinds: store.kinds,
          audio: store.audioCodecs,
          video: store.videoCodec,
          audioOk: store.audioOk(),
          audioLabel: store.audioCodecs.length ? audioCodecLabel(store.audioCodecs[0]) : null,
        })
      );
    }

    /* GET /probe?u=<url> – header intelligence without disturbing playback:
     * a short ranged fetch (first ~2.5MB contains EBML+Tracks for virtually
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
      if (store.probed || !isMatroska(target, "")) return answer();
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          answer();
        }
      };
      const guard = setTimeout(done, 12000); // never hang the caller
      proxyFetch(target, "bytes=0-2621439", 0)
        .then((up) => {
          const scanner = new MkvScanner(store);
          up.on("data", (chunk) => {
            try {
              scanner.feed(chunk);
            } catch {
              up.destroy();
            }
            if (store.probed) up.destroy(); // Tracks parsed – that's all we need
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
    const isFullPass = !range || /^bytes=0(?:-\d*)?$/.test(String(range).trim());
    proxyFetch(target, range, 0)
      .then((up) => {
        const headers = {};
        for (const h of PASS_HEADERS) {
          if (up.headers[h] !== undefined) headers[h] = up.headers[h];
        }
        headers["access-control-allow-origin"] = "*";
        headers["cache-control"] = "no-store";
        res.writeHead(up.statusCode, headers);

        const store = stores.get(target);
        let scanner = null;
        if (isMatroska(target, up.headers["content-type"])) {
          scanner = new MkvScanner(store);
        }
        stats.streams += 1;

        up.on("data", (chunk) => {
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
            if (scanner && scanner.subTrack == null) store.found = store.found || false;
          }
        });
        up.on("error", () => {
          stats.errors += 1;
          res.destroy();
        });
        up.pipe(res);
        // pipe() pauses data flow? No – pipe consumes; but 'data' + pipe both
        // attach listeners → flowing mode is fine (data listeners count too).
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

/** http(s) GET with Range passthrough and manual redirects. */
function proxyFetch(url, range, depth) {
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
        return resolve(proxyFetch(next, range, depth + 1));
      }
      resolve(res);
    });
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error("upstream timeout")));
  });
}

module.exports = { startStreamProxy, MkvScanner, SubStore, StoreCache, srtFrameToText, assFrameToCue, assTimeToMs, isAudioCodecSupported, audioCodecLabel };
