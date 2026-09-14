/* resolve-f2m-covers.mjs — v0.34.1 (COVER-1)
 *
 * The Film2Media wave shipped with generated SVG covers (/api/cover/<slug>.svg).
 * This pass upgrades them to REAL artwork + real metadata, in three phases:
 *
 *   A) tt-resolution — match every f2m title to its IMDb id via Cinemeta
 *      search (name + year verification, strict). Rewrites poster/backdrop to
 *      /covers/<tt>/poster.jpg|backdrop.jpg — the exact convention the od wave
 *      uses. That single rewrite unlocks everything downstream:
 *        - export-catalog derives posterUrl/backdropUrl (metahub streaming)
 *        - imdbIdFrom() starts working → genre/desc enrichment by tt
 *        - hero-pick eligibility (isTtCover)
 *      No image files are downloaded: the default render path streams from
 *      metahub per-<img> (same as od); the sandbox disk budget stays flat.
 *
 *   B) wikidata enrichment — the SAME engine as src/lib/meta-enrich.ts:
 *      batched SPARQL by IMDb id (genres P136 + fa/en article links), then
 *      Wikipedia summaries for «about». Write policy is verbatim: genres only
 *      when current is junk, description only when empty/short/templated.
 *      Titles WITHOUT a tt fall back to searchEntityByTitle (Persian films).
 *
 *   C) report — matched/unmatched/collision stats to
 *      /home/z/my-project/scripts/f2m-covers-report.json
 *
 * Run: node scripts/resolve-f2m-covers.mjs [--resolve-only] [--enrich-only]
 * Idempotent: titles whose poster is already /covers/<tt>/ are skipped in A,
 * already-canonical genres/desc are skipped in B.
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const ROOT = path.join(import.meta.dirname, "..");
const REPORT = process.env.F2M_REPORT || "/home/z/my-project/scripts/f2m-covers-report.json";
const CACHE_FILE = process.env.F2M_CACHE || "/home/z/my-project/scripts/f2m-meta-cache.json";
const RESOLVE_ONLY = process.argv.includes("--resolve-only");
const ENRICH_ONLY = process.argv.includes("--enrich-only");
const LIMIT = parseInt(process.env.F2M_LIMIT || "0", 10) || 0;
/* سقف‌های اجرای chunked — هر فراخوانی ≤ ~۹ دقیقه (سندباکس فرزندان پس‌زمینه را می‌کشد) */
const SPARQL_BATCH_CAP = parseInt(process.env.F2M_SPARQL_BATCHES || "0", 10) || Infinity;
const ENRICH_CAP = parseInt(process.env.F2M_ENRICH_LIMIT || "0", 10) || Infinity;
const NOTT_CAP = parseInt(process.env.F2M_NOTT_LIMIT || "0", 10) || 400;
const MISSED_FILE = process.env.F2M_MISSED || "/home/z/my-project/scripts/f2m-nott-missed.json";
const TRIED_FILE = process.env.F2M_TRIED || "/home/z/my-project/scripts/f2m-resolve-tried.json";
const SECOND_CHANCE = process.argv.includes("--second-chance");
const SKIP_NOTT = process.argv.includes("--skip-nott");
/* query.wikidata.org burst rate-limit دارد — فاصله بین کوئری‌ها قابل تنظیم است */
const SPARQL_GAP = parseInt(process.env.F2M_SPARQL_GAP || "700", 10);

const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.join(ROOT, "db", "custom.db") } },
});

/* ------------------------------------------------------------------ */
/* genre-map port (verbatim semantics from src/lib/genre-map.ts)       */
/* ------------------------------------------------------------------ */

const CANONICAL_GENRES = [
  "اکشن", "درام", "کمدی", "هیجان‌انگیز", "جنایی", "علمی‌تخیلی", "ترسناک", "عاشقانه",
  "ماجراجویی", "معمایی", "تاریخی", "جنگی", "حماسی", "نوآر", "فانتزی", "انیمیشن",
  "مستند", "خانوادگی", "زندگینامه‌ای", "موزیکال", "موسیقی", "وسترن", "ورزشی", "رئالیتی",
];
const CANON = new Set(CANONICAL_GENRES);
const JUNK = new Set(["نامشخص", "—", "–", "-", "unknown", "n/a", "genre"]);
const VARIANTS = [
  [/^علمی[\s\u200c\-–—ـ]*تخیلی$/, "علمی‌تخیلی"],
  [/^زندگینامه$/, "زندگینامه‌ای"],
  [/^هیجان[\s\u200c\-–—ـ]*انگیز$/, "هیجان‌انگیز"],
  [/^ماجرا$/, "ماجراجویی"],
];
const MAX_GENRES = 4;

function normalizeGenres(raw) {
  const out = [];
  const arr = Array.isArray(raw) ? raw : [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    let g = item.trim().replace(/\s+/g, " ");
    if (!g || JUNK.has(g) || JUNK.has(g.toLowerCase())) continue;
    g = g.replace(/هیجان[\s\-–—ـ]*انگیز/, "هیجان‌انگیز");
    g = g.replace(/علمی[\s\-–—ـ]*تخیلی/, "علمی‌تخیلی");
    for (const [re, canon] of VARIANTS) if (re.test(g)) { g = canon; break; }
    if (!CANON.has(g)) continue;
    if (!out.includes(g)) out.push(g);
    if (out.length >= MAX_GENRES) break;
  }
  return out;
}
const genresAreJunk = (raw) => normalizeGenres(raw).length === 0;

const LABEL_RULES = [
  [/science[ -]?fiction|sci-?fi|علمی[\s\u200c\-–—ـ]*تخیلی/i, "علمی‌تخیلی"],
  [/cyberpunk|dystop|post-?apocalyptic|time[ -]?travel|\bspace\b/i, "علمی‌تخیلی"],
  [/martial[ -]?arts|wuxia|رزمی/i, "اکشن"],
  [/superhero|ابرقهرمان/i, "اکشن"],
  [/heist|فیلم سرقت/i, "جنایی"],
  [/soap opera|telenovela|مسلسل/i, "درام"],
  [/coming[ -]?of[ -]?age|youth|نوجوان/i, "درام"],
  [/sitcom|کمدی موقعیت/i, "کمدی"],
  [/animated|animation|anime|انیمیشن|انیمه/i, "انیمیشن"],
  [/biographical|biopic|زندگینامه/i, "زندگینامه‌ای"],
  [/musical|موزیکال/i, "موزیکال"],
  [/detective|کارآگاه/i, "معمایی"],
  [/martial|samurai/i, "اکشن"],
  [/zombie|vampire|هیولا/i, "ترسناک"],
  [/espionage|\bspy\b|جاسوسی/i, "هیجان‌انگیز"],
  [/survival|بقا/i, "ماجراجویی"],
  [/supernatural|ماوراء|ماورالطبیعه/i, "فانتزی"],
  [/\baction\b|اکشن/i, "اکشن"],
  [/\badventure\b|ماجراجویی|ماجرایی/i, "ماجراجویی"],
  [/\bcomedy\b|کمدی/i, "کمدی"],
  [/\bcrime\b|gangster|جنایی/i, "جنایی"],
  [/documentary|مستند/i, "مستند"],
  [/\bdrama\b|درام/i, "درام"],
  [/\bepic\b|حماسی/i, "حماسی"],
  [/family|خانوادگی|کودکانه/i, "خانوادگی"],
  [/fantasy|فانتزی|خیال[\s\u200c\-–—ـ]*پردازی/i, "فانتزی"],
  [/historical|\bhistory\b|تاریخی/i, "تاریخی"],
  [/horror|ترسناک/i, "ترسناک"],
  [/\bmusic\b|موسیقی/i, "موسیقی"],
  [/mystery|معمایی/i, "معمایی"],
  [/\bnoir\b|نوآر/i, "نوآر"],
  [/romance|romantic|عاشقانه|عاشق/i, "عاشقانه"],
  [/sport|ورزشی/i, "ورزشی"],
  [/thriller|suspense|هیجان‌انگیز|مهیج|تعلیق/i, "هیجان‌انگیز"],
  [/\bwar\b|جنگی/i, "جنگی"],
  [/western|وسترن/i, "وسترن"],
  [/reality|رئالیتی/i, "رئالیتی"],
];

function genresFromWikidataLabels(labels) {
  const out = [];
  for (const label of labels) {
    if (!label) continue;
    for (const [re, genre] of LABEL_RULES) {
      if (re.test(label) && !out.includes(genre)) {
        out.push(genre);
        if (out.length >= MAX_GENRES) return normalizeGenres(out);
      }
    }
  }
  return normalizeGenres(out);
}

const faDigits = (n) => String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

function fallbackDescription(opts) {
  const kind = opts.type === "series" ? "سریال" : "فیلم";
  const year = opts.year && opts.year > 1900 ? ` ${faDigits(opts.year)}` : "";
  const bits = [`«${opts.title}»`];
  if (opts.genres && opts.genres.length) bits.push(`${kind}ی${year} در ژانر ${opts.genres.join("، ")}`);
  else bits.push(`${kind}${year}`);
  bits.push("— آماده‌ی پخش آنلاین در نما.");
  return bits.join(" ");
}

const TEMPLATE_RE = /منبع دایرکتوری|آرشیو دنیای سریال|آرشیو دنیای فیلم|آماده‌ی پخش آنلاین در نما\.$/;
function descriptionNeedsWork(d) {
  const s = (d || "").trim();
  if (!s) return true;
  if (s.length < 80) return true;
  return TEMPLATE_RE.test(s);
}

/* ------------------------------------------------------------------ */
/* wikidata port (verbatim from src/lib/wikidata.ts)                   */
/* ------------------------------------------------------------------ */

const UA = "NamaFrame-CatalogBot/1.0 (https://github.com/pvwvuow/frame; catalog metadata enrichment)";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKI_API = "https://www.wikidata.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sparqlSleep = () => sleep(SPARQL_GAP);

const SPARQL_BY_IMDB = (ids) => {
  const values = ids.map((id) => `"${id}"`).join(" ");
  return `SELECT DISTINCT ?imdb ?gl ?date ?fa ?en WHERE {
  VALUES ?imdb { ${values} }
  ?item wdt:P345 ?imdb .
  OPTIONAL { ?item wdt:P136 ?g . ?g rdfs:label ?gl . FILTER(LANG(?gl) IN ("fa","en")) }
  OPTIONAL { ?item wdt:P577 ?date . }
  OPTIONAL { ?faArt schema:about ?item ; schema:isPartOf <https://fa.wikipedia.org/> ; schema:name ?fa . }
  OPTIONAL { ?enArt schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?en . }
}`;
};

async function sparql(query, tries = 4) {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(5000 * i + Math.random() * 2000);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 400) throw new Error("sparql 400 (fatal)");
      if (!res.ok) throw new Error(`sparql ${res.status}`);
      const j = await res.json();
      return j.results?.bindings ?? [];
    } catch (e) {
      lastErr = e;
      if (String(e?.message).includes("fatal")) throw lastErr;
    }
  }
  throw lastErr ?? new Error("sparql failed");
}

function foldRows(rows, keyField) {
  const out = new Map();
  for (const r of rows) {
    const key = r[keyField]?.value;
    if (!key) continue;
    let hit = out.get(key);
    if (!hit) { hit = { genres: [] }; out.set(key, hit); }
    const gl = r.gl?.value;
    if (gl && !hit.genres.includes(gl)) hit.genres.push(gl);
    const fa = r.fa?.value;
    if (fa && !hit.faTitle) hit.faTitle = fa;
    const en = r.en?.value;
    if (en && !hit.enTitle) hit.enTitle = en;
    const date = r.date?.value;
    if (date && hit.year == null) {
      const y = parseInt(date.slice(0, 4), 10);
      if (y > 1880 && y <= new Date().getFullYear() + 2) hit.year = y;
    }
  }
  for (const hit of out.values()) hit.genres = genresFromWikidataLabels(hit.genres);
  return out;
}

async function fetchMetaByImdb(ids) {
  if (!ids.length) return new Map();
  return foldRows(await sparql(SPARQL_BY_IMDB(ids)), "imdb");
}

async function searchEntityByTitle(title, isSeries) {
  const p31 = isSeries ? "Q5398426|Q11424|Q506240|Q581714" : "Q11424|Q506240|Q5398426";
  const q = `${title} haswbstatement:P31=${p31}`;
  const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&srprop=&format=json&origin=*`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const j = await res.json();
    const qid = j.query?.search?.[0]?.title;
    if (!qid || !/^Q\d+$/.test(qid)) return null;
    const rows = await sparql(
      `SELECT DISTINCT ?qid ?imdb ?gl ?date ?fa ?en WHERE {
  VALUES ?qid { wd:${qid} }
  OPTIONAL { ?qid wdt:P345 ?imdb }
  OPTIONAL { ?qid wdt:P136 ?g . ?g rdfs:label ?gl . FILTER(LANG(?gl) IN ("fa","en")) }
  OPTIONAL { ?qid wdt:P577 ?date . }
  OPTIONAL { ?faArt schema:about ?qid ; schema:isPartOf <https://fa.wikipedia.org/> ; schema:name ?fa . }
  OPTIONAL { ?enArt schema:about ?qid ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?en . }
}`
    );
    const folded = foldRows(rows.map((r) => ({ ...r, qid: { value: r.qid?.value ?? qid } })), "qid");
    const hit = folded.get(qid);
    return hit ? { qid, ...hit } : null;
  } catch {
    return null;
  }
}

async function fetchSummary(lang, title) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`summary ${res.status}`);
    const j = await res.json();
    if (j.type && j.type !== "standard" && j.type !== "disambiguation") return null;
    const extract = (j.extract || "").trim();
    if (!extract || /^may refer to/i.test(extract)) return null;
    return { lang, extract };
  } catch {
    return null;
  }
}

async function fetchBestSummary(faTitle, enTitle, minLen = 100) {
  const fa = faTitle ? await fetchSummary("fa", faTitle) : null;
  if (fa && fa.extract.length >= minLen) return fa;
  const en = enTitle ? await fetchSummary("en", enTitle) : null;
  if (en && en.extract.length >= minLen) return en;
  if (fa) return fa;
  if (en) return en;
  return null;
}

/* ---------------- کش پایدار SPARQL/خلاصه (برای اجرای chunked) ---------------- */
/* f2m-meta-cache.json: { tt: { genres, faTitle, enTitle, year, noMeta? } } — نتیجه‌های SPARQL میان فراخوانی‌ها می‌ماند */
function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { return {}; }
}
function saveCache(c) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c));
}
function loadMissed() {
  try { return JSON.parse(fs.readFileSync(MISSED_FILE, "utf8")); } catch { return {}; }
}
function saveMissed(m) {
  fs.mkdirSync(path.dirname(MISSED_FILE), { recursive: true });
  fs.writeFileSync(MISSED_FILE, JSON.stringify(m));
}
function loadTried() {
  try { return JSON.parse(fs.readFileSync(TRIED_FILE, "utf8")); } catch { return {}; }
}
function saveTried(t) {
  fs.mkdirSync(path.dirname(TRIED_FILE), { recursive: true });
  fs.writeFileSync(TRIED_FILE, JSON.stringify(t));
}

/* ------------------------------------------------------------------ */
/* Cinemeta tt-resolution                                              */
/* ------------------------------------------------------------------ */

const CINEMETA = (type, q) =>
  `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(q)}.json`;

/** کیفیت تطبیق نام — بدون وابستگی خارجی */
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const nameRatio = (a, b) => {
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
};

const QUERY_NOISE_RE =
  /\b(2160p|1080p|720p|576p|540p|480p|360p|240p|4k|uhd|fhd|hdr10?\+?|bluray|blu-ray|bdrip|brrip|dvdrip|web[ .-]?dl|webrip|hdtv|hdts|x264|x265|h\.?264|h\.?265|hevc|aac|mkv|mp4|film2media|farsi|persian|dubbed|complete|season[ .-]?\d+|s\d+e\d+|miniseries|series)\b/gi;

function cleanQuery(s) {
  return String(s || "")
    .replace(QUERY_NOISE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const yearOf = (releaseInfo) => {
  const m = /(\d{4})/.exec(String(releaseInfo || ""));
  return m ? parseInt(m[1], 10) : null;
};

/** سخت‌گیری تطبیق: نام دقیق یا نزدیک‌تر از ۰.۹۲ + گیت سال */
function verifyHit(meta, t) {
  if (!meta) return null;
  const q = normName(t._query);
  const n = normName(meta.name);
  if (!q || !n) return null;
  const exact = q === n;
  const ratio = nameRatio(q, n);
  if (!exact && ratio < 0.92) return null;
  const hy = yearOf(meta.releaseInfo);
  // گیت سال: فیلم ±۱، سریال ±۳ (سال شروع)؛ اگر یکی نامشخص بود فقط نام حرف می‌زند
  if (hy && t.year > 0) {
    const tol = t.type === "series" ? 3 : 1;
    if (Math.abs(hy - t.year) > tol) return null;
  }
  return { tt: meta.imdb_id || meta.id, name: meta.name, year: hy, exact, ratio };
}

/** پاس دوم برای عناوینی که titleEn بریده‌شان پاس اول را رد کرد:
 *  نام hit باید کل query را با مرز کلمه در بر بگیرد (یا برعکس)،
 *  query حداقل ۲ کلمه، گیت سال همان قبلی؛ کوتاه‌ترین نامِ منطبق انتخاب می‌شود */
function verifyHitRelaxed(meta, t) {
  if (!meta) return null;
  const q = normName(t._query);
  const n = normName(meta.name);
  if (!q || !n) return null;
  const qw = q.split(" ");
  if (qw.length < 2 && q !== n) return null;
  const contained = q.length >= 8 && (n.includes(q) || q.includes(n));
  if (!contained) return null;
  const hy = yearOf(meta.releaseInfo);
  if (hy && t.year > 0) {
    const tol = t.type === "series" ? 3 : 1;
    if (Math.abs(hy - t.year) > tol) return null;
  }
  return { tt: meta.imdb_id || meta.id, name: meta.name, year: hy, exact: q === n, ratio: nameRatio(q, n) };
}

async function fetchJson(url, timeoutMs = 15_000, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`http ${res.status}`);
      if (!res.ok) return null; // 404 و امثالش → پاسخ قطعی، تلاش بی‌فایده
      return await res.json();
    } catch {
      await sleep(800 * (i + 1) + Math.random() * 400);
    }
  }
  return null;
}

async function resolveOnCinemeta(t, relaxed = false) {
  const type = t.type === "series" ? "series" : "movie";
  const j = await fetchJson(CINEMETA(type, t._query));
  const metas = Array.isArray(j?.metas) ? j.metas : [];
  if (relaxed) {
    // در پرس‌وجوی بریده، کوتاه‌ترین نامِ دربرگیرنده دقیق‌ترین است (از «All of Us Are Dead Roblox» پرهیز می‌کند)
    const hits = metas.slice(0, 25)
      .map((m) => verifyHitRelaxed(m, t))
      .filter(Boolean)
      .sort((a, b) => a.name.length - b.name.length);
    return hits[0] || null;
  }
  // اول دقیق‌ترین؛ در گره نام‌های همسان، اولین (محبوب‌ترین) ترجیح دارد
  for (const m of metas.slice(0, 8)) {
    const v = verifyHit(m, t);
    if (v) return v;
  }
  return null;
}

/** صف موازی سبک برای فاز A */
async function runPool(items, workers, fn) {
  let i = 0;
  const next = async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: workers }, next));
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const report = { at: new Date().toISOString(), resolve: {}, enrich: {} };

  const where = { source: "f2m", poster: { startsWith: "/api/cover/" } };
  const titles = await db.title.findMany({
    where,
    select: { id: true, slug: true, title: true, titleEn: true, type: true, year: true, genres: true, description: true, poster: true, backdrop: true },
    orderBy: { views: "desc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  console.log(`f2m titles with generated covers: ${titles.length}`);
  for (const t of titles) {
    const q = cleanQuery(t.titleEn && /[a-z]/i.test(t.titleEn) ? t.titleEn : t.title);
    t._query = q.replace(/\s+\d{4}$/, "").trim();
  }

  /* ---------------- فاز A: حل tt ---------------- */
  const tried = loadTried();
  let pool = titles;
  if (SECOND_CHANCE) {
    // پاس دوم: همه باقی‌مانده‌ها (tried و untried) با تطبیق relaxed — کوتاه‌ترین نامِ دربرگیرنده
    pool = titles;
  } else if (!ENRICH_ONLY) {
    // پاس اول: همان‌هایی که قبلاً تلاش شده را دوباره نپرس
    const before = pool.length;
    pool = pool.filter((t) => !tried[t.slug]);
    if (pool.length !== before) console.log(`  [A] skipping ${before - pool.length} already-tried titles`);
  }
  const todoA = RESOLVE_ONLY || !ENRICH_ONLY ? pool : [];
  let resolved = 0, unresolved = 0, doneA = 0;
  const matches = new Map(); // titleId → { tt, name, year, exact, ratio }
  const unresolvedList = [];

  await runPool(todoA, 6, async (t, idx) => {
    const hit = t._query ? await resolveOnCinemeta(t, SECOND_CHANCE) : null;
    if (hit) {
      matches.set(t.id, hit);
      resolved++;
    } else {
      unresolved++;
      if (unresolvedList.length < 2000) unresolvedList.push({ slug: t.slug, query: t._query, year: t.year, type: t.type });
    }
    if (!tried[t.slug]) tried[t.slug] = SECOND_CHANCE ? 2 : 1;
    doneA++;
    if (doneA % 250 === 0) { saveTried(tried); console.log(`  [A] ${doneA}/${todoA.length} resolved=${resolved} unresolved=${unresolved}`); }
    await sleep(120 + Math.random() * 120);
  });
  saveTried(tried);

  // برخورد tt: اگر tt حل‌شده قبلاً برای یک عنوان od استفاده شده → همان اثر با دو ردیف است (گزارش، بدون حذف)
  const odTt = new Map();
  const all = await db.title.findMany({
    where: { poster: { startsWith: "/covers/" } },
    select: { id: true, slug: true, source: true, poster: true },
  });
  for (const r of all) {
    const m = /^\/covers\/(tt\d+)\//.exec(r.poster);
    if (m) odTt.set(m[1], r);
  }
  let collisions = 0;
  const collisionSamples = [];
  for (const [tid, hit] of matches) {
    const od = odTt.get(hit.tt);
    if (od) {
      collisions++;
      if (collisionSamples.length < 25) collisionSamples.push({ f2mSlug: (titles.find((t) => t.id === tid) || {}).slug, odSlug: od.slug, tt: hit.tt });
    }
  }

  // بازنویسی مسیرها (idempotent — فقط ردیف‌های حل‌شده)
  let pathsUpdated = 0;
  for (const [tid, hit] of matches) {
    await db.title.update({
      where: { id: tid },
      data: { poster: `/covers/${hit.tt}/poster.jpg`, backdrop: `/covers/${hit.tt}/backdrop.jpg` },
    });
    pathsUpdated++;
  }
  console.log(`[A] resolved=${resolved}/${todoA.length} pathsUpdated=${pathsUpdated} collisionsWithOd=${collisions}`);

  report.resolve = { total: todoA.length, resolved, unresolved, collisions, pathsUpdated, collisionSamples, unresolvedSample: unresolvedList.slice(0, 120), secondChance: SECOND_CHANCE };
  // گزارش میانی همین‌جا نوشته شود (اگر فازهای بعد قطع شدند، آمار A از دست نرود)
  const writeReport = () => {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  };
  writeReport();

  if (RESOLVE_ONLY) {
    console.log(`report → ${REPORT}`);
    await db.$disconnect();
    return;
  }

  /* ---------------- فاز B: غنی‌سازی ویکی‌دیتا ---------------- */
  // عنوان‌ها را با مسیر تازه دوباره بخوان (فاز A مسیر را عوض کرده)
  const fresh = await db.title.findMany({
    where: { source: "f2m" },
    select: { id: true, slug: true, title: true, titleEn: true, type: true, year: true, genres: true, description: true, poster: true },
    orderBy: { views: "desc" },
  });
  const byImdb = new Map(); // tt → title rows
  const noTt = [];
  for (const t of fresh) {
    const m = /^\/covers\/(tt\d+)\//.exec(t.poster);
    if (m) {
      const tt = m[1];
      if (!byImdb.has(tt)) byImdb.set(tt, []);
      byImdb.get(tt).push(t);
    } else {
      noTt.push(t);
    }
  }
  const ttIds = [...byImdb.keys()];
  console.log(`[B] titles with tt: ${fresh.length - noTt.length} (unique tt: ${ttIds.length}), without tt: ${noTt.length}`);

  let genresFixed = 0, descsFixed = 0, fallbacksWritten = 0, spFail = 0;

  // ۱) SPARQL دسته‌ای روی ttها — با کش پایدار (فراخوانی‌های chunked نتایج را دور می‌ریزند)
  const cache = loadCache();
  const metaByImdb = new Map();
  let cacheHits = 0;
  const uncached = ttIds.filter((tt) => {
    const c = cache[tt];
    if (!c) return true;
    cacheHits++;
    if (!c.noMeta) metaByImdb.set(tt, { genres: c.genres || [], faTitle: c.faTitle, enTitle: c.enTitle, year: c.year });
    return false;
  });
  console.log(`  [B] cache: ${cacheHits} warm / ${uncached.length} cold tt`);
  let batchesRun = 0;
  for (let i = 0; i < uncached.length && batchesRun < SPARQL_BATCH_CAP; i += 60) {
    const batch = uncached.slice(i, i + 60);
    try {
      const hits = await fetchMetaByImdb(batch);
      for (const [k, v] of hits) {
        metaByImdb.set(k, v);
        cache[k] = { genres: v.genres, faTitle: v.faTitle, enTitle: v.enTitle, year: v.year };
      }
      // tt بدون هیچ نتیجه هم کش شود تا هر بار دوباره پرسیده نشوند
      for (const tt of batch) if (!cache[tt]) cache[tt] = { noMeta: true };
    } catch (e) {
      spFail++;
      console.log(`  [B] sparql batch ${i / 60} failed: ${e.message}`);
    }
    batchesRun++;
    saveCache(cache);
    if (batchesRun % 5 === 0) console.log(`  [B] sparql batches ${batchesRun} (cold ${uncached.length})`);
    await sparqlSleep();
  }
  console.log(`  [B] sparql hits: ${metaByImdb.size}/${ttIds.length} tt (batches this run: ${batchesRun})`);

  // ۲) اعمال ژانر + خلاصه (موتور موازی سبک؛ سیاست نوشتن = meta-enrich)
  //    عنوان‌هایی که هم هیت دارند و هم کار دارند اولویت‌اند؛ سقف ENRICH_CAP برای اجرای chunked
  const applyTasks = [];
  for (const t of fresh) {
    const m = /^\/covers\/(tt\d+)\//.exec(t.poster);
    const hit = m ? metaByImdb.get(m[1]) : undefined;
    const gJunk = genresAreJunk(JSON.parse(t.genres || "[]") || []);
    // توضیح: یا واقعا کار دارد، یا خالی است (جایگزین صادقانه)؛
    // متن‌های قالبی که هیت ندارند دوباره کاری ندارند (از چرخش بی‌پایان جلوگیری می‌کند)
    const dNeeds = hit ? descriptionNeedsWork(t.description) : !(t.description || "").trim();
    if (hit ? (gJunk || dNeeds) : dNeeds) {
      applyTasks.push({ t, hit, gJunk, dJunk: dNeeds });
    }
  }
  // هیت‌دارها جلو (خروجی واقعی)، بدون‌هیت‌ها دنبال (فقط fallback برای خالی‌ها)
  applyTasks.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
  const capped = applyTasks.slice(0, ENRICH_CAP);
  console.log(`  [B] apply tasks: ${capped.length}${applyTasks.length > capped.length ? ` (capped from ${applyTasks.length})` : ""}`);

  let doneB = 0;
  await runPool(capped, 4, async ({ t, hit, gJunk, dJunk }) => {
    const data = {};

    if (gJunk && hit && hit.genres.length) {
      data.genres = JSON.stringify(hit.genres);
    }

    if (dJunk) {
      let finalDesc = null;
      if (hit && (hit.faTitle || hit.enTitle)) {
        const s = await fetchBestSummary(hit.faTitle, hit.enTitle, 100);
        if (s && (s.extract.length >= 100 || (t.description || "").trim().length < 80)) finalDesc = s.extract;
        await sleep(100 + Math.random() * 100);
      }
      if (!finalDesc) {
        const cur = (t.description || "").trim();
        if (cur.length >= 80 && !/منبع دایرکتوری|آرشیو دنیای/.test(cur)) finalDesc = cur;
        else {
          finalDesc = fallbackDescription({ title: t.title, type: t.type === "series" ? "series" : "movie", year: t.year ?? undefined, genres: hit?.genres ?? [] });
          fallbacksWritten++;
        }
      }
      if (finalDesc && finalDesc !== t.description) data.description = finalDesc;
    }

    if (Object.keys(data).length) {
      await db.title.update({ where: { id: t.id }, data });
      if (data.genres) genresFixed++;
      if (data.description) {
        descsFixed++;
        if (data.description.includes("آماده‌ی پخش آنلاین")) descsFixed--; // fallback جدا شمرده شود
      }
    }
    doneB++;
    if (doneB % 250 === 0) console.log(`  [B] applied ${doneB}/${capped.length} genresFixed=${genresFixed} realDesc=${descsFixed}`);
  });

  // ۳) عنوان‌های بدون tt → جست‌وجوی عنوان ویکی‌دیتا (مثل meta-enrich؛ موازی سبک)
  //    فهرست miss پایدار نگه داشته می‌شود تا هر فراخوانی دوباره همان‌ها را نپرسد
  const missed = loadMissed();
  let noTtFixed = 0, noTtDone = 0;
  const noTtList = SKIP_NOTT ? [] : noTt.filter((t) => !missed[t.slug]).slice(0, NOTT_CAP);
  await runPool(noTtList, 3, async (t) => {
    // titleEn های f2m اغلب وسط‌شان بریده/سانسور شده («Boy Sw ows Universe») —
    // عنوان فارسی کامل است؛ ویکی‌دیتا فارسی را خوب می‌فهمد → اول فارسی، بعد لاتین
    const qLat = cleanQuery(t.titleEn && /[a-z]/i.test(t.titleEn) ? t.titleEn : "").replace(/\s+\d{4}$/, "").trim();
    const qFa = (t.title || "").replace(/\s+\d{4}$/, "").trim();
    const queries = [];
    if (qFa && /[\u0600-\u06FF]/.test(qFa)) queries.push(qFa);
    if (qLat && qLat !== qFa) queries.push(qLat);
    for (const q of queries) {
      const found = await searchEntityByTitle(q, t.type === "series");
      if (!found) continue;
      const data = {};
      if (genresAreJunk(JSON.parse(t.genres || "[]") || []) && found.genres.length) data.genres = JSON.stringify(found.genres);
      if (descriptionNeedsWork(t.description) && (found.faTitle || found.enTitle)) {
        const s = await fetchBestSummary(found.faTitle, found.enTitle, 100);
        if (s && (s.extract.length >= 100 || (t.description || "").trim().length < 80)) data.description = s.extract;
      }
      // اگر جست‌وجو یک tt هم آورد → پوستر را هم ارتقا بده (بونوس)
      if (found.imdb && /^tt\d+$/.test(found.imdb)) {
        data.poster = `/covers/${found.imdb}/poster.jpg`;
        data.backdrop = `/covers/${found.imdb}/backdrop.jpg`;
      }
      if (Object.keys(data).length) {
        await db.title.update({ where: { id: t.id }, data });
        noTtFixed++;
        break; // این عنوان حل شد — کوئری بعدی لازم نیست
      }
    }
    if (!queries.length) missed[t.slug] = { q: "", at: new Date().toISOString() };
    noTtDone++;
    if (noTtDone % 100 === 0) { saveMissed(missed); console.log(`  [B] noTt search ${noTtDone}/${noTtList.length} fixed=${noTtFixed}`); }
    await sparqlSleep();
  });
  saveMissed(missed);
  console.log(`[B] done. genresFixed=${genresFixed} realDesc=${descsFixed} fallbackDesc=${fallbacksWritten} noTtFixed=${noTtFixed} spFail=${spFail}`);

  report.enrich = {
    titlesWithTt: fresh.length - noTt.length,
    uniqueTt: ttIds.length,
    sparqlHits: metaByImdb.size,
    genresFixed,
    realDesc: descsFixed,
    fallbackDesc: fallbacksWritten,
    noTtTitles: noTt.length,
    noTtFixed,
    spFail,
  };

  writeReport();
  console.log(`report → ${REPORT}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
