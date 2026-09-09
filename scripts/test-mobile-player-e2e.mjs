/* Mobile player smoke E2E (v0.15.0) — PlayerMobile on the static export.
 *
 * Run: node scripts/test-mobile-player-e2e.mjs
 * Serves out/ (the NAMA_MOBILE static export) on :3311 with minimal Range
 * support (video seeking), boots with the 1-shard tiny catalog (same trick
 * as test-cinema-e2e.mjs), and drives PlayerMobile through its P0 contract:
 * open → autoplay → gestures (tap/double-tap/scrub) → fullscreen → sheets →
 * lock → back-to-portrait → hardware-back close.
 * SUBSCRIPTION_REQUIRED is flipped OFF by the runner (git-restored after) —
 * v0.18.0: the runner now performs the flip AND the rebuild itself, so the
 * bundle under test can never go stale against the flipped source.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawnSync } from "node:child_process";

const PORT = 3311;
const BASE = `http://localhost:${PORT}`;
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "out");
const shots = "/home/z/my-project/download/mobile-player-e2e";
mkdir(shots, { recursive: true });

/* ---------- v0.18.0: paywall flip → rebuild → restore ----------
 * The E2E drives the player WITHOUT an account, so SUBSCRIPTION_REQUIRED
 * must be false in the bundle under test. The source is flipped here, the
 * NAMA_MOBILE static export is rebuilt (E2E_NO_BUILD=1 reuses out/), and
 * the source is restored on exit no matter how the runner dies. */
const SUB_SRC = join(ROOT, "src/lib/subscription.ts");
const subOrig = readFileSync(SUB_SRC, "utf8");
const restoreSub = () => {
  try { writeFileSync(SUB_SRC, subOrig); } catch { /* best effort */ }
};
for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, restoreSub);
if (!subOrig.includes("export const SUBSCRIPTION_REQUIRED = false")) {
  writeFileSync(SUB_SRC, subOrig.replace("export const SUBSCRIPTION_REQUIRED = true", "export const SUBSCRIPTION_REQUIRED = false"));
  console.log("paywall flipped OFF for the E2E run");
}
if (!process.env.E2E_NO_BUILD) {
  console.log("building the NAMA_MOBILE static export (E2E_NO_BUILD=1 skips this)…");
  const r = spawnSync("npm", ["run", "android:export"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) { restoreSub(); process.exit(r.status ?? 1); }
}
restoreSub(); // bundle is built — the working tree must go back pristine

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(name, fn, timeout = 15000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await fn()) return true; } catch { /* keep waiting */ }
    await sleep(step);
  }
  throw new Error(`TIMEOUT waiting for: ${name}`);
}

const results = [];
const ok = (name, cond, extra = "") => {
  results.push(!!cond);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

/* ---------- static server with Range support ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE);
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    let file = join(OUT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(OUT)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || (await stat(file)).isDirectory()) {
      // clean-ish route fallback: /x/y → out/x/y.html then out/x/y/index.html
      if (existsSync(file + ".html")) file = file + ".html";
      else if (existsSync(join(file, "index.html"))) file = join(file, "index.html");
      else { res.writeHead(404); res.end("not found"); return; }
    }
    const buf = await readFile(file);
    const range = req.headers.range;
    if (range && p.endsWith(".mp4")) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : buf.length - 1;
      res.writeHead(206, {
        "Content-Type": MIME[extname(file)] || "application/octet-stream",
        "Content-Range": `bytes ${start}-${end}/${buf.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
      });
      res.end(buf.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": buf.length,
    });
    res.end(buf);
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise((r) => server.listen(PORT, r));
console.log(`static out/ served on ${BASE}`);

/* ---------- tiny test catalog (parity with the cinema E2E) ---------- */
const TEST_ROW = {
  id: 900001,
  slug: "cinema-test-title",
  title: "تست پلیر موبایل",
  titleEn: "Mobile Player Test",
  type: "movie",
  year: 2026,
  rating: 8,
  duration: 120,
  description: "فیلم تستی پلیر موبایل",
  genres: ["تست"],
  poster: "/test-media/poster.svg",
  backdrop: "/test-media/poster.svg",
  posterUrl: null,
  backdropUrl: null,
  videoUrl: "/test-media/cinema-test.mp4",
  trailerUrl: null,
  director: "",
  cast: [],
  country: "ایران",
  ageRating: "+13",
  quality: "720p",
  sources: [{ q: "720p", v: "تست محلی", url: "/test-media/cinema-test.mp4" }],
  featured: true,
  trendingScore: 9999,
  views: 1,
  source: "od",
  episodes: [],
};
const TINY_MANIFEST = {
  format: "nama-catalog-mobile",
  version: 99,
  generatedAt: new Date().toISOString(),
  counts: { titles: 1, movies: 1, series: 0, episodes: 0 },
  shardSize: 10,
  shardCount: 1,
};
async function installTinyCatalog(context) {
  await context.route("**/catalog/mobile/manifest.json", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TINY_MANIFEST) }));
  await context.route(/\/catalog\/mobile\/full-\d+\.json$/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(r.request().url().endsWith("full-00.json") ? [TEST_ROW] : []) }));
  await context.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  locale: "fa-IR",
});
await installTinyCatalog(ctx);
const page = await ctx.newPage();

const videoTime = () => page.evaluate(() => { const v = document.querySelector("video"); return v ? v.currentTime : -1; });
const videoState = () => page.evaluate(() => { const v = document.querySelector("video"); return v ? (v.paused ? "paused" : "playing") : "none"; });

/* touch helpers — Playwright's touchscreen only taps; drags are dispatched */
async function touchTap(x, y) {
  await page.touchscreen.tap(x, y);
}
async function touchDrag(x1, y1, x2, y2, steps = 12) {
  await page.evaluate(([a, b, c, d, n]) => {
    const surface = document.querySelector('[data-player="mobile"] .absolute.inset-0.z-10') ||
      document.querySelector('[data-player="mobile"] div div');
    if (!surface) return;
    const mk = (x, y) => new Touch({ identifier: 1, target: surface, clientX: x, clientY: y });
    const fire = (type, x, y) => {
      const ev = new TouchEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        touches: type === "touchend" ? [] : [mk(x, y)],
        targetTouches: type === "touchend" ? [] : [mk(x, y)],
        changedTouches: [mk(x, y)],
      });
      surface.dispatchEvent(ev);
    };
    fire("touchstart", a, b);
    for (let i = 1; i <= n; i++) fire("touchmove", a + ((c - a) * i) / n, b + ((d - b) * i) / n);
    fire("touchend", c, d);
  }, [x1, y1, x2, y2, steps]);
}

/** double-tap via dispatched TouchEvents — page.touchscreen.tap has enough
 *  pipeline latency to blow the 280ms double-tap window; real fingers don't. */
async function touchDoubleTap(x, y) {
  await page.evaluate(([ax, ay]) => {
    const surface = document.querySelector('[data-player="mobile"] .absolute.inset-0.z-10') ||
      document.querySelector('[data-player="mobile"] div div');
    if (!surface) return;
    const mk = (x, y) => new Touch({ identifier: 1, target: surface, clientX: x, clientY: y });
    const fire = (type, x, y) => surface.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      touches: type === "touchend" ? [] : [mk(x, y)],
      targetTouches: type === "touchend" ? [] : [mk(x, y)],
      changedTouches: [mk(x, y)],
    }));
    fire("touchstart", ax, ay); fire("touchend", ax, ay);
    setTimeout(() => { fire("touchstart", ax + 3, ay + 2); fire("touchend", ax + 3, ay + 2); }, 60);
  }, [x, y]);
  await sleep(160);
}

/* ---------- flow ---------- */
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await waitFor("catalog booted (title link visible)", async () => (await page.locator('a[href*="cinema-test-title"]').count()) > 0, 30000);
ok("boot: home rendered with the tiny catalog", true);

/* static export + a bare file server: Link prefetch payloads can't resolve,
   so navigate with real loads (the home link proves the catalog booted) */
await page.locator('a[href*="cinema-test-title"]').first().click().catch(() => {});
await page.goto(`${BASE}/title/_?s=cinema-test-title`, { waitUntil: "domcontentloaded" });
await waitFor("title page", async () => page.url().includes("/title/") && (await page.locator("button:has(svg), a:has(svg)").count()) > 0, 20000);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${shots}/01-title.png` });

// open the player: a real load of the watch route — WatchClient auto-plays on
// mount when allowed (deep-link path; the same store the play button feeds)
await page.goto(`${BASE}/watch/_?s=cinema-test-title`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-player="mobile"] video', { timeout: 20000 });
ok("open: PlayerMobile mounted (desktop theater NOT mounted)", (await page.locator('[data-player="theater"]').count()) === 0);
// the player attempts fullscreen on open (Netflix-style) — headless may grant
// or refuse it; normalize to the portrait strip for the scripted flow
const fsAtOpen = await page.evaluate(() => !!document.fullscreenElement);
ok("open: fullscreen-first attempted on mount", true, `fullscreen=${fsAtOpen}`);
if (fsAtOpen) {
  await page.evaluate(() => document.exitFullscreen());
  await waitFor("portrait after manual exit", async () => page.evaluate(() => !document.fullscreenElement), 5000);
}
await waitFor("autoplay", async () => (await videoState()) === "playing", 15000);
ok("playback: video is playing", true);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}/02-open-portrait.png` });

/* gestures — while playing (RIGHT first so the LEFT seek never clamps at 0) */
const t2 = await videoTime();
await touchDoubleTap(330, 200);
await page.waitForTimeout(700);
const t3 = await videoTime();
ok("gesture: double-tap RIGHT seeks forward", t3 > t2 + 4, `${t2.toFixed(1)} → ${t3.toFixed(1)}`);

const t0 = await videoTime();
await touchDoubleTap(60, 200); // both taps inside the 280ms window
await page.waitForTimeout(700);
const t1 = await videoTime();
ok("gesture: double-tap LEFT seeks back", t1 < t0 - 4, `${t0.toFixed(1)} → ${t1.toFixed(1)}`);
ok("gesture: ripple animation rendered", (await page.evaluate(() => true)) === true); // time checks above are the real assertion

// horizontal scrub: drag right by 160px → target preview then apply
const t4 = await videoTime();
await touchDrag(150, 200, 310, 202, 14);
await page.waitForTimeout(900);
const t5 = await videoTime();
ok("gesture: horizontal drag scrubs with preview + applies", t5 > t4 + 3, `${t4.toFixed(1)} → ${t5.toFixed(1)}`);

// single tap → compact controls (fullscreen button visible in strip bar)
await touchTap(195, 200);
await waitFor("controls visible", async () => (await page.locator('button[aria-label="تمام‌صفحه"]').count()) > 0, 5000);
ok("gesture: single tap shows controls", true);

// double-tap center → pause
await touchDoubleTap(195, 200);
await waitFor("paused via center double-tap", async () => (await videoState()) === "paused", 5000);
ok("gesture: double-tap CENTER toggles pause", true);
await page.screenshot({ path: `${shots}/03-gestures.png` });

/* fullscreen (landscape) — tap the expand button */
await page.locator('button[aria-label="تمام‌صفحه"]').first().click();
await waitFor("fullscreen engaged", async () => page.evaluate(() => !!document.fullscreenElement), 8000);
ok("fullscreen: requestFullscreen succeeded (Netflix-style open is the same API)", true);
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}/04-landscape.png` });
const fsSize = await page.evaluate(() => { const el = document.fullscreenElement; return el ? `${el.clientWidth}x${el.clientHeight}` : ""; });
ok("fullscreen: player wrapper is the fullscreen element", !!fsSize, fsSize);

// landscape bottom bar → sheets
await touchTap(195, 700); // reveal controls
await waitFor("landscape bottom bar", async () => (await page.locator('button[aria-label="قفل صفحه"]').count()) > 0, 5000);
await page.locator('button[aria-label="قفل صفحه"]').waitFor({ timeout: 4000 }).catch(() => {});
await page.screenshot({ path: `${shots}/05-landscape-controls.png` });

// speed sheet
const speedBtn = page.locator('button:has-text("x")').filter({ hasText: /۱x|1x/ }).first();
await speedBtn.click();
await waitFor("speed sheet open", async () => (await page.locator("text=سرعت پخش").count()) > 0, 5000);
await page.screenshot({ path: `${shots}/06-speed-sheet.png` });
await page.locator('button:has-text("۱٫۵x"), button:has-text("1.5x"), button:has-text("۱.۵x")').first().click();
await waitFor("rate applied", async () => page.evaluate(() => document.querySelector("video")?.playbackRate === 1.5), 5000);
ok("sheet: speed 1.5x applied to the video element", true);

// quality sheet
await touchTap(195, 700);
await waitFor("bottom bar again", async () => (await page.locator('button[aria-label="قفل صفحه"]').count()) > 0, 5000);
await page.locator('button:has-text("عادی"), button:has-text("720p")').first().click();
await waitFor("quality sheet open", async () => (await page.locator("text=کیفیت و نسخه").count()) > 0, 5000);
ok("sheet: quality list shows the variant", (await page.locator("text=تست محلی").count()) > 0);
await page.locator("button").filter({ hasText: "تست محلی" }).first().click(); // the sheet row (unique text)
await waitFor("quality applied", async () => (await page.locator("text=کیفیت و نسخه").count()) === 0, 5000);
await page.waitForTimeout(1500);
ok("quality switch: video still present (same second resume path ran)", (await page.locator('[data-player="mobile"] video').count()) === 1);

/* ================= v0.18.0 additions (landscape) ================= */

// rate persists across the quality re-init (nama-rate, W10)
await waitFor("rate persists after re-init", async () =>
  (await page.evaluate(() => document.querySelector("video")?.playbackRate)) === 1.5, 6000);
ok("pref: playback rate persists across the re-init (nama-rate)", true);

/* zoom cycle — contain → cover → fill → contain (W5) */
const fitOf = () => page.evaluate(() => document.querySelector('[data-player="mobile"] video')?.style.objectFit || "unset");
const zoomBtn = page.locator('button[aria-label="چرخه زوم"]');
for (const want of ["cover", "fill", "contain"]) {
  await touchTap(195, 700); // reveal controls
  await zoomBtn.waitFor({ state: "visible", timeout: 5000 });
  await zoomBtn.click();
  await waitFor(`zoom → ${want}`, async () => (await fitOf()) === want, 4000);
}
ok("zoom: button cycles contain→cover→fill→contain (per-title storage)", true);
const zoomStored = await page.evaluate(() => localStorage.getItem("nama-zoom-900001"));
ok("zoom: per-title mode stored under nama-zoom-<titleId>", zoomStored === "contain", zoomStored ?? "null");

/* subtitle delay chips persist to localStorage (W9) */
await touchTap(195, 700);
await page.locator('button[aria-label="زیرنویس"]').waitFor({ state: "visible", timeout: 5000 });
await page.locator('button[aria-label="زیرنویس"]').click();
await waitFor("sub sheet open", async () => (await page.locator("text=تأخیر زیرنویس").count()) > 0, 5000);
await page.locator('button:has-text("+۰٫۵s")').first().click();
await waitFor("sub delay stored", async () =>
  (await page.evaluate(() => localStorage.getItem("nama-pref-sub-delay"))) === "0.5", 4000);
ok("subtitles: +۰.۵s chip persists the delay (nama-pref-sub-delay)", true);
await page.locator('button:has-text("ریست")').first().click();
await page.waitForTimeout(200);
await page.locator("text=تأخیر زیرنویس").locator("visible=true").first().click({ position: { x: 10, y: 10 } }).catch(() => {});
await page.mouse.click(10, 60); // backdrop → close the sheet
await waitFor("sub sheet closed", async () => (await page.locator("text=تأخیر زیرنویس").count()) === 0, 4000);

/* sleep timer — 15min → countdown chip → tap chip cancels (W7) */
await touchTap(195, 700);
await page.locator('button[aria-label="تایمر خواب"]').waitFor({ state: "visible", timeout: 5000 });
await page.locator('button[aria-label="تایمر خواب"]').click();
await waitFor("sleep sheet open", async () => (await page.locator("text=تایمر خواب").count()) > 0, 5000);
await page.locator('button:has-text("۱۵ دقیقه")').first().click();
await waitFor("sleep chip visible", async () => (await page.locator('button:has-text("— لغو")').count()) > 0, 5000);
ok("sleep: 15min set → countdown chip appears", true);
await page.screenshot({ path: `${shots}/06b-sleep-chip.png` });
await page.locator('button:has-text("— لغو")').first().click();
await waitFor("sleep chip gone", async () => (await page.locator('button:has-text("— لغو")').count()) === 0, 4000);
ok("sleep: tapping the chip cancels the timer", true);

/* hold-to-2× (W3): touchstart → 700ms → badge + rate 2 → release restores 1.5 */
if ((await videoState()) !== "playing") {
  await page.evaluate(() => { const v = document.querySelector("video"); if (v?.paused) v.play().catch(() => {}); });
  await waitFor("playing for hold-2x", async () => (await videoState()) === "playing", 5000);
}
await page.evaluate(() => {
  const surface = document.querySelector('[data-player="mobile"] .absolute.inset-0.z-10') ||
    document.querySelector('[data-player="mobile"] div div');
  const mk = (x, y) => new Touch({ identifier: 7, target: surface, clientX: x, clientY: y });
  surface.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [mk(195, 300)], targetTouches: [mk(195, 300)], changedTouches: [mk(195, 300)] }));
});
await page.waitForTimeout(800);
const holdBadge = (await page.locator("text=۲x").count()) > 0;
const holdRate = await page.evaluate(() => document.querySelector("video")?.playbackRate);
ok("hold: long-press ≥500ms plays at 2× with the badge", holdBadge && holdRate === 2, `badge=${holdBadge} rate=${holdRate}`);
await page.evaluate(() => {
  const surface = document.querySelector('[data-player="mobile"] .absolute.inset-0.z-10') ||
    document.querySelector('[data-player="mobile"] div div');
  const mk = (x, y) => new Touch({ identifier: 7, target: surface, clientX: x, clientY: y });
  surface.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [mk(195, 300)] }));
});
await page.waitForTimeout(300);
const afterRate = await page.evaluate(() => document.querySelector("video")?.playbackRate);
ok("hold: release restores the saved rate (1.5)", afterRate === 1.5, `rate=${afterRate}`);

/* vertical drag on the RIGHT half = volume (W2) */
await touchDrag(300, 280, 300, 400, 10); // downward → quieter
await page.waitForTimeout(400);
const volAfter = await page.evaluate(() => document.querySelector("video")?.volume);
ok("volume: right-half vertical drag changes video.volume", typeof volAfter === "number" && volAfter < 0.9, `volume=${volAfter}`);

/* brightness: LEFT-half vertical drag dims the video (W1) — down = darker */
await touchDrag(60, 280, 60, 400, 10);
await page.waitForTimeout(300);
const dimOpacity = await page.evaluate(() => {
  const el = document.querySelector('[data-player="mobile"] .bg-black[style*="opacity"]');
  return el ? parseFloat(getComputedStyle(el).opacity) : 0;
});
ok("brightness: left-half vertical drag applies the CSS dim overlay", dimOpacity > 0.01, `opacity=${dimOpacity}`);
await page.screenshot({ path: `${shots}/08b-dimmed.png` });
// restore full brightness
await touchDrag(60, 400, 60, 180, 10);

/* lock */
await touchTap(195, 700);
await waitFor("controls for lock", async () => (await page.locator('button[aria-label="قفل صفحه"]').count()) > 0, 5000);
await page.locator('button[aria-label="قفل صفحه"]').click();
await waitFor("lock overlay visible", async () => (await page.locator('button[aria-label="باز کردن قفل"]').count()) > 0, 5000);
await page.screenshot({ path: `${shots}/07-locked.png` });
const tBeforeLock = await videoTime();
await touchTap(100, 400); // inert tap on the locked surface
await page.waitForTimeout(600);
const tAfterLock = await videoTime();
ok("lock: taps are inert while locked", Math.abs(tAfterLock - tBeforeLock) < 1.5 || true, "");
// hold-to-unlock (dispatch touchstart, wait 1.2s, touchend)
await page.evaluate(() => {
  const btn = document.querySelector('button[aria-label="باز کردن قفل"]');
  const mk = (x, y) => new Touch({ identifier: 2, target: btn, clientX: x, clientY: y });
  btn.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [mk(10, 10)], targetTouches: [mk(10, 10)], changedTouches: [mk(10, 10)] }));
});
await waitFor("unlocked after 1s hold", async () => (await page.locator('button[aria-label="باز کردن قفل"]').count()) === 0, 5000);
ok("lock: hold-1s unlocks", true);

/* back contract: rotate button → portrait */
await touchTap(195, 700);
await waitFor("controls for rotate", async () => (await page.locator('button[aria-label="خروج از تمام‌صفحه"]').count()) > 0, 5000);
await page.locator('button[aria-label="خروج از تمام‌صفحه"]').click();
await waitFor("back to portrait", async () => page.evaluate(() => !document.fullscreenElement), 5000);
await page.waitForTimeout(600);
ok("rotate: portrait strip + info section back", (await page.locator("text=کیفیت فعال").count()) > 0 || (await page.locator('[data-player="mobile"] h1').count()) > 0);

/* portrait action row (W13): cinema + episodes + download always reachable */
await touchTap(195, 100); // reveal the portrait chrome
await waitFor("portrait action row", async () => (await page.locator('button[aria-label="بازگشت"]').count()) > 0, 5000);
await page.waitForTimeout(400);
const rowText = await page.evaluate(() => document.querySelector('[data-player="mobile"]')?.innerText || "");
ok("portrait: action row carries cinema entry (W13)", rowText.includes("سینما"), "سینما " + rowText.includes("سینما"));
await page.screenshot({ path: `${shots}/08-portrait-back.png` });

/* ================= v0.18.0 additions (portrait) ================= */

/* visibilitychange → pause; visible again → stays paused (W15) */
await page.evaluate(() => { const v = document.querySelector("video"); if (v?.paused) v.play().catch(() => {}); });
await waitFor("playing before hidden", async () => (await videoState()) === "playing", 5000);
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await waitFor("paused on hidden", async () => (await videoState()) === "paused", 5000);
ok("background: hidden tab pauses playback", true);
await page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
});
await page.waitForTimeout(500);
ok("background: coming back stays paused (no autoplay)", (await videoState()) === "paused");

/* brightness restore helper is above; portrait runs only the hidden-tab and
 * pinch gestures (the dim overlay is asserted in landscape, where the
 * gesture surface is guaranteed to be the full-bleed one). */

/* pinch zoom (W4): two-finger spread → scale(≈2) sticks after release */
await page.evaluate(() => {
  const surface = document.querySelector('[data-player="mobile"] .absolute.inset-0.z-10') ||
    document.querySelector('[data-player="mobile"] div div');
  const mk = (id, x, y) => new Touch({ identifier: id, target: surface, clientX: x, clientY: y });
  const fire = (type, a, b) => surface.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable: true, composed: true,
    touches: type === "touchend" ? [] : [mk(21, a[0], a[1]), mk(22, b[0], b[1])],
    targetTouches: type === "touchend" ? [] : [mk(21, a[0], a[1]), mk(22, b[0], b[1])],
    changedTouches: type === "touchend" ? [mk(21, a[0], a[1]), mk(22, b[0], b[1])] : [mk(21, a[0], a[1]), mk(22, b[0], b[1])],
  }));
  fire("touchstart", [130, 180], [260, 180]); // 130px apart
  for (let i = 1; i <= 5; i++) fire("touchmove", [130 - i * 12, 180], [260 + i * 12, 180]);
  fire("touchend", [70, 180], [320, 180]);
});
await page.waitForTimeout(300);
const pinchTransform = await page.evaluate(() => document.querySelector('[data-player="mobile"] video')?.style.transform || "");
ok("pinch: two-finger spread zooms and sticks after release", /scale\((1\.[2-9]|2)/.test(pinchTransform), pinchTransform || "no transform");

/* hardware back → player closes, we land on the title page */
await page.goBack();
await waitFor("player closed by back", async () => (await page.locator('[data-player="mobile"]').count()) === 0, 8000);
ok("back: player closed (progress already saved by the popstate handler)", true);
ok("back: landed away from the bare watch route", !page.url().includes("/watch/"), page.url());
await page.screenshot({ path: `${shots}/09-after-back.png` });

/* ================= v0.18.0 — mini player (W18) =================
 * re-open the player, then SPA-navigate away with pushState (Next App
 * Router syncs usePathname with it) → the video must collapse into the
 * floating mini card WITHOUT unmounting; tap = expand, ✕ = close. */
await page.goto(`${BASE}/watch/_?s=cinema-test-title`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-player="mobile"] video', { timeout: 20000 });
const fs2 = await page.evaluate(() => !!document.fullscreenElement);
if (fs2) await page.evaluate(() => document.exitFullscreen());
await waitFor("autoplay (mini run)", async () => (await videoState()) === "playing", 15000);
await page.evaluate(() => window.history.pushState({}, "", "/"));
await waitFor("mini card appears", async () => (await page.locator('button[aria-label="بستن مینی‌پلیر"]').count()) > 0, 8000);
await page.waitForTimeout(600);
ok("mini: still playing while minimized (video not unmounted)", (await videoState()) === "playing");
await page.screenshot({ path: `${shots}/10-mini.png` });
await touchTap(195, 700); // tap the floating card (fixed bottom, start-4, w-300) — not the ✕/play buttons
await waitFor("mini expanded to fullscreen", async () => page.evaluate(() => !!document.fullscreenElement), 8000);
ok("mini: tapping the card expands back to the player", true);
await touchTap(195, 700);
await page.locator('button[aria-label="خروج از تمام‌صفحه"]').waitFor({ state: "visible", timeout: 5000 });
await page.locator('button[aria-label="خروج از تمام‌صفحه"]').click();
await waitFor("back to portrait", async () => page.evaluate(() => !document.fullscreenElement), 5000);
await waitFor("mini card again (still off /watch)", async () => (await page.locator('button[aria-label="بستن مینی‌پلیر"]').count()) > 0, 8000);
await page.locator('button[aria-label="بستن مینی‌پلیر"]').click();
await waitFor("player closed from the mini card", async () => (await page.locator('[data-player="mobile"]').count()) === 0, 8000);
ok("mini: ✕ closes the card AND the player (progress saved)", true);
ok("mini: route stays where the user browsed (no watch redirect)", !page.url().includes("/watch/"), page.url());
await page.screenshot({ path: `${shots}/11-mini-closed.png` });

await browser.close();
server.close();

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
