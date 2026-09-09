/* v0.21.0 — minimal ISO-BMFF (fMP4) writer for the in-WebView MSE path.
 *
 * WHY: when the device WebView refuses to demux Matroska through a plain
 * <video src> (the «پلیر اصلی هیچی پخش نمی‌کنه» device report), the only
 * way to keep the cinema-capable web player on the catalog is to hand the
 * decoder a container it ALWAYS plays: fragmented MP4 over MediaSource.
 * The demuxer (mkv-web.ts) yields raw H.264 (AVCC, length-prefixed NALUs)
 * + AAC frames; this module boxes them into init segments + media
 * fragments — the same shapes every DASH player feeds MSE.
 *
 * TIMESTAMP MODEL (the B-frame contract):
 *  - Matroska blocks arrive in DECODE order with PTS only.
 *  - DTS is a synthetic monotonic grid: dts_i = dtsBase + i·period.
 *  - presentation offset = pts − dts (SIGNED → trun version 1), which is
 *    exactly how B-frames are carried in MP4.
 *  - Audio has no B-frames: dts = pts grid with the exact AAC frame
 *    duration (1024 samples), anchored at its own Matroska PTS.
 *  Each track keeps its own timescale (video 90k, audio = sample rate);
 *  both are anchored to the same media zero, so A/V sync is preserved.
 *
 * PURE — no DOM, fully node-testable against ffprobe-decoded fixtures.
 */

/* ---- byte helpers ------------------------------------------------- */

function u8(n: number): Uint8Array {
  return new Uint8Array([n & 0xff]);
}
function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}
function u24(n: number): Uint8Array {
  return new Uint8Array([(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
}
function i32(n: number): Uint8Array {
  return u32(n < 0 ? n + 0x100000000 : n);
}
function ascii4(s: string): Uint8Array {
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
function strz(s: string): Uint8Array {
  const out = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out; // null-terminated
}
function concat(parts: Uint8Array[]): Uint8Array {
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
/** one ISO-BMFF box: 4-byte big-endian size + type + payload */
function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const body = concat(payload);
  return concat([u32(body.length + 8), ascii4(type), body]);
}
function fullbox(type: string, version: number, flags: number, ...payload: Uint8Array[]): Uint8Array {
  return box(type, u8(version), u24(flags), ...payload);
}
const UNITY_MATRIX: Uint8Array[] = [
  u32(0x00010000), u32(0), u32(0),
  u32(0), u32(0x00010000), u32(0),
  u32(0), u32(0), u32(0x40000000),
];

/* ---- AAC AudioSpecificConfig parsing ------------------------------ */

const AAC_FREQ = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

export type AscInfo = { objectType: number; sampleRate: number; channels: number };

export function parseAsc(asc: Uint8Array): AscInfo | null {
  if (!asc || asc.length < 2) return null;
  let ot = asc[0]! >> 3;
  let idx = 5;
  if (ot === 31) {
    if (asc.length < 3) return null;
    ot = 32 + ((asc[0]! & 0x07) << 3) + (asc[1]! >> 5);
    idx = 11;
  }
  const fi = bits(asc, idx, 4);
  idx += 4;
  const ch = bits(asc, idx, 4);
  const rate = fi === 15 ? 0 : AAC_FREQ[fi] ?? 0;
  if (!rate || !ch) return null;
  return { objectType: ot, sampleRate: rate, channels: ch };
}

/** big-endian bitfield read across byte boundaries */
function bits(b: Uint8Array, pos: number, n: number): number {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const byte = b[(pos + i) >> 3] ?? 0;
    const bit = 7 - ((pos + i) & 7);
    v = v * 2 + ((byte >> bit) & 1);
  }
  return v;
}

/* ---- init segments ------------------------------------------------- */

export type VideoInit = { width: number; height: number; avcC: Uint8Array; trackId?: number };
export type AudioInit = { asc: Uint8Array; sampleRate: number; channels: number; trackId?: number };

function ftypBox(): Uint8Array {
  return box("ftyp", ascii4("isom"), u32(0x200), ascii4("isom"), ascii4("iso2"), ascii4("avc1"), ascii4("mp41"));
}
function mvhdBox(nextTrackId: number): Uint8Array {
  return fullbox(
    "mvhd", 0, 0,
    u32(0), u32(0), // creation / modification
    u32(1000), u32(0), // timescale, duration (fragmented → 0)
    u16(0x0001), u16(0x0000), // rate 1.0 (16.16)
    u16(0x0100), // volume 1.0 (8.8)
    u16(0), u32(0), u32(0), // reserved (2 + 8)
    ...UNITY_MATRIX,
    u32(0), u32(0), u32(0), u32(0), u32(0), u32(0), // pre_defined
    u32(nextTrackId)
  );
}
function trexBox(trackId: number): Uint8Array {
  return fullbox("trex", 0, 0, u32(trackId), u32(1), u32(0), u32(0), u32(0));
}

/** ftyp + moov for the VIDEO track (fragmented: mvex/trex present). */
export function buildVideoInit(o: VideoInit): Uint8Array {
  const trackId = o.trackId ?? 1;
  const tkhd = fullbox(
    "tkhd", 0, 0x000007,
    u32(0), u32(0), // creation / modification
    u32(trackId), u32(0), // track_ID, reserved
    u32(0), // duration (fragmented)
    u32(0), u32(0), // reserved
    u16(0), u16(0), u16(0), u16(0), // layer, alt_group, volume, reserved
    ...UNITY_MATRIX,
    u32(o.width << 16), u32(o.height << 16)
  );
  const mdhd = fullbox("mdhd", 0, 0, u32(0), u32(0), u32(90000), u32(0), u16(0x55c4), u16(0));
  const hdlr = fullbox("hdlr", 0, 0, u32(0), ascii4("vide"), u32(0), u32(0), u32(0), strz("VideoHandler"));
  const vmhd = fullbox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0));
  const dref = fullbox("dref", 0, 0, u32(1), fullbox("url ", 0, 1));
  const avc1 = box(
    "avc1",
    u16(0), u32(0), u16(1), // reserved(6), data_reference_index
    u16(0), u16(0), u32(0), u32(0), u32(0), // pre_defined(2), reserved(2), pre_defined(12)
    u16(o.width), u16(o.height),
    u32(0x00480000), u32(0x00480000), // h/v resolution 72dpi
    u32(0), // reserved
    u16(1), // frame_count
    new Uint8Array(32), // compressorname (pascal, empty)
    u16(0x0018), u16(0xffff), // depth, pre_defined
    box("avcC", o.avcC)
  );
  const stsd = fullbox("stsd", 0, 0, u32(1), avc1);
  const stbl = box(
    "stbl",
    stsd,
    fullbox("stts", 0, 0, u32(0)),
    fullbox("stsc", 0, 0, u32(0)),
    fullbox("stsz", 0, 0, u32(0), u32(0)),
    fullbox("stco", 0, 0, u32(0))
  );
  const minf = box("minf", vmhd, box("dinf", dref), stbl);
  const mdia = box("mdia", mdhd, hdlr, minf);
  const trak = box("trak", tkhd, mdia);
  const moov = box("moov", mvhdBox(trackId + 1), trak, box("mvex", trexBox(trackId)));
  return concat([ftypBox(), moov]);
}

/** ftyp + moov for the AUDIO track (mp4a + esds from the ASC). */
export function buildAudioInit(o: AudioInit): Uint8Array {
  const trackId = o.trackId ?? 2;
  const tkhd = fullbox(
    "tkhd", 0, 0x000007,
    u32(0), u32(0),
    u32(trackId), u32(0),
    u32(0),
    u32(0), u32(0),
    u16(0), u16(0), u16(0x0100), u16(0),
    ...UNITY_MATRIX,
    u32(0), u32(0)
  );
  const mdhd = fullbox("mdhd", 0, 0, u32(0), u32(0), u32(o.sampleRate), u32(0), u16(0x55c4), u16(0));
  const hdlr = fullbox("hdlr", 0, 0, u32(0), ascii4("soun"), u32(0), u32(0), u32(0), strz("SoundHandler"));
  const smhd = fullbox("smhd", 0, 0, u16(0), u16(0));
  const dref = fullbox("dref", 0, 0, u32(1), fullbox("url ", 0, 1));
  // ESDS descriptors: ES(0x03) → DecoderConfig(0x04) → DecoderSpecific(0x05, ASC) → SL(0x06)
  // Lengths use the 4-byte EXTENDED form — Chrome's MP4 parser rejects the
  // compact 1-byte form (every real muxer — ffmpeg/GPAC/mux.js — writes the
  // extended one, so its short-form path is effectively dead code).
  // every byte except the last carries the 0x80 continuation flag:
  // "80 80 80 25" = 0x25 — "00 00 00 2b" would be a ZERO length + junk!
  const dlen = (len: number) =>
    concat([
      u8(((len >> 21) & 0x7f) | 0x80),
      u8(((len >> 14) & 0x7f) | 0x80),
      u8(((len >> 7) & 0x7f) | 0x80),
      u8(len & 0x7f),
    ]);
  const ascLen = o.asc.length;
  const dsiLen = 5 + ascLen; // tag(1) + dlen(4) + ASC
  const slLen = 6; // tag(1) + dlen(4) + value(1)
  const dcdLen = 13 + dsiLen + slLen; // body: OT+streamType+sizes(13) + DSI + SL
  const esLen = 3 + (5 + dcdLen) + slLen; // body: ES_ID+flags(3) + DCD box + SL
  const esdsPayload = concat([
    u8(0x03), dlen(esLen), u16(trackId), u8(0), // ES_Descriptor
    u8(0x04), dlen(dcdLen), u8(0x40), u8(0x15), // DecoderConfig: OT mp4a, streamType audio<<2|1
    u24(0), u32(0), u32(0), // bufferSizeDB, maxBitrate, avgBitrate
    u8(0x05), dlen(ascLen), o.asc, // DecoderSpecificInfo = the ASC
    u8(0x06), dlen(1), u8(0x02), // SLConfig
  ]);
  const esds = fullbox("esds", 0, 0, esdsPayload);
  const mp4a = box(
    "mp4a",
    u16(0), u32(0), u16(1), // reserved(6), data_reference_index
    u32(0), u32(0), // reserved(8) — QT version/revision/vendor (NOT the visual 16B block!)
    u16(o.channels), u16(16), // channelcount, samplesize
    u16(0), u16(0), // pre_defined, reserved
    u32((o.sampleRate << 16) >>> 0), // samplerate 16.16
    esds
  );
  const stsd = fullbox("stsd", 0, 0, u32(1), mp4a);
  const stbl = box(
    "stbl",
    stsd,
    fullbox("stts", 0, 0, u32(0)),
    fullbox("stsc", 0, 0, u32(0)),
    fullbox("stsz", 0, 0, u32(0), u32(0)),
    fullbox("stco", 0, 0, u32(0))
  );
  const minf = box("minf", smhd, box("dinf", dref), stbl);
  const mdia = box("mdia", mdhd, hdlr, minf);
  const trak = box("trak", tkhd, mdia);
  const moov = box("moov", mvhdBox(trackId + 1), trak, box("mvex", trexBox(trackId)));
  return concat([ftypBox(), moov]);
}

/* ---- media fragments ----------------------------------------------- */

export type Sample = {
  size: number;
  duration: number; // track timescale units
  compOffset?: number; // SIGNED, video only (pts − dts)
  key?: boolean;
};

const VIDEO_TRUN_FLAGS = 0x000f01; // data-offset | duration | size | flags | comp-time (v1)
const AUDIO_TRUN_FLAGS = 0x000301; // data-offset | duration | size

/** moof + mdat for one video fragment (trun v1 → signed comp offsets).
 *  data_offset is computed ANALYTICALLY (moof = 8+16(mfhd) + 8+16+16+20+16n
 *  → 84+16n total; mdat payload starts +8) — patching a built box is
 *  impossible: concat() copies, the local view would diverge. */
export function buildVideoFragment(o: {
  trackId?: number;
  seq: number;
  baseDts: number; // 90k units
  samples: Sample[];
  payload: Uint8Array; // concatenated AVCC samples
}): Uint8Array {
  const trackId = o.trackId ?? 1;
  const n = o.samples.length;
  const dataOffset = 92 + 16 * n;
  const entries: Uint8Array[] = [];
  for (const s of o.samples) {
    entries.push(u32(s.duration >>> 0), u32(s.size), u32(s.key ? 0x02000000 : 0x01010000), i32(s.compOffset ?? 0));
  }
  const trun = fullbox("trun", 1, VIDEO_TRUN_FLAGS, u32(n), i32(dataOffset), ...entries);
  const tfdt = fullbox("tfdt", 0, 0, u32(o.baseDts >>> 0));
  // default-base-is-moof: sample offsets are moof-relative — REQUIRED by
  // Chromium's MSE parser when no base_data_offset is carried
  const tfhd = fullbox("tfhd", 0, 0x020000, u32(trackId));
  const traf = box("traf", tfhd, tfdt, trun);
  const mfhd = fullbox("mfhd", 0, 0, u32(o.seq >>> 0));
  const moof = box("moof", mfhd, traf);
  const mdat = concat([u32(o.payload.length + 8), ascii4("mdat"), o.payload]);
  return concat([moof, mdat]);
}

/** moof + mdat for one audio fragment (no comp offsets). */
export function buildAudioFragment(o: {
  trackId?: number;
  seq: number;
  baseDts: number; // audio timescale units
  samples: { size: number; duration: number }[];
  payload: Uint8Array;
}): Uint8Array {
  const trackId = o.trackId ?? 2;
  const n = o.samples.length;
  const dataOffset = 92 + 8 * n; // moof(84+8n) + mdat header(8)
  const entries: Uint8Array[] = [];
  for (const s of o.samples) entries.push(u32(s.duration >>> 0), u32(s.size));
  const trun = fullbox("trun", 0, AUDIO_TRUN_FLAGS, u32(n), i32(dataOffset), ...entries);
  const tfdt = fullbox("tfdt", 0, 0, u32(o.baseDts >>> 0));
  const tfhd = fullbox("tfhd", 0, 0x020000, u32(trackId)); // default-base-is-moof
  const traf = box("traf", tfhd, tfdt, trun);
  const mfhd = fullbox("mfhd", 0, 0, u32(o.seq >>> 0));
  const moof = box("moof", mfhd, traf);
  const mdat = concat([u32(o.payload.length + 8), ascii4("mdat"), o.payload]);
  return concat([moof, mdat]);
}


/* ---- Matroska → AVCC normalisation --------------------------------- */

/** Matroska stores H.264 with NALU lengths sized by avcC.lengthSizeMinusOne
 *  (almost always 4). fMP4 requires exactly 4 — convert when needed. */
export function toAvc4ByteSamples(data: Uint8Array, lenSize: number): Uint8Array | null {
  if (lenSize === 4) return data;
  if (lenSize < 1 || lenSize > 4) return null;
  const nalus: Uint8Array[] = [];
  let p = 0;
  while (p + lenSize <= data.length) {
    let len = 0;
    for (let i = 0; i < lenSize; i++) len = len * 256 + data[p + i]!;
    p += lenSize;
    if (len <= 0 || p + len > data.length) return null;
    nalus.push(u32(len), data.subarray(p, p + len));
    p += len;
  }
  if (!nalus.length || p !== data.length) return null;
  return concat(nalus);
}
