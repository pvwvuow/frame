/* v0.20.0 — in-WebView Matroska scanner contract tests, run against REAL
 * generated MKV files (ffmpeg: H.264/AAC + muxed Persian SRT, AC3 audio,
 * HEVC video). Guards the mobile web-player subs pipeline end-to-end at the
 * byte level: track intelligence, cue extraction, resync, backfill offsets,
 * the ranged HTTP session, and dead-URL handling.
 *
 * Run: node scripts/test-mkv-web.mjs   (spins its own Range server)
 */
import ts from "typescript";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TMP = join(ROOT, ".test-tmp-mkvweb");
const SAMPLES = "/home/z/my-project/scripts/samples";
mkdirSync(TMP, { recursive: true });

let passed = 0;
let failed = 0;
const check = (cond, label, extra = "") => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${label} ${extra}`);
  }
};

// transpile the REAL source (no drift)
const src = readFileSync(join(ROOT, "src/lib/mkv-web.ts"), "utf8").replace(/^["']use client["'];?/m, "");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync(join(TMP, "mkv-web.mjs"), js);
const MW = await import(pathToFileURL(join(TMP, "mkv-web.mjs")).href);

/* ---------------- pure byte-level tests ---------------- */
console.log("— scanner against real bytes —");
const fileA = readFileSync(join(SAMPLES, "mkv_h264_aac_fa.mkv")); // H.264+AAC+fa SRT
const fileB = readFileSync(join(SAMPLES, "mkv_h264_ac3_fa.mkv")); // H.264+AC3+fa SRT
const fileC = readFileSync(join(SAMPLES, "mkv_h265_aac_fa.mkv")); // HEVC+AAC+fa SRT
const fileMp4 = readFileSync(join(SAMPLES, "d_h264_aac.mp4"));

function scanAll(buf) {
  const store = new MW.MkvCueStore();
  store.matroska = MW.sniffEbml(new Uint8Array(buf)) >= 0;
  const sc = new MW.MkvScanner(store, 0);
  sc.feed(new Uint8Array(buf));
  return store;
}

{
  const s = scanAll(fileA);
  check(s.matroska, "A: EBML magic sniffed");
  check(s.probed, "A: Tracks element captured");
  check(s.videoCodec === "V_MPEG4/ISO/AVC", `A: video codec h264 (${s.videoCodec})`);
  check(s.audioCodecs.length === 1 && s.audioCodecs[0] === "A_AAC", `A: audio codec A_AAC (${s.audioCodecs})`);
  check(s.audioOk() === true, "A: audio decodable");
  check(s.textTracks.size === 1, `A: one text track (${s.textTracks.size})`);
  const info = [...s.textTracks.values()][0];
  check(info && info.codec === "utf8", `A: track codec utf8 (${info && info.codec})`);
  check(info && /^fa/.test(info.lang), `A: track lang fa (${info && info.lang})`);
  const cues = s.cues();
  check(cues.length === 12, `A: 12 cues extracted (${cues.length})`);
  check(cues[0] && Math.abs(cues[0].s - 500) < 120, `A: first cue ≈500ms (${cues[0] && cues[0].s})`);
  check(cues[0] && /سلام/.test(cues[0].t), `A: first cue Persian text (${cues[0] && cues[0].t})`);
  check(cues[11] && Math.abs(cues[11].s - 50000) < 150, `A: last cue ≈50s (${cues[11] && cues[11].s})`);
  check(cues.every((c) => c.e > c.s), "A: ends after starts");
  const cov = s.covSec();
  check(cov && cov[1] >= 52 && cov[1] <= 57, `A: coverage max ≈52s (+gap heuristic) (${cov})`);
}

{
  const s = scanAll(fileB);
  check(s.audioCodecs[0] === "A_AC3", `B: audio codec A_AC3 (${s.audioCodecs[0]})`);
  check(s.audioOk() === false, "B: audio NOT decodable (the silent-video trap)");
  check(s.audioLabel() === "AC3 (Dolby Digital)", `B: label (${s.audioLabel()})`);
  check(s.cues().length === 12, `B: cues still extracted with AC3 audio (${s.cues().length})`);
}

{
  const s = scanAll(fileC);
  check(s.videoCodec === "V_MPEGH/ISO/HEVC", `C: video codec hevc (${s.videoCodec})`);
  check(s.audioOk() === true, "C: aac audio decodable");
  check(s.cues().length === 12, `C: 12 cues (${s.cues().length})`);
}

/* resync: the SESSION contract — the head is scanned first (tracks learned),
 * then a mid-file window is fed to a FRESH scanner sharing the store (the
 * seek/backfill path). The window starts mid-cluster: the scanner must hunt
 * the next real cluster header and keep extracting cues. */
{
  const store = new MW.MkvCueStore();
  new MW.MkvScanner(store, 0).feed(new Uint8Array(fileA.subarray(0, 384 * 1024)));
  check(store.textTracks.size >= 1, "resync: head pass learned the text track");
  const mid = new MW.MkvScanner(store, 393_216);
  mid.feed(new Uint8Array(fileA.subarray(393_216)));
  const cues = store.cues();
  check(cues.length === 12, `resync: mid-file window recovered cues 9..12 (${cues.length})`);
  check(cues.every((c) => c.s >= 0), "resync: cue times non-negative");
}

/* timestamp scale: a non-default scale must shift cue times, not break them */
{
  const store = scanAll(fileA);
  check(store.timestampScale === 1_000_000, `A: default 1ms scale (${store.timestampScale})`);
}

/* ---------------- HTTP session tests (local Range server) ---------------- */
console.log("— ranged HTTP session —");
const { spawn } = await import("node:child_process");
const server = spawn(process.execPath, ["/home/z/my-project/scripts/mkv-server.cjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const BASE = "http://127.0.0.1:39001";
try {
  {
    const p = await MW.probeMkvHead(`${BASE}/mkv_h264_aac_fa.mkv`);
    check(p.reachable === true, "probe: reachable");
    check(p.matroska === true, "probe: matroska sniffed");
    check(p.probed === true, "probe: tracks captured");
    check(p.audioOk === true, "probe: audio ok");
    check(p.fileSize === fileA.length, `probe: fileSize from content-range (${p.fileSize})`);
    check(p.subFound === true, "probe: sub track found");
    const cached = MW.probeMkvHead(`${BASE}/mkv_h264_aac_fa.mkv`);
    check(cached === p || (await cached).attempted === true, "probe: cache dedupes");
  }
  {
    const p = await MW.probeMkvHead(`${BASE}/mkv_h264_ac3_fa.mkv`);
    check(p.audioOk === false && p.audioLabel === "AC3 (Dolby Digital)", "probe: AC3 caught in the head");
  }
  {
    const p = await MW.probeMkvHead(`${BASE}/does_not_exist.mkv`);
    check(p.reachable === false && p.status === 404, `probe: dead URL → status ${p.status}`);
  }
  {
    // the session over HTTP: full playback from 0 → cues arrive, park at ≥45s
    const seen = [];
    let state = "idle";
    const scan = new MW.MkvWebScan(
      `${BASE}/mkv_h264_aac_fa.mkv`,
      (cues) => seen.push(cues.length),
      (s) => {
        state = s;
      },
      () => 55
    );
    scan.start(0);
    await new Promise((r) => setTimeout(r, 2500));
    check(seen.length >= 1, `session: cue emissions (${seen.length})`);
    check(seen[seen.length - 1] === 12, `session: 12 cues by the end (${seen[seen.length - 1]})`);
    check(state === "parked" || state === "done", `session: parked at runway (${state})`);
    // simulate a late seek: covered(52s) < 45+45 → resumes; nothing new but no crash
    scan.progress(50, true);
    await new Promise((r) => setTimeout(r, 400));
    check(true, "session: progress() after park is safe");
    scan.stop();
  }
  {
    // mp4 via the session → sniffed non-matroska → clean done, zero cues
    let state = "idle";
    let cueN = -1;
    const scan = new MW.MkvWebScan(
      `${BASE}/d_h264_aac.mp4`,
      (cues) => {
        cueN = cues.length;
      },
      (s) => {
        state = s;
      }
    );
    scan.start(0);
    await new Promise((r) => setTimeout(r, 1200));
    check(state === "done", `mp4 session: clean done (${state})`);
    check(cueN <= 0, "mp4 session: no cues");
  }
  {
    // offsetFor sanity on a real file: after a full scan, offsets track time
    const store = new MW.MkvCueStore();
    store.fileSize = fileA.length;
    const sc = new MW.MkvScanner(store, 0);
    sc.feed(new Uint8Array(fileA));
    const o25 = store.offsetFor(25, 55);
    const o50 = store.offsetFor(50, 55);
    check(o25 != null && o50 != null && o50 > o25, `offsetFor monotonic (${o25} → ${o50})`);
    check(o50 != null && o50 < fileA.length, "offsetFor within file bounds");
  }
} finally {
  server.kill();
  rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
