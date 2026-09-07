/* Verify the Frame Android static export in Chromium:
 * catalog import → home shelves → movies grid → title page → search →
 * favorites/watchlist via the fetch shim (IndexedDB). */
import { chromium } from "playwright";

const BASE = "http://localhost:8899";
const results = [];
const ok = (name, cond, extra = "") => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"} | ${name}${extra ? " | " + extra : ""}`);
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile" });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));

// 1) home + catalog import
const t0 = Date.now();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
// wait for splash to go away (import done) — up to 60s
await page.waitForFunction(() => !document.querySelector("img[src='/app-icon.png']") || document.body.innerText.length > 500, null, { timeout: 60000 }).catch(() => {});
await page.waitForSelector("main img", { timeout: 30000 }).catch(() => {});
const importMs = Date.now() - t0;
ok("home: main renders", await page.$("main"), `t=${importMs}ms`);

// catalog in IndexedDB?
const cat = await page.evaluate(async () => {
  const { localforage } = {};
  return new Promise((resolve) => {
    const req = indexedDB.open("frame-mobile");
    req.onsuccess = () => {
      const db = req.result;
      let titles = 0;
      const done = () => resolve({ titles });
      if (!db.objectStoreNames.contains("titles")) return resolve({ titles: -1 });
      const tx = db.transaction("titles", "readonly");
      const st = tx.objectStore("titles");
      const c = st.count();
      c.onsuccess = () => { titles = c.result; done(); };
      c.onerror = () => resolve({ titles: -2 });
    };
    req.onerror = () => resolve({ titles: -3 });
  });
});
ok("IndexedDB titles imported", cat.titles >= 14000, JSON.stringify(cat));

// shelves render: count cards
const cards = await page.$$eval("main img", (els) => els.length);
ok("home: cards rendered", cards > 20, `imgs=${cards}`);
await page.screenshot({ path: "/tmp/m-home.png" });

// 2) movies page
await page.goto(BASE + "/movies", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("main img").length > 10, null, { timeout: 30000 }).catch(() => {});
const mv = await page.$$eval("main img", (els) => els.length);
ok("movies: grid renders", mv > 10, `imgs=${mv}`);

// 3) title page via the mobile query-route (the shell the export emits)
const slug = await page.evaluate(async () => {
  const r = await fetch("/catalog/mobile/manifest.json").then((x) => x.json());
  const s = await fetch("/catalog/mobile/full-00.json").then((x) => x.json());
  return s[0].slug;
});
await page.goto(`${BASE}/title/_?s=${slug}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("h1")?.innerText?.trim().length > 1, null, { timeout: 30000 }).catch(() => {});
const h1 = await page.$eval("h1", (e) => e.innerText).catch(() => "");
ok("title page renders", h1.length > 0, `h1="${h1.slice(0, 30)}"`);
await page.screenshot({ path: "/tmp/m-title.png" });

// 4) search via shim
await page.goto(BASE + "/search?q=بریکینگ", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("main img").length > 0, null, { timeout: 30000 }).catch(() => {});
const sres = await page.$$eval("main img", (els) => els.length);
ok("search: results render", sres > 0, `imgs=${sres}`);

// 5) shim API: library + favorites toggle
const api = await page.evaluate(async () => {
  const lib1 = await (await fetch("/api/library")).json();
  const fav = await (await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titleId: 7 }) })).json();
  const lib2 = await (await fetch("/api/library")).json();
  const unfav = await (await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titleId: 7, value: false }) })).json();
  return { fav0: lib1.favorites.length, fav, count1: lib2.favorites.length, unfav };
});
ok("shim: favorites toggle", api.fav.isFavorite === true && api.count1 === api.fav0 + 1 && api.unfav.isFavorite === false, JSON.stringify(api));

// 6) favorites page reflects toggle
await page.evaluate(async () => {
  await fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ titleId: 7 }) });
});
await page.goto(BASE + "/favorites", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("main img").length > 0, null, { timeout: 30000 }).catch(() => {});
const favImgs = await page.$$eval("main img", (els) => els.length);
ok("favorites page renders", favImgs > 0, `imgs=${favImgs}`);

// 7) watch page boot (signed-out → entitlement gate renders; video mounts only for entitled users)
await page.goto(`${BASE}/watch/_?s=${slug}`, { waitUntil: "domcontentloaded" });
// wait for the catalog splash to clear (cold context imports again)
await page.waitForFunction(
  () => !document.body.innerText.includes("آماده‌سازی آرشیو"),
  null,
  { timeout: 90000 }
).catch(() => {});
await page.waitForTimeout(5000);
const watchState = await page.evaluate(() => {
  const v = document.querySelector("video");
  const bodyText = document.body.innerText;
  return {
    hasVideo: !!v,
    gate: /اشتراک|وارد شو|ورود|عضویت/.test(bodyText),
    src: (v?.currentSrc || v?.src || "").slice(0, 60),
  };
});
ok("watch: player or entitlement gate", watchState.hasVideo || watchState.gate, JSON.stringify(watchState));
await page.screenshot({ path: "/tmp/m-watch.png" });

// 8) THE user-reported bug: card → QuickView → "full details" link must land
// on the title page (not bounce back to home with a reload)
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("main img").length > 10, null, { timeout: 30000 }).catch(() => {});
// dismiss the welcome/auth popup if it came up (fresh context → no seen-flag;
// it pops 1.6s after paint, so sweep a few times)
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(700);
  const closed = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.getAttribute("aria-label") || "").includes("بستن") || (x.getAttribute("aria-label") || "").toLowerCase() === "close"
    );
    if (b) { b.click(); return true; }
    return false;
  });
  if (!closed && i >= 2) break;
}
await page.click("main button[aria-label*='جزئیات'], main button[aria-label*='details' i]", { timeout: 10000 }).catch(() => {});
await page.waitForSelector("[role='dialog'], [class*='modal']", { timeout: 10000 }).catch(() => {});
const modalUp = await page.evaluate(() => !!document.querySelector("[role='dialog'], [class*='modal']"));
const detailsLink = await page.$("a[href^='/title/']");
ok("quickview: modal + details link", modalUp && !!detailsLink);
if (detailsLink) {
  const expectedName = await page.evaluate(() => {
    const m = document.querySelector("[role='dialog'], [class*='modal']");
    return m ? m.querySelector("h2,h3")?.innerText?.trim().slice(0, 40) : "";
  });
  // JS click: the link sits inside the scrollable bottom-sheet and the sheet's
  // action bar can overlap it in the 412px viewport (hit-testing fails there)
  await page.evaluate((el) => el.click(), detailsLink);
  await page.waitForFunction(
    (name) => document.querySelector("h1")?.innerText?.trim().length > 1,
    expectedName,
    { timeout: 30000 }
  ).catch(() => {});
  await page.waitForTimeout(1200); // let client data paint
  const nav = await page.evaluate(() => ({
    url: location.pathname + location.search,
    h1: document.querySelector("h1")?.innerText?.trim() ?? "",
    isHome: !!document.querySelector("main img[src*='poster']") && location.pathname === "/",
  }));
  ok(
    "nav: card → details stays on title page",
    nav.url.startsWith("/title/_?s=") && nav.h1.length > 1 && !nav.isHome,
    JSON.stringify(nav).slice(0, 120)
  );
  await page.screenshot({ path: "/tmp/m-nav-title.png" });

  // 9) person page via director/cast chip on the title page
  const clickedPerson = await page.evaluate(() => {
    const a = [...document.querySelectorAll("main a[href^='/person/']")].find(
      (x) => (x.getAttribute("href") || "").length > "/person/_?s=".length
    );
    if (a) { a.click(); return a.getAttribute("href"); }
    return null;
  });
  if (clickedPerson) {
    await page.waitForTimeout(1800);
    const p = await page.evaluate(() => ({
      url: location.pathname + location.search,
      h1: document.querySelector("h1")?.innerText?.trim() ?? "",
    }));
    ok("nav: person page via ?s=", p.url.startsWith("/person/_?s=") && p.h1.length > 1, JSON.stringify(p).slice(0, 120));
    await page.screenshot({ path: "/tmp/m-nav-person.png" });
  } else {
    ok("nav: person page via ?s=", false, "no person link on title page");
  }
}

// 10) collection page via ?s=
await page.goto(`${BASE}/collections/_?s=top-rated`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelectorAll("main img").length > 3, null, { timeout: 30000 }).catch(() => {});
const col = await page.$$eval("main img", (els) => els.length);
ok("collections: page renders via ?s=", col > 3, `imgs=${col}`);

// 11) settings: android update card present on mobile
await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.includes("به‌روزرسانی برنامه"), null, { timeout: 20000 }).catch(() => {});
const upd = await page.evaluate(() => document.body.innerText.includes("به‌روزرسانی برنامه (اندروید)"));
ok("settings: AppUpdateCard renders", upd);

const pass = results.filter((r) => r.pass).length;
console.log(`\n== ${pass}/${results.length} passed ==`);
await browser.close();
process.exit(pass === results.length ? 0 : 1);
