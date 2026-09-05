/* Copies static assets + public into the standalone output (needed by `next start`-less deployments and Electron). */
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(standalone)) {
  console.error("standalone output missing – is `output: 'standalone'` set in next.config.ts?");
  process.exit(1);
}
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
console.log("✓ standalone output ready:", standalone);
