/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * نما – Electron main process
 *
 * Production layout (see electron-builder.yml):
 *   <resources>/app/standalone/server.js      – Next.js standalone server
 *   <resources>/app/standalone/.next/static   – static assets
 *   <resources>/app/standalone/public         – posters / videos / fonts
 *   <resources>/app/seed.db                   – pristine SQLite database
 *
 * On first launch the seed database is copied to <userData>/nama.db so user
 * data survives updates. The Next server is spawned as a Node child process
 * (ELECTRON_RUN_AS_NODE) on a free localhost port and the window loads it.
 */
const { app, BrowserWindow, ipcMain, shell, Menu, nativeTheme, dialog, session } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");
const http = require("node:http");
const log = require("electron-log");

log.transports.file.level = "info";
log.initialize?.();

const isDev = !app.isPackaged;
// bundled entry lives in electron/dist → project root is two levels up
const ROOT = path.join(__dirname, "..", "..");
const DEV_URL = process.env.NAMA_DEV_URL || "http://localhost:3000";
const APP_NAME = "نما";

/* userData must be ASCII-safe: the SQLite path is handed to Prisma as a
   `file:` URL and the query engine fails to OPEN (or create) files under
   non-ASCII directories on Windows (the Persian app name «نما» produced
   %APPDATA%\نما\nama.db → "Error code 14: Unable to open the database file"
   → every page rendered "A server error occurred"). Keep the visible app
   name Persian, but pin the data directory to plain ASCII.
   appData is resolvable before `ready`; an explicit setPath below always wins. */
const LEGACY_USER_DATA = path.join(app.getPath("appData"), APP_NAME);
app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), "Nama"));

let mainWindow = null;
let serverProc = null;
let serverUrl = null;
let autoUpdater = null;
/** exit info of the last dead server process – for precise error messages */
let lastServerExit = null;

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
function resourcesDir() {
  return isDev ? ROOT : process.resourcesPath;
}
function standaloneDir() {
  return isDev ? path.join(ROOT, ".next", "standalone") : path.join(resourcesDir(), "app", "standalone");
}
function seedDbPath() {
  return isDev ? path.join(ROOT, "db", "custom.db") : path.join(resourcesDir(), "app", "seed.db");
}
function userDbPath() {
  return path.join(app.getPath("userData"), "nama.db");
}
/** True only for the boot that actually copied the bundled seed (first run
 *  or a corrupted-db recovery) – used to trigger the fast seed-adoption path
 *  (cover-URL rebase + release-hash pre-store) instead of a full merge. */
let freshSeedCopy = false;
function toFileUrl(p) {
  // Prisma sqlite accepts `file:` + absolute path; use forward slashes on Windows.
  return "file:" + p.replace(/\\/g, "/");
}

function catalogMarkerPath() {
  return path.join(app.getPath("userData"), "catalog.sha256");
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

/** Records which bundled seed version the user database currently reflects. */
function writeCatalogMarker(hash) {
  try {
    fs.mkdirSync(path.dirname(catalogMarkerPath()), { recursive: true });
    fs.writeFileSync(catalogMarkerPath(), hash + "\n", "utf8");
    log.info("catalog marker updated:", hash.slice(0, 12));
  } catch (e) {
    log.warn("could not write catalog marker:", e);
  }
}

function readCatalogMarker() {
  try {
    return fs.readFileSync(catalogMarkerPath(), "utf8").trim();
  } catch {
    return "";
  }
}

function isSQLiteFile(p) {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return buf.toString("utf8") === "SQLite format 3\0";
  } catch {
    return false;
  }
}

/** One-time carry-over of the v0.6.0-era database that lived under %APPDATA%\نما. */
function migrateLegacyDb(dst) {
  try {
    const legacy = path.join(LEGACY_USER_DATA, "nama.db");
    if (path.resolve(legacy) !== path.resolve(dst) && fs.existsSync(legacy) && isSQLiteFile(legacy) && !fs.existsSync(dst)) {
      // atomic copy (tmp + rename) so an interrupted migration never leaves
      // a half-written nama.db behind
      const tmp = dst + ".legacy-tmp";
      fs.copyFileSync(legacy, tmp);
      fs.renameSync(tmp, dst);
      log.info("migrated legacy database from", legacy);
    }
  } catch (e) {
    log.warn("legacy database migration skipped:", e);
  }
}

function ensureUserDb() {
  const dst = userDbPath();
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  migrateLegacyDb(dst);
  const usable = fs.existsSync(dst) && isSQLiteFile(dst) && fs.statSync(dst).size > 4096;
  if (!usable) {
    freshSeedCopy = true;
    const src = seedDbPath();
    // Stale -wal/-shm journals from a previous database would corrupt the
    // fresh copy (SQLite would try to recover them against the new file) –
    // move a pre-existing db aside (kept for support) and drop its journals.
    const brokenStamp = fs.existsSync(dst)
      ? ".broken-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 24)
      : null;
    for (const suf of ["", "-wal", "-shm"]) {
      const f = dst + suf;
      if (!fs.existsSync(f)) continue;
      try {
        if (brokenStamp) fs.renameSync(f, f + brokenStamp);
        else fs.rmSync(f, { force: true });
      } catch {
        try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
      }
    }
    if (fs.existsSync(src)) {
      // atomic copy (tmp + rename) so an interrupted copy never leaves a broken db
      const tmp = dst + ".tmp";
      fs.copyFileSync(src, tmp);
      fs.renameSync(tmp, dst);
      log.info("seeded user database at", dst);
      // the fresh copy already reflects the bundled catalog → remember it so
      // the boot-time comparison below does not schedule a needless refresh
      try {
        writeCatalogMarker(sha256File(src));
      } catch (e) {
        log.warn("seed hash failed after first-run copy:", e);
      }
    } else {
      // no seed shipped → Prisma will create an empty file and seed.ts
      // self-heals the schema (db/schema.sql) on first request
      log.warn("seed database missing:", src, "– falling back to runtime schema bootstrap");
    }
  }
  return dst;
}

/* ------------------------------------------------------------------ */
/* leftover-server hygiene (v0.10.2)                                   */
/* ------------------------------------------------------------------ */
/* If a previous run was force-killed, the Next server child survives as an
   orphan and keeps nama.db locked → "database is locked" errors and slow
   boots. A pid file lets the next launch detect and reap it. */
function serverPidFile() {
  return path.join(app.getPath("userData"), "server.pid");
}

function writeServerPid(pid) {
  try {
    fs.mkdirSync(path.dirname(serverPidFile()), { recursive: true });
    fs.writeFileSync(serverPidFile(), String(pid), "utf8");
  } catch (e) {
    log.warn("could not write server.pid:", e);
  }
}

function clearServerPid() {
  try {
    fs.rmSync(serverPidFile(), { force: true });
  } catch {
    /* ignore */
  }
}

/** True when `pid` is (very likely) a leftover Nama standalone server. */
function isOurServerProcess(pid) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { timeout: 10000, windowsHide: true }
      ).toString();
      return /server\.js/i.test(out);
    }
    if (process.platform === "darwin") {
      // macOS has no /proc – `ps -p <pid> -o command=` prints the full argv
      const out = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
        timeout: 10000,
      }).toString();
      return /server\.js/.test(out);
    }
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return /server\.js/.test(cmd);
  } catch {
    return false;
  }
}

function killProcessTree(pid) {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
        timeout: 10000,
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGKILL");
    }
    log.warn("killed leftover server process:", pid);
  } catch (e) {
    log.info("leftover server already gone:", pid, (e && e.message) || e);
  }
}

function cleanupStaleServer() {
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(serverPidFile(), "utf8").trim());
  } catch {
    return;
  }
  clearServerPid();
  if (!pid || pid === process.pid || !Number.isFinite(pid)) return;
  if (isOurServerProcess(pid)) killProcessTree(pid);
  else log.info("stale pid", pid, "is not a Nama server – left alone");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Waits until the embedded server answers /api/health. Fails FAST when the
 *  server process dies, and never hammers a busy-but-alive server (a cold
 *  start under antivirus scanning can legitimately take a while). */
function waitFor(url, timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const retry = (err) => {
      if (!serverProc) {
        const why = lastServerExit ? `exit code ${lastServerExit.code}` : "process gone";
        return reject(new Error(`server process exited before becoming ready (${why})`));
      }
      if (Date.now() - started > timeoutMs) {
        return reject(err instanceof Error ? err : new Error("server did not start in time"));
      }
      setTimeout(tick, 400);
    };
    const tick = () => {
      if (!serverProc) return retry();
      const req = http.get(url + "/api/health", (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(10000, () => {
        req.destroy();
        retry();
      });
    };
    tick();
  });
}

/** GET + JSON parse helper shared by the boot probes and the sync watcher. */
function httpJson(url_, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url_, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("health request timeout")));
  });
}

function attachServerLogging(proc) {
  proc.stdout.on("data", (d) => log.info("[next]", String(d).trim()));
  proc.stderr.on("data", (d) => log.warn("[next]", String(d).trim()));
  proc.on("exit", (code, signal) => {
    lastServerExit = { code, signal };
    log.warn("next server exited with code", code);
    serverProc = null;
  });
}

/** Polls the background catalog sync (see runStartupSync in
 *  catalog-refresh.ts) until it settles, then records the bundled-seed
 *  marker. A failed merge leaves the marker stale → next boot retries. */
function watchCatalogSync(seedHash) {
  if (!seedHash) return;
  const started = Date.now();
  const timer = setInterval(() => {
    if (!serverUrl) {
      clearInterval(timer);
      return;
    }
    if (Date.now() - started > 20 * 60 * 1000) {
      clearInterval(timer);
      log.error("catalog sync watcher timed out – marker left stale, next boot retries");
      return;
    }
    httpJson(serverUrl + "/api/health", 10000)
      .then((j) => {
        const st = j && j.catalog;
        if (!st || st.status === "running" || st.status === "idle") return; // keep waiting
        clearInterval(timer);
        if (st.status === "ok" && st.result && st.result.ok) {
          const secs = st.finishedAt && st.startedAt ? Math.max(1, Math.round((st.finishedAt - st.startedAt) / 1000)) : "?";
          log.info(
            `catalog sync finished in ${secs}s: ${st.result.titles} titles, ` +
              `+${st.result.created ?? 0} new, ~${st.result.updated ?? 0} updated, -${st.result.removed ?? 0} removed`
          );
          writeCatalogMarker(seedHash);
        } else {
          log.error("catalog sync failed:", (st.result && st.result.error) || st.status);
          log.warn("catalog marker left stale – next launch retries the merge");
        }
      })
      .catch(() => {
        /* server busy – keep polling */
      });
  }, 4000);
  timer.unref?.();
}

/** Site root for asset rebasing – same rule as catalog-refresh.ts. A catalog
 *  URL like <root>/main/public/catalog/index.json yields <root>/main/public/
 *  (where covers live); plain static hosts keep their origin root. */
function siteRootOfUrl(u) {
  try {
    const x = new URL(u);
    const m = x.pathname.match(/^(.*\/)catalog\/[^/]+$/);
    x.pathname = m ? m[1] : x.pathname.replace(/[^/]*$/, "");
    x.search = "";
    x.hash = "";
    return x.toString();
  } catch {
    return u;
  }
}

async function startServer() {
  if (isDev && process.env.NAMA_USE_DEV_SERVER !== "0") {
    // `npm run dev` is expected to be running
    serverUrl = DEV_URL;
    return serverUrl;
  }
  const dir = standaloneDir();
  const entry = path.join(dir, "server.js");
  if (!fs.existsSync(entry)) throw new Error(`standalone server not found: ${entry}\nRun "npm run build" first.`);

  cleanupStaleServer();
  const dbPath = ensureUserDb();

  /* Catalog freshness: if the bundled seed differs from the version the user
     database was installed from, let the server merge the new catalog in
     before the window opens (see src/lib/catalog-refresh.ts). Without this,
     an updated app kept rendering the catalog of the FIRST installed version
     – the user DB intentionally survives updates, the old code only copied
     the seed when the file was still missing. */
  let seedHash = null;
  let needsCatalogRefresh = false;
  const seed = seedDbPath();
  if (fs.existsSync(seed)) {
    try {
      seedHash = sha256File(seed);
      needsCatalogRefresh = seedHash !== readCatalogMarker();
    } catch (e) {
      log.warn("catalog seed hash failed:", e);
    }
  }
  if (needsCatalogRefresh) log.info("bundled catalog differs from installed – refresh scheduled");

  /* Content auto-update (default ON): the catalog is pulled from this repo's
     raw GitHub URL, so new movies/series committed to the repository reach
     every installed app WITHOUT releasing a new version. The merge is
     hash-gated and preserves all user data (profiles, favorites, progress).

     Opt-out / override: drop a plain-text catalog-url.txt next to seed.db
     (resources/app) containing either
       - another http(s) URL  → sync from that server instead, or
       - "off" / "local"      → disable remote sync entirely (bundled seed only). */
  const DEFAULT_CATALOG_URL = "https://raw.githubusercontent.com/pvwvuow/frame/main/public/catalog/index.json";
  let catalogUrl = "";
  try {
    const urlFile = path.join(path.dirname(seed), "catalog-url.txt");
    if (fs.existsSync(urlFile)) {
      const v = fs.readFileSync(urlFile, "utf8").trim();
      if (/^https?:\/\//i.test(v)) {
        catalogUrl = v;
        log.info("hosted catalog configured:", catalogUrl);
      } else if (/^(off|local|disable[d]?)$/i.test(v)) {
        log.info("remote catalog sync disabled via catalog-url.txt");
      } else if (v) {
        log.warn("ignoring catalog-url.txt – not an http(s) URL");
      }
    } else {
      catalogUrl = DEFAULT_CATALOG_URL;
      log.info("content auto-update enabled (GitHub catalog):", catalogUrl);
    }
  } catch (e) {
    log.warn("catalog-url.txt read failed:", e);
  }

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: "0", // set per spawn attempt below (retry on instant death)
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: toFileUrl(dbPath),
    NEXT_TELEMETRY_DISABLED: "1",
    NAMA_ELECTRON: "1",
    NAMA_CATALOG_SEED: needsCatalogRefresh ? seed : "",
    NAMA_CATALOG_URL: catalogUrl,
  };

  /* Cover-light packages (v0.10.1+): when covers are not bundled, root-relative
     asset paths (/covers/…) must resolve against the hosted site root. The
     server rebases them – both on the fast fresh-seed adoption path and on the
     full seed merge. Full packages with bundled covers keep local paths. */
  const coversBundled = fs.existsSync(path.join(standaloneDir(), "public", "covers"));
  if (!coversBundled) {
    env.NAMA_CATALOG_SITE_ROOT = siteRootOfUrl(catalogUrl || DEFAULT_CATALOG_URL);
  }
  /* Fresh seed (first run): the server only rebases cover URLs in place and
     pre-stores the release catalog hash (seed-version.json, written by
     afterPack) so the remote sync fast-paths instead of downloading the
     whole ~69MB index.json for content the seed already carries. */
  if (freshSeedCopy) {
    env.NAMA_CATALOG_FRESH_SEED = "1";
    try {
      const vf = path.join(path.dirname(seed), "seed-version.json");
      if (fs.existsSync(vf)) {
        const vHash = (JSON.parse(fs.readFileSync(vf, "utf8")).sha256 || "").toLowerCase();
        if (/^[0-9a-f]{64}$/.test(vHash)) env.NAMA_CATALOG_SEED_VERSION_HASH = vHash;
      }
    } catch (e) {
      log.warn("seed-version.json read failed:", e);
    }
  }
  /* If the server dies instantly (port race, antivirus lock) retry once on a
     fresh port before surfacing an error. */
  for (let attempt = 1; ; attempt++) {
    env.PORT = String(await freePort());
    serverProc = spawn(process.execPath, [entry], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    writeServerPid(serverProc.pid);
    attachServerLogging(serverProc);
    serverUrl = `http://127.0.0.1:${env.PORT}`;
    try {
      // /api/health answers in milliseconds since v0.10.2 – the catalog
      // merge moved to a background job (runStartupSync) and no longer
      // blocks the startup gate
      await waitFor(serverUrl, 90000);
      break;
    } catch (e) {
      const diedEarly = !serverProc;
      stopServer();
      if (attempt >= 2 || !diedEarly) throw e;
      log.warn("server process died immediately – retrying once on a fresh port");
    }
  }
  await probeDatabase(serverUrl);
  if (seedHash) {
    if (!needsCatalogRefresh) {
      writeCatalogMarker(seedHash);
    } else {
      // the bundled-seed merge runs in the background now – the marker is
      // written only when it settles (a stale marker retries next boot)
      watchCatalogSync(seedHash);
    }
  }
  homeProbeDigest = await probeHomePage(serverUrl);
  if (homeProbeDigest) log.error("home page SSR error, digest:", homeProbeDigest);
  return serverUrl;
}

/** Fetches / and looks for an RSC error digest embedded in the streamed payload. */
function probeHomePage(baseUrl) {
  return new Promise((resolve) => {
    const req = http.get(baseUrl + "/", (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        const m = body.match(/digest\\*"?:\\*"(\d{4,})/) || body.match(/"digest":"(\d{4,})"/);
        resolve(m ? m[1] : null);
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

/** Result of the post-boot /api/health database probe (null when unreachable). */
let dbProbeError = null;
/** Digest of a server-render error detected on the home page, if any. */
let homeProbeDigest = null;

async function probeDatabase(baseUrl) {
  try {
    const j = await httpJson(baseUrl + "/api/health", 60000);
    dbProbeError = j && j.db && j.db.ok === false ? String(j.db.error || "unknown database error") : null;
    if (dbProbeError) log.error("database probe failed:", dbProbeError);
    else log.info("database probe ok", j && j.db && typeof j.db.titles === "number" ? `(${j.db.titles} titles)` : "");
    return j;
  } catch {
    dbProbeError = null;
    return null;
  }
}

function stopServer() {
  const proc = serverProc;
  serverProc = null;
  if (!proc || proc.killed) return;
  try {
    if (process.platform === "win32" && proc.pid) {
      // kill() only signals the direct child; taskkill /T takes down the
      // whole tree so nothing survives to hold nama.db locked
      execFileSync("taskkill", ["/F", "/T", "/PID", String(proc.pid)], {
        timeout: 8000,
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* window                                                             */
/* ------------------------------------------------------------------ */
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#070709" : "#f3f3f7",
    title: APP_NAME,
    icon: path.join(ROOT, "build", "icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 22 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    mainWindow = null;
  });

  // external links → system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (serverUrl && url.startsWith(serverUrl)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (serverUrl && url.startsWith(serverUrl)) return;
    e.preventDefault();
    shell.openExternal(url);
  });

  win.loadURL(serverUrl);
  return win;
}

function showError(err) {
  log.error(err);
  dialog.showErrorBox("نما – خطا در اجرا", String(err && err.stack ? err.stack : err));
}

/* ------------------------------------------------------------------ */
/* one-click database repair (v0.10.2)                                 */
/* ------------------------------------------------------------------ */

const FATAL_DB_RE =
  /(malformed|not a database|corrupt|disk image|database (table )?is locked|unable to open|database file|SQLITE_(BUSY|CORRUPT|CANTOPEN|IOERR))/i;

/** Moves a broken database (and its WAL/SHM journals) aside, then restores a
 *  pristine copy of the bundled seed. The broken files stay next to the
 *  original as nama.db.broken-<stamp> for support. */
function reseedUserData() {
  const dst = userDbPath();
  const src = seedDbPath();
  if (!fs.existsSync(src)) return false;
  try {
    stopServer();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 24);
    for (const suf of ["", "-wal", "-shm"]) {
      const f = dst + suf;
      if (!fs.existsSync(f)) continue;
      try {
        fs.renameSync(f, `${f}.broken-${stamp}`);
      } catch {
        try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
      }
    }
    // atomic copy (tmp + rename) so an interrupted repair never leaves a
    // half-written database behind
    const tmp = dst + ".tmp";
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dst);
    freshSeedCopy = true;
    try { fs.rmSync(catalogMarkerPath(), { force: true }); } catch { /* ignore */ }
    try { writeCatalogMarker(sha256File(src)); } catch { /* ignore */ }
    log.warn("database reseeded; previous files kept with suffix .broken-" + stamp);
    return true;
  } catch (e) {
    log.error("database reseed failed:", e);
    return false;
  }
}

/** Startup failure or fatal database error → offer one-click auto repair
 *  (backup + fresh seed + server restart) instead of a dead-end error box. */
async function offerRepair(kind, detail) {
  const canRepair = fs.existsSync(seedDbPath());
  log.error(kind + ":", detail);
  try {
    const r = await dialog.showMessageBox({
      type: "error",
      title: "نما – خطا",
      message: kind,
      detail:
        `${String(detail).slice(0, 900)}\n\n` +
        `مسیر دیتابیس:\n${userDbPath()}\n\n` +
        (canRepair
          ? "«تعمیر خودکار» دیتابیس را با نسخه‌ی سالم بازسازی می‌کند؛ یک نسخه‌ی پشتیبان از فایل فعلی کنار همان نگه داشته می‌شود (.broken)."
          : "فایل seed برای تعمیر خودکار پیدا نشد. لطفاً فایل لاگ را برای پشتیبانی بفرستید:\n" + log.transports.file.getFile().path),
      buttons: canRepair ? ["تعمیر خودکار و اجرای مجدد", "خروج"] : ["خروج"],
      defaultId: 0,
      cancelId: canRepair ? 1 : 0,
      noLink: true,
    });
    if (canRepair && r.response === 0) {
      if (!reseedUserData()) throw new Error("بازسازی دیتابیس ناموفق بود (فایل seed در دسترس نیست).");
      if (mainWindow) {
        try { mainWindow.destroy(); } catch { /* ignore */ }
        mainWindow = null;
      }
      await startServer();
      buildMenu();
      mainWindow = createWindow();
      setupUpdater();
      return;
    }
  } catch (e) {
    showError(e);
  }
  app.quit();
}

/* ------------------------------------------------------------------ */
/* menu                                                               */
/* ------------------------------------------------------------------ */
function nav(p) {
  mainWindow?.webContents.send("nama:navigate", p);
}
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "نما",
      submenu: [
        { label: "خانه", accelerator: "CmdOrCtrl+H", click: () => nav("/") },
        { label: "جستجو", accelerator: "CmdOrCtrl+F", click: () => nav("/search") },
        { type: "separator" },
        { label: "فیلم‌ها", click: () => nav("/movies") },
        { label: "سریال‌ها", click: () => nav("/series") },
        { label: "مجموعه‌ها", click: () => nav("/collections") },
        { label: "امشب چی ببینم؟", accelerator: "CmdOrCtrl+Shift+R", click: () => nav("/random") },
        { type: "separator" },
        { label: "لیست من", accelerator: "CmdOrCtrl+L", click: () => nav("/my-list") },
        { label: "اعلان‌ها", accelerator: "CmdOrCtrl+Shift+N", click: () => nav("/notifications") },
        { label: "تنظیمات", accelerator: "CmdOrCtrl+,", click: () => nav("/settings") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit", label: "خروج" },
      ],
    },
    { label: "ویرایش", role: "editMenu" },
    {
      label: "نما",
      role: "viewMenu",
    },
    { label: "پنجره", role: "windowMenu" },
    {
      label: "راهنما",
      submenu: [
        { label: "راهنما و سوالات متداول", click: () => nav("/faq") },
        { label: "میان‌برهای صفحه‌کلید", click: () => nav("/settings#shortcuts") },
        { type: "separator" },
        { label: "بررسی به‌روزرسانی…", click: () => checkForUpdates(true) },
        { label: "صفحه‌ی انتشار در GitHub", click: () => shell.openExternal("https://github.com/pvwvuow/frame/releases") },
        { label: "پوشه‌ی داده‌ها", click: () => shell.openPath(app.getPath("userData")) },
        { label: "پوشه‌ی لاگ", click: () => shell.openPath(path.dirname(log.transports.file.getFile().path)) },
        { type: "separator" },
        { label: `درباره‌ی نما (v${app.getVersion()})`, click: () => nav("/settings#about") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* auto-update (GitHub Releases)                                      */
/* ------------------------------------------------------------------ */
function setupUpdater() {
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater } = require("electron-updater"));
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    const send = (payload) => mainWindow?.webContents.send("nama:update-status", payload);
    autoUpdater.on("update-available", (i) => send({ status: "available", version: i.version }));
    autoUpdater.on("update-not-available", () => send({ status: "not-available" }));
    autoUpdater.on("download-progress", (p) => send({ status: "downloading", percent: p.percent }));
    autoUpdater.on("update-downloaded", (i) => send({ status: "downloaded", version: i.version }));
    autoUpdater.on("error", (e) => send({ status: "error", message: e?.message }));
    setTimeout(() => autoUpdater.checkForUpdates().catch((e) => log.warn("update check failed", e)), 8000);
  } catch (e) {
    log.warn("electron-updater unavailable", e);
  }
}

async function checkForUpdates(interactive = false) {
  if (!autoUpdater) {
    if (interactive) dialog.showMessageBox({ type: "info", title: APP_NAME, message: "به‌روزرسانی خودکار فقط در نسخه‌ی نصب‌شده فعال است." });
    return { status: "disabled" };
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    const available = !!latest && latest !== app.getVersion();
    if (interactive && !available) dialog.showMessageBox({ type: "info", title: APP_NAME, message: "شما آخرین نسخه را دارید." });
    return available ? { status: "available", version: latest } : { status: "not-available" };
  } catch (e) {
    return { status: "error", message: e?.message ?? String(e) };
  }
}

/* ------------------------------------------------------------------ */
/* ipc                                                                */
/* ------------------------------------------------------------------ */
ipcMain.handle("nama:info", () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  dataDir: app.getPath("userData"),
  dbPath: userDbPath(),
}));
ipcMain.handle("nama:check-updates", () => checkForUpdates(false));
ipcMain.handle("nama:install-update", () => {
  if (!autoUpdater) return false;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});
ipcMain.handle("nama:open-data-dir", () => shell.openPath(app.getPath("userData")));
ipcMain.handle("nama:open-external", (_e, url) => {
  if (typeof url === "string" && /^(https?:\/\/|mailto:|tel:)/i.test(url)) return shell.openExternal(url);
});
ipcMain.handle("nama:is-maximized", () => !!mainWindow?.isMaximized());
ipcMain.on("nama:win", (_e, action) => {
  if (!mainWindow) return;
  if (action === "minimize") mainWindow.minimize();
  else if (action === "maximize") (mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  else if (action === "close") mainWindow.close();
  else if (action === "fullscreen") mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.on("nama:badge", (_e, count) => {
  const n = Math.max(0, Number(count) || 0);
  if (process.platform === "darwin") app.dock?.setBadge(n ? String(n) : "");
  else if (process.platform === "linux") app.setBadgeCount(n);
  else if (mainWindow) mainWindow.setOverlayIcon(null, n ? `${n} اعلان` : "");
});

/* ------------------------------------------------------------------ */
/* lifecycle                                                          */
/* ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  if (process.platform === "win32") app.setAppUserModelId("app.nama.desktop");

  app.whenReady().then(async () => {
    try {
      // tighten permissions – no camera/mic/geolocation prompts
      session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(["fullscreen", "media", "notifications"].includes(permission)));
      await startServer();
      buildMenu();
      mainWindow = createWindow();
      setupUpdater();
      if (dbProbeError && FATAL_DB_RE.test(dbProbeError)) {
        // locked/corrupt database → let the user repair in one click
        offerRepair("خطای دیتابیس", dbProbeError);
      } else if (dbProbeError || homeProbeDigest) {
        const why = dbProbeError
          ? `خطای دیتابیس:\n${dbProbeError}`
          : `خطای رندر سرور (digest: ${homeProbeDigest})`;
        dialog.showErrorBox(
          "نما – خطای داخلی سرور",
          `${why}\n\n` +
            `مسیر دیتابیس:\n${userDbPath()}\n\n` +
            `لطفاً این فایل لاگ را برای پشتیبانی بفرستید:\n${log.transports.file.getFile().path}`
        );
      }
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
      });
    } catch (e) {
      // startup failure → repair dialog instead of a dead-end error box
      offerRepair("خطا در اجرا", String(e && e.stack ? e.stack : e));
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    stopServer();
    clearServerPid();
  });
  process.on("exit", stopServer);
}
