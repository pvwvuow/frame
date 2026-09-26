"use strict";

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

let cache = null;

function file() {
  return path.join(app.getPath("userData"), "frame-store.json");
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch (_err) {
    cache = {};
  }
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) cache = {};
  return cache;
}

function flush() {
  try {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(load(), null, 2));
    fs.renameSync(tmp, file());
  } catch (err) {
    console.error("[frame] store flush failed:", err.message);
  }
}

function get(key, fallback) {
  const data = load();
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
}

function set(key, value) {
  load()[key] = value;
  flush();
  return true;
}

module.exports = { get, set };
