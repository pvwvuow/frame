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
const { spawn } = require("node:child_process");
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
      fs.copyFileSync(legacy, dst);
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
    const src = seedDbPath();
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

function waitFor(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url + "/api/health", (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error("server did not start in time"));
      setTimeout(tick, 250);
    };
    tick();
  });
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

  const port = await freePort();
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

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: toFileUrl(dbPath),
    NEXT_TELEMETRY_DISABLED: "1",
    NAMA_ELECTRON: "1",
    NAMA_CATALOG_SEED: needsCatalogRefresh ? seed : "",
  };
  serverProc = spawn(process.execPath, [entry], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  serverProc.stdout.on("data", (d) => log.info("[next]", String(d).trim()));
  serverProc.stderr.on("data", (d) => log.warn("[next]", String(d).trim()));
  serverProc.on("exit", (code) => {
    log.warn("next server exited with code", code);
    serverProc = null;
  });
  serverUrl = `http://127.0.0.1:${port}`;
  // the first health probe also runs the one-time catalog merge → give it room
  await waitFor(serverUrl, needsCatalogRefresh ? 120000 : 30000);
  const health = await probeDatabase(serverUrl);
  if (seedHash) {
    if (!needsCatalogRefresh) {
      writeCatalogMarker(seedHash);
    } else if (health?.catalog?.ok) {
      log.info(
        `catalog refreshed from bundled seed: ${health.catalog.titles} titles, ` +
          `${health.catalog.episodes} episodes (+${health.catalog.created} new, ~${health.catalog.updated} updated, -${health.catalog.removed} removed)`
      );
      writeCatalogMarker(seedHash);
    } else {
      log.error("catalog refresh failed:", health?.catalog?.error || "no catalog result");
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

function probeDatabase(baseUrl) {
  return new Promise((resolve) => {
    const req = http.get(baseUrl + "/api/health", (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
          dbProbeError = json && json.db && json.db.ok === false ? String(json.db.error || "unknown database error") : null;
        } catch {
          dbProbeError = null;
        }
        if (dbProbeError) log.error("database probe failed:", dbProbeError);
        else log.info("database probe ok");
        resolve(json);
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(60000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    try {
      serverProc.kill();
    } catch {
      /* ignore */
    }
  }
  serverProc = null;
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
      if (dbProbeError || homeProbeDigest) {
        const why = dbProbeError
          ? `خطای دیتابیس:\n${dbProbeError}`
          : `خطای رندر سرور (digest: ${homeProbeDigest})`;
        dialog.showErrorBox(
          "نما – خطای داخلی سرور",
          `${why}\n\n` +
            `مسیر دیتابیس:\n${userDbPath()}\n\n` +
            `راهنما: پوشه‌ی داده‌ها را از منوی راهنما باز کنید و فایل nama.db را حذف کنید تا در اجرای بعدی از نو ساخته شود.\n` +
            `لطفاً این فایل لاگ را برای پشتیبانی بفرستید:\n${log.transports.file.getFile().path}`
        );
      }
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
      });
    } catch (e) {
      showError(e);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", stopServer);
  process.on("exit", stopServer);
}
