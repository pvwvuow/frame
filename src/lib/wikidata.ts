/**
 * wikidata.ts (v0.32.0) — کلاینت فراداده‌ی بدون‌کلید برای تکمیل ژانر و توضیح.
 *
 * چرا ویکی‌دیتا؟
 *  - بدون API key و بدون سرور (روحیه‌ی local-first نما)
 *  - شناسه‌ی IMDb (P345) را از قبل داریم؛ نگاشت دقیق به موجودیت اثر
 *  - P136 (ژانر) + پیوند fa/en ویکی‌پدیا → خلاصه‌ی واقعی برای «درباره»
 *
 * ادب درخواست: UA با اطلاعات تماس، فاصله بین کوئری‌ها، بک‌آف روی 429/5xx.
 * همه‌ی توابع خالص‌اند (فقط fetch) — هم در اپ هم در اسکریپت‌ها استفاده می‌شوند.
 */

import { genresFromWikidataLabels } from "./genre-map";

const UA = "NamaFrame-CatalogBot/1.0 (https://github.com/pvwvuow/frame; catalog metadata enrichment)";
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKI_API = "https://www.wikidata.org/w/api.php";

export interface MetaHit {
  /** ژانرهای معیار استخراج‌شده (ممکن است خالی باشد) */
  genres: string[];
  /** سال انتشار از P577، اگر موجود */
  year?: number;
  /** عنوان مقاله‌ی fa.wikipedia (برای summary) */
  faTitle?: string;
  /** عنوان مقاله‌ی en.wikipedia */
  enTitle?: string;
}

/** کوئری SPARQL روی شناسه‌های IMDb (P345) — ژانر + سال + مقاله‌ی ویکی‌پدیا */
const SPARQL_BY_IMDB = (ids: string[]): string => {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** SPARQL با retry/بک‌آف — خروجی خام bindings */
async function sparql(query: string, tries = 4): Promise<Array<Record<string, { value: string }>>> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  let lastErr: Error | null = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(5000 * i + Math.random() * 2000);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/sparql-results+json" },
        signal: AbortSignal.timeout(60_000),
      });
      // 429/5xx/403 (rate-limit پروکسی) قابل تلاش مجدد؛ 400 کوئری بد است
      if (res.status === 400) throw new Error("sparql 400 (fatal)");
      if (!res.ok) throw new Error(`sparql ${res.status}`);
      const j = (await res.json()) as { results?: { bindings?: Array<Record<string, { value: string }>> } };
      return j.results?.bindings ?? [];
    } catch (e) {
      lastErr = e as Error;
      if (String((e as Error)?.message).includes("fatal")) throw lastErr;
    }
  }
  throw lastErr ?? new Error("sparql failed");
}

/** تجمیع ردیف‌های SPARQL به یک hit برای هر شناسه */
function foldRows(rows: Array<Record<string, { value: string }>>, keyField: string): Map<string, MetaHit> {
  const out = new Map<string, MetaHit>();
  for (const r of rows) {
    const key = r[keyField]?.value;
    if (!key) continue;
    let hit = out.get(key);
    if (!hit) {
      hit = { genres: [] };
      out.set(key, hit);
    }
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
  // برچسب‌های خام → ژانرهای معیار (فقط یک بار، بعد از تجمیع)
  for (const hit of out.values()) {
    hit.genres = genresFromWikidataLabels(hit.genres);
  }
  return out;
}

/** فراداده‌ی دسته‌ای از روی شناسه‌های IMDb — نگاشت imdbId → hit */
export async function fetchMetaByImdb(ids: string[]): Promise<Map<string, MetaHit>> {
  if (!ids.length) return new Map();
  const rows = await sparql(SPARQL_BY_IMDB(ids));
  return foldRows(rows, "imdb");
}

export interface EntitySearchHit extends MetaHit {
  qid: string;
  imdb?: string;
}

/** جست‌وجوی عنوان در ویکی‌دیتا (فقط اثرها) — برای عنوان‌هایی که tt ندارند */
export async function searchEntityByTitle(title: string, isSeries: boolean): Promise<EntitySearchHit | null> {
  const p31 = isSeries ? "Q5398426|Q11424|Q506240|Q581714" : "Q11424|Q506240|Q5398426";
  const q = `${title} haswbstatement:P31=${p31}`;
  const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=1&srprop=&format=json&origin=*`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
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
    const folded = foldRows(
      rows.map((r) => ({ ...r, qid: { value: r.qid?.value ?? qid } })),
      "qid"
    );
    const hit = folded.get(qid);
    if (!hit) return null;
    return { qid, ...hit };
  } catch {
    return null;
  }
}

export interface WikiSummary {
  lang: "fa" | "en";
  extract: string;
}

/** خلاصه‌ی مقاله‌ی ویکی‌پدیا (REST) */
export async function fetchSummary(lang: "fa" | "en", title: string): Promise<WikiSummary | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`summary ${res.status}`);
    const j = (await res.json()) as { type?: string; extract?: string };
    if (j.type && j.type !== "standard" && j.type !== "disambiguation") return null;
    const extract = (j.extract || "").trim();
    if (!extract || /^may refer to/i.test(extract)) return null; // disambiguation
    return { lang, extract };
  } catch {
    return null;
  }
}

/** بهترین خلاصه‌ی موجود: fa ترجیح دارد، en جایگزین؛ هر مقاله حداکثر یک بار */
export async function fetchBestSummary(faTitle?: string, enTitle?: string, minLen = 100): Promise<WikiSummary | null> {
  const fa = faTitle ? await fetchSummary("fa", faTitle) : null;
  if (fa && fa.extract.length >= minLen) return fa;
  const en = enTitle ? await fetchSummary("en", enTitle) : null;
  if (en && en.extract.length >= minLen) return en;
  if (fa) return fa;
  if (en) return en;
  return null;
}

export const WIKI_UA = UA;
export const sparqlSleep = () => sleep(700);
