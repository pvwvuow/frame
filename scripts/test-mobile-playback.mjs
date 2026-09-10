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
const { resolveOwner, shouldLadderAdvance, isLadderExhausted, isDuplicateNotice, metaWatchdogMs, preflightDecision, nextWebIdxSkippingNative } = await import(
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
/* v0.21.1 — the filename CODEC layer: x265/HEVC/10bit/DTS/AC3 MKVs are
 * WebView-undecodable → the NATIVE class (straight to Media3, no doomed
 * <video> mount). Plain H.264/AAC MKVs stay fragile (web-first). */
ok("class: x265 mkv → native (no 12s burn, no silent film)", classifyUrl("https://x/Breaking.Bad.S01E01.720p.x265.BluRay.SoftSub.mkv") === "native");
ok("class: 10bit mkv → native", classifyUrl("https://x/Anime.1080p.10bit.BluRay.mkv") === "native");
ok("class: DTS mkv → native", classifyUrl("https://x/Movie.1080p.DTS.BluRay.mkv") === "native");
ok("class: plain mkv stays fragile (web-first)", classifyUrl("https://x/Movie.1080p.BluRay.mkv") === "fragile");
ok("needsNative (STRICT): only what the WebView can never own", needsNativePlayer("https://x/a.mkv") === false && needsNativePlayer("https://x/dl/8a71f") === false && needsNativePlayer("https://x/a.avi") === true && needsNativePlayer("local:/f/x.mkv") === true && needsNativePlayer("http://x/a.mp4") === true);
ok("needsNative (STRICT): codec MKV is strict-native", needsNativePlayer("https://x/a.x265.mkv") === true);

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
/* v0.21.1 — codec-native MKVs are the NATIVE class: probing → pending, the
 * healthy bridge hands them to Media3 DIRECTLY (the «Breaking Bad x265
 * variants burned the web ladder» class), a dead bridge is honest. */
ok("owner: probing + x265 mkv → pending (native class, probe owns the call)", resolveOwner({ hasBridge: null, cinemaActive: false, proxyReady: true, url: "https://x/a.x265.mkv" }) === "pending");
ok("owner: healthy Android + x265 mkv → NATIVE directly", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.x265.mkv" }) === "native");
ok("owner: dead bridge + x265 mkv → unsupported (honest)", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "https://x/a.x265.mkv" }) === "unsupported");

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

/* ---- v0.21.1 — preflightDecision (the byte-preflight verdict) --------------
 * Every candidate source gets ONE pure verdict BEFORE the <video> mounts:
 * dead heads step the ladder instantly, AC3/DTS audio hands off to Media3,
 * MSE-capable files ride the fMP4 transport when the device prefers it. */
const dead = { reachable: false, status: 503, matroska: false, audioOk: null, mse: null };
ok("preflight: 403/503 dead head → next (no 12s watchdog burn)", preflightDecision(dead, { preferMse: false, bridgeOk: true, engine: "auto" }).action === "next");
ok("preflight: transport hiccup (status 0) → wait (the element may still win)", preflightDecision({ ...dead, status: 0 }, { preferMse: false, bridgeOk: true, engine: "auto" }).action === "wait");
ok("preflight: non-matroska bytes (token URL hiding an mp4) → keep", preflightDecision({ reachable: true, status: 200, matroska: false, audioOk: null, mse: null }, { preferMse: false, bridgeOk: true, engine: "auto" }).action === "keep");
ok("preflight: healthy matroska → keep (web player owns it)", preflightDecision({ reachable: true, status: 200, matroska: true, audioOk: true, mse: { supported: true } }, { preferMse: false, bridgeOk: true, engine: "auto" }).action === "keep");
ok("preflight: preferMse + MSE-capable → mse (device-proven transport)", preflightDecision({ reachable: true, status: 200, matroska: true, audioOk: true, mse: { supported: true } }, { preferMse: true, bridgeOk: true, engine: "auto" }).action === "mse");
ok("preflight: AC3/DTS audio + healthy bridge → native (a silent film is broken)", preflightDecision({ reachable: true, status: 200, matroska: true, audioOk: false, mse: { supported: false } }, { preferMse: false, bridgeOk: true, engine: "auto" }).action === "native");
ok("preflight: AC3/DTS audio + probe in flight → wait (no handoff on a guess)", preflightDecision({ reachable: true, status: 200, matroska: true, audioOk: false, mse: null }, { preferMse: false, bridgeOk: null, engine: "auto" }).action === "wait");
ok("preflight: engine override → keep (the engine path owns routing)", preflightDecision({ reachable: true, status: 200, matroska: true, audioOk: false, mse: null }, { preferMse: false, bridgeOk: true, engine: "native" }).action === "keep");

/* ---- v0.21.1 — nextWebIdxSkippingNative (the smart ladder landing) --------
 * After a web failure the ladder must LAND on a web-ownable variant, never
 * on another codec-native MKV (a guaranteed second failure + another burn). */
ok("skip: lands on the next non-native index", nextWebIdxSkippingNative(["fragile", "native", "fragile"], 0) === 2);
ok("skip: consecutive native-class sources are all skipped", nextWebIdxSkippingNative(["fragile", "native", "native", "web"], 0) === 3);
ok("skip: no web-ownable source left → -1 (the native rung takes over)", nextWebIdxSkippingNative(["fragile", "native"], 1) === -1);
ok("skip: next already web-ownable → plain step", nextWebIdxSkippingNative(["fragile", "fragile"], 0) === 1);
ok("skip: from the last index → -1", nextWebIdxSkippingNative(["fragile"], 0) === -1);

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

/* ---- metaWatchdogMs (v0.19.2 — the open-path hang breaker) ----------------
 * A stalled host never fires `error` — the watchdog declares the source dead
 * after the delay. 12s in production; the localStorage hook is E2E-only. */
ok("watchdog: production default is 12s", metaWatchdogMs() === 12000);
globalThis.localStorage = { getItem: (k) => (k === "nama-meta-watchdog-ms" ? "1200" : null) };
ok("watchdog: E2E hook shortens the delay", metaWatchdogMs() === 1200);
globalThis.localStorage = { getItem: () => "junk" };
ok("watchdog: junk value → default", metaWatchdogMs() === 12000);
globalThis.localStorage = { getItem: () => "100" };
ok("watchdog: below the 250ms floor → default", metaWatchdogMs() === 12000);
delete globalThis.localStorage;
ok("watchdog: no storage at all → default", metaWatchdogMs() === 12000);

rmSync(TMP, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
