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
// Ship the seed SQLite database next to the standalone server so `npm start`
// (or any host running `node .next/standalone/server.js`) works out of the box.
fs.mkdirSync(path.join(standalone, "db"), { recursive: true });
fs.copyFileSync(path.join(root, "db", "custom.db"), path.join(standalone, "db", "custom.db"));
console.log("✓ standalone output ready:", standalone);
