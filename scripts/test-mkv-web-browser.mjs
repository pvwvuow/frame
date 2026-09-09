/* v0.20.0 — BROWSER E2E for the in-WebView Matroska scanner.
 *
 * The node tests (test-mkv-web.mjs) prove the byte engine; this proves the
 * BROWSER half — the exact environment the Android WebView runs: real
 * Chromium, real fetch() with Range, TextDecoder, dynamic module import —
 * driving MkvWebScan end-to-end against a live Range server.
 *
 * Run: node scripts/test-mkv-web-browser.mjs  (spins its own server)
 */
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const ROOT = new URL("..", import.meta.url).pathname;
const TMP = join(ROOT, ".test-tmp-mkvweb-browser");
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

// transpile mkv-web.ts → a browser-loadable ESM file served by our server
const src = readFileSync(join(ROOT, "src/lib/mkv-web.ts"), "utf8").replace(/^["']use client["'];?/m, "");
const js = ts_transpile(src);
writeFileSync(join("/home/z/my-project/scripts/samples", "mkv-web.browser.mjs"), js);
function ts_transpile(source) {
  const ts = require("typescript");
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const server = spawn(process.execPath, ["/home/z/my-project/scripts/mkv-server.cjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const BASE = "http://127.0.0.1:39001";

const browser = await chromium.launch();
const page = await browser.newPage();
// same-origin: module import is CORS-gated, so navigate to the server first
await page.goto(`${BASE}/`, { waitUntil: "load" }).catch(() => {});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

const result = await page.evaluate(
  async (base) => {
    const mod = await import(`${base}/mkv-web.browser.mjs`);
    const out = { canImport: true, steps: [] };

    // 1. probe
    const probe = await mod.probeMkvHead(`${base}/mkv_h264_aac_fa.mkv`);
    out.probe = probe;

    // 2. full session with seek simulation
    const emissions = [];
    let lastState = "idle";
    const scan = new mod.MkvWebScan(
      `${base}/mkv_h264_aac_fa.mkv`,
      (cues) => emissions.push(cues.length),
      (s) => {
        lastState = s;
      },
      () => 55
    );
    scan.start(0);
    await new Promise((r) => setTimeout(r, 3000));
    out.emissions = emissions;
    out.lastState = lastState;
    out.finalCues = scan.cueCount;

    // 3. mp4 → clean no-cues
    let mp4State = "idle";
    const scan2 = new mod.MkvWebScan(
      `${base}/d_h264_aac.mp4`,
      () => {},
      (s) => {
        mp4State = s;
      }
    );
    scan2.start(0);
    await new Promise((r) => setTimeout(r, 1500));
    out.mp4State = mp4State;

    // 4. dead URL
    let deadState = "idle";
    const scan3 = new mod.MkvWebScan(
      `${base}/missing_file.mkv`,
      () => {},
      (s) => {
        deadState = s;
      }
    );
    scan3.start(0);
    await new Promise((r) => setTimeout(r, 1500));
    out.deadState = deadState;
    return out;
  },
  BASE
);

check(result.canImport, "browser: ESM module imports (dynamic import + TextDecoder)");
check(result.probe && result.probe.reachable && result.probe.matroska, "browser: probe reachable+matroska");
check(result.probe && result.probe.audioOk === true, "browser: probe audio intelligence");
check(result.emissions && result.emissions.length >= 1, `browser: session emits cues (${result.emissions})`);
check(result.finalCues === 12, `browser: 12 cues via browser fetch+Range (${result.finalCues})`);
check(result.lastState === "parked" || result.lastState === "done", `browser: session runway park (${result.lastState})`);
check(result.mp4State === "done", `browser: mp4 clean done (${result.mp4State})`);
check(result.deadState === "dead", `browser: dead URL → dead state (${result.deadState})`);
check(pageErrors.length === 0, `browser: zero page errors (${pageErrors.join("; ") || "none"})`);

await browser.close();
server.kill();
rmSync(TMP, { recursive: true, force: true });
rmSync(join("/home/z/my-project/scripts/samples", "mkv-web.browser.mjs"), { force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
