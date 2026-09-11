/* Copies static assets + public into the standalone output (needed by `next start`-less deployments and Electron).
 *
 * v0.26.0 (F-19) — this used to blind-copy ~1.2GB of public/ into the
 * standalone tree that electron-after-pack then filtered straight back out
 * (ENOSPC risk on CI, minutes of wasted IO per build on 3 OS × every
 * release). What each deployment actually serves:
 *   - public/covers (~989MB): NEVER — artwork streams from metahub everywhere
 *   - public/catalog/titles (~122MB): NEVER — full records stream from
 *     jsDelivr/raw on every platform
 *   - public/catalog/mobile + index.json + version.json: KEPT — Android
 *     clients of a self-hosted server fetch the lite shards from the origin,
 *     and index.json is the NAMA_CATALOG_URL source for self-hosts.
 */
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(standalone)) {
  console.error("standalone output missing – is `output: 'standalone'` set in next.config.ts?");
  process.exit(1);
}
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });

const skipHeavy = (src) =>
  /[\\/]public[\\/]covers([\\/]|$)/.test(src) ||
  /[\\/]public[\\/]catalog[\\/]titles([\\/]|$)/.test(src);
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
  filter: (s) => !skipHeavy(s),
});
// Ship the seed SQLite database next to the standalone server so `npm start`
// (or any host running `node .next/standalone/server.js`) works out of the box.
// schema.sql (full DDL) ships alongside it so seed.ts can self-heal an
// empty/legacy database at runtime.
fs.mkdirSync(path.join(standalone, "db"), { recursive: true });
fs.copyFileSync(path.join(root, "db", "custom.db"), path.join(standalone, "db", "custom.db"));
const ddlSrc = path.join(root, "prisma", "schema.sql");
if (fs.existsSync(ddlSrc)) {
  fs.copyFileSync(ddlSrc, path.join(standalone, "db", "schema.sql"));
} else {
  console.warn("⚠ prisma/schema.sql missing – generate it: npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/schema.sql");
}
console.log("✓ standalone output ready:", standalone, "(covers/titles excluded from the copy — streamed remotely)");
