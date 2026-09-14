/* enrich-genres.mjs — v0.34.4 (GENRE-1)
 *
 * The user queued «ژانرها» (genre completion). 2,441 of the 19,501 catalog
 * titles have no genres: 2,305 of the Film2Media wave + 136 od stragglers.
 * 2,015 of them carry a resolvable IMDb id in their cover path.
 *
 * Three escalating sources, all funneling through the SAME canonical genre
 * normalizer as the shipping enrichment engine (src/lib/meta-enrich.ts via
 * resolve-f2m-covers.mjs):
 *   A) the persistent f2m SPARQL cache (free — 382 hits measured)
 *   B) a fresh wikidata SPARQL pass for tts the cache never saw (~100)
 *   C) Cinemeta meta (Stremio) for whatever is still genre-less — its
 *      English genre labels map through the shared LABEL_RULES
 *
 * Write policy: ONLY titles whose genres are empty are touched (existing
 * canonical genres are never overwritten), max 4 genres, canonical fa labels.
 * Resumable: results persist to the cache file between chunked runs.
 *
 * Run: node scripts/enrich-genres.mjs [--dry-run]   (ENRICH_CAP to limit)
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const ROOT = path.join(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");
const CAP = parseInt(process.env.ENRICH_CAP || "0", 10) || Infinity;
const DB = new PrismaClient({
  datasources: { db: { url: "file:" + path.join(ROOT, "db", "custom.db") } },
});

const F2M_CACHE = process.env.F2M_CACHE || "/home/z/my-project/scripts/f2m-meta-cache.json";
const GENRE_CACHE = process.env.GENRE_CACHE || "/home/z/my-project/scripts/genre-enrich-cache.json";

const TT_RE = /^\/covers\/(tt\d+)\//;
const ttOf = (p) => TT_RE.exec(p || "")?.[1] ?? "";

/* ---- genre normalizer (verbatim semantics from resolve-f2m-covers.mjs) ---- */
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

function genresFromLabels(labels) {
  const out = [];
  for (const label of labels) {
    if (typeof label !== "string") continue;
    for (const [re, genre] of LABEL_RULES) {
      if (re.test(label) && !out.includes(genre)) { out.push(genre); break; }
    }
    if (out.length >= MAX_GENRES) break;
  }
  return out;
}

/* ---- caches ---- */
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const f2mCache = readJson(F2M_CACHE, {});
let genreCache = readJson(GENRE_CACHE, {}); // { tt: { genres: string[] , noMeta?: 1 } }
const saveGenreCache = () => {
  fs.mkdirSync(path.dirname(GENRE_CACHE), { recursive: true });
  fs.writeFileSync(GENRE_CACHE, JSON.stringify(genreCache));
};

/* ---- sources ---- */
const UA = "NamaFrame-CatalogBot/1.0 (https://github.com/pvwvuow/frame; catalog genre enrichment)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparqlByImdb(ids) {
  const values = ids.map((id) => `"${id}"`).join(" ");
  const q = `SELECT DISTINCT ?imdb ?gl WHERE {
  VALUES ?imdb { ${values} }
  ?item wdt:P345 ?imdb .
  OPTIONAL { ?item wdt:P136 ?g . ?g rdfs:label ?gl . FILTER(LANG(?gl) IN ("fa","en")) }
}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`;
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(5000 * i);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`sparql ${res.status}`);
      const j = await res.json();
      const out = new Map();
      for (const r of j.results?.bindings ?? []) {
        const imdb = r.imdb?.value;
        const gl = r.gl?.value;
        if (!imdb || !gl) continue;
        if (!out.has(imdb)) out.set(imdb, []);
        if (!out.get(imdb).includes(gl)) out.get(imdb).push(gl);
      }
      return out;
    } catch (e) {
      if (i === 3) console.error("  sparql failed for batch:", e.message);
    }
  }
  return new Map();
}

async function cinemetaGenres(type, tt) {
  const t = type === "series" ? "series" : "movie";
  const url = `https://v3-cinemeta.strem.io/meta/${t}/${tt}.json`;
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500 * i);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`cinemeta ${res.status}`);
      const j = await res.json();
      const g = j?.meta?.genres;
      return Array.isArray(g) ? g.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean) : null;
    } catch {
      /* retry */
    }
  }
  return null;
}

async function main() {
  // pre-0.34 rows may carry raw NULLs (the column predates its default)
  await DB.$executeRawUnsafe(`UPDATE Title SET genres='[]' WHERE genres IS NULL OR genres=''`);
  const rows = await DB.title.findMany({
    where: { OR: [{ genres: "" }, { genres: "[]" }] },
    select: { id: true, slug: true, titleEn: true, title: true, type: true, poster: true },
  });
  console.log(`[genre] titles missing genres: ${rows.length}`);
  const stats = { fromCache: 0, fromSparql: 0, fromCinemeta: 0, updated: 0, genreless: 0 };

  /* phase A — free hits from the persistent f2m cache */
  let targets = rows;
  for (const r of targets) {
    const tt = ttOf(r.poster);
    if (tt && f2mCache[tt]?.genres?.length) {
      const g = normalizeGenres(f2mCache[tt].genres);
      if (g.length) {
        if (!DRY) await DB.title.update({ where: { id: r.id }, data: { genres: JSON.stringify(g) } });
        stats.fromCache++;
        stats.updated++;
      }
    }
  }
  console.log(`[genre] phase A (f2m cache): ${stats.fromCache} filled`);
  targets = targets.slice(0, Math.min(targets.length, CAP === Infinity ? targets.length : CAP));

  /* phase B — wikidata for tts the caches never saw */
  const pending = [];
  for (const r of targets) {
    const tt = ttOf(r.poster);
    if (!tt) continue;
    /* f2m cache PRESENCE (any value) means wikidata was already queried for
     * this tt in the v0.34.1 pass — absent genres there = genuinely none.
     * Re-asking ~1.5k known misses would only burn the SPARQL budget. */
    if (tt in f2mCache || tt in genreCache) continue;
    pending.push({ r, tt });
  }
  const BATCH = 40;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const found = await sparqlByImdb(batch.map((b) => b.tt));
    for (const b of batch) {
      const labels = found.get(b.tt);
      const g = labels ? genresFromLabels(labels) : [];
      if (g.length) {
        genreCache[b.tt] = { genres: g };
        if (!DRY) await DB.title.update({ where: { id: b.r.id }, data: { genres: JSON.stringify(g) } });
        stats.fromSparql++;
        stats.updated++;
      } else {
        genreCache[b.tt] = { noMeta: 1 };
      }
    }
    saveGenreCache();
    await sleep(700);
    if ((i / BATCH) % 20 === 0) console.log(`  sparql ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
  }
  console.log(`[genre] phase B (wikidata): ${stats.fromSparql} filled`);

  /* phase C — Cinemeta for the stubborn remainder */
  const rem = [];
  for (const r of targets) {
    const tt = ttOf(r.poster);
    if (!tt || genreCache[tt]?.genres?.length || genreCache[tt]?.noMeta) continue;
    rem.push({ r, tt });
  }
  console.log(`[genre] phase C (cinemeta) targets: ${rem.length}`);
  let cDone = 0;
  for (const { r, tt } of rem) {
    if (DRY && stats.fromCinemeta >= 12) break; // small sample for dry mode
    const labels = await cinemetaGenres(r.type, tt);
    const g = labels ? genresFromLabels(labels) : [];
    if (g.length) {
      genreCache[tt] = { genres: g, src: "cinemeta" };
      if (!DRY) await DB.title.update({ where: { id: r.id }, data: { genres: JSON.stringify(g) } });
      stats.fromCinemeta++;
      stats.updated++;
    } else {
      genreCache[tt] = { noMeta: 1, src: "cinemeta" };
    }
    if (++cDone % 40 === 0) {
      saveGenreCache(); // resumable: survive chunked foreground runs
      console.log(`  cinemeta ${cDone}/${rem.length}`);
    }
    await sleep(120);
  }
  saveGenreCache();

  console.log(`[genre] DONE ${JSON.stringify(stats)}`);
  const left = await DB.title.count({ where: { OR: [{ genres: "" }, { genres: "[]" }] } });
  console.log(`[genre] titles still without genres: ${left}`);
  await DB.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
