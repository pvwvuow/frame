"use strict";

const { app } = require("electron");

let autoUpdater = null;
let send = () => {};

function emit(state, extra) {
  const payload = Object.assign({ state }, extra || {});
  try {
    send(payload);
  } catch (_err) {
    /* پنجره بسته شده است */
  }
}

function init(sender) {
  send = typeof sender === "function" ? sender : () => {};

  if (!app.isPackaged) {
    emit("dev", { message: "به‌روزرسانی در حالت توسعه غیرفعال است" });
    return;
  }

  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    emit("error", { message: "ماژول به‌روزرسانی در دسترس نیست" });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => emit("checking"));
  autoUpdater.on("update-available", (info) =>
    emit("available", { version: info && info.version })
  );
  autoUpdater.on("update-not-available", () => emit("uptodate"));
  autoUpdater.on("download-progress", (p) => emit("downloading", { percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => emit("downloaded", { version: info && info.version }));
  autoUpdater.on("error", (err) => emit("error", { message: String(err && err.message ? err.message : err) }));

  setTimeout(() => checkForUpdates(), 8000);
}

async function checkForUpdates() {
  if (!autoUpdater) return { ok: false, reason: "unavailable" };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result && result.updateInfo && result.updateInfo.version };
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
}

async function downloadUpdate() {
  if (!autoUpdater) return { ok: false };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
}

function quitAndInstall() {
  if (!autoUpdater) return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
}

module.exports = { init, checkForUpdates, downloadUpdate, quitAndInstall };
