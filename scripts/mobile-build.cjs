#!/usr/bin/env node
/* Android (static export) build.
 *
 * The API routes are server-only (desktop). For the export build they are
 * moved aside, `next build` runs with NAMA_MOBILE=1 (output: "export"), and
 * the routes are restored. Output lands in out/ for Capacitor to consume.
 *
 * v0.16.0 — SPLIT ASSETS: the covers webp library no longer rides inside
 * out/ → the APK drops from ~134MB to ~40MB. Instead the covers are staged
 * here as ORDERED CHUNKS under .covers-pack/ (Frame-coverpack-rN-pNN.zip,
 * ~12MB each, most-seen titles first) which CI attaches to the release; the
 * in-app updater merges them into the live web root at runtime
 * (applyCoverPack). Code + catalog shards stay in out/ → the OTA web bundle
 * is ~20MB instead of ~130MB.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
// v0.12.0 — native surface revision (bump ONLY when android/ java/config
// changes ship): 2 = initial player + downloads + self-update bridge
// 3 = v0.16.0 — applyCoverPack + covers-carryover + player HTTP hardening
// 4 = v0.16.1 — cleartext traffic + OkHttp datasource (desktop-parity
//     UA/TLS/redirects) → APK required for every user on ≤ rev 3
// 5 = v0.16.3 — THE ROOT PLAYBACK FIX: NamaNativePlugin is now registered
//     BEFORE super.onCreate() in MainActivity (the bridge was dead since
//     v0.12.0 — every native handoff rejected "not implemented"); plus the
//     audio-decoder resilience in PlayerActivity → APK required for every
//     user on ≤ rev 4
// 6 = v0.17.0 — PLAY PROTECT HARDENING + NATIVE PLAYER UI: removed
//     REQUEST_INSTALL_PACKAGES (in-app APK install → openUrl to browser),
//     network_security_config + scoped relaxed TLS (dl hosts only),
//     allowBackup=false, R8 minify, WebView debug/mixed-content off in
//     release, custom Netflix-style controller in PlayerActivity → APK
//     required for every user on ≤ rev 5. NOTE: this is the LAST APK that
//     users of ≤ rev 5 receive via the in-app installer; from now on the
//     updater opens the browser.
const NATIVE_REV = 9; // v0.21.1 — PlayerActivity: AUDIO HARDENING (codec failure now tries every OTHER audio track before muting; video-side failures finish immediately for the JS ladder) → APK required for every user on ≤ rev 8.
                      // ⚠️ bump THIS constant AND let it rewrite version.properties — bumping version.properties alone gets silently overwritten by android:export (this script) and CI ships an OTA bundle instead of the full APK (the v0.19.0 bug).
const API_DIR = path.join(ROOT, "src", "app", "api");
const TMP_DIR = path.join(ROOT, ".mobile-tmp-api");
const PACK_DIR = path.join(ROOT, ".covers-pack");
const WORK_DIR = path.join(ROOT, ".covers-pack-work");
const COVERS_SRC = path.join(ROOT, "public", "covers");
const PART_BYTES = 12 * 1024 * 1024; // ~12MB per chunk

function readCoversRev() {
  const f = path.join(__dirname, "covers-rev.txt");
  try {
    const v = parseInt(fs.readFileSync(f, "utf8").trim(), 10);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* fallthrough */
  }
  return 1;
}

function listWebp(dir, base) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listWebp(p, path.join(base, e.name)));
    else if (e.name.endsWith(".webp")) out.push(path.join(base, e.name));
  }
  return out;
}

/** tt folder → best views among catalog titles using it (for ordering) */
function folderViewsByViews() {
  const map = new Map();
  const dir = path.join(ROOT, "public", "catalog", "mobile");
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!/^full-\d+\.json$/.test(f)) continue;
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const t of arr) {
        const m = /\/covers\/(tt\d+)\//.exec(t.poster || "");
        if (m) {
          const v = Number(t.views) || 0;
          if (v > (map.get(m[1]) || 0)) map.set(m[1], v);
        }
      }
    } catch {
      /* ignore shard */
    }
  }
  return map;
}

/** Stage covers as ordered chunks: posters first (views desc), then
 *  backdrops; parts are hardlinked into a temp tree and zipped. */
function stageCoverPacks(rev) {
  if (!fs.existsSync(COVERS_SRC)) {
    console.log("no public/covers — skipping cover pack staging");
    return 0;
  }
  fs.rmSync(PACK_DIR, { recursive: true, force: true });
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(PACK_DIR, { recursive: true });

  const folderViews = folderViewsByViews();
  const all = listWebp(COVERS_SRC, "covers"); // e.g. covers/tt123/poster.webp
  const posters = all.filter((p) => /poster\.webp$/.test(p));
  const backdrops = all.filter((p) => /backdrop\.webp$/.test(p));

  const folderOf = (p) => p.split(/[/\\]/)[1];
  posters.sort((a, b) => (folderViews.get(folderOf(b)) || 0) - (folderViews.get(folderOf(a)) || 0) || (a < b ? -1 : 1));
  backdrops.sort();
  const ordered = [...posters, ...backdrops];

  // group into ~PART_BYTES chunks
  const parts = [];
  let cur = [];
  let curBytes = 0;
  for (const rel of ordered) {
    let sz = 0;
    try {
      sz = fs.statSync(path.join(COVERS_SRC, rel.slice("covers/".length))).size;
    } catch {
      continue;
    }
    if (cur.length && curBytes + sz > PART_BYTES) {
      parts.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push({ rel, sz });
    curBytes += sz;
  }
  if (cur.length) parts.push(cur);

  parts.forEach((files, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const work = path.join(WORK_DIR, `p${nn}`);
    fs.mkdirSync(work, { recursive: true });
    let bytes = 0;
    for (const { rel } of files) {
      const src = path.join(COVERS_SRC, rel.slice("covers/".length));
      const dst = path.join(work, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      try {
        fs.linkSync(src, dst);
      } catch {
        fs.copyFileSync(src, dst);
      }
      bytes += fs.statSync(src).size;
    }
    const dest = path.join(PACK_DIR, `Frame-coverpack-r${rev}-p${nn}.zip`);
    execSync(`cd "${work}" && zip -qr "${dest}" .`, { stdio: "inherit" });
    fs.rmSync(work, { recursive: true, force: true });
    console.log(`  pack p${nn}: ${files.length} files ${(bytes / 1048576).toFixed(1)}MB`);
  });
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  const totalBytes = parts.reduce((s, files) => s + files.reduce((a, f) => a + f.sz, 0), 0);
  console.log(`cover packs: ${parts.length} parts, ${(totalBytes / 1048576).toFixed(0)}MB total → .covers-pack/`);
  return parts.length;
}

function main() {
  if (fs.existsSync(TMP_DIR)) {
    console.log("restoring stale tmp api dir…");
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(API_DIR)) {
    fs.renameSync(API_DIR, TMP_DIR);
    console.log("api/ moved aside");
  }
  try {
    const APP_VERSION = require(path.join(ROOT, "package.json")).version;
    execSync("npx next build", {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        NAMA_MOBILE: "1",
        NEXT_PUBLIC_NAMA_MOBILE: "1",
        NEXT_PUBLIC_APP_VERSION: APP_VERSION,
      },
    });
  } finally {
    if (fs.existsSync(TMP_DIR)) {
      fs.renameSync(TMP_DIR, API_DIR);
      console.log("api/ restored");
    }
  }

  /* Post-export slim-down: the APK must NOT carry the covers library (the
   * desktop jpgs NOR the webp set — covers ride the split pack + metahub
   * fallback now), nor the monolithic index.json (mobile/ shards instead). */
  const OUT = path.join(ROOT, "out");
  let removed = 0;
  let bytes = 0;
  const rmWalk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        rmWalk(p);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      if (p.includes(`${path.sep}covers${path.sep}`) && (ext === ".jpg" || ext === ".jpeg" || ext === ".webp")) {
        bytes += fs.statSync(p).size;
        fs.unlinkSync(p);
        removed++;
      }
    }
  };
  rmWalk(OUT);
  // drop the emptied covers dir tree from the export
  if (fs.existsSync(path.join(OUT, "covers"))) fs.rmSync(path.join(OUT, "covers"), { recursive: true, force: true });
  for (const f of ["index.json", "README.md"]) {
    const p = path.join(OUT, "catalog", f);
    if (fs.existsSync(p)) {
      bytes += fs.statSync(p).size;
      fs.unlinkSync(p);
    }
  }
  console.log(`post-clean: removed ${removed} cover images + catalog/index.json (${(bytes / 1048576).toFixed(0)}MB)`);

  /* Stage the split cover packs (order: most-seen titles first) */
  const COVERS_REV = readCoversRev();
  stageCoverPacks(COVERS_REV);

  /* Keep the Android build in lock-step with the app version: gradle reads
   * version.properties (versionCode must grow monotonically for updates).
   * 0.10.29 → versionCode 100029 (maj*1e6 + min*1e4 + patch). */
  const { version } = require(path.join(ROOT, "package.json"));
  const [maj, min, pat] = version.split(".").map((n) => parseInt(n, 10) || 0);
  const code = maj * 1_000_000 + min * 10_000 + pat;
  const versionProps = [
    `versionName=${version}`,
    `versionCode=${code}`,
    // v0.12.0 — read by gradle → BuildConfig.NATIVE_REV; the in-app updater
    // compares it against the release's nativeRev to decide OTA web-bundle
    // vs full-APK download.
    `nativeRev=${NATIVE_REV}`,
    // v0.16.0 — gradle → BuildConfig.COVERS_REV: the cover-pack baseline the
    // APK assets carry (covers no longer ship in the APK → 0).
    `coversRev=0`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "android", "version.properties"), versionProps);
  console.log(`android version: versionName=${version} versionCode=${code} nativeRev=${NATIVE_REV} coversRev=0`);

  console.log("static export ready: out/");
}

main();
