/* v0.10.5 – canonical variant labels from the actual file names.
 *
 * The scraped «v» labels drifted away from the files they point at (e.g.
 * «دوبله فارسی» on a SoftSub.mkv, «زیرنویس چسبیده» on a Dubbed.mkv – the
 * site's own tables list several files per quality and the rows got zipped
 * together in the wrong order). Users then picked a «چسبیده» variant and got
 * a dubbed or subtitle-less file.
 *
 * The file name is the ground truth (DonyayeSerial convention):
 *   .../Dubbed/*.Farsi.Dubbed... → «دوبله فارسی»
 *   .../SoftSub/*.SoftSub...     → «زیرنویس چسبیده»  (SRT muxed in the mkv;
 *                                   the local stream proxy extracts it live)
 *   .../HardSub/...              → «زیرنویس چسبیده»
 *   .../NoSub/...                → «بدون زیرنویس»
 *   no token                     → keep the existing label
 *
 * Run: node scripts/fix-variant-labels.cjs [--dry]
 */
const { PrismaClient } = require("@prisma/client");

const DRY = process.argv.includes("--dry");
const db = new PrismaClient({
  datasources: { db: { url: "file:" + process.cwd().replace(/\\/g, "/") + "/db/custom.db" } },
});

function canonicalVariant(url, current) {
  let s = url || "";
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  if (/\/Dubbed\/|[.\-]Dubbed[.\-]|Farsi[.\-]?Dubbed/i.test(s)) return "دوبله فارسی";
  if (/HardSub/i.test(s)) return "زیرنویس چسبیده";
  if (/SoftSub/i.test(s)) return "زیرنویس چسبیده";
  if (/\/NoSub\/|[.\-]NoSub[.\-]/i.test(s)) return "بدون زیرنویس";
  return current; // plain-named files (e.g. drama encodes) keep their label
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
  const next = arr.map((s) => {
    if (!s || !s.url) return s;
    const nv = canonicalVariant(s.url, s.v);
    if (nv !== s.v) {
      changed++;
      return { ...s, v: nv };
    }
    return s;
  });
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
      // count label transitions for the report
      try {
        const a = JSON.parse(before);
        const b = JSON.parse(json);
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          const k = `${a[i]?.v || "(empty)"} → ${b[i]?.v || "(empty)"}`;
          if (a[i]?.v !== b[i]?.v) transitions.set(k, (transitions.get(k) || 0) + 1);
        }
      } catch {
        /* ignore */
      }
      if (!DRY) {
        await db[model].update({ where: { id: row.id }, data: { sources: json } });
      }
    }
    if (!DRY) process.stdout.write(`  ${label}: ${rows} scanned\r`);
  }
  process.stdout.write("\n");
  console.log(`${label}: rows=${rows} rows-fixed=${touchedRows} entries-fixed=${touchedEntries}${DRY ? " (DRY)" : ""}`);
  for (const [k, n] of [...transitions.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)) {
    console.log(`   ${n}\t${k}`);
  }
}

(async () => {
  console.log(`fix-variant-labels ${DRY ? "(dry run)" : ""}`);
  await walk("title", "titles");
  await walk("episode", "episodes");
  if (!DRY) console.log("done – re-export the catalog (scripts/export-catalog.mjs) so auto-update ships the fix");
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
