/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Frame – desktop floating player windows (v0.10.19, MULTI-WINDOW)
 *
 * Every floating player is a REAL OS window: frameless, freely resizable,
 * optionally always-on-top ("pinned"), so the user can keep watching while
 * they browse the app or work in ANY other program. Each window loads the
 * /pip route of the embedded Next server; state flows over IPC:
 *
 *   main window  →  pip:open (payload)                     → { id } | "max" | "invalid"
 *   pip window   →  pip:time / pip:expand / pip:next / pip:pin / pip:close
 *   main process →  pip:state (new payload) | pip:closed {id}
 *                   | pip:expand-to-main {id, payload} | nama:pip-time {id, t}
 *                   | nama:pip-sync {id, state}
 *
 * v0.10.19: several floats can live at the same time (user request: playing
 * multiple movies simultaneously). Every IPC call from a float window is
 * routed by its `webContents` sender, so windows never touch each other's
 * state. Up to MAX_PIPS windows; new windows cascade from the saved bounds.
 */
const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const DEFAULTS = { width: 480, height: 316, minWidth: 320, minHeight: 220 };
const MAX_PIPS = 4;
/** px offset between stacked new windows so they don't fully overlap */
const CASCADE = 32;

let log = console;
let getMainWindow = () => null;
let getServerUrl = () => null;
let isQuitting = () => false;
let getUserData = () => null;

/** id → { win, state, pinned } */
const pips = new Map();
let nextPipId = 1;
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
  // persist the bounds of the most recently touched window
  const last = [...pips.values()].pop();
  if (!last || last.win.isDestroyed()) return;
  try {
    const b = last.win.getNormalBounds();
    const data = { ...b, pinned: last.pinned };
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

/** True when a position is (partially) visible on any connected display. */
function onScreen(b) {
  const area = screen.getAllDisplays().map((d) => d.workArea);
  return area.some(
    (a) => b.x + b.width > a.x + 60 && b.x < a.x + a.width - 60 && b.y + b.height > a.y + 40 && b.y < a.y + a.height - 40
  );
}

/** Resolve which floating window an IPC message came from. */
function pipFor(sender) {
  for (const entry of pips.values()) {
    if (!entry.win.isDestroyed() && entry.win.webContents === sender) return entry;
  }
  return null;
}

function sendToMain(channel, payload) {
  const main = getMainWindow();
  if (main && !main.isDestroyed()) main.webContents.send(channel, payload);
}

function applyTopmost(entry) {
  try {
    entry.win.setAlwaysOnTop(entry.pinned, "screen-saver");
  } catch {
    entry.win.setAlwaysOnTop(entry.pinned);
  }
}

function createPipWindow(id, state) {
  const saved = loadBounds(getUserData());
  const pinned = saved && Number.isFinite(saved.pinned) ? !!saved.pinned : true;

  // cascade: nudge every additional window so multiple floats stay visible
  const n = pips.size;
  const casc = { x: undefined, y: undefined };
  if (saved && onScreen(saved)) {
    casc.x = saved.x + (n % MAX_PIPS) * CASCADE;
    casc.y = saved.y + (n % MAX_PIPS) * CASCADE;
  }

  const win = new BrowserWindow({
    width: saved?.width || DEFAULTS.width,
    height: saved?.height || DEFAULTS.height,
    x: casc.x,
    y: casc.y,
    minWidth: DEFAULTS.minWidth,
    minHeight: DEFAULTS.minHeight,
    frame: false,
    show: false,
    backgroundColor: "#000000",
    alwaysOnTop: pinned,
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

  const entry = { win, state, pinned };

  // float above everything (screen-saver level survives fullscreen apps on mac)
  applyTopmost(entry);
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => win.show());

  const touch = () => scheduleSave();
  win.on("moved", touch);
  win.on("resized", touch);
  win.on("close", () => {
    scheduleSave();
  });
  win.on("closed", () => {
    pips.delete(id);
    sendToMain("pip:closed", { id });
    // last float gone while the app window is hidden (closed-to-float flow)
    // → bring the app back so the user is never left with nothing on screen
    if (pips.size === 0) {
      const main = getMainWindow();
      if (main && !main.isDestroyed() && !main.isVisible()) main.show();
    }
  });

  const url = getServerUrl();
  if (url) win.loadURL(url + "/pip");
  return entry;
}

/** IPC surface — called once from main.cjs at startup. */
function setupPip(deps) {
  log = deps.log || log;
  getMainWindow = deps.getMainWindow || getMainWindow;
  getServerUrl = deps.getServerUrl || getServerUrl;
  isQuitting = deps.isQuitting || isQuitting;
  getUserData = deps.getUserData || getUserData;

  // opens a NEW floating window per call (v0.10.19) — the caller decides
  // which movie/episode it plays; windows are independent after that
  ipcMain.handle("pip:open", (_e, payload) => {
    if (!payload || typeof payload !== "object") return "invalid";
    if (pips.size >= MAX_PIPS) return "max";
    const id = nextPipId++;
    pips.set(id, createPipWindow(id, payload));
    return { id };
  });

  // close: by id (main window asks a specific float to come home) or the
  // sender's own window (the ✕ inside the float)
  ipcMain.on("pip:close", (_e, id) => {
    if (Number.isFinite(id)) {
      const entry = pips.get(id);
      if (entry && !entry.win.isDestroyed()) entry.win.close();
      return;
    }
    const entry = pipFor(_e.sender);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
  });

  ipcMain.on("pip:pin", (_e, on) => {
    const entry = pipFor(_e.sender);
    if (!entry) return;
    entry.pinned = !!on;
    if (!entry.win.isDestroyed()) applyTopmost(entry);
    scheduleSave();
  });

  ipcMain.on("pip:time", (_e, t) => {
    const entry = pipFor(_e.sender);
    if (entry && Number.isFinite(t)) sendToMain("nama:pip-time", { id: keyOf(entry), t });
  });

  // user pressed "بازگشت به برنامه" inside a float window
  ipcMain.on("pip:expand", (_e, data) => {
    const entry = pipFor(_e.sender);
    if (!entry) return;
    const payload = {
      ...entry.state,
      startAt: Math.max(0, Number(data?.currentTime) || 0),
      srcIdx: Number.isFinite(data?.srcIdx) ? data.srcIdx : -1,
    };
    const main = getMainWindow();
    if (main && !main.isDestroyed()) {
      if (!main.isVisible()) main.show();
      if (main.isMinimized()) main.restore();
      main.focus();
      main.webContents.send("pip:expand-to-main", { id: keyOf(entry), payload });
    }
    if (!entry.win.isDestroyed()) entry.win.close();
  });

  // next-episode advanced INSIDE a float window
  ipcMain.on("pip:next", (_e) => {
    const entry = pipFor(_e.sender);
    if (!entry || !entry.state) return;
    const eps = Array.isArray(entry.state.episodes) ? entry.state.episodes : [];
    const i = eps.findIndex((x) => x && x.id === entry.state.episode?.id);
    const next = i >= 0 && i < eps.length - 1 ? eps[i + 1] : null;
    if (!next || !next.videoUrl) return;
    entry.state = {
      ...entry.state,
      src: next.videoUrl,
      episode: next,
      nextEpisode: eps[i + 2] || null,
      startAt: 0,
      currentTime: 0,
      srcIdx: -1,
    };
    if (!entry.win.isDestroyed()) entry.win.webContents.send("pip:state", entry.state);
    sendToMain("nama:pip-sync", { id: keyOf(entry), state: entry.state });
  });

  // per-window initial payload (renderer asks right after boot)
  ipcMain.handle("pip:get-state", (_e) => {
    const entry = pipFor(_e.sender);
    if (!entry) return null;
    return { id: keyOf(entry), ...entry.state };
  });
}

function keyOf(entry) {
  for (const [id, e] of pips.entries()) if (e === entry) return id;
  return -1;
}

/** True when at least one float window currently exists (main-window close gating). */
function pipOpen() {
  return pips.size > 0;
}

module.exports = { setupPip, pipOpen };
