/* v0.16.1 — needsNativePlayer classifier contract test.
 * v0.19.0 — REWRITTEN for the WEB-FIRST contract. The old premise («the
 * WebView cannot demux Matroska») was wrong: Chromium sniffs BYTES, not
 * extensions, and the desktop app has been playing these exact MKVs through
 * a 1:1 byte pipe for years. needsNativePlayer keeps the STRICT meaning
 * «the WebView can NEVER own this» (local files, cleartext http in release
 * builds, legacy containers with no demuxer); MKV and token URLs moved to
 * the web-first «fragile» class — classifyUrl is the routing source now.
 *
 * Node ≥23.6 strips TS types natively, so the REAL source is imported
 * directly (no transpile drift).
 *
 * Run: node scripts/test-needs-native.mjs
 */
import { needsNativePlayer, classifyUrl, isMkvUrl, mediaSrc } from "../src/lib/video-url.ts";

let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
};

/* ---- classifyUrl — the v0.19.0 routing source of truth ------------------ */
const WEB = [
  ["mp4", "https://dl.example.com/movie.mp4"],
  ["m4v", "https://dl.example.com/movie.m4v"],
  ["mov", "https://dl.example.com/movie.mov"],
  ["webm", "https://dl.example.com/movie.webm"],
  ["m3u8", "https://dl.example.com/stream.m3u8"],
  ["mp4 with query", "https://dl.example.com/movie.mp4?token=x"],
];
for (const [name, url] of WEB) ok(`class web: ${name}`, classifyUrl(url) === "web");

const FRAGILE = [
  ["mkv extension (H.264/AAC MKVs play on web)", "https://dl.example.com/movie.mkv"],
  ["mk3d extension", "https://dl.example.com/movie.mk3d"],
  ["mkv with query", "https://dl.example.com/movie.mkv?s=1"],
  ["token URL (redirector, no extension)", "https://cdn.example.com/dl/8a71f"],
  ["token URL with query", "https://x.example.com/get?id=42&k=abc"],
];
for (const [name, url] of FRAGILE) ok(`class fragile (web-first): ${name}`, classifyUrl(url) === "fragile");

const NATIVE = [
  ["avi (no Chromium demuxer)", "https://dl.example.com/movie.avi"],
  ["wmv", "https://dl.example.com/movie.wmv"],
  ["mpg/mpeg/ts/flv", "https://dl.example.com/movie.ts"],
  ["http token URL (cleartext blocked in release)", "http://cdn.example.com/dl/8a71f"],
  ["local offline file", "local:/data/user/0/ir.frame.nama/files/videos/abc.mkv"],
];
for (const [name, url] of NATIVE) ok(`class native: ${name}`, classifyUrl(url) === "native");
ok("class: empty string stays web (harmless idle)", classifyUrl("") === "web");
ok("class: plain-http mp4 → native (mixed content off in release)", classifyUrl("http://dl.example.com/movie.mp4") === "native");
ok("class: plain-http mkv → native", classifyUrl("http://dl.example.com/movie.mkv") === "native");

/* ---- needsNativePlayer — the STRICT «WebView can never own it» predicate -
 * Consumers: the desktop player's handoff block (dead on Electron) and the
 * mobile «سوییچ به نسخه وب‌سازگار» gate, where a switch must land on a
 * source GUARANTEED web-playable. */
ok("strict: mkv NO LONGER preemptive-native (web-first now)", needsNativePlayer("https://dl.example.com/movie.mkv") === false);
ok("strict: token URL NO LONGER preemptive-native", needsNativePlayer("https://cdn.example.com/dl/8a71f") === false);
ok("strict: avi/wmv/ts still native", needsNativePlayer("https://x/a.avi") === true && needsNativePlayer("https://x/a.wmv") === true && needsNativePlayer("https://x/a.ts") === true);
ok("strict: cleartext http still native", needsNativePlayer("http://dl.example.com/movie.mp4") === true);
ok("strict: local: still native", needsNativePlayer("local:/data/user/0/ir.frame.nama/files/videos/abc.mkv") === true);
ok("strict: empty string stays false", needsNativePlayer("") === false);
ok("strict: web-safe ext still false", needsNativePlayer("https://dl.example.com/movie.mp4") === false && needsNativePlayer("https://dl.example.com/stream.m3u8") === false);

/* ---- desktop-parity invariant --------------------------------------------
 * The Electron proxy still routes every MKV + extension-less/token URL (the
 * desktop sniff/subtitle pipeline) — mediaSrc behavior must not change. */
ok(
  "desktop: no proxy → raw passthrough",
  mediaSrc("https://x/y.mkv", null) === "https://x/y.mkv"
);
ok(
  "desktop: mkv → proxy stream",
  mediaSrc("https://x/y.mkv", "http://127.0.0.1:25500") === "http://127.0.0.1:25500/stream?u=" + encodeURIComponent("https://x/y.mkv")
);
ok("desktop: mp4 direct", mediaSrc("https://x/y.mp4", "http://127.0.0.1:25500") === "https://x/y.mp4");
ok("desktop: token URL → proxy stream (sniff)", mediaSrc("https://x/dl/8a71f", "http://127.0.0.1:25500") === "http://127.0.0.1:25500/stream?u=" + encodeURIComponent("https://x/dl/8a71f"));
ok("desktop: isMkvUrl unchanged", isMkvUrl("https://x/a.mkv") === true && isMkvUrl("https://x/a.mp4") === false);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
