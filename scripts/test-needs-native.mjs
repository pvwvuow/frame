/* v0.16.1 — needsNativePlayer classifier contract test.
 *
 * Node ≥23.6 strips TS types natively, so the REAL source is imported
 * directly (no transpile drift). Guards the exact regression the user hit:
 * «یه سری فیلما اصلاً پلی نمیشن» — extension-less/token URLs and legacy
 * containers fell through to the WebView (no Matroska demuxer) instead of
 * the native Media3 player.
 *
 * Run: node scripts/test-needs-native.mjs
 */
import { needsNativePlayer, isMkvUrl, mediaSrc } from "../src/lib/video-url.ts";

let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
};

/* ---- direct expectations ------------------------------------------------ */
const NATIVE = [
  ["mkv extension", "https://dl.example.com/movie.mkv"],
  ["mk3d extension", "https://dl.example.com/movie.mk3d"],
  ["avi", "https://dl.example.com/movie.avi"],
  ["wmv", "https://dl.example.com/movie.wmv"],
  ["mpg/mpeg/ts/flv", "https://dl.example.com/movie.ts"],
  ["token URL (redirector, no extension)", "https://cdn.example.com/dl/8a71f"],
  ["token URL with query", "https://x.example.com/get?id=42&k=abc"],
  ["http token URL", "http://cdn.example.com/dl/8a71f"],
  ["local offline file", "local:/data/user/0/ir.frame.nama/files/videos/abc.mkv"],
];
for (const [name, url] of NATIVE) ok(`native: ${name}`, needsNativePlayer(url) === true);
ok("native: empty string stays false", needsNativePlayer("") === false);

const WEB = [
  ["mp4", "https://dl.example.com/movie.mp4"],
  ["m4v", "https://dl.example.com/movie.m4v"],
  ["mov", "https://dl.example.com/movie.mov"],
  ["webm", "https://dl.example.com/movie.webm"],
  ["m3u8", "https://dl.example.com/stream.m3u8"],
  ["mp4 with query", "https://dl.example.com/movie.mp4?token=x"],
];
for (const [name, url] of WEB) ok(`webview-safe: ${name}`, needsNativePlayer(url) === false);

/* v0.17.0 — plain http:// never rides the WebView: release builds disable
 * mixed content + cleartext (Play-Protect hardening) and Media3 has no such
 * restriction. Even http://*.mp4 goes native now. */
ok("native: plain-http mp4 (mixed content is off in release)", needsNativePlayer("http://dl.example.com/movie.mp4") === true);
ok("native: plain-http webm", needsNativePlayer("http://dl.example.com/movie.webm") === true);
ok("native: plain-http m3u8", needsNativePlayer("http://dl.example.com/stream.m3u8") === true);
ok("webview-safe: https mp4 still light path", needsNativePlayer("https://dl.example.com/movie.mp4") === false);

/* ---- desktop-parity invariant --------------------------------------------
 * Every URL the desktop sends through the Electron proxy (isMkvUrl OR an
 * extension-less/token http URL) MUST go native on Android — there is no
 * proxy there to sniff the container. (webm is the one intentional split:
 * the WebView demuxes it, so it stays on the light web path.) */
const PROXY_CLASS = [
  "https://x.example.com/dl/8a71f",
  "https://x.example.com/movie.mkv",
  "https://x.example.com/movie.mkv?s=1",
  "http://x.example.com/token/aBcD123",
];
for (const url of PROXY_CLASS) {
  const desktopProxied = isMkvUrl(url) || (/^https?:\/\//i.test(url) && !/\.(mp4|m4v|mkv|mk3d|webm|avi|mov|wmv|mpg|mpeg|ts|flv)(\?|#|$)/i.test(url));
  ok(
    `parity: desktop-proxy URL rides native (${url})`,
    !desktopProxied || needsNativePlayer(url) || /\.webm(\?|$)/i.test(url)
  );
}

/* ---- desktop routing untouched -------------------------------------------
 * mediaSrc behavior for the web/Electron path must not change: proxy base
 * null → raw URL; mkv → /stream; plain mp4 → direct. */
ok("desktop: no proxy → raw passthrough", mediaSrc("https://x/y.mkv", null) === "https://x/y.mkv");
ok(
  "desktop: mkv → proxy stream",
  mediaSrc("https://x/y.mkv", "http://127.0.0.1:25500") === "http://127.0.0.1:25500/stream?u=" + encodeURIComponent("https://x/y.mkv")
);
ok("desktop: mp4 direct", mediaSrc("https://x/y.mp4", "http://127.0.0.1:25500") === "https://x/y.mp4");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
