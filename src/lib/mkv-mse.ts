"use client";

/* v0.21.0 — the MSE fallback transport: Matroska → fMP4 → MediaSource.
 *
 * WHEN THIS RUNS: the plain <video src=mkv> path failed on the device
 * (MEDIA_ERR_SRC_NOT_SUPPORTED/DECODE — the WebView cannot demux Matroska)
 * while the file itself is web-playable content (H.264 + AAC). Instead of
 * surrendering the catalog to the no-cinema native player, the web cinema
 * player demuxes the SAME bytes in JS (mkv-web.ts scanner) and re-boxes
 * them into fragmented MP4 — a container every Chromium decodes.
 *
 * Transport is the proven ranged reader (CapacitorHttp on Android, fetch
 * elsewhere). One session = one source URL, one MediaSource, up to two
 * SourceBuffers (video/audio). Seeks RESTART the session cleanly (no
 * timestamp-regression edge cases) — the player debounces the gesture.
 *
 * BANDWIDTH CONTRACT (the v0.20.0 lesson): the session paces its chunk
 * loop through the player's pace() hook — it never rips bytes while the
 * buffer is starving, and parks once ~30s of media is buffered ahead.
 */

import {
  computeMseCapability,
  fetchRange,
  MkvCueStore,
  MkvScanner,
  sniffEbml,
  type MkvFrame,
} from "./mkv-web";
import {
  buildAudioFragment,
  buildAudioInit,
  buildVideoFragment,
  buildVideoInit,
  parseAsc,
  toAvc4ByteSamples,
} from "./fmp4";

export type MseState = "idle" | "probing" | "buffering" | "parked" | "done" | "dead" | "stopped";

const HEAD_BYTES = 384 << 10;
const CHUNK = 768 << 10;
const PARK_AHEAD_SEC = 30;
const FRAG_MIN_SEC = 1.5; // close a video fragment at the next keyframe after this span
const FRAG_MAX_SEC = 5; // force-close regardless of keyframes
const AUDIO_FRAG_SEC = 1.0;
const STALL_MS = 16000;

type FrameAcc = { data: Uint8Array; ptsMs: number; key: boolean };

/** serialize appendBuffer() calls on one SourceBuffer */
class AppendQueue {
  private q: ((done: () => void) => void)[] = [];
  private busy = false;
  constructor(private sb: SourceBuffer) {}
  append(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.q.push((done) => {
        const onEnd = () => {
          this.sb.removeEventListener("updateend", onEnd);
          this.sb.removeEventListener("error", onErr);
          resolve();
          done();
        };
        const onErr = () => {
          this.sb.removeEventListener("updateend", onEnd);
          this.sb.removeEventListener("error", onErr);
          reject(new Error("sb-append:error-event"));
          done();
        };
        this.sb.addEventListener("updateend", onEnd);
        this.sb.addEventListener("error", onErr);
        try {
          this.sb.appendBuffer(data as unknown as BufferSource);
        } catch (e) {
          this.sb.removeEventListener("updateend", onEnd);
          this.sb.removeEventListener("error", onErr);
          reject(e instanceof Error ? e : new Error(String(e)));
          done();
        }
      });
      this.drain();
    });
  }
  private drain() {
    if (this.busy || !this.q.length) return;
    const next = this.q.shift()!;
    this.busy = true;
    next(() => {
      this.busy = false;
      this.drain();
    });
  }
  get pending(): number {
    return this.q.length + (this.busy ? 1 : 0);
  }
}

export class MkvMseSession {
  private store = new MkvCueStore();
  private state: MseState = "idle";
  private stopped = false;
  private cursor: number | null = null;
  private scanner: MkvScanner | null = null;
  private ms: MediaSource | null = null;
  private objUrl: string | null = null;
  private vsb: SourceBuffer | null = null;
  private asb: SourceBuffer | null = null;
  private vq: AppendQueue | null = null;
  private aq: AppendQueue | null = null;
  private vAcc: FrameAcc[] = [];
  private aAcc: FrameAcc[] = [];
  private needKeyStart = true;
  private vPeriod90 = 3750; // 24fps initial guess, refined by min-delta
  private vPrevPtsMs: number | null = null;
  private vNextDts90: number | null = null;
  private aRate = 0;
  private aNextDts: number | null = null;
  private lenSize = 4;
  private seq = 1;
  private lastProgressAt = Date.now();
  private appendSec = 0; // media seconds appended (video grid)
  private stallTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly url: string,
    private hooks: {
      onObjectUrl?: (u: string) => void;
      onState?: (s: MseState) => void;
      /** playback cannot continue on this transport — the caller ladders */
      onFatal?: (reason: string) => void;
      pace?: () => Promise<void>;
    }
  ) {}

  get state_(): MseState {
    return this.state;
  }
  get appendedSec(): number {
    return this.appendSec;
  }
  get objectUrl(): string | null {
    return this.objUrl;
  }
  get store_(): MkvCueStore {
    return this.store;
  }

  private setState(s: MseState) {
    this.state = s;
    this.hooks.onState?.(s);
  }

  private fail(reason: string) {
    if (this.state === "dead" || this.state === "stopped") return;
    this.setState("dead");
    this.cleanupMedia();
    this.hooks.onFatal?.(reason);
  }

  async start(startSec: number): Promise<void> {
    this.setState("probing");
    const head = await fetchRange(this.url, 0, HEAD_BYTES - 1);
    if (this.stopped) return;
    if (!head.ok) {
      this.fail(`head:${head.status}`);
      return;
    }
    this.store.fileSize = head.total || this.store.fileSize;
    if (sniffEbml(head.data) < 0) {
      this.fail("not-matroska");
      return;
    }
    this.scanner = new MkvScanner(this.store, 0, (f) => this.onFrame(f));
    this.scanner.feed(head.data);
    this.bytesCount = head.data.length;
    const cap = computeMseCapability(this.store);
    if (!cap.supported) {
      this.fail(cap.reason);
      return;
    }
    const v = this.store.videoMediaTrack;
    const a = this.store.audioMediaTrack;
    if (!v?.private) {
      this.fail("no-video-config");
      return;
    }
    this.lenSize = (v.private[4]! & 0x03) + 1;
    if (a?.private) {
      const asc = parseAsc(a.private);
      if (!asc) {
        this.fail("bad-ASC");
        return;
      }
      this.aRate = asc.sampleRate;
    }
    // attach — the element renders session.objectUrl once onObjectUrl fires
    const ms = new MediaSource();
    this.ms = ms;
    this.objUrl = URL.createObjectURL(ms);
    this.hooks.onObjectUrl?.(this.objUrl);
    await new Promise<void>((resolve) => {
      ms.addEventListener("sourceopen", () => resolve(), { once: true });
    });
    if (this.stopped) return;
    try {
      this.vsb = ms.addSourceBuffer(`video/mp4; codecs="${cap.videoCodec}"`);
      if (a) this.asb = ms.addSourceBuffer(`audio/mp4; codecs="${cap.audioCodec}"`);
    } catch (e) {
      this.fail(`sb-create:${String(e)}`);
      return;
    }
    this.vq = new AppendQueue(this.vsb);
    if (this.asb) this.aq = new AppendQueue(this.asb);
    try {
      await this.vq.append(buildVideoInit({ width: v.width, height: v.height, avcC: v.private, trackId: 1 }));
      if (a && this.aq) await this.aq.append(buildAudioInit({ asc: a.private!, sampleRate: this.aRate, channels: parseAsc(a.private!)?.channels ?? 2, trackId: 2 }));
    } catch (e) {
      this.fail(`init:${String(e)}`);
      return;
    }
    if (this.store.durationSec && Number.isFinite(this.store.durationSec)) {
      try {
        ms.duration = this.store.durationSec;
      } catch {
        /* older engines */
      }
    }
    // start position: resume far into the file → jump near the keyframe
    let cursor = head.data.length;
    if (startSec > 30) {
      const dur = this.store.durationSec ?? 0;
      const est = this.store.offsetFor(Math.max(0, startSec - 10), dur);
      if (est != null) cursor = Math.max(HEAD_BYTES, est);
      this.needKeyStart = true;
    }
    this.cursor = cursor;
    if (cursor > head.data.length) this.scanner = new MkvScanner(this.store, cursor, (f) => this.onFrame(f));
    this.setState("buffering");
    this.startStallWatch();
    await this.pump();
  }

  private bytesCount = 0;

  private startStallWatch() {
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.stallTimer = setInterval(() => {
      if (this.stopped || this.state !== "buffering") return;
      if (Date.now() - this.lastProgressAt > STALL_MS) this.fail("stall");
    }, 4000);
  }

  /* ---- demux frame sink ---- */
  private onFrame(f: MkvFrame) {
    if (this.stopped) return;
    if (f.ptsMs < 0) return; // encoder-priming frame — cannot feed a u32 timeline
    const v = this.store.videoMediaTrack;
    if (v && f.track === v.num) {
      if (this.vPrevPtsMs != null) {
        const d = f.ptsMs - this.vPrevPtsMs;
        if (d >= 1 && d < 1000) this.vPeriod90 = Math.min(this.vPeriod90, Math.max(1, Math.round(d * 90)));
      }
      this.vPrevPtsMs = f.ptsMs;
      this.vAcc.push({ data: f.data, ptsMs: f.ptsMs, key: f.key });
      this.flushVideo(false);
    } else if (f.track === this.store.audioMediaTrack?.num) {
      // v0.21.0 FIX — no aRate gate here: aRate is parsed AFTER the head
      // scan, and gating on it silently dropped the head's first ~8s of
      // audio frames (buffered started at 8.2 instead of 0).
      this.aAcc.push({ data: f.data, ptsMs: f.ptsMs, key: false });
      this.flushAudio(false);
    }
  }

  /** grid anchor = the FIRST appended frame's pts (absolute media time).
   *  v0.21.0 FIX — when the SourceBuffers don't exist yet (frames arriving
   *  from the head scan, which covers ~8s of media), RETURN WITHOUT
   *  CLEARING the accumulator: the previous code built the fragment and
   *  then dropped it into a null queue (vq?.append) — silently losing every
   *  frame the head had produced (buffered=[8.2-10] instead of [0-10]). */
  private flushVideo(force: boolean) {
    if (!this.vAcc.length || !this.vq) return;
    const first = this.vAcc[0]!;
    const last = this.vAcc[this.vAcc.length - 1]!;
    const spanMs = last.ptsMs - first.ptsMs;
    if (this.needKeyStart) {
      const k = this.vAcc.findIndex((fr) => fr.key);
      if (k > 0) this.vAcc = this.vAcc.slice(k); // drop pre-key frames
      else if (k < 0 && spanMs < FRAG_MAX_SEC * 2000) return; // wait for a keyframe
    }
    const acc = this.vAcc;
    if (!acc.length) return;
    const f0 = acc[0]!;
    const fn = acc[acc.length - 1]!;
    const keyReady = acc.some((fr) => fr.key) && fn.ptsMs - f0.ptsMs >= FRAG_MIN_SEC * 1000;
    if (!force && !keyReady && fn.ptsMs - f0.ptsMs < FRAG_MAX_SEC * 1000) return;
    if (this.vNextDts90 == null) this.vNextDts90 = Math.round(f0.ptsMs * 90);
    const payloadParts: Uint8Array[] = [];
    const samples: { size: number; duration: number; compOffset: number; key: boolean }[] = [];
    let dts = this.vNextDts90;
    let dropped = false;
    for (const fr of acc) {
      const data = toAvc4ByteSamples(fr.data, this.lenSize);
      if (!data) {
        dropped = true;
        break;
      }
      const comp = Math.round(fr.ptsMs * 90) - dts;
      samples.push({ size: data.length, duration: this.vPeriod90, compOffset: comp, key: fr.key });
      payloadParts.push(data);
      dts += this.vPeriod90;
    }
    if (dropped || !samples.length) {
      this.vAcc = [];
      return;
    }
    const frag = buildVideoFragment({
      seq: this.seq++,
      baseDts: this.vNextDts90,
      samples,
      payload: concatBytes(payloadParts),
    });
    this.vNextDts90 = dts;
    this.appendSec = Math.max(this.appendSec, (dts - this.vPeriod90) / 90000);
    this.vAcc = [];
    this.needKeyStart = false;
    const epoch = this.epoch;
    void this.vq
      ?.append(frag)
      .then(() => {
        this.lastProgressAt = Date.now();
      })
      .catch((e) => {
        if (epoch === this.epoch && !this.stopped) this.fail(`v-append:${String(e)}`);
      });
  }

  private flushAudio(force: boolean) {
    if (!this.aAcc.length || !this.aq || !this.aRate) return;
    const f0 = this.aAcc[0]!;
    const fn = this.aAcc[this.aAcc.length - 1]!;
    if (!force && fn.ptsMs - f0.ptsMs < AUDIO_FRAG_SEC * 1000) return;
    if (this.aNextDts == null) this.aNextDts = Math.round((f0.ptsMs * this.aRate) / 1000);
    const payloadParts: Uint8Array[] = [];
    const samples: { size: number; duration: number }[] = [];
    let dts = this.aNextDts;
    for (const fr of this.aAcc) {
      if (!fr.data.length) continue;
      samples.push({ size: fr.data.length, duration: 1024 });
      payloadParts.push(fr.data);
      dts += 1024;
    }
    if (!samples.length) {
      this.aAcc = [];
      return;
    }
    const frag = buildAudioFragment({ seq: this.seq++, baseDts: this.aNextDts, samples, payload: concatBytes(payloadParts) });
    this.aNextDts = dts;
    this.aAcc = [];
    const epoch = this.epoch;
    void this.aq
      .append(frag)
      .then(() => {
        this.lastProgressAt = Date.now();
      })
      .catch((e) => {
        if (epoch === this.epoch && !this.stopped) this.fail(`a-append:${String(e)}`);
      });
  }

  /* ---- fetch loop ---- */
  private pumping = false;
  private epoch = 0;

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    const myEpoch = this.epoch;
    try {
      while (!this.stopped && this.epoch === myEpoch && this.cursor != null) {
        const size = this.store.fileSize || 0;
        if (size && this.cursor >= size) break;
        await this.hooks.pace?.();
        if (this.stopped || this.epoch !== myEpoch) return;
        const r = await fetchRange(this.url, this.cursor, this.cursor + CHUNK - 1);
        if (this.stopped || this.epoch !== myEpoch) return;
        if (!r.ok) {
          if (r.status === 416) break; // EOF
          if (r.status === 0) {
            this.setState("parked"); // transport hiccup — progress() re-wakes
            return;
          }
          this.fail(`fetch:${r.status}`);
          return;
        }
        if (!r.data.length) break;
        this.bytesCount += r.data.length;
        if (r.total) this.store.fileSize = r.total;
        this.lastProgressAt = Date.now();
        this.scanner!.feed(r.data);
        this.cursor += r.data.length;
        // park when enough media is buffered ahead of the playhead
        if (this.appendSec - (this.posSec || 0) >= PARK_AHEAD_SEC) {
          this.setState("parked");
          return;
        }
      }
      if (this.stopped || this.epoch !== myEpoch) return;
      // EOF — flush the tail and close. The Info Duration can LIE (muxers
      // killed mid-write leave a stale placeholder): endOfStream() plus an
      // explicit set from the appended grid corrects it to the real length.
      this.flushVideo(true);
      this.flushAudio(true);
      try {
        if (this.ms && this.ms.readyState === "open") {
          const realDur = (this.vNextDts90 ?? 0) / 90000;
          if (Number.isFinite(realDur) && realDur > 0) this.ms.duration = realDur;
          this.ms.endOfStream();
        }
      } catch {
        /* already ended */
      }
      this.setState("done");
    } finally {
      if (this.epoch === myEpoch) this.pumping = false;
    }
  }

  private posSec = 0;

  /** the player feeds this on timeupdate/seek/visibility — parks wake here */
  progress(sec: number) {
    this.posSec = sec;
    if (this.state === "parked" && this.appendSec - sec < PARK_AHEAD_SEC) {
      this.setState("buffering");
      void this.pump();
    }
  }

  /** v1 seek = clean restart (fresh MediaSource, no timestamp regressions).
   *  The player debounces the gesture; the browser re-seeks to `sec` once
   *  the fresh timeline covers it. */
  seekTo(sec: number) {
    this.epoch += 1;
    this.pumping = false;
    this.vAcc = [];
    this.aAcc = [];
    this.needKeyStart = true;
    this.vNextDts90 = null;
    this.aNextDts = null;
    this.vPrevPtsMs = null;
    this.vPeriod90 = Math.max(this.vPeriod90, 1);
    this.appendSec = 0;
    this.cleanupMedia(false);
    if (this.objUrl) {
      // the element is about to be re-pointed; release the old blob URL
      try {
        URL.revokeObjectURL(this.objUrl);
      } catch {
        /* ignore */
      }
      this.objUrl = null;
    }
    this.setState("probing");
    const run = async () => {
      const dur = this.store.durationSec ?? 0;
      const est = this.store.offsetFor(Math.max(0, sec - 8), dur || (this.videoDur || 0));
      let cursor = est != null ? Math.max(HEAD_BYTES, est) : HEAD_BYTES;
      // re-attach fresh
      const ms = new MediaSource();
      this.ms = ms;
      this.objUrl = URL.createObjectURL(ms);
      this.hooks.onObjectUrl?.(this.objUrl);
      await new Promise<void>((resolve) => ms.addEventListener("sourceopen", () => resolve(), { once: true }));
      if (this.stopped || this.state === "stopped") return;
      const cap = computeMseCapability(this.store);
      if (!cap.supported) {
        this.fail(cap.reason);
        return;
      }
      try {
        this.vsb = ms.addSourceBuffer(`video/mp4; codecs="${cap.videoCodec}"`);
        this.asb = this.store.audioMediaTrack && cap.audioCodec ? ms.addSourceBuffer(`audio/mp4; codecs="${cap.audioCodec}"`) : null;
      } catch (e) {
        this.fail(`sb-create:${String(e)}`);
        return;
      }
      this.vq = new AppendQueue(this.vsb);
      this.aq = this.asb ? new AppendQueue(this.asb) : null;
      const v = this.store.videoMediaTrack;
      const a = this.store.audioMediaTrack;
      try {
        if (v?.private) await this.vq.append(buildVideoInit({ width: v.width, height: v.height, avcC: v.private, trackId: 1 }));
        if (a?.private && this.aq && this.aRate) await this.aq.append(buildAudioInit({ asc: a.private, sampleRate: this.aRate, channels: parseAsc(a.private)?.channels ?? 2, trackId: 2 }));
      } catch (e) {
        this.fail(`init:${String(e)}`);
        return;
      }
      if (this.store.durationSec && Number.isFinite(this.store.durationSec)) {
        try {
          ms.duration = this.store.durationSec;
        } catch {
          /* ignore */
        }
      }
      this.cursor = cursor;
      this.scanner = new MkvScanner(this.store, cursor, (f) => this.onFrame(f));
      this.setState("buffering");
      void this.pump();
    };
    void run();
  }

  private videoDur = 0;

  noteVideoDuration(d: number) {
    if (Number.isFinite(d) && d > 0) this.videoDur = d;
  }

  stop() {
    this.stopped = true;
    this.epoch += 1;
    this.setState("stopped");
    this.cleanupMedia();
  }

  private cleanupMedia(revoke = true) {
    if (this.stallTimer) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
    try {
      if (this.ms && this.ms.readyState === "open") this.ms.endOfStream();
    } catch {
      /* ignore */
    }
    this.vsb = null;
    this.asb = null;
    this.vq = null;
    this.aq = null;
    if (revoke && this.objUrl) {
      try {
        URL.revokeObjectURL(this.objUrl);
      } catch {
        /* ignore */
      }
      this.objUrl = null;
    }
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
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
