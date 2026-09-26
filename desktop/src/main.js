"use strict";

const { app, BrowserWindow, ipcMain, shell, Menu, session, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const store = require("./store");
const updater = require("./updater");

const APP_ID = "com.frame.app";
const SITE = "https://tvframe.vip";
const REPO = "pvwvuow/frame";
const REMOTE_CATALOG = `https://raw.githubusercontent.com/${REPO}/main/docs/browse.json`;

const isDev = !app.isPackaged;

// نمونه‌ی تک‌نسخه؛ اجرای دوباره فقط پنجره‌ی باز را جلو می‌آورد
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setName("Frame");
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

if (app.isDefaultProtocolClient && app.isPackaged) {
  app.setAsDefaultProtocolClient("frame");
}

/** @type {BrowserWindow|null} */
let win = null;

function bundledCatalogPath() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "app", "data")
    : path.join(__dirname, "..", "app", "data");
  return path.join(base, "browse.json");
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return fallback;
  }
}

function createWindow() {
  const bounds = store.get("window", { width: 1320, height: 860 });

  win = new BrowserWindow({
    width: bounds.width || 1320,
    height: bounds.height || 860,
    x: bounds.x,
    y: bounds.y,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: "#08080c",
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webSecurity: true,
    },
  });

  win.loadFile(path.join(__dirname, "..", "app", "index.html"));
  win.once("ready-to-show", () => win && win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // ناوبری به بیرون از اپ همیشه در مرورگر پیش‌فرض باز می‌شود
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !url.startsWith("devtools://")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
    store.set("window", win.getBounds());
  };
  win.on("resize", persistBounds);
  win.on("move", persistBounds);
  win.on("closed", () => {
    win = null;
  });

  // F12 برای حالت توسعه
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F12" && isDev) {
      win.webContents.toggleDevTools();
    }
  });
}

function installPermissionsGuard() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  // دانلودهای مستقیم به مرورگر سپرده می‌شوند تا مسیر مقصد برای کاربر شفاف باشد
  ses.on("will-download", (event) => {
    event.preventDefault();
  });
}

function buildMenu() {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: "Frame",
      submenu: [
        { role: "about", label: "درباره فریم" },
        { type: "separator" },
        { role: "hide", label: "پنهان کردن" },
        { type: "separator" },
        { role: "quit", label: "خروج" },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle("app:meta", () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    packaged: app.isPackaged,
    site: SITE,
    repo: `https://github.com/${REPO}`,
  }));

  ipcMain.handle("store:get", (_e, key, fallback) => store.get(key, fallback));
  ipcMain.handle("store:set", (_e, key, value) => store.set(key, value));

  // کاتالوگ: نسخه‌ی بسته‌شده + کش تازه‌تر دانلودشده در userData
  ipcMain.handle("catalog:load", () => {
    const cached = path.join(app.getPath("userData"), "catalog.json");
    const local = readJsonSafe(bundledCatalogPath(), null);
    const remote = readJsonSafe(cached, null);
    if (remote && remote.titles && (!local || (remote.counts?.total || 0) > (local.counts?.total || 0))) {
      return { source: "cache", data: remote };
    }
    return { source: "bundled", data: local };
  });

  ipcMain.handle("catalog:refresh", async () => {
    const cached = path.join(app.getPath("userData"), "catalog.json");
    try {
      const body = await fetchText(REMOTE_CATALOG);
      const parsed = JSON.parse(body);
      if (!parsed || !Array.isArray(parsed.titles)) throw new Error("bad payload");
      fs.writeFileSync(cached, body);
      return { ok: true, source: "network", data: parsed };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  ipcMain.handle("shell:openExternal", (_e, url) => {
    if (typeof url === "string" && /^https?:/i.test(url)) shell.openExternal(url);
  });

  ipcMain.handle("update:check", () => updater.checkForUpdates());
  ipcMain.handle("update:download", () => updater.downloadUpdate());
  ipcMain.handle("update:install", () => updater.quitAndInstall());
  ipcMain.handle("window:minimize", () => win && win.minimize());
  ipcMain.handle("window:maximize", () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle("window:close", () => win && win.close());
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": `Frame/${app.getVersion()}` }, timeout: 20000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchText(res.headers.location));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  installPermissionsGuard();
  registerIpc();
  buildMenu();

  try {
    protocol.handle("frame", () => net.fetch(path.join(__dirname, "..", "app", "index.html")));
  } catch (_err) {
    /* protocol.handle در نسخه‌های قدیمی‌تر موجود نیست */
  }

  createWindow();
  updater.init((payload) => {
    if (win && !win.isDestroyed()) win.webContents.send("update:status", payload);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (err) => {
  console.error("[frame] uncaught:", err);
});
