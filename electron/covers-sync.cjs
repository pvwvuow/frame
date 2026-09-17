/* ART-3.0 (v0.36.0) — desktop COVERPACK SYNC (the missing desktop half of the
 * offline-cover machinery Android has had since v0.16.0).
 *
 * WHY: the packaged desktop app is cover-light — it ships NO artwork and
 * posterSrc used to stream metahub / raw.githubusercontent per-<img>. On
 * Iranian networks both remote hosts fail in bulk → dark cards everywhere.
 * The release assets already carry the FULL artwork library as split
 * ~12MB parts (Frame-coverpack-rN-pNN.zip, views-ordered: the most-seen
 * titles first) — the exact assets the Android app downloads. Until now the
 * desktop had no downloader for them.
 *
 * HOW: this module runs in the MAIN process and uses electronNet.fetch —
 * the Chromium network stack, system-proxy aware (Node fetch ignores the
 * system proxy: the v0.34.3 catalog lesson). Parts download sequentially
 * into <userData>/coverpack-cache (resume across boots: a landed part is
 * skipped by the server manifest, a partial zip by its size check), and
 * each part is POSTed to the local Next server /api/covers/merge which
 * unpacks it into <userData>/covers-store and updates the manifest.
 * Coverage grows part by part, so the first merged part already puts the
 * most popular posters on local disk.
 *
 * The renderer learns progress via «covers:progress» webContents events
 * (CoversSyncBridge → localStorage rev flip) and can ask for a manual run
 * via covers:sync-now.
 */
const fs = require("node:fs");
const path = require("node:path");
const log = require("electron-log");

const REPO = "pvwvuow/frame";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const PACK_RE = /^Frame-coverpack-r(\d+)-p(\d+)\.zip$/i;
const BOOT_DELAY_MS = 25 * 1000; // let boot seed-merge + first paint settle
const PART_TIMEOUT_MS = 30 * 60 * 1000; // 12MB on a slow VPN still lands
const API_TIMEOUT_MS = 20 * 1000;

let state = {
  phase: "idle", // idle | check | download | merge | done | error | up-to-date
  part: 0,
  totalParts: 0,
  received: 0,
  total: 0,
  message: "",
  error: "",
  rev: 0,
  updatedAt: null,
};

let ctx = null; // { serverUrl, cacheDir, send, netFetch }
let running = false;
let bootTimer = null;

function setState(patch) {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  emit();
}

function emit() {
  try {
    ctx && ctx.send("covers:progress", publicState());
  } catch {
    /* window may be gone */
  }
}

function publicState() {
  return { ...state };
}

/** GET/POST through the Chromium stack (proxy-aware). */
async function netFetch(url, opts = {}, timeoutMs = API_TIMEOUT_MS) {
  const res = await ctx.netFetch(url, {
    headers: { "User-Agent": "Frame-CoversSync", ...(opts.headers || {}) },
    ...opts,
    // BUG-076 — the timeout parameter was silently dropped: a hung coverpack
    // download or merge POST kept `running` true forever and refused every
    // future sync until app restart.
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}

async function fetchJson(url, timeoutMs) {
  const res = await netFetch(url, { headers: { Accept: "application/vnd.github+json" } }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Read the store manifest directly (the server writes it; mirrors its shape). */
function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ctx.storeDir, "manifest.json"), "utf8"));
  } catch {
    return { rev: 0, parts: [], totalParts: 0, files: 0, bytes: 0 };
  }
}

/** Stream a web ReadableStream to disk with progress. */
async function downloadToFile(url, dest, size) {
  const res = await netFetch(url, {}, PART_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error("empty body");
  const reader = res.body.getReader();
  const tmp = dest + ".tmp";
  const out = fs.openSync(tmp, "w");
  let received = 0;
  let lastEmit = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      fs.writeSync(out, value);
      received += value.byteLength;
      const now = Date.now();
      if (now - lastEmit > 400) {
        lastEmit = now;
        setState({ phase: "download", received, total: size || 0 });
      }
    }
  } finally {
    fs.closeSync(out);
  }
  if (size && received !== size) throw new Error(`size mismatch ${received}/${size}`);
  fs.renameSync(tmp, dest);
  return received;
}

async function mergePart(zipPath, rev, part, totalParts) {
  setState({ phase: "merge", part });
  const res = await netFetch(`${ctx.serverUrl}/api/covers/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zipPath, rev, part, totalParts }),
  }, 60 * 1000);
  if (!res.ok) throw new Error(`merge HTTP ${res.status}`);
  const body = await res.json();
  if (!body || !body.ok) throw new Error("merge rejected");
  return body.manifest;
}

async function run() {
  const manifest = readManifest();
  setState({ phase: "check", message: "" });

  // releases/latest → resolves to the newest published release (same URL
  // family the catalog sync + updater already prove reachable)
  let rel;
  try {
    rel = await fetchJson(LATEST_API, API_TIMEOUT_MS);
  } catch (e) {
    throw new Error(`release check failed: ${e && e.message}`);
  }
  const assets = (rel && Array.isArray(rel.assets) ? rel.assets : []) || [];
  let rev = 0;
  const partsMap = new Map();
  for (const a of assets) {
    const m = PACK_RE.exec(a.name || "");
    if (!m) continue;
    const r = Number(m[1]);
    const p = Number(m[2]);
    if (r > rev) rev = r;
    const list = partsMap.get(r) || [];
    list.push({ part: p, url: a.browser_download_url, size: a.size });
    partsMap.set(r, list);
  }
  if (!rev) {
    setState({ phase: "up-to-date", rev: 0, message: "no packs on release" });
    return;
  }
  const parts = (partsMap.get(rev) || []).sort((a, b) => a.part - b.part);

  if (manifest.rev >= rev && manifest.parts.length >= parts.length) {
    setState({ phase: "up-to-date", rev, totalParts: parts.length, message: "آپدیت است" });
    return;
  }

  fs.mkdirSync(ctx.cacheDir, { recursive: true });
  fs.mkdirSync(ctx.storeDir, { recursive: true });

  for (const p of parts) {
    if (manifest.parts.includes(p.part)) continue;
    const nn = String(p.part).padStart(2, "0");
    const dest = path.join(ctx.cacheDir, `Frame-coverpack-r${rev}-p${nn}.zip`);
    // resume: a fully-landed zip from a previous boot is reused as-is
    let have = false;
    try {
      have = fs.existsSync(dest) && fs.statSync(dest).size === p.size;
    } catch {
      have = false;
    }
    if (!have) {
      setState({ phase: "download", part: p.part, totalParts: parts.length, received: 0, total: p.size, message: `دانلود بستهٔ ${p.part} از ${parts.length}` });
      try {
        fs.rmSync(dest, { force: true });
        await downloadToFile(p.url, dest, p.size);
      } catch (e) {
        try { fs.rmSync(dest, { force: true }); } catch { /* ignore */ }
        throw new Error(`part ${p.part} download failed: ${e && e.message}`);
      }
    }
    const mf = await mergePart(dest, rev, p.part, parts.length);
    setState({ phase: "merge", part: p.part, totalParts: parts.length, rev: mf.rev, message: `بستهٔ ${p.part} نصب شد (${mf.parts.length}/${parts.length})` });
  }

  const done = readManifest();
  setState({ phase: "done", rev: done.rev, totalParts: parts.length, message: "تصاویر آفلاین آماده است" });
  log.info("[covers-sync] complete:", JSON.stringify({ rev: done.rev, parts: done.parts.length, files: done.files, bytes: done.bytes }));
}

function startSync() {
  if (!ctx || running) return false;
  running = true;
  setState({ phase: "check", error: "", message: "" });
  void (async () => {
    try {
      await run();
    } catch (e) {
      const msg = String((e && e.message) || e);
      log.warn("[covers-sync] failed:", msg);
      setState({ phase: "error", error: msg });
    } finally {
      running = false;
    }
  })();
  return true;
}

/** Wire the module up (called from main.cjs once the server is healthy). */
function startCoversSync(options) {
  ctx = options; // { serverUrl, userData, send, netFetch }
  ctx.cacheDir = path.join(options.userData, "coverpack-cache");
  ctx.storeDir = path.join(options.userData, "covers-store");
  if (bootTimer) clearTimeout(bootTimer);
  bootTimer = setTimeout(() => {
    if (process.env.NAMA_COVERS_SYNC === "0") return;
    startSync();
  }, BOOT_DELAY_MS);
  bootTimer.unref?.();
}

function coversState() {
  return publicState();
}

module.exports = { startCoversSync, startSync, coversState, LATEST_API };
