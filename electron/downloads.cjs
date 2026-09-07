/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Frame – download manager (v0.10.19)
 *
 * A small, dependency-free download queue in the main process:
 *   • the user picks a base folder → Frame creates  <dir>/Frame/Movies|Series/…
 *     and organizes every download as
 *       Movies:  Frame/Movies/<Name (Year)>/<Name (Year) - 480p.mkv>
 *       Series:  Frame/Series/<Name (Year)>/Season 02/<Name - S02E04 - 480p.mkv>
 *   • up to MAX_ACTIVE parallel transfers, FIFO queue, pause/resume/cancel
 *     (pause keeps the .part file; resume continues with an HTTP Range request,
 *     and a server that ignores Range simply restarts the file)
 *   • live speed + progress broadcast to the renderer (nama:dl-state)
 *   • queue + folder setting persist in userData/frame-downloads.json
 *
 * The renderer never passes paths — it passes catalog metadata (name, year,
 * season, episode, quality, variant, url) and the manager builds a SAFE
 * filename itself, so a hostile catalog row cannot escape the Frame tree.
 */
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");

const MAX_ACTIVE = 2;
const MAX_HISTORY = 200;
const MAX_REDIRECTS = 5;
const STALL_TIMEOUT = 30000;
/** transient network failures auto-retry this many times before surfacing
 * as "failed" (v0.10.19 — a dropped VPN/Wi-Fi must not kill a download) */
const MAX_RETRIES = 2;

let log = console;
let getMainWindow = () => null;
let getUserData = () => null;
let dialog = null;
let shell = null;
let app = null;

/** item id → transfer controller */
const active = new Map();
let items = [];
let baseDir = null;
let loaded = false;
let saveTimer = null;
let broadcastTimer = null;
let idCounter = 0;

/* ------------------------------------------------------------------ */
/* state file                                                          */
/* ------------------------------------------------------------------ */
function stateFile() {
  return path.join(getUserData(), "frame-downloads.json");
}

function writeState() {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ dir: baseDir, items: items.slice(-MAX_HISTORY) }), "utf8");
  } catch (e) {
    log.warn("downloads state save failed:", e);
  }
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeState();
  }, 700);
}

function flushSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  writeState();
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (raw && typeof raw === "object") {
      baseDir = typeof raw.dir === "string" && path.isAbsolute(raw.dir) ? raw.dir : null;
      items = Array.isArray(raw.items) ? raw.items.filter((it) => it && typeof it.url === "string") : [];
      // app quit / crash mid-download: downloading → paused (resumable when a
      // .part survived), otherwise back to the queue
      for (const it of items) {
        if (it.status === "downloading") {
          it.status = fs.existsSync(it.filePath + ".part") ? "paused" : "queued";
          it.speed = 0;
        }
      }
    }
  } catch {
    /* first run */
  }
}

/* ------------------------------------------------------------------ */
/* naming / Frame folder structure                                     */
/* ------------------------------------------------------------------ */
function sanitize(part) {
  return (
    String(part || "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s.]+|[\s.]+$/g, "")
      .slice(0, 120)
      .trim()
  );
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function urlExt(url) {
  try {
    const m = new URL(url).pathname.match(/\.(mkv|mp4|m4v|avi|mov|wmv|flv|webm|ts|mpg|mpeg|mk3d)$/i);
    return m ? m[1].toLowerCase() : "mkv";
  } catch {
    return "mkv";
  }
}

/** Unique final path — "name (2).ext" when the target already exists. */
function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const stem = path.basename(p, ext);
  for (let i = 2; i < 999; i++) {
    const cand = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(cand)) return cand;
  }
  return p;
}

function computeTarget(it) {
  const frameRoot = path.join(baseDir, "Frame");
  const name = sanitize(it.name) || "نامشخص";
  const year = Number.isFinite(it.year) && it.year > 1900 ? ` (${Math.floor(it.year)})` : "";
  const folder = sanitize(`${name}${year}`) || name;
  const tag = [sanitize(it.quality) || "", sanitize(it.variant) || ""].filter(Boolean).join(" - ");
  let dir;
  let file;
  if (it.kind === "series") {
    const s = Number.isFinite(it.season) && it.season > 0 ? Math.floor(it.season) : 1;
    const e = Number.isFinite(it.episode) && it.episode > 0 ? Math.floor(it.episode) : 1;
    dir = path.join(frameRoot, "Series", folder, `Season ${pad2(s)}`);
    file = sanitize(`${name} S${pad2(s)}E${pad2(e)}${tag ? " - " + tag : ""}`) || `S${pad2(s)}E${pad2(e)}`;
  } else {
    dir = path.join(frameRoot, "Movies", folder);
    file = sanitize(`${name}${year}${tag ? " - " + tag : ""}`) || name;
  }
  return { dir, file: path.join(dir, `${file}.${urlExt(it.url)}`) };
}

function partPath(it) {
  return (it.filePath || "") + ".part";
}

/* ------------------------------------------------------------------ */
/* renderer broadcast                                                  */
/* ------------------------------------------------------------------ */
function snapshot() {
  return { dir: baseDir, items };
}

function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const main = getMainWindow();
    if (main && !main.isDestroyed()) main.webContents.send("nama:dl-state", snapshot());
  }, 350);
}

/* ------------------------------------------------------------------ */
/* transfer engine                                                     */
/* ------------------------------------------------------------------ */
function pump() {
  for (const it of items) {
    if (active.size >= MAX_ACTIVE) break;
    if (it.status === "queued" && !active.has(it.id)) startItem(it);
  }
}

function requestUrl(url, headers, cb, redirects = 0) {
  let u;
  try {
    u = new URL(url);
  } catch {
    cb(new Error("آدرس نامعتبر است"));
    return;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    cb(new Error("پروتکل آدرس پشتیبانی نمی‌شود"));
    return;
  }
  const mod = u.protocol === "https:" ? https : http;
  const req = mod.request(u, { headers, method: "GET" }, (res) => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (redirects >= MAX_REDIRECTS) {
        cb(new Error("تعداد زیادی ریدایرکت"));
        return;
      }
      let next;
      try {
        next = new URL(res.headers.location, u).toString();
      } catch {
        cb(new Error("ریدایرکت نامعتبر"));
        return;
      }
      requestUrl(next, headers, cb, redirects + 1);
      return;
    }
    cb(null, res, req);
  });
  req.on("error", (e) => cb(e));
  req.end();
}

function startItem(it) {
  if (active.has(it.id)) return;

  // resolve the destination BEFORE anything else so a missing folder fails fast
  let target;
  try {
    if (!baseDir) throw new Error("پوشه‌ی دانلود انتخاب نشده است");
    target = computeTarget(it);
    fs.mkdirSync(target.dir, { recursive: true });
    it.filePath = target.file;
  } catch (e) {
    it.status = "failed";
    it.error = e?.message || String(e);
    broadcast();
    return;
  }

  const part = partPath(it);
  let received = 0;
  try {
    received = fs.existsSync(part) ? Math.max(0, fs.statSync(part).size) : 0;
  } catch {
    received = 0;
  }

  /** controller — exists for the whole transfer, before the socket does */
  const ctl = { stopped: false, paused: false, canceled: false, req: null, res: null, stream: null };
  active.set(it.id, ctl);

  let settled = false;
  let lastTick = Date.now();
  let lastBytes = received;

  const finish = (status, err, transient = false) => {
    if (settled) return;
    settled = true;
    clearInterval(tick);
    active.delete(it.id);
    for (const s of [ctl.stream, ctl.res]) {
      try {
        s?.destroy();
      } catch {
        /* ignore */
      }
    }
    try {
      ctl.req?.destroy();
    } catch {
      /* ignore */
    }
    if (ctl.canceled) return; // item already detached from the list
    if (status === "completed") {
      // never silently overwrite another file
      let finalPath = it.filePath;
      try {
        if (fs.existsSync(finalPath)) finalPath = uniquePath(finalPath);
        fs.renameSync(part, finalPath);
        it.filePath = finalPath;
      } catch (e) {
        it.status = "failed";
        it.error = "انتقال فایل ناموفق بود: " + (e?.message || "");
        it.speed = 0;
        save();
        broadcast();
        pump();
        return;
      }
      it.status = "completed";
      if (it.total > 0) it.received = it.total;
      it.speed = 0;
      it.retries = 0;
      it.completedAt = Date.now();
    } else if (status === "paused") {
      it.status = "paused";
      it.speed = 0;
    } else if (transient && (it.retries || 0) < MAX_RETRIES) {
      // network hiccup (Wi-Fi/VPN drop, stalled socket…) → silently requeue;
      // the .part file stays so the retry continues from where it stopped
      it.retries = (it.retries || 0) + 1;
      it.status = "queued";
      it.speed = 0;
    } else {
      it.status = "failed";
      it.error = err || "خطای ناشناخته در دانلود";
      it.speed = 0;
    }
    save();
    broadcast();
    pump(); // fill the freed slot
  };

  const tick = setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    if (dt >= 0.9) {
      it.speed = Math.max(0, Math.round((received - lastBytes) / dt));
      lastTick = now;
      lastBytes = received;
      broadcast();
    }
  }, 1000);

  /** user pause/cancel — kills the socket; finish() then lands the status */
  ctl.halt = (why) => {
    ctl.stopped = true;
    if (why === "pause") ctl.paused = true;
    if (why === "cancel") ctl.canceled = true;
    try {
      ctl.req?.destroy();
    } catch {
      /* ignore */
    }
    try {
      ctl.res?.destroy();
    } catch {
      /* ignore */
    }
    try {
      ctl.stream?.destroy();
    } catch {
      /* ignore */
    }
  };

  const headers = {
    "User-Agent": `Frame/${app ? app.getVersion() : "0.0.0"} (github.com/pvwvuow/frame)`,
    Accept: "*/*",
  };
  if (received > 0) headers.Range = `bytes=${received}-`;

  it.status = "downloading";
  it.error = null;
  it.speed = 0;
  broadcast();

  requestUrl(it.url, headers, (err, res, req) => {
    ctl.req = req || null;
    if (err) {
      // connection-level failure (DNS, timeout, reset…) — retryable
      finish(ctl.paused ? "paused" : ctl.canceled ? "failed" : "failed", ctl.paused ? null : err.message, !ctl.paused && !ctl.canceled);
      return;
    }
    if (ctl.stopped) {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
      finish(ctl.canceled || ctl.paused ? "paused" : "failed", null);
      return;
    }
    ctl.res = res;

    /** v0.10.19: pause/cancel DESTROY the socket, which fires no 'error' and
     * no 'finish' on its own — without this handler the item would sit in
     * "downloading" forever. 'end' marks a fully received body so the normal
     * path is never mistaken for a drop. */
    let resEnded = false;
    res.on("end", () => {
      resEnded = true;
    });
    res.on("close", () => {
      if (settled || resEnded) return;
      if (ctl.paused || ctl.canceled) finish("paused");
      else finish("failed", "اتصال در میانه‌ی دانلود قطع شد", true);
    });

    if (req) {
      req.setTimeout(STALL_TIMEOUT, () => {
        try {
          req.destroy(new Error("اتصال بیش از حد طول کشید"));
        } catch {
          /* ignore */
        }
      });
    }

    const code = res.statusCode || 0;
    if (code !== 206 && code !== 200) {
      res.resume();
      finish("failed", `پاسخ سرور: ${code}`);
      return;
    }
    if (code === 206) {
      it.resumable = true;
    } else {
      // server ignored the Range header → restart the file from zero
      received = 0;
      it.resumable = false;
    }
    const len = Number(res.headers["content-length"]);
    it.total = Number.isFinite(len) && len > 0 ? (code === 206 ? len + received : len) : it.total || 0;
    it.received = received;

    let stream;
    try {
      stream = fs.createWriteStream(part, { flags: code === 206 ? "a" : "w" });
    } catch (e) {
      res.resume();
      finish("failed", "ساخت فایل ممکن نشد: " + (e?.message || ""));
      return;
    }
    ctl.stream = stream;

    res.on("data", (chunk) => {
      received += chunk.length;
      it.received = received;
    });
    res.on("error", (e) => {
      finish(
        ctl.paused || ctl.canceled ? "paused" : "failed",
        ctl.paused || ctl.canceled ? null : e?.message,
        !ctl.paused && !ctl.canceled
      );
    });
    stream.on("error", (e) => {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
      finish(
        ctl.paused || ctl.canceled ? "paused" : "failed",
        ctl.paused || ctl.canceled ? null : "نوشتن فایل ناموفق بود: " + (e?.message || "")
      );
    });
    res.pipe(stream);
    stream.on("finish", () => {
      // distinguish a full body from an aborted one
      if (it.total > 0 && received < it.total - 1024) {
        finish(ctl.paused || ctl.canceled ? "paused" : "failed", ctl.paused || ctl.canceled ? null : "دریافت فایل ناقص ماند", !ctl.paused && !ctl.canceled);
        return;
      }
      finish("completed");
    });
  });
}

function haltItem(it, why) {
  const ctl = active.get(it.id);
  if (!ctl) return false;
  ctl.halt(why);
  return true;
}

/* ------------------------------------------------------------------ */
/* IPC surface                                                         */
/* ------------------------------------------------------------------ */
function setupDownloads(deps) {
  log = deps.log || log;
  getMainWindow = deps.getMainWindow || getMainWindow;
  getUserData = deps.getUserData || getUserData;
  dialog = deps.dialog;
  shell = deps.shell;
  app = deps.app;
  const { ipcMain } = require("electron");

  ipcMain.handle("dl:get-state", () => {
    load();
    pump(); // resume the queue left from a previous session
    return snapshot();
  });

  ipcMain.handle("dl:enqueue", (_e, raw) => {
    load();
    if (!raw || typeof raw !== "object") return { ok: false, error: "درخواست نامعتبر" };
    const url = String(raw.url || "");
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: "آدرس فایل معتبر نیست" };
    if (!baseDir) return { ok: false, error: "اول پوشه‌ی دانلود را انتخاب کنید", needDir: true };

    const it = {
      id: `dl_${Date.now().toString(36)}_${(idCounter = (idCounter + 1) % 1e6)}`,
      url,
      name: sanitize(raw.name) || "نامشخص",
      year: Number(raw.year) || 0,
      kind: raw.kind === "series" ? "series" : "movie",
      season: Number(raw.season) || 0,
      episode: Number(raw.episode) || 0,
      quality: sanitize(raw.quality) || "",
      variant: sanitize(raw.variant) || "",
      mb: Number(raw.mb) || 0,
      label: sanitize(raw.label) || "",
      status: "queued",
      received: 0,
      total: 0,
      speed: 0,
      error: null,
      createdAt: Date.now(),
    };
    // compute the target now so duplicates can be detected before starting
    try {
      it.filePath = computeTarget(it).file;
      const dup = items.find((x) => x.filePath === it.filePath && ["queued", "downloading", "paused"].includes(x.status));
      if (dup) return { ok: true, id: dup.id, dup: true };
    } catch {
      it.filePath = "";
    }

    items.push(it);
    if (items.length > MAX_HISTORY + 40) items = items.slice(-MAX_HISTORY);
    save();
    pump();
    broadcast();
    return { ok: true, id: it.id };
  });

  ipcMain.on("dl:pause", (_e, id) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (it.status === "downloading") {
      if (!haltItem(it, "pause")) {
        it.status = "paused";
        save();
        broadcast();
      }
    } else if (it.status === "queued") {
      it.status = "paused";
      save();
      broadcast();
    }
  });

  ipcMain.on("dl:resume", (_e, id) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if ((it.status === "paused" || it.status === "failed") && !active.has(it.id)) {
      it.status = "queued";
      it.error = null;
      it.retries = 0; // a manual resume grants fresh retries
      save();
      pump();
      broadcast();
    }
  });

  ipcMain.on("dl:cancel", (_e, id) => {
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const it = items[idx];
    const part = partPath(it);
    const wasActive = haltItem(it, "cancel");
    if (!wasActive) {
      try {
        fs.rmSync(part, { force: true });
      } catch {
        /* ignore */
      }
    } else {
      // the socket abort lands asynchronously — remove the partial file after
      // the streams release it (best effort; leftovers are harmless)
      setTimeout(() => {
        try {
          fs.rmSync(part, { force: true });
        } catch {
          /* ignore */
        }
      }, 1500);
    }
    items.splice(idx, 1);
    save();
    broadcast();
    pump();
  });

  ipcMain.on("dl:remove", (_e, id) => {
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const it = items[idx];
    if (it.status === "downloading" || it.status === "queued") return; // use cancel
    items.splice(idx, 1);
    save();
    broadcast();
  });

  ipcMain.handle("dl:choose-dir", async () => {
    load();
    const opts = {
      title: "انتخاب پوشه‌ی دانلود Frame",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "انتخاب این پوشه",
    };
    try {
      opts.defaultPath = baseDir || app.getPath("downloads");
    } catch {
      /* ignore */
    }
    const r = await dialog.showOpenDialog(getMainWindow() ?? undefined, opts);
    const dir = r.canceled ? null : r.filePaths?.[0] ?? null;
    if (dir) {
      baseDir = dir;
      flushSave();
      broadcast();
    }
    return dir;
  });

  ipcMain.handle("dl:set-dir", (_e, dir) => {
    load();
    if (typeof dir !== "string" || !path.isAbsolute(dir)) return false;
    baseDir = path.normalize(dir);
    flushSave();
    broadcast();
    return true;
  });

  ipcMain.handle("dl:open-folder", (_e, id) => {
    load();
    if (!baseDir) return false;
    const frameRoot = path.join(baseDir, "Frame");
    if (!id) {
      try {
        fs.mkdirSync(frameRoot, { recursive: true });
      } catch {
        /* ignore */
      }
      shell.openPath(frameRoot);
      return true;
    }
    const it = items.find((x) => x.id === id);
    if (!it) return false;
    if (it.status === "completed" && it.filePath && fs.existsSync(it.filePath)) {
      shell.showItemInFolder(it.filePath);
      return true;
    }
    // in-flight → reveal the containing folder
    const dir = it.filePath ? path.dirname(it.filePath) : frameRoot;
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    shell.openPath(dir);
    return true;
  });
}

module.exports = { setupDownloads };
