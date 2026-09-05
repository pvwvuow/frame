/* Bundles the Electron main + preload scripts (with electron-updater / electron-log)
   into electron/dist so the packaged asar needs no node_modules at all. */
const esbuild = require("esbuild");
const path = require("node:path");
const pkg = require("../package.json");
const root = path.join(__dirname, "..");

async function run() {
  const common = {
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    minify: false,
    sourcemap: false,
    external: ["electron"],
    define: { "process.env.NAMA_APP_VERSION": JSON.stringify(pkg.version) },
    logLevel: "info",
  };
  await esbuild.build({ ...common, entryPoints: [path.join(root, "electron/main.cjs")], outfile: path.join(root, "electron/dist/main.cjs") });
  await esbuild.build({ ...common, entryPoints: [path.join(root, "electron/preload.cjs")], outfile: path.join(root, "electron/dist/preload.cjs") });
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
