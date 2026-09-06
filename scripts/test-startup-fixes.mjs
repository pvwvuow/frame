/* Startup-fix test harness (v0.10.2)
 * Runs electron/main.cjs inside a vm sandbox with a stubbed `electron`
 * module, then exercises the new file-operation logic:
 *   1. ensureUserDb() with a corrupt db + stale -wal/-shm journals
 *      → journals gone, corrupt file kept as .broken-*, fresh seed copied
 *   2. reseedUserData() with a corrupt db → backup + atomic reseed
 *   3. cleanupStaleServer() → kills a leftover "server.js" process,
 *      ignores foreign pids and its own pid
 */
import { createRequire } from "node:module";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);

// project root = parent of scripts/ (works locally AND in CI checkout)
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nama-test-"));
const userData = path.join(tmp, "Nama");
fs.mkdirSync(userData, { recursive: true });

const events = { dialogs: [], killed: [] };

const electronStub = {
  app: {
    isPackaged: false,
    getPath: (k) => (k === "appData" ? tmp : k === "userData" ? userData : tmp),
    setName: () => {},
    setPath: () => {},
    requestSingleInstanceLock: () => true,
    whenReady: () => new Promise(() => {}), // never resolves – no boot
    on: () => {},
    quit: () => events.quit = true,
    getVersion: () => "0.10.2-test",
    setAppUserModelId: () => {},
  },
  BrowserWindow: class {},
  ipcMain: { handle: () => {}, on: () => {} },
  shell: { openExternal: () => {}, openPath: () => {} },
  Menu: { setApplicationMenu: () => {} },
  nativeTheme: { shouldUseDarkColors: true },
  dialog: {
    showErrorBox: (...a) => events.dialogs.push(a[0]),
    showMessageBox: async () => ({ response: 0 }),
  },
  session: { defaultSession: { setPermissionRequestHandler: () => {} } },
};

const logStub = {
  transports: { file: { level: "info", getFile: () => ({ path: path.join(tmp, "test.log") }) } },
  initialize: () => {},
  info: (...a) => console.log("  [log.info]", ...a),
  warn: (...a) => console.log("  [log.warn]", ...a),
  error: (...a) => console.log("  [log.error]", ...a),
};

const src = fs.readFileSync(path.join(ROOT, "electron", "main.cjs"), "utf8");
const sandbox = {
  require: (m) => (m === "electron" ? electronStub : m === "electron-log" ? logStub : require(m)),
  module: { exports: {} },
  exports: {},
  __filename: path.join(ROOT, "electron", "dist", "main.cjs"),
  __dirname: path.join(ROOT, "electron", "dist"), // bundled layout → ROOT = two levels up
  process,
  Buffer,
  console,
  setTimeout,
  setInterval,
  clearInterval,
  Date,
  JSON,
  Math,
  Number,
  String,
  Promise,
  URL,
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "main.cjs" });

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "  ✅ PASS" : "  ❌ FAIL"}  ${name}`);
  if (!cond) failures++;
}

const userDb = path.join(userData, "nama.db");
const isSqlite = (p) => {
  try {
    const fd = fs.openSync(p, "r");
    const b = Buffer.alloc(15);
    fs.readSync(fd, b, 0, 15, 0);
    fs.closeSync(fd);
    return b.toString("utf8") === "SQLite format 3";
  } catch {
    return false;
  }
};

/* ---- Test 1: corrupt db + stale journals ------------------------- */
console.log("\n[1] ensureUserDb with corrupt nama.db + stale -wal/-shm");
fs.writeFileSync(userDb, "THIS IS NOT A DATABASE AT ALL 1234567890");
fs.writeFileSync(userDb + "-wal", "stale wal garbage");
fs.writeFileSync(userDb + "-shm", "stale shm garbage");
sandbox.ensureUserDb();
check("nama.db replaced with a real SQLite seed", isSqlite(userDb) && fs.statSync(userDb).size > 1e6);
check("no stale -wal left", !fs.existsSync(userDb + "-wal"));
check("no stale -shm left", !fs.existsSync(userDb + "-shm"));
const broken1 = fs.readdirSync(userData).filter((f) => f.startsWith("nama.db.broken-"));
check("corrupt db kept as .broken- backup", broken1.length === 1);
check("no .tmp leftovers", !fs.existsSync(userDb + ".tmp"));
check("catalog marker written", fs.existsSync(path.join(userData, "catalog.sha256")));

/* ---- Test 2: reseedUserData -------------------------------------- */
console.log("\n[2] reseedUserData replaces a later-corrupted db");
fs.writeFileSync(userDb, "CORRUPTED AGAIN");
const ok = sandbox.reseedUserData();
check("reseedUserData returned true", ok === true);
check("db is valid SQLite again", isSqlite(userDb) && fs.statSync(userDb).size > 1e6);
const broken2 = fs.readdirSync(userData).filter((f) => f.startsWith("nama.db.broken-"));
check("second backup kept", broken2.length === 2);
check("marker rewritten after reseed", fs.existsSync(path.join(userData, "catalog.sha256")));

/* ---- Test 3: cleanupStaleServer ---------------------------------- */
console.log("\n[3] cleanupStaleServer reaps a leftover server.js process");
const fakeDir = path.join(tmp, "standalone");
fs.mkdirSync(fakeDir, { recursive: true });
const fakeServer = path.join(fakeDir, "server.js");
fs.writeFileSync(fakeServer, "setInterval(() => {}, 1000);");
const orphan = spawn(process.execPath, [fakeServer], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));
fs.writeFileSync(path.join(userData, "server.pid"), String(orphan.pid));
sandbox.cleanupStaleServer();
await new Promise((r) => setTimeout(r, 600));
let alive = true;
try {
  process.kill(orphan.pid, 0);
} catch {
  alive = false;
}
check("orphan server.js process was killed", !alive);
check("pid file removed", !fs.existsSync(path.join(userData, "server.pid")));

console.log("\n[3b] cleanupStaleServer ignores foreign processes");
// cross-platform "unrelated" process (no `sleep` on Windows, no /proc on macOS)
const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e6)"], { stdio: "ignore" });
fs.writeFileSync(path.join(userData, "server.pid"), String(sleeper.pid));
sandbox.cleanupStaleServer();
await new Promise((r) => setTimeout(r, 300));
alive = true;
try {
  process.kill(sleeper.pid, 0);
} catch {
  alive = false;
}
check("foreign process NOT killed", alive);
check("pid file still cleared", !fs.existsSync(path.join(userData, "server.pid")));
try {
  process.kill(sleeper.pid, "SIGKILL");
} catch {}

console.log(`\n${failures === 0 ? "ALL TESTS PASSED ✅" : failures + " TEST(S) FAILED ❌"}`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
process.exit(failures === 0 ? 0 : 1);
