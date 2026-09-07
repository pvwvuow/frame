#!/usr/bin/env node
/* Android (static export) build.
 *
 * The API routes are server-only (desktop). For the export build they are
 * moved aside, `next build` runs with NAMA_MOBILE=1 (output: "export"), and
 * the routes are restored. Output lands in out/ for Capacitor to consume.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const API_DIR = path.join(ROOT, "src", "app", "api");
const TMP_DIR = path.join(ROOT, ".mobile-tmp-api");

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
    execSync("npx next build", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, NAMA_MOBILE: "1" },
    });
  } finally {
    if (fs.existsSync(TMP_DIR)) {
      fs.renameSync(TMP_DIR, API_DIR);
      console.log("api/ restored");
    }
  }

  /* Post-export slim-down: the APK must NOT carry the desktop's 682MB of
   * original JPEG covers (mobile uses the compact .webp set + SVG fallbacks),
   * nor the monolithic index.json (shipped as mobile/ shards instead). */
  const OUT = path.join(ROOT, "out");
  let removed = 0;
  let bytes = 0;
  const rmWalk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { rmWalk(p); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (p.includes(`${path.sep}covers${path.sep}`) && (ext === ".jpg" || ext === ".jpeg")) {
        bytes += fs.statSync(p).size;
        fs.unlinkSync(p);
        removed++;
      }
    }
  };
  rmWalk(OUT);
  for (const f of ["index.json", "README.md"]) {
    const p = path.join(OUT, "catalog", f);
    if (fs.existsSync(p)) { bytes += fs.statSync(p).size; fs.unlinkSync(p); }
  }
  console.log(`post-clean: removed ${removed} jpg covers + catalog/index.json (${(bytes / 1024 / 1024).toFixed(0)}MB)`);

  /* Keep the Android build in lock-step with the app version: gradle reads
   * version.properties (versionCode must grow monotonically for updates).
   * 0.10.29 → versionCode 100029 (maj*1e6 + min*1e4 + patch). */
  const { version } = require(path.join(ROOT, "package.json"));
  const [maj, min, pat] = version.split(".").map((n) => parseInt(n, 10) || 0);
  const code = maj * 1_000_000 + min * 10_000 + pat;
  const versionProps = [
    `versionName=${version}`,
    `versionCode=${code}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "android", "version.properties"), versionProps);
  console.log(`android version: versionName=${version} versionCode=${code}`);

  console.log("static export ready: out/");
}

main();
