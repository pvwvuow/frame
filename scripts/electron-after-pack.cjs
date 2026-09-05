/* electron-builder afterPack hook: ship the Next.js standalone server, static
   assets, public folder and seed DB as plain resources (outside the asar). */
const fs = require("node:fs");
const path = require("node:path");

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
  const skip = (src) => /\.map$/.test(src) || /[\\/]\.next[\\/]cache([\\/]|$)/.test(src);
  fs.cpSync(standalone, path.join(dest, "standalone"), { recursive: true, dereference: true, filter: (s) => !skip(s) });
  fs.cpSync(path.join(root, ".next", "static"), path.join(dest, "standalone", ".next", "static"), { recursive: true });
  fs.cpSync(path.join(root, "public"), path.join(dest, "standalone", "public"), { recursive: true });
  fs.copyFileSync(path.join(root, "db", "custom.db"), path.join(dest, "seed.db"));
  console.log("  • afterPack: standalone server copied →", dest);
};
