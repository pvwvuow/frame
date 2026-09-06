#!/usr/bin/env node
/* Pre-build gate (v0.10.3) — catches every failure mode that ever broke a
   Nama build/release BEFORE wasting minutes on `next build`:

   1. Toolchain       — node >= 20, package.json parseable
   2. Disk space      — needs >= 6 GB free (ENOSPC killed past builds)
   3. Build inputs    — db/custom.db, prisma/schema.sql, prisma/schema.prisma,
                        public/catalog/version.json, build/icon.png,
                        electron/main.cjs, scripts/electron-after-pack.cjs
   4. Seed DB         — SQLite header + sane size (corrupt seed shipped once)
   5. Catalog consistency — sha256(index.json) == version.json.sha256 and
                        counts plausible (a stale version.json made fresh
                        installs do a pointless 69 MB sync)
   6. Release state   — warns when tag v<version> already exists on origin
                        (desktop.yml will skip the release) or is missing
                        (push to main WILL build & publish that version)

   Usage: node scripts/preflight.mjs [--quick]   (--quick skips the 69 MB hash)
   Exit 1 on any hard failure, 0 otherwise. Never auto-fixes anything. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");

let failed = false;
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg) => { console.error(`  \x1b[31m✗\x1b[0m ${msg}`); failed = true; };
const warn = (msg) => console.warn(`  \x1b[33m!\x1b[0m ${msg}`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const GB = 1024 ** 3;

/* 1 ─ toolchain ------------------------------------------------------- */
section("1. Toolchain");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) ok(`node ${process.versions.node}`);
else bad(`node >= 20 required (found ${process.versions.node})`);

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  ok(`package.json v${pkg.version}`);
  if (!/\bnext build\b.*--webpack|--webpack.*\bnext build\b/.test(pkg.scripts?.build || "")) {
    bad('scripts.build must run `next build --webpack` — Turbopack panics on Persian text (next-code-frame/highlight.rs)');
  } else ok("build script is Turbopack-safe (--webpack)");
} catch (e) {
  bad(`package.json unreadable: ${e.message}`);
}

/* 2 ─ disk ----------------------------------------------------------- */
section("2. Disk space");
try {
  const st = fs.statfsSync(ROOT);
  const free = st.bsize * st.bfree;
  if (free > 6 * GB) ok(`${(free / GB).toFixed(1)} GB free`);
  else if (free > 4 * GB) warn(`${(free / GB).toFixed(1)} GB free — tight; clean release/ and .next/cache if the build fails with ENOSPC`);
  else bad(`${(free / GB).toFixed(1)} GB free — need >= 6 GB`);
} catch {
  warn("statfs unsupported here — disk not checked");
}

/* 3 ─ build inputs ---------------------------------------------------- */
section("3. Required build inputs");
const REQUIRED = [
  "db/custom.db",
  "prisma/schema.prisma",
  "prisma/schema.sql",
  "public/catalog/version.json",
  "build/icon.png",
  "electron/main.cjs",
  "scripts/electron-after-pack.cjs",
  "scripts/bundle-electron.cjs",
  "scripts/postbuild.cjs",
  "package-lock.json",
];
for (const rel of REQUIRED) {
  const p = path.join(ROOT, rel);
  if (fs.existsSync(p)) ok(rel);
  else bad(`missing: ${rel}`);
}

/* 4 ─ seed DB --------------------------------------------------------- */
section("4. Seed database (db/custom.db)");
const seed = path.join(ROOT, "db", "custom.db");
if (fs.existsSync(seed)) {
  const sz = fs.statSync(seed).size;
  const head = Buffer.alloc(16);
  const fd = fs.openSync(seed, "r");
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  const isSqlite = head.toString("utf8") === "SQLite format 3\0";
  if (!isSqlite) bad("db/custom.db is NOT a SQLite file (header mismatch) — reseed before building");
  else if (sz < 1024 * 1024) bad(`db/custom.db suspiciously small (${(sz / 1024).toFixed(0)} KB)`);
  else ok(`SQLite header OK, ${(sz / 1024 / 1024).toFixed(1)} MB`);
} else bad("db/custom.db missing — afterPack will refuse to package");

/* 5 ─ catalog consistency ---------------------------------------------- */
section("5. Hosted catalog consistency");
const vjson = path.join(ROOT, "public", "catalog", "version.json");
const ijson = path.join(ROOT, "public", "catalog", "index.json");
let vHash = "";
try {
  const v = JSON.parse(fs.readFileSync(vjson, "utf8"));
  vHash = String(v.sha256 || "");
  const c = v.counts || {};
  if (!/^[0-9a-f]{64}$/.test(vHash)) bad("version.json sha256 malformed");
  else if (!c.titles || c.titles < 100) bad(`version.json counts implausible: ${JSON.stringify(c)}`);
  else ok(`version.json: ${c.titles} titles / ${c.episodes} episodes`);
} catch (e) {
  bad(`version.json unreadable: ${e.message}`);
}
if (!QUICK && fs.existsSync(ijson) && vHash) {
  const { createHash } = await import("node:crypto");
  const h = createHash("sha256").update(fs.readFileSync(ijson)).digest("hex");
  if (h === vHash) ok(`index.json sha256 matches version.json (${h.slice(0, 12)}…)`);
  else bad(`index.json (${h.slice(0, 12)}…) does NOT match version.json (${vHash.slice(0, 12)}…) — re-run export-catalog.mjs`);
} else if (!QUICK) {
  warn("index.json missing — hosted catalog sync will break for installed apps");
}
const liveJson = path.join(ROOT, "public", "catalog", "index.json");
if (fs.existsSync(liveJson)) {
  const mb = fs.statSync(liveJson).size / 1024 / 1024;
  ok(`index.json size ${mb.toFixed(1)} MB (bundled seed must reflect this)`);
}

/* 6 ─ release state ------------------------------------------------------ */
section("6. Release state");
const tag = `v${pkg?.version ?? "?"}`;
try {
  const remote = execSync("git config --get remote.origin.url", { cwd: ROOT, encoding: "utf8" }).trim();
  const repo = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  if (repo) {
    const slug = repo[1];
    let tags = "";
    try {
      tags = execSync(`git ls-remote --tags origin "refs/tags/${tag}"`, { cwd: ROOT, encoding: "utf8", timeout: 20000 });
    } catch { /* offline */ }
    if (tags.trim()) warn(`tag ${tag} already exists on origin → a push to main will NOT build a release (bump package.json version to release)`);
    else warn(`tag ${tag} NOT on origin → next push to main AUTO-CREATES the tag and PUBLISHES release ${tag}`);
    ok(`origin repo: ${slug}`);
  } else warn("origin is not github.com — release automation N/A");
} catch {
  warn("not a git checkout? — tag state not checked");
}

console.log("");
if (failed) {
  console.error("\x1b[31m✘ PREFLIGHT FAILED — fix the ✗ items above before building.\x1b[0m");
  process.exit(1);
}
console.log("\x1b[32m✔ PREFLIGHT OK — safe to build.\x1b[0m");
