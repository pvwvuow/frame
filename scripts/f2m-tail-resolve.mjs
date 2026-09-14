/* f2m-tail-resolve.mjs — (COVER-1 پیوست) نجات دم‌ماهیک f2m
 *
 * ~۹۴۰ عنوان f2m هنوز کاور SVG دارند چون titleEn شان در فایل منبع وسط بریده
 * شده («Boy Sw ows Universe»، «The F of the House of Usher») و فارسی هم
 * ندارند. اما نام کامل واقعی داخل مسیر URL های دانلود خودشان است:
 *   https://host/yA3f/Series/The.F.and.Rise.of.Reggie.Dinkins.S01/...mkv
 *
 * این اسکریپت از sources هر عنوان، نامزدهای نام را بیرون می‌کشد (تمیزشده با
 * QUERY_NOISE_RE)، و با Cinemeta تطبیق می‌دهد — اول سخت‌گیر، بعد relaxed
 * (دربرگیری کلمه‌ای + گیت سال). روی موفقیت: poster/backdrop → /covers/<tt>/.
 *
 * Run: node scripts/f2m-tail-resolve.mjs   (idempotent — فقط /api/cover/ ها)
 */

import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const ROOT = path.join(import.meta.dirname, "..");
const db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(ROOT, "db", "custom.db") } } });

const UA = "NamaFrame-CatalogBot/1.0 (https://github.com/pvwvuow/frame; catalog metadata enrichment)";
const LIMIT = parseInt(process.env.TAIL_LIMIT || "0", 10) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- همان نرمال‌سازی resolve-f2m-covers.mjs ---- */
const normName = (s) =>
  String(s || "").toLowerCase()
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const nameRatio = (a, b) => (a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);

const NOISE = /\b(2160p|1080p|720p|576p|540p|480p|360p|240p|4k|uhd|fhd|hdr10?\+?|bluray|blu-ray|bdrip|brrip|dvdrip|web[ .-]?dl|webrip|hdtv|hdts|x264|x265|h\.?264|h\.?265|hevc|aac|mkv|mp4|film2media|farsi|persian|dubbed|complete|season[ .-]?\d+|s\d+e?\d*|e\d{1,3}|mini)?\b/gi;
const stripNoise = (s) =>
  String(s || "")
    .replace(/\.(mkv|mp4|avi|mov)$/i, " ")
    .replace(/(?:^|[\s._-])(?:S\d{1,2}(?:E\d{1,3})?|E\d{2,3}|1x\d{1,2}|2160p|1080p|720p|480p|4K|WEB[-. ]?DL|WEBRip|BluRay|x264|x265|HEVC|AAC|DDP?5\.?1|PSA|GANOOL|RARBG|GALAXYRG|MEGA|Filme?|Serial|Dubbed|Farsi|Complete)(?=$|[\s._-])/gi, " ")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const yearOf = (ri) => { const m = /(\d{4})/.exec(String(ri || "")); return m ? parseInt(m[1], 10) : null; };

function verify(meta, qRaw, t) {
  if (!meta) return null;
  const q = normName(qRaw);
  const n = normName(meta.name);
  if (!q || !n) return null;
  const exact = q === n;
  const ratio = nameRatio(q, n);
  // سخت‌گیر: دقیق یا ≥۰.۹۲؛ شل: دربرگیری کامل query در نام (یا برعکس) با حداقل ۸ حرف
  const contained = q.length >= 8 && (n.includes(q) || q.includes(n));
  if (!exact && ratio < 0.92 && !contained) return null;
  const hy = yearOf(meta.releaseInfo);
  if (hy && t.year > 0) {
    const tol = t.type === "series" ? 3 : 1;
    if (Math.abs(hy - t.year) > tol) return null;
  }
  return { tt: meta.imdb_id || meta.id, name: meta.name, year: hy, score: exact ? 2 : ratio };
}

async function cinemeta(type, q) {
  const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(q)}.json`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j?.metas) ? j.metas : [];
    } catch { await sleep(800 * (i + 1)); }
  }
  return [];
}

/** نامزدهای نام از sources JSON — سگمنت‌های مسیر URL تمیزشده، طولانی‌ترین اول */
function candidatesFromSources(sourcesJson) {
  let arr = [];
  try { arr = JSON.parse(sourcesJson || "[]"); } catch {}
  const cands = new Set();
  for (const s of arr) {
    const u = typeof s === "string" ? s : s?.url;
    if (!u || typeof u !== "string") continue;
    let p = "";
    try { p = decodeURIComponent(new URL(u).pathname); } catch { continue; }
    const segs = p.split("/").filter(Boolean);
    // از عمیق به سطحی؛ هم پوشه هم نام فایل
    for (let i = segs.length - 1; i >= 0; i--) {
      const c = stripNoise(segs[i]);
      if (c && c.length >= 4 && /[a-z\u0600-\u06FF]/i.test(c) && !/^\d+$/.test(c)) cands.add(c);
      if (cands.size >= 6) break;
    }
  }
  return [...cands].sort((a, b) => b.length - a.length).slice(0, 3);
}

async function resolveTitle(t) {
  const type = t.type === "series" ? "series" : "movie";
  for (const cand of t._cands) {
    const metas = await cinemeta(type, cand);
    // اول تطبیق سخت‌گیر روی ۸ اول؛ بعد شل روی ۲۵ اول
    for (const m of metas.slice(0, 8)) {
      const v = verify(m, cand, t);
      if (v && v.score === 2) return { ...v, q: cand };
    }
    const relaxed = metas.slice(0, 25).map((m) => verify(m, cand, t)).filter(Boolean).sort((a, b) => b.score - a.score);
    if (relaxed[0]) return { ...relaxed[0], q: cand };
    await sleep(120);
  }
  return null;
}

async function runPool(items, workers, fn) {
  let i = 0;
  const next = async () => { while (true) { const idx = i++; if (idx >= items.length) return; await fn(items[idx]); } };
  await Promise.all(Array.from({ length: workers }, next));
}

async function main() {
  const rows = await db.title.findMany({
    where: { source: "f2m", poster: { startsWith: "/api/cover/" } },
    select: { id: true, slug: true, title: true, titleEn: true, type: true, year: true, sources: true },
    orderBy: { views: "desc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  console.log(`tail titles: ${rows.length}`);
  const pool = rows
    .map((t) => ({ ...t, _cands: candidatesFromSources(t.sources) }))
    .filter((t) => t._cands.length > 0);
  console.log(`with URL candidates: ${pool.length}`);

  let fixed = 0, done = 0;
  const samples = [];
  await runPool(pool, 6, async (t) => {
    const hit = await resolveTitle(t);
    if (hit && hit.tt && /^tt\d+$/.test(hit.tt)) {
      await db.title.update({
        where: { id: t.id },
        data: { poster: `/covers/${hit.tt}/poster.jpg`, backdrop: `/covers/${hit.tt}/backdrop.jpg` },
      });
      fixed++;
      if (samples.length < 15) samples.push({ slug: t.slug, q: hit.q, tt: hit.tt, name: hit.name });
    }
    done++;
    if (done % 150 === 0) console.log(`  ${done}/${pool.length} fixed=${fixed}`);
    await sleep(120 + Math.random() * 120);
  });
  console.log(`tail done. fixed=${fixed}/${pool.length}`);
  for (const s of samples) console.log(`  e.g. ${s.q.slice(0, 28)} → ${s.tt} «${s.name}» (${s.slug})`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error("FATAL", e); try { await db.$disconnect(); } catch {} process.exit(1); });
