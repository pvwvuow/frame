/* v0.16.2 — mobile playback ownership + race-proof ladder contract tests.
 *
 * Guards the structural rework: declarative owner resolution, the
 * duplicate-error echo guard, the single ladder terminator and the notice
 * dedupe — the exact mechanics behind «پیام اتصال برقرار نشد روی فیلمی که
 * دارد پخش می‌شود».
 *
 * The lib imports "./video-url" extension-less (bundler-style), which node's
 * ESM resolver rejects — so both sources are transpiled here with the repo's
 * own typescript package and the specifier rewritten. No transpile drift:
 * the REAL sources are what get tested.
 *
 * Run: node scripts/test-mobile-playback.mjs
 */
import ts from "typescript";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TMP = join(ROOT, ".test-tmp-playback");
mkdirSync(TMP, { recursive: true });

const emit = (rel, outName, rewrite) => {
  const src = readFileSync(join(ROOT, rel), "utf8").replace(/^["']use client["'];?/m, "");
  let js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  if (rewrite) js = js.replace(/from "\.\/video-url"/g, 'from "./video-url.mjs"');
  writeFileSync(join(TMP, outName), js);
};
emit("src/lib/video-url.ts", "video-url.mjs");
emit("src/lib/mobile-playback.ts", "mobile-playback.mjs", true);
const { resolveOwner, shouldLadderAdvance, isLadderExhausted, isDuplicateNotice } = await import(
  pathToFileURL(join(TMP, "mobile-playback.mjs")).href
);
const { classifyUrl, needsNativePlayer } = await import(
  pathToFileURL(join(TMP, "video-url.mjs")).href
);

let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
};

/* ---- classifyUrl (v0.19.0 WEB-FIRST) --------------------------------------
 * The catalog is ~all MKV: routing every .mkv straight to native handed the
 * WHOLE catalog to the player without the cinema. v0.19.0 splits three ways:
 * web (sniffs+plays reliably) / fragile (web-FIRST, native = fallback) /
 * native (the WebView can never own it). */
ok("class: plain mp4 → web", classifyUrl("https://x/a.mp4") === "web");
ok("class: m3u8 → web", classifyUrl("https://x/a.m3u8") === "web");
ok("class: mkv → fragile (web-first, Media3 fallback)", classifyUrl("https://x/a.mkv") === "fragile");
ok("class: token/extension-less https → fragile (Chromium sniffs BYTES)", classifyUrl("https://x/dl/8a71f") === "fragile");
ok("class: avi → native (no Chromium demuxer)", classifyUrl("https://x/a.avi") === "native");
ok("class: wmv/ts/flv/mpg → native", classifyUrl("https://x/a.ts") === "native" && classifyUrl("https://x/a.flv") === "native");
ok("class: cleartext http → native (release WebView blocks it)", classifyUrl("http://x/a.mp4") === "native");
ok("class: local: download → native", classifyUrl("local:/data/user/0/ir.frame.nama/files/dl/x.mkv") === "native");
ok("needsNative (STRICT): only what the WebView can never own", needsNativePlayer("https://x/a.mkv") === false && needsNativePlayer("https://x/dl/8a71f") === false && needsNativePlayer("https://x/a.avi") === true && needsNativePlayer("local:/f/x.mkv") === true && needsNativePlayer("http://x/a.mp4") === true);

/* ---- resolveOwner --------------------------------------------------------*/
/* v0.19.0 — web-first auto: web AND fragile classes ride the WebView
 * bridge-INDEPENDENTLY (Chromium sniffs the bytes; Media3 is the FALLBACK
 * rung, wired in PlayerMobile's exhaustion path). Only the native class
 * consults the tri-state bridge probe. */
ok("owner: probing + mkv → web (web-first — no probe dependency)", resolveOwner({ hasBridge: null, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv" }) === "web");
ok("owner: probing + token URL → web", resolveOwner({ hasBridge: null, cinemaActive: false, proxyReady: true, url: "https://x/dl/8a71f" }) === "web");
ok("owner: probing + web-safe mp4 → web (never wait for the probe)", resolveOwner({ hasBridge: null, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4" }) === "web");
ok("owner: probed DEAD plugin + mkv → STILL web (honest web attempt first)", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv" }) === "web");
ok("owner: probed DEAD plugin + local: download → unsupported", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "local:/data/user/0/ir.frame.nama/files/dl/x.mkv" }) === "unsupported");
ok("owner: probed DEAD plugin still plays mp4 in WebView", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4" }) === "web");
ok("owner: proxy unresolved yet → pending (no decision without the base)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: false, url: "https://x/a.mkv" }) === "pending");
ok("owner: cinema rides the web video even for MKV", resolveOwner({ hasBridge: true, cinemaActive: true, proxyReady: true, url: "https://x/a.mkv" }) === "web");
ok("owner: mkv on healthy Android → WEB (the cinema player owns it first)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv" }) === "web");
ok("owner: local: file on healthy Android → native", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "local:/data/user/0/ir.frame.nama/files/dl/x.mkv" }) === "native");
ok("owner: token URL on healthy Android → WEB (sniff first)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/dl/8a71f" }) === "web");
ok("owner: avi on healthy Android → native (no web demuxer, no wasted fetch)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.avi" }) === "native");
ok("owner: plain mp4 on Android → web (light path)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4" }) === "web");

/* ---- resolveOwner · engine pref (v0.18.1 «پلیر ویدیو») --------------------
 * "native" = the user FORCED the native Media3 player for every source.
 * The bridge probe still gates: no handoff on a guess, honest fallback when
 * the plugin is dead. Cinema beats the engine either way. */
ok("engine native: even a plain mp4 → native (one consistent engine)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4", engine: "native" }) === "native");
ok("engine native: token URL → native", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/dl/8a71f", engine: "native" }) === "native");
ok("engine native: while probing → pending (never mount the WebView on a guess)", resolveOwner({ hasBridge: null, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4", engine: "native" }) === "pending");
ok("engine native: bridge dead + web-safe → honest web fallback", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4", engine: "native" }) === "web");
ok("engine native: bridge dead + mkv → honest web fallback (web may still decode it)", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv", engine: "native" }) === "web");
ok("engine native: cinema still rides the web <video>", resolveOwner({ hasBridge: true, cinemaActive: true, proxyReady: true, url: "https://x/a.mp4", engine: "native" }) === "web");
ok("engine auto (explicit): mkv → web (same as default)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv", engine: "auto" }) === "web");
ok("engine auto (explicit): mp4 → web", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4", engine: "auto" }) === "web");
ok("engine auto (explicit): probing + mp4 → web", resolveOwner({ hasBridge: null, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4", engine: "auto" }) === "web");

/* ---- shouldLadderAdvance (echo guard) ------------------------------------ */
const t0 = 1_000_000;
ok("ladder: first failure always advances", shouldLadderAdvance(null, 0, t0) === true);
ok("ladder: duplicate echo within window blocked", shouldLadderAdvance({ idx: 0, at: t0 }, 0, t0 + 800) === false);
ok("ladder: real failure after window advances", shouldLadderAdvance({ idx: 0, at: t0 }, 0, t0 + 1600) === true);
ok("ladder: different source advances immediately", shouldLadderAdvance({ idx: 1, at: t0 }, 2, t0 + 10) === true);

/* ---- isLadderExhausted (single terminator) ------------------------------- */
ok("exhausted: next out of range → fatal", isLadderExhausted(3, 3, 1) === true);
ok("exhausted: next in range → advance", isLadderExhausted(1, 3, 1) === false);
ok("exhausted: last source reached → fatal", isLadderExhausted(2, 2, 1) === true);
ok("exhausted: sanity cap respected", isLadderExhausted(1, 3, 9) === true);

/* ---- isDuplicateNotice (no more «پشت سر هم» toasts) ---------------------- */
ok("notice: first message shows", isDuplicateNotice(null, "m", t0) === false);
ok("notice: same message within 5s suppressed", isDuplicateNotice({ msg: "m", at: t0 }, "m", t0 + 2000) === true);
ok("notice: different message shows", isDuplicateNotice({ msg: "a", at: t0 }, "b", t0 + 100) === false);
ok("notice: same message after 5s shows", isDuplicateNotice({ msg: "m", at: t0 }, "m", t0 + 5001) === false);

rmSync(TMP, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
