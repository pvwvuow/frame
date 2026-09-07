/* Unit tests for src/lib/source-fix.ts (v0.10.17).
 *
 * The module is pure TypeScript with no imports, so the test transpiles it
 * in-process with the repo's own `typescript` package and evaluates it —
 * no build step, no ts-node dependency.
 *
 * Run: node scripts/test-source-fix.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = path.dirname(url.fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "..", "src", "lib", "source-fix.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module_ = { exports: {} };
new Function("module", "exports", "require", js)(module_, module_.exports, require);
const { urlQuality, canonicalVariant, normalizeSources, sourceQualityRank } = module_.exports;

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

/* ---- urlQuality: the URL's file/dir name is the ground truth ---- */
check("480p file under a 720p-ish path", urlQuality("https://dl.example/S01/720p.BluRay/Breaking.S01E01.480p.BluRay.mkv") === "480p");
check("1080p dir tag", urlQuality("https://dl.example/Serial/1080p.Web-DL/x.mkv") === "1080p");
check("2160p → 4K label", urlQuality("https://dl.example/a.2160p.10bit.HDR.mkv") === "4K");
check("4k tag", urlQuality("https://dl.example/Movie.4k.x264.mkv") === "4K");
check("576p → 540p bucket", urlQuality("https://dl.example/a.576p.mkv") === "540p");
check("240p → 360p bucket", urlQuality("https://dl.example/a.240p.mkv") === "360p");
check("encoded URL decoded first", urlQuality("https://dl.example/a%2E480p%2Emkv") === "480p");
check("no tag → null", urlQuality("https://dl.example/plain-drama.mkv") === null);
check("query string ignored", urlQuality("https://dl.example/a.mkv?fake=1080p") === null);
check("hostname not matched", urlQuality("https://1080p.cdn.example/a.mkv") === null);
check("dash separators", urlQuality("https://dl.example/Movie-480p-BluRay.mkv") === "480p");

/* ---- canonicalVariant: same rules as fix-variant-labels.cjs ---- */
check("Dubbed dir", canonicalVariant("https://x/Dubbed/a.mkv", "?") === "دوبله فارسی");
check("Farsi.Dubbed name", canonicalVariant("https://x/a.Farsi.Dubbed.DonyayeSerial.mkv", "?") === "دوبله فارسی");
check("SoftSub name", canonicalVariant("https://x/S01/720p.BluRay/a.720p.SoftSub.DonyayeSerial.mkv", "?") === "زیرنویس چسبیده");
check("HardSub name", canonicalVariant("https://x/a.HardSub.mkv", "?") === "زیرنویس چسبیده");
check("NoSub dir", canonicalVariant("https://x/NoSub/S05/a.mkv", "?") === "بدون زیرنویس");
check("plain file keeps label", canonicalVariant("https://x/plain.mkv", "دوبله فارسی") === "دوبله فارسی");

/* ---- normalizeSources: the 480→720 bug, reproduced and fixed ---- */
const BAD = [
  { q: "720p", v: "دوبله فارسی", url: "https://dl.example/Allo/NoSub/S05/480p.DVDRip/Allo.S05E01.480p.DVDRip.DonyayeSerial.mkv", mb: 200 },
  { q: "1080p", v: "دوبله فارسی", url: "https://dl.example/WEBRip/13.Reasons.S01E01.720p.WEBRip.Dubbed.KIMO.DonyayeSerial.mkv", mb: 350 },
  { q: "720p", v: "زیرنویس چسبیده", url: "https://dl.example/S01/720p.BluRay/1883.S01E01.720p.BluRay.x264.SoftSub.DonyayeSerial.mkv", mb: 400 },
];
const fixed = normalizeSources(BAD);
check("mislabelled 720p → truthful 480p", fixed[0].q === "480p", JSON.stringify(fixed[0]));
check("mislabelled 1080p → truthful 720p", fixed[1].q === "720p");
check("correct labels pass through", fixed[2].q === "720p" && fixed[2].v === "زیرنویس چسبیده");
check("variant re-derived from URL", fixed[0].v === "بدون زیرنویس" && fixed[1].v === "دوبله فارسی");
check("order preserved (hint/remembered idx stay valid)", fixed.map((s) => s.url).join("|") === BAD.map((s) => s.url).join("|"));

const DUP = [
  { q: "480p", v: "", url: "https://dl.example/a.720p.mkv" },
  { q: "720p", v: "", url: "https://dl.example/a.720p.mkv" },
  { q: "", v: "", url: "https://dl.example/b.mkv" },
];
const deduped = normalizeSources(DUP);
check("duplicate URL dropped (picking either row played the same file)", deduped.length === 2);
check("untagged url keeps its label", deduped[1].q === "");

check("normalizeSources: empty/null safe", JSON.stringify(normalizeSources(null)) === "[]" && JSON.stringify(normalizeSources([])) === "[]");
check("normalizeSources: entries without url dropped", normalizeSources([{ q: "720p", v: "", url: "" }]).length === 0);

/* ---- sourceQualityRank: REAL quality ranks above a wrong label ---- */
check("rank from url wins", sourceQualityRank({ q: "1080p", url: "https://x/a.480p.mkv" }) === 3);
check("rank falls back to label when url untagged", sourceQualityRank({ q: "720p", url: "https://x/plain.mkv" }) === 6);

/* ---- idempotence: normalizing twice changes nothing further ---- */
const twice = normalizeSources(normalizeSources(BAD));
check("idempotent", JSON.stringify(twice) === JSON.stringify(fixed));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
