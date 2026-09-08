/* Cinema E2E — two REAL accounts, two browser contexts, REAL Supabase.
 * Flow: host logs in → plays the local test title → starts cinema from the
 * player panel → gets a code. Guest logs in → joins from the NEW navbar
 * popover by code → follows automatically. Then sync checks: pause, seek,
 * play, member list, and finally host closes → guest is told.
 * Run: node scripts/test-cinema-e2e.mjs  (server on :3222 must be up) */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3222";
const URL = "https://emqsegjeiyimoyncbhfn.supabase.co";
const KEY = "sb_publishable_m23eUV8cC-xqhqD-3P6Wsg_U5WsiM3E";
const PASS = "Frame#test-2026";
const stamp = Date.now().toString(36).slice(-6);
const HOST_EMAIL = `e2e-host-${stamp}@frame-test.ir`;
const GUEST_EMAIL = `e2e-guest-${stamp}@frame-test.ir`;

const shots = "/home/z/my-project/download/cinema-e2e";
import { mkdirSync } from "node:fs";
mkdirSync(shots, { recursive: true });

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
  results.push(cond);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

/* ---------- create the two accounts via REST ---------- */
async function ensureUser(email) {
  const sb = createClient(URL, KEY);
  let r = await sb.auth.signUp({ email, password: PASS });
  if (r.error && /already|registered|exists/i.test(r.error.message)) {
    r = await sb.auth.signInWithPassword({ email, password: PASS });
  }
  if (r.error) throw new Error(`signup ${email}: ${r.error.message}`);
  return email;
}
await ensureUser(HOST_EMAIL);
await ensureUser(GUEST_EMAIL);
console.log("accounts ready:", HOST_EMAIL, GUEST_EMAIL);

/* ---------- UI login helper (real /auth flow) ---------- */
const SB_KEY = "sb-emqsegjeiyimoyncbhfn-auth-token";
async function uiLogin(page, email) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  const emailIn = page.locator('input[type="email"]').first();
  await emailIn.waitFor({ timeout: 30000 });
  await emailIn.fill(email);
  await page.locator('input[type="password"]').first().fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  await waitFor(`session persisted for ${email}`, async () => {
    const raw = await page.evaluate((k) => localStorage.getItem(k), SB_KEY);
    if (!raw) return false;
    try { return !!JSON.parse(raw)?.user?.id; } catch { return false; }
  }, 15000);
  await page.waitForTimeout(800);
}

/* ---------- tiny test catalog: intercept the shard import ----------
 * The layout's CatalogGate blocks the whole app until the mobile catalog
 * (21 shards, ~14k titles) is imported into IndexedDB. For the E2E we serve
 * a 1-shard catalog with ONLY the test title — instant boot, deterministic. */
const TEST_ROW = {
  id: 900001,
  slug: "cinema-test-title",
  title: "تست سینما — رنگ‌ها",
  titleEn: "Cinema Test",
  type: "movie",
  year: 2026,
  rating: 8,
  duration: 120,
  description: "فیلم تستی سینما",
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
}

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });

/* ================= HOST ================= */
const hostCtx = await browser.newContext({ viewport: { width: 1360, height: 850 }, locale: "fa-IR" });
await installTinyCatalog(hostCtx);
const host = await hostCtx.newPage();
await uiLogin(host, HOST_EMAIL);
ok("host: logged in (supabase session persisted)", true);

await host.goto(`${BASE}/watch/cinema-test-title`, { waitUntil: "domcontentloaded" });
await host.waitForSelector("video", { timeout: 30000 }).catch(() => {});
await host.screenshot({ path: `${shots}/01-host-watchpage.png` });

// press the main play button on the watch page (theater opens)
const playBtn = host.locator("button:has(svg), a:has(svg)").filter({ hasText: /پخش|تماشا|Play/ }).first();
if (await playBtn.count()) await playBtn.click();
else await host.keyboard.press("Enter");
await host.waitForSelector("video", { timeout: 15000 });
await host.waitForTimeout(2500);
const hostPlaying0 = await host.evaluate(() => { const v = document.querySelector("video"); return v ? !v.paused : null; });
ok("host: video is playing", hostPlaying0 === true, `paused=${hostPlaying0 === null ? "?" : !hostPlaying0}`);

// open the cinema panel inside the player
await host.locator('button:has-text("سینما")').first().click();
await host.waitForTimeout(800);
await host.screenshot({ path: `${shots}/02-host-panel-idle.png` });

// start hosting
await host.locator('button:has-text("شروع سینما")').first().click();
await waitFor("host room code appears", async () => {
  const t = await host.locator("body").textContent();
  return /(?<![A-Z0-9])[A-Z2-9]{6}(?![A-Z0-9])/.test(t);
}, 10000);
await host.waitForTimeout(2500);
const bodyTxt = await host.locator("body").textContent();
const codeMatch = bodyTxt.match(/(?<![A-Z0-9])[A-Z2-9]{6}(?![A-Z0-9])/g) || [];
ok("host: room code displayed", codeMatch.length > 0, codeMatch.join(","));
const CODE = codeMatch[0];
await host.screenshot({ path: `${shots}/03-host-panel-code.png` });

/* ================= GUEST ================= */
const guestCtx = await browser.newContext({ viewport: { width: 1360, height: 850 }, locale: "fa-IR" });
await installTinyCatalog(guestCtx);
const guest = await guestCtx.newPage();
await uiLogin(guest, GUEST_EMAIL);

// guest lands on home → the NEW navbar cinema button
await guest.goto(BASE, { waitUntil: "domcontentloaded" });
await guest.waitForTimeout(1500);
const cinemaPill = guest.locator('header button:has-text("سینما")').first();
ok("guest: navbar cinema button visible", await cinemaPill.count() > 0);
await guest.screenshot({ path: `${shots}/04-guest-home-navbar.png` });

await cinemaPill.click();
await guest.waitForTimeout(600);
await guest.screenshot({ path: `${shots}/05-guest-popover-idle.png` });
await guest.locator('input[placeholder="XXXXXX"]').fill(CODE);
await guest.locator('button:has-text("جوین")').last().click();
await guest.waitForTimeout(2500);
ok("guest: navigated to the room's title", guest.url().includes("/watch/cinema-test-title"), guest.url());

// guest opens the player
const gPlayBtn = guest.locator("button:has(svg), a:has(svg)").filter({ hasText: /پخش|تماشا|Play/ }).first();
if (await gPlayBtn.count()) await gPlayBtn.click();
else await guest.keyboard.press("Enter");
await guest.waitForSelector("video", { timeout: 15000 });
await guest.waitForTimeout(3000);

/* presence: both sides should see 2 members shortly (host panel is ALREADY
   open from the hosting step; the drawer covers the toolbar button, so no
   re-click — read it directly) */
await host.waitForTimeout(2500);
const hostPanelTxt = await host.locator("body").textContent();
ok("presence: host sees 2 in the room", hostPanelTxt.includes("۲") && (hostPanelTxt.includes("داخل سینما") || hostPanelTxt.includes("نفر")), "");
await guest.locator('button:has-text("سینما")').first().click();
await guest.waitForTimeout(1200);
await guest.screenshot({ path: `${shots}/06-guest-popover-live.png` });
const guestPopTxt = await guest.locator("body").textContent();
ok("presence: guest sees 2 members", /2/.test(guestPopTxt) && guestPopTxt.includes("داخل سینما"), "");

/* ---------- SYNC 1: host pauses → guest pauses ---------- */
const hp0 = await host.evaluate(() => document.querySelector("video").paused);
if (!hp0) await host.keyboard.press(" "); // space = pause in the player? (click toggles too)
await host.waitForTimeout(300);
let paused = await host.evaluate(() => document.querySelector("video").paused);
if (!paused) { await host.mouse.click(680, 400); await host.waitForTimeout(400); paused = await host.evaluate(() => document.querySelector("video").paused); }
ok("host: paused locally", paused);
await waitFor("guest follows pause", async () => (await guest.evaluate(() => document.querySelector("video").paused)) === true, 10000);
ok("sync: host pause → guest paused", true);

/* ---------- SYNC 2: host seeks → guest follows ---------- */
await host.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 90; });
await waitFor("guest follows seek to ~90s", async () => {
  const t = await guest.evaluate(() => document.querySelector("video").currentTime);
  return Math.abs(t - 90) < 3;
}, 12000);
ok("sync: host seek(90s) → guest ≈90s", true, `guest=${await guest.evaluate(() => document.querySelector("video").currentTime)}`);

/* ---------- SYNC 3: host plays → guest plays ---------- */
await host.mouse.click(680, 400); // toggle play back on
await waitFor("guest follows play", async () => !(await guest.evaluate(() => document.querySelector("video").paused)), 10000);
ok("sync: host play → guest playing", true);

/* ---------- SYNC 4: drift correction (guest scrubs away, host beat pulls back) ---------- */
await guest.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 20; });
await waitFor("guest pulled back to host position", async () => {
  const g = await guest.evaluate(() => document.querySelector("video").currentTime);
  const h = await host.evaluate(() => document.querySelector("video").currentTime);
  return Math.abs(g - h) < 4;
}, 15000);
ok("sync: guest drift auto-corrected", true);

await host.screenshot({ path: `${shots}/07-host-live-sync.png` });
await guest.screenshot({ path: `${shots}/08-guest-live-sync.png` });

/* ---------- CLOSE: host ends cinema → guest notified ---------- */
await host.locator('button:has-text("پایان سینما")').first().click();
await waitFor("guest notified «میزبان سینما را بست»", async () => {
  const t = await guest.locator("body").textContent();
  return t.includes("میزبان سینما را بست");
}, 12000);
ok("close: guest sees the host-ended banner", true);
await guest.screenshot({ path: `${shots}/09-guest-closed-banner.png` });

/* guest cinema state fully back to idle — the drawer is still open (covers
   the toolbar button), close it via its X, then re-open fresh */
await guest.locator('button[aria-label="بستن"]').first().click();
await guest.waitForTimeout(400);
await guest.locator('button[title*="سینما"]').first().click();
await guest.waitForTimeout(900);
const idleTxt = await guest.locator("body").textContent();
ok("close: guest cinema back to idle (can host again)", idleTxt.includes("شروع سینما"), "");

await browser.close();
const fails = results.filter((r) => !r).length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
process.exit(fails ? 1 : 0);
