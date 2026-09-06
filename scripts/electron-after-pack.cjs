/* electron-builder afterPack hook: ship the Next.js standalone server, static
   assets, public folder and seed DB as plain resources (outside the asar).

   An ALLOWLIST is used on purpose: Next's standalone output can carry traced
   project-root extras (logs, .env, scratch dirs…). Only what server.js needs
   at runtime may reach the installed app: server.js, package.json, .next,
   node_modules, public, db. */
const fs = require("node:fs");
const path = require("node:path");

const STANDALONE_ENTRIES = ["server.js", "package.json", ".next", "node_modules", "public", "db"];

exports.default = async function afterPack(context) {
  const root = path.join(__dirname, "..");
  const isMac = context.electronPlatformName === "darwin";
  const resources = isMac
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const dest = path.join(resources, "app");
  const standalone = path.join(root, ".next", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("Run `npm run build` before packaging – .next/standalone is missing");

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  /* Cover-light packaging (v0.10.1+): public/covers (~680MB for the full
     archive) and public/catalog (~69MB index.json) are intentionally NOT
     bundled – covers stream from the hosted site root (GitHub raw, the same
     origin the catalog auto-update uses) and the catalog is fetched remotely
     at boot. This keeps the installer ~200MB instead of ~900MB. The seed DB
     (full metadata, works offline) stays bundled. */
  const skip = (src) =>
    /\.map$/.test(src) ||
    /[\\/]\.next[\\/]cache([\\/]|$)/.test(src) ||
    /[\\/]public[\\/](covers|catalog)([\\/]|$)/.test(src);
  for (const entry of STANDALONE_ENTRIES) {
    const src = path.join(standalone, entry);
    if (!fs.existsSync(src)) {
      console.warn(`  • afterPack: standalone/${entry} missing – skipped`);
      continue;
    }
    fs.cpSync(src, path.join(dest, "standalone", entry), { recursive: true, dereference: true, filter: (s) => !skip(s) });
  }
  // static assets live outside the traced output – copy them in explicitly
  fs.cpSync(path.join(root, ".next", "static"), path.join(dest, "standalone", ".next", "static"), { recursive: true });

  const seedSrc = path.join(root, "db", "custom.db");
  if (!fs.existsSync(seedSrc)) throw new Error("db/custom.db missing – it is the packaged seed database");
  fs.copyFileSync(seedSrc, path.join(dest, "seed.db"));

  const ddl = path.join(dest, "standalone", "db", "schema.sql");
  if (!fs.existsSync(ddl)) throw new Error("standalone/db/schema.sql missing – postbuild.cjs did not run? (needed for runtime schema self-heal)");

  /* Companion hash of the catalog this seed.db was exported from (written by
     export-catalog.mjs). The server pre-stores it in SyncState on fresh
     installs, so the boot-time remote sync fast-paths instead of downloading
     the whole ~69MB index.json for content the seed already contains. */
  const versionSrc = path.join(root, "public", "catalog", "version.json");
  if (fs.existsSync(versionSrc)) {
    fs.copyFileSync(versionSrc, path.join(dest, "seed-version.json"));
  } else {
    console.warn("  • afterPack: public/catalog/version.json missing – fresh installs will do a full remote sync");
  }

  console.log("  • afterPack: standalone server copied →", dest, "(cover-light: covers+catalog excluded)");
};
