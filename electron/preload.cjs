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
  /* desktop-wide floating player (real OS window, v0.10.5) */
  pip: {
    open: (payload) => ipcRenderer.invoke("pip:open", payload),
    close: () => ipcRenderer.send("pip:close"),
    expand: (currentTime, srcIdx) => ipcRenderer.send("pip:expand", { currentTime, srcIdx }),
    pin: (on) => ipcRenderer.send("pip:pin", !!on),
    time: (t) => ipcRenderer.send("pip:time", t),
    next: () => ipcRenderer.send("pip:next"),
    getState: () => ipcRenderer.invoke("pip:get-state"),
    onState: (cb) => on("pip:state", cb),
    onExpand: (cb) => on("pip:expand-to-main", cb),
    onClosed: (cb) => on("pip:closed", cb),
    onTime: (cb) => on("nama:pip-time", cb),
    onSync: (cb) => on("nama:pip-sync", cb),
  },
});
