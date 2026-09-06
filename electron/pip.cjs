/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * نما – desktop-wide floating player window (v0.10.5)
 *
 * The floating player is a REAL OS window: frameless, freely resizable,
 * optionally always-on-top ("pinned"), so the user can keep watching while
 * they browse the app or work in ANY other program. It loads the /pip route
 * of the embedded Next server; state flows over IPC:
 *
 *   main window  →  pip:open (payload incl. currentTime/volume/srcIdx)
 *   pip window   →  pip:time / pip:expand / pip:next / pip:pin / pip:close
 *   main process →  pip:state (new payload) | pip:closed | pip:expand-to-main
 */
const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const DEFAULTS = { width: 480, height: 316, minWidth: 320, minHeight: 220 };

let log = console;
let getMainWindow = () => null;
let getServerUrl = () => null;
let isQuitting = () => false;

let pipWindow = null;
let pipState = null;
let pipPinned = true;
let saveTimer = null;

function boundsFile(userData) {
  return path.join(userData, "pip-bounds.json");
}

function loadBounds(userData) {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(userData), "utf8"));
    if (Number.isFinite(b.width) && Number.isFinite(b.height)) return b;
  } catch {
    /* first run */
  }
  return null;
}

function saveBounds(userData) {
  if (!pipWindow || pipWindow.isDestroyed()) return;
  try {
    const b = pipWindow.getNormalBounds();
    const data = { ...b, pinned: pipPinned };
    fs.writeFileSync(boundsFile(userData), JSON.stringify(data), "utf8");
  } catch (e) {
    log.warn("pip bounds save failed:", e);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveBounds(getUserData());
  }, 400);
}

let getUserData = () => null;

/** True when a position is (partially) visible on any connected display. */
function onScreen(b) {
  const area = screen.getAllDisplays().map((d) => d.workArea);
  return area.some(
    (a) => b.x + b.width > a.x + 60 && b.x < a.x + a.width - 60 && b.y + b.height > a.y + 40 && b.y < a.y + a.height - 40
  );
}

function createPipWindow() {
  const saved = loadBounds(getUserData());
  if (saved && Number.isFinite(saved.pinned)) pipPinned = !!saved.pinned;

  const win = new BrowserWindow({
    width: saved?.width || DEFAULTS.width,
    height: saved?.height || DEFAULTS.height,
    x: saved && onScreen(saved) ? saved.x : undefined,
    y: saved && onScreen(saved) ? saved.y : undefined,
    minWidth: DEFAULTS.minWidth,
    minHeight: DEFAULTS.minHeight,
    frame: false,
    show: false,
    backgroundColor: "#000000",
    alwaysOnTop: pipPinned,
    fullscreenable: false,
    maximizable: false,
    skipTaskbar: false,
    title: "Frame — پخش شناور",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // float above everything (screen-saver level survives fullscreen apps on mac)
  try {
    win.setAlwaysOnTop(pipPinned, "screen-saver");
  } catch {
    win.setAlwaysOnTop(pipPinned);
  }
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => win.show());

  win.on("moved", scheduleSave);
  win.on("resized", scheduleSave);
  win.on("close", () => {
    saveBounds(getUserData());
  });
  win.on("closed", () => {
    pipWindow = null;
    pipState = null;
    const main = getMainWindow();
    if (main && !main.isDestroyed() && !main.isVisible()) main.show();
    main?.webContents?.send("pip:closed");
  });

  const url = getServerUrl();
  if (url) win.loadURL(url + "/pip");
  return win;
}

/** IPC surface — called once from main.cjs at startup. */
function setupPip(deps) {
  log = deps.log || log;
  getMainWindow = deps.getMainWindow || getMainWindow;
  getServerUrl = deps.getServerUrl || getServerUrl;
  isQuitting = deps.isQuitting || isQuitting;
  getUserData = deps.getUserData || getUserData;

  ipcMain.handle("pip:open", (_e, payload) => {
    if (!payload || typeof payload !== "object") return "invalid";
    pipState = payload;
    if (pipWindow && !pipWindow.isDestroyed()) {
      pipWindow.webContents.send("pip:state", pipState);
      return "updated";
    }
    pipWindow = createPipWindow();
    return "created";
  });

  ipcMain.on("pip:close", () => {
    if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
  });

  ipcMain.on("pip:pin", (_e, on) => {
    pipPinned = !!on;
    if (pipWindow && !pipWindow.isDestroyed()) {
      try {
        pipWindow.setAlwaysOnTop(pipPinned, "screen-saver");
      } catch {
        pipWindow.setAlwaysOnTop(pipPinned);
      }
    }
    scheduleSave();
  });

  ipcMain.on("pip:time", (_e, t) => {
    const main = getMainWindow();
    if (main && !main.isDestroyed() && Number.isFinite(t)) main.webContents.send("nama:pip-time", t);
  });

  // user pressed "بازگشت به برنامه" inside the pip window
  ipcMain.on("pip:expand", (_e, data) => {
    if (!pipState) return;
    const payload = {
      ...pipState,
      startAt: Math.max(0, Number(data?.currentTime) || 0),
      srcIdx: Number.isFinite(data?.srcIdx) ? data.srcIdx : -1,
    };
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      if (!main.isVisible()) main.show();
      if (main.isMinimized()) main.restore();
      main.focus();
      main.webContents.send("pip:expand-to-main", payload);
    }
    if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
  });

  // next-episode advanced INSIDE the pip window
  ipcMain.on("pip:next", () => {
    if (!pipState) return;
    const eps = Array.isArray(pipState.episodes) ? pipState.episodes : [];
    const i = eps.findIndex((x) => x && x.id === pipState.episode?.id);
    const next = i >= 0 && i < eps.length - 1 ? eps[i + 1] : null;
    if (!next || !next.videoUrl) return;
    pipState = {
      ...pipState,
      src: next.videoUrl,
      episode: next,
      nextEpisode: eps[i + 2] || null,
      startAt: 0,
      currentTime: 0,
      srcIdx: -1,
    };
    if (pipWindow && !pipWindow.isDestroyed()) pipWindow.webContents.send("pip:state", pipState);
    const main = getMainWindow();
    if (main && !main.isDestroyed()) main.webContents.send("nama:pip-sync", pipState);
  });

  ipcMain.handle("pip:get-state", () => pipState);
}

/** True when the pip window currently exists (main-window close gating). */
function pipOpen() {
  return !!pipWindow && !pipWindow.isDestroyed();
}

module.exports = { setupPip, pipOpen };
