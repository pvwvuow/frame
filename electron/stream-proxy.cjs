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
 * extracts S_TEXT/UTF8 frames (the DonyayeSerial convention). Subtitle blocks
 * are interleaved with video packets, so cues accumulate for the byte ranges
 * that actually flow through – linear playback covers the whole file, and
 * seeks simply fill in the gaps they stream through. Cue stores are shared
 * per-URL (sha1), deduped, and LRU-capped.
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
    /** @type {Map<string, {s:number, t:string}>} startMs|text → cue */
    this.cues = new Map();
    this.found = false; // an SRT/UTF8 subtitle track exists
    this.assOnly = false;
    /** marker-inclusive track number of the SRT track (shared across all
     *  range-requests of this URL – a seek pass starts mid-file without a
     *  Tracks element, it must still recognise subtitle blocks) */
    this.trackNumber = null;
    this.complete = false; // a full-file (bytes=0-) pass finished
    this.vttCache = null;
    this.vttCount = -1;
    this.touched = Date.now();
  }

  addCue(startMs, text) {
    const s = Math.max(0, Math.round(startMs));
    const t = String(text || "").trim();
    if (!t) return;
    const key = s + "|" + t;
    if (this.cues.has(key)) return;
    if (this.cues.size > 20000) return; // safety valve
    this.cues.set(key, { s, t });
    this.vttCache = null;
    this.touched = Date.now();
  }

  /** VTT built from collected cues, sorted, non-overlapping. */
  vtt() {
    if (this.vttCache !== null && this.vttCount === this.cues.size) return this.vttCache;
    const list = [...this.cues.values()].sort((a, b) => a.s - b.s);
    const out = ["WEBVTT", ""];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const next = list[i + 1];
      const end = Math.min(next ? next.s - 1 : c.s + 6000, c.s + 6000);
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
/* SRT frame → text                                                   */
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
    this.subTrack = store.trackNumber ?? null; // marker-inclusive SRT track no
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

  /** TrackEntry children → find S_TEXT/UTF8 (SRT) track. */
  parseTracks(buf) {
    let p = 0;
    let trackNum = null;
    let trackType = null;
    let codec = "";
    const flush = () => {
      if (trackType === 0x11 && codec && trackNum != null) {
        if (/^S_TEXT\/UTF8/i.test(codec)) {
          this.subTrack = markedTrackVint(trackNum);
          this.store.found = true;
          this.store.trackNumber = this.subTrack;
        } else if (/^S_TEXT/i.test(codec)) {
          this.store.assOnly = !this.store.found;
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
  }

  /** SimpleBlock / Block header → subtitle frame when it belongs to the
   *  SRT track. Layout: [track vint][timecode int16][flags u8][frames…]. */
  parseBlock(buf, start, size) {
    if (this.subTrack == null) return; // tracks not seen yet (or no SRT)
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
    const text = srtFrameToText(buf.subarray(frameStart, start + size));
    if (!text) return;
    this.store.addCue(this.clusterTc + tcRel, text);
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
        })
      );
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

module.exports = { startStreamProxy, MkvScanner, SubStore, StoreCache, srtFrameToText };
