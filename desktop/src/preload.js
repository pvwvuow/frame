"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("frame", {
  meta: () => ipcRenderer.invoke("app:meta"),

  store: {
    get: (key, fallback) => ipcRenderer.invoke("store:get", key, fallback),
    set: (key, value) => ipcRenderer.invoke("store:set", key, value),
  },

  catalog: {
    load: () => ipcRenderer.invoke("catalog:load"),
    refresh: () => ipcRenderer.invoke("catalog:refresh"),
  },

  updates: {
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    onStatus: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("update:status", listener);
      return () => ipcRenderer.removeListener("update:status", listener);
    },
  },

  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },

  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
});
