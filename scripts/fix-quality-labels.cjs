/* v0.10.17 – canonical QUALITY + VARIANT labels from the actual file names.
 *
 * The archive's own tables list several files per quality and the import
 * zipped the rows together in the wrong order: ~17% of the sources shipped
 * with a quality label that does not match the file their URL points at
 * (label «720p» on a 480p file, «1080p» on a 720p file …). The user picks
 * «۴۸۰» and gets the 720p file. The file name inside the URL is the ground
 * truth — the same rule scripts/fix-variant-labels.cjs (v0.10.5) applies to
 * variant labels, now extended to the quality label.
 *
 * NOTE: the app itself ALSO re-derives labels at runtime (src/lib/source-fix.ts,
 * wired into the player store and the watch/title pages), so playback is
 * truthful even against stale catalogs. This script fixes the stored data so
 * the bundled seed.db and the exported catalog carry correct labels too.
 *
 * Idempotent: rows already canonical never match the update predicate.
 *
 * Run: node scripts/fix-quality-labels.cjs [--dry]
 */
const { PrismaClient } = require("@prisma/client");

const DRY = process.argv.includes("--dry");
const db = new PrismaClient({
  datasources: { db: { url: "file:" + process.cwd().replace(/\\/g, "/") + "/db/custom.db" } },
});

const Q_LABEL = {
  "2160p": "4K", "4k": "4K", uhd: "4K",
  "1080p": "1080p",
  "720p": "720p",
  "576p": "540p", "540p": "540p",
  "480p": "480p",
  "360p": "360p", "240p": "360p",
};
const Q_TAG_RE = /(?:^|[.\-_ \/])(2160p|1080p|720p|576p|540p|480p|360p|240p|4k|uhd)(?=$|[.\-_ \/])/i;

function urlQuality(url) {
  let s = String(url || "");
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  s = s.split("?")[0].split("#")[0];
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(slash + 1); // drop the host
  const baseSlash = s.lastIndexOf("/");
  const base = baseSlash >= 0 ? s.slice(baseSlash + 1) : s;
  const m = Q_TAG_RE.exec(base) ?? Q_TAG_RE.exec(s); // basename first (file name = truth)
  return m ? Q_LABEL[m[1].toLowerCase()] ?? null : null;
}

function canonicalVariant(url, current) {
  let s = String(url || "");
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  if (/\/Dubbed\/|[.\-]Dubbed[.\-]|Farsi[.\-]?Dubbed/i.test(s)) return "دوبله فارسی";
  if (/HardSub/i.test(s)) return "زیرنویس چسبیده";
  if (/SoftSub/i.test(s)) return "زیرنویس چسبیده";
  if (/\/NoSub\/|[.\-]NoSub[.\-]/i.test(s)) return "بدون زیرنویس";
  return current;
}

function fixSourcesJson(json) {
  let arr;
  try {
    arr = JSON.parse(json || "[]");
  } catch {
    return { json, changed: 0 };
  }
  if (!Array.isArray(arr)) return { json, changed: 0 };
  let changed = 0;
  const seen = new Set();
  const next = [];
  for (const s of arr) {
    if (!s || !s.url) continue;
    if (seen.has(s.url)) { changed++; continue; } // dedupe zipped rows
    seen.add(s.url);
    const q = urlQuality(s.url) ?? s.q ?? "";
    const v = canonicalVariant(s.url, s.v ?? "");
    if (q !== s.q || v !== s.v) {
      changed++;
      next.push({ ...s, q, v });
    } else {
      next.push(s);
    }
  }
  return { json: changed ? JSON.stringify(next) : json, changed };
}

async function walk(model, label) {
  let lastId = 0;
  let rows = 0;
  let touchedRows = 0;
  let touchedEntries = 0;
  const transitions = new Map();
  for (;;) {
    const batch = await db[model].findMany({
      where: { id: { gt: lastId } },
      select: { id: true, sources: true },
      orderBy: { id: "asc" },
      take: 2000,
    });
    if (!batch.length) break;
    lastId = batch[batch.length - 1].id;
    for (const row of batch) {
      rows++;
      const before = row.sources;
      const { json, changed } = fixSourcesJson(before);
      if (!changed) continue;
      touchedRows++;
      touchedEntries += changed;
      try {
        const a = JSON.parse(before);
        const b = JSON.parse(json);
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          const k = `${a[i]?.q || "?"}|${a[i]?.v || "?"} → ${b[i]?.q || "?"}|${b[i]?.v || "?"}`;
          if (a[i]?.q !== b[i]?.q || a[i]?.v !== b[i]?.v) transitions.set(k, (transitions.get(k) || 0) + 1);
        }
      } catch {
        /* ignore */
      }
      if (!DRY) {
        await db[model].update({ where: { id: row.id }, data: { sources: json } });
      }
    }
    if (!DRY && rows % 2000 === 0) process.stdout.write(`  ${label}: ${rows} scanned\r`);
  }
  process.stdout.write("\n");
  console.log(`${label}: rows=${rows} rows-fixed=${touchedRows} entries-fixed=${touchedEntries}${DRY ? " (DRY)" : ""}`);
  for (const [k, n] of [...transitions.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15)) {
    console.log(`   ${n}\t${k}`);
  }
}

(async () => {
  console.log(`fix-quality-labels ${DRY ? "(dry run)" : ""}`);
  await walk("title", "titles");
  await walk("episode", "episodes");
  if (!DRY) console.log("done – re-export the catalog so auto-update ships the fix");
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
