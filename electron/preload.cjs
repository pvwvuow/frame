/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel, cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("nama", {
  isElectron: true,
  platform: process.platform,
  version: process.env.NAMA_APP_VERSION || "0.0.0",
  getInfo: () => ipcRenderer.invoke("nama:info"),
  checkForUpdates: () => ipcRenderer.invoke("nama:check-updates"),
  installUpdate: () => ipcRenderer.invoke("nama:install-update"),
  openDataDir: () => ipcRenderer.invoke("nama:open-data-dir"),
  openExternal: (url) => ipcRenderer.invoke("nama:open-external", url),
  /** base URL of the local stream proxy ("" when unavailable / web mode) */
  proxyUrl: () => ipcRenderer.invoke("nama:proxy-url"),
  /* v0.10.14 – disk mirror of the login/subscription snapshots (see main.cjs):
     keeps the user logged in even if the localStorage origin ever changes */
  authCache: {
    read: () => ipcRenderer.invoke("nama:auth-cache-read"),
    write: (data) => ipcRenderer.invoke("nama:auth-cache-write", data),
  },
  window: {
    minimize: () => ipcRenderer.send("nama:win", "minimize"),
    maximize: () => ipcRenderer.send("nama:win", "maximize"),
    close: () => ipcRenderer.send("nama:win", "close"),
    toggleFullscreen: () => ipcRenderer.send("nama:win", "fullscreen"),
    isMaximized: () => ipcRenderer.invoke("nama:is-maximized"),
  },
  onNavigate: (cb) => on("nama:navigate", cb),
  onUpdateStatus: (cb) => on("nama:update-status", cb),
  setBadge: (count) => ipcRenderer.send("nama:badge", count),
  /* desktop floating players (real OS windows) — v0.10.19 multi-window */
  pip: {
    /** opens a NEW floating window → resolves { id } | "max" | "invalid" */
    open: (payload) => ipcRenderer.invoke("pip:open", payload),
    /** close a specific window (by id) or, from inside a float, itself */
    close: (id) => ipcRenderer.send("pip:close", id),
    expand: (currentTime, srcIdx) => ipcRenderer.send("pip:expand", { currentTime, srcIdx }),
    pin: (on) => ipcRenderer.send("pip:pin", !!on),
    time: (t) => ipcRenderer.send("pip:time", t),
    next: () => ipcRenderer.send("pip:next"),
    getState: () => ipcRenderer.invoke("pip:get-state"),
    onState: (cb) => on("pip:state", cb),
    /** { id, payload } */
    onExpand: (cb) => on("pip:expand-to-main", cb),
    /** { id } */
    onClosed: (cb) => on("pip:closed", cb),
    /** { id, t } */
    onTime: (cb) => on("nama:pip-time", cb),
    /** { id, state } */
    onSync: (cb) => on("nama:pip-sync", cb),
  },
  /* download manager (v0.10.19) — main-process queue with pause/resume,
     speed reporting and the Frame folder structure */
  downloads: {
    getState: () => ipcRenderer.invoke("dl:get-state"),
    enqueue: (item) => ipcRenderer.invoke("dl:enqueue", item),
    pause: (id) => ipcRenderer.send("dl:pause", id),
    resume: (id) => ipcRenderer.send("dl:resume", id),
    cancel: (id) => ipcRenderer.send("dl:cancel", id),
    remove: (id) => ipcRenderer.send("dl:remove", id),
    chooseDir: () => ipcRenderer.invoke("dl:choose-dir"),
    setDir: (dir) => ipcRenderer.invoke("dl:set-dir", dir),
    /** open the folder of an item (or the Frame root when id is null) */
    openFolder: (id) => ipcRenderer.invoke("dl:open-folder", id ?? null),
    /** { dir, items } */
    onState: (cb) => on("nama:dl-state", cb),
  },
});
