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
  version: process.env.npm_package_version || require("../package.json").version,
  getInfo: () => ipcRenderer.invoke("nama:info"),
  checkForUpdates: () => ipcRenderer.invoke("nama:check-updates"),
  openDataDir: () => ipcRenderer.invoke("nama:open-data-dir"),
  openExternal: (url) => ipcRenderer.invoke("nama:open-external", url),
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
});
