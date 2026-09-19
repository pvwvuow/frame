#!/usr/bin/env node
/* ONE-COMMAND content publish pipeline — run this on every content update.
 *
 *   node scripts/publish-catalog.mjs             # full publish
 *   node scripts/publish-catalog.mjs --dry-run   # preview the hero picks only
 *   HERO_MIN_RATING=8.0 node scripts/publish-catalog.mjs
 *
 * Steps:
 *   1. feature-new-hero.mjs   — auto-recut the home hero from the newest
 *                               add-wave (rating ≥ 8.5, series-first, real
 *                               covers, playable episodes). See that file.
 *   2. export-catalog.mjs     — db/custom.db → public/catalog/index.json
 *                               (+ version.json sha256 = content identity)
 *   3. mobile-shard-catalog.cjs — index.json → public/catalog/mobile/ shards
 *                               (manifest version = content sha → Android
 *                               re-imports automatically after an update)
 *
 * Then bump package.json, commit, push main + tag vX.Y.Z — the release build
 * and every device's first sync take it from there.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

/* the curation scripts accept --dry-run; the data movers don't need it */
const DRYABLE = new Set(["feature-new-hero.mjs", "feature-weekly.mjs"]);

function run(file) {
  const dry = DRY_RUN && DRYABLE.has(file) ? "--dry-run" : "";
  console.log(`\n─── node scripts/${file} ${dry}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", file), ...dry ? [dry] : []], {
    stdio: "inherit",
    cwd: ROOT,
  });
  if (r.status !== 0) throw new Error(`step failed: ${file} (exit ${r.status})`);
}

console.log("publish-catalog: hero → weekly → export → shards");
run("feature-new-hero.mjs");
/* v0.50.0 — the weekly shelf's pool (پیشنهاد این هفته) is recut on every
 * publish too; it excludes the hero's slides so the shelf reads as a
 * different aisle. */
run("feature-weekly.mjs");
if (DRY_RUN) {
  console.log("\ndry-run stops here (export/shards not touched).");
  process.exit(0);
}
run("export-catalog.mjs");
run("mobile-shard-catalog.cjs");
console.log("\npublish-catalog done ✔ — next: bump version, commit, push main + tag.");
