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

let failures = 0;
const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures += 1;
};

/* ---- resolveOwner -------------------------------------------------------- */
ok("owner: no bridge (Electron/browser) → web", resolveOwner({ hasBridge: false, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv" }) === "web");
ok("owner: proxy unresolved yet → web", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: false, url: "https://x/a.mkv" }) === "web");
ok("owner: cinema rides the web video even for MKV", resolveOwner({ hasBridge: true, cinemaActive: true, proxyReady: true, url: "https://x/a.mkv" }) === "web");
ok("owner: mkv on Android → native", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mkv" }) === "native");
ok("owner: token URL on Android → native", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/dl/8a71f" }) === "native");
ok("owner: plain mp4 on Android → web (light path)", resolveOwner({ hasBridge: true, cinemaActive: false, proxyReady: true, url: "https://x/a.mp4" }) === "web");

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
