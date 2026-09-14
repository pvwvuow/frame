#!/usr/bin/env node
/* import-film2media.mjs — import the Film2Media source archive (xlsx → JSON)
 * into db/custom.db as a first-class link source, alongside (and preferred
 * over) the open-directory links.
 *
 * Input: F2M_JSON (default ./f2m.json) — {titles:[…], files:[…]} exported from
 * Film2Media-Source.xlsx (titles sheet + files sheet with resolved hyperlink
 * URLs). The JSON itself is NOT committed (≈90MB); keep it out of git.
 *
 * What it does (idempotent — re-running adds nothing twice):
 *   1. normalise f2m rows: slug via the SAME cleanTitle/slugify pipeline the
 *      od-sync uses, q = base resolution, v = the app's variant labels
 *      (SoftSub/HardSub → «زیرنویس چسبیده», Dubbed → «دوبله فارسی», else
 *      «بدون زیرنویس»), mb = sheet size.
 *   2. match f2m titles against the DB: exact slug → titleEn+year →
 *      unique titleEn (type-consistent). 
 *   3. matched movies: prepend f2m links to Title.sources (URL-deduped) and
 *      make the best f2m file the playing videoUrl (f2m hosts answer
 *      worldwide; the od hosts are the ones that 503).
 *   4. matched series: merge per-episode sources; create missing episodes;
 *      upgrade episode videoUrl to the f2m link when f2m is not worse.
 *   5. unmatched titles: create new Title rows (source='f2m', SVG covers,
 *      empty description/genres — the auto-enricher fills them later),
 *      episodes straight from the sheet (season/episode columns, filename
 *      fallback: S01E02 / ES01E02 / 1x02 / E02(+URL /S01/) / bare anime
 *      numbering «Name.01.1080p»), double-ep files (S01E23E24) attach to
 *      every episode they contain.
 *
 * Run: node scripts/import-film2media.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const ROOT = path.join(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");
const F2M_JSON = process.env.F2M_JSON || "/home/z/my-project/upload/film2media/f2m.json";

/* ---------- verbatim port of src/lib/source/parser.ts (slug parity) ---------- */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function normalizeDigits(s) {
  let out = "";
  for (const ch of s) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out;
}
const NOISE_RE = new RegExp(
  [
    "\\b(?:2160p|1080p|720p|576p|540p|480p|360p|240p)\\b",
    "\\b(?:4k|uhd|fhd|hdr10\\+?|hdr)\\b",
    "\\b(?:bluray|blu-ray|bdrip|brrip|dvdrip|web[ .-]?dl|webrip|web|hdtv|hdts|cam|dvdscr|hdcam)\\b",
    "\\b(?:x264|x265|h[.]?264|h[.]?265|hevc|avc|xvid|divx)\\b",
    "\\b(?:aac|ac3|eac3|ddp?5?[.]?[01]|dts(?:-hd)?|truehd|atmos|flac|mp3)\\b",
    "\\b(?:dual[ .-]?audio|dubbed|hardsub|softsub|embed)\\b",
    "\\b(?:complete|pack)\\b",
    "\\b(?:yify|rarbg|ettv|eztv|fgt|galaxyrg|tidi|golfdl|ilmte?b|aparatchi|dlcenter|digmatv|filmino)\\b",
    "\\[[^\\]]*\\]", "\\([^)]*\\)", "\\{[^}]*\\}",
  ].join("|"),
  "gi"
);
function cleanTitle(raw) {
  let s = normalizeDigits(decodeURIComponent(raw)).replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  const ym = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = ym ? parseInt(ym[1], 10) : null;
  s = s.replace(NOISE_RE, " ");
  if (ym) s = s.replace(ym[0], " ");
  s = s.replace(/[\s._-]{2,}/g, " ").replace(/^[\s._-]+|[\s._-]+$/g, "").trim();
  s = s.replace(/\b(?:s\d{1,2}|season[ \t]*\d{1,2}|فصل[ \t]*\d{1,2})\b/gi, " ").trim();
  s = s.replace(/[\s._-]{2,}/g, " ").replace(/^[\s._-]+|[\s._-]+$/g, "");
  return { title: s || raw, year };
}
function hash8(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(6, "0").slice(0, 6);
}
function slugify(title, year) {
  const ascii = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = ascii || "title";
  const h = hash8(`${title}|${year ?? ""}`);
  return year ? `${base}-${year}-${h}` : `${base}-${h}`;
}

/* ---------- f2m helpers ---------- */
/** f2m-only noise tokens (stripped in the filename fallback path). */
const F2M_NOISE = /\b(?:film2media|donyayeserial|pahe|10bit)\b|farsi[._]?(?:sub|dub(?:bed)?)?|\bsub\b|\bdub\b|\bmkv\b|\bmp4\b/gi;
const URL_CAT_RE = /^(film|movies?|series|serial|serialha|new-server|collection|anime|animation|sub|dub|nosub|dubl|hardsub|softsub|1080p?|720p?|480p?|540p?|2160p?|x265|x264|farsi)$/i;
/** Title guess for rows whose nameEn column is empty: URL folder first
 *  («/Film/New-Server/Collection/Borning/…» → Borning), then the filename. */
function fallbackName(f) {
  try {
    const segs = new URL(f.url).pathname.split("/").filter(Boolean).slice(1)
      .map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
    const cands = segs.filter((s) => !URL_CAT_RE.test(s) && !/\.(mkv|mp4|avi|wmv|mpeg|ts)$/i.test(s));
    const nonYear = cands.find((s) => !/^(19|20)\d{2}$/.test(s));
    if (nonYear) return cleanTitle(nonYear).title;
  } catch { /* bad url → filename path */ }
  const base = (f.filename || "").replace(/\.(mkv|mp4|avi|wmv|mpeg|ts)$/i, "").replace(F2M_NOISE, " ");
  const c = cleanTitle(base);
  const words = c.title.split(/\s+/).filter(Boolean);
  const out = words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase()).join(" ");
  return out || c.title;
}
const Q_RANK = { "4k": 10, "2160p": 10, "1080p": 8, "720p": 6, "540p": 4, "480p": 3, "360p": 2, "240p": 1 };
/** "1080p x265 10bit" → {q:"1080p", rank:8} */
function qOf(quality, filename) {
  const f = normalizeDigits(`${quality || ""} ${filename || ""}`).toLowerCase();
  for (const [tag, rank] of Object.entries(Q_RANK)) {
    if (f.includes(tag)) return { q: tag === "2160p" ? "4K" : tag, rank };
  }
  return { q: "HD", rank: 0 };
}
/** variant label — same vocabulary the od catalog uses (v0.10.5 convention). */
function vOf(audio, filename) {
  const a = (audio || "").toLowerCase();
  const f = (filename || "").toLowerCase();
  if (a.includes("dubbed") || /dubbed|farsi\.dub|dual[ .-]?audio/.test(f)) return "دوبله فارسی";
  if (a.includes("softsub") || a.includes("hardsub")) return "زیرنویس چسبیده";
  if (a.includes("sub") || /hardsub|farsi\.sub|farsi\.sub\./.test(f)) return "زیرنویس چسبیده";
  return "بدون زیرنویس";
}
/** season/episode from filename + URL when the sheet columns are empty. */
function epFromFilename(fn, url) {
  const f = normalizeDigits(fn.replace(/\/+/g, "."));
  let m = f.match(/\b(?:E)?S(\d{1,2})[\s._-]?E(?:P)?(\d{1,3})\b/i);
  if (m) {
    const season = parseInt(m[1], 10);
    let first = parseInt(m[2], 10);
    // double-episode files: S01E23E24 → attach to 23..24
    const rest = f.slice(m.index + m[0].length);
    const m2 = rest.match(/^\s*E(?:P)?(\d{1,3})\b/i);
    const last = m2 ? parseInt(m2[1], 10) : first;
    if (last > first && last - first <= 4) return { season, from: first, to: last };
    return { season, from: first, to: first };
  }
  m = f.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) return { season: parseInt(m[1], 10), from: parseInt(m[2], 10), to: parseInt(m[2], 10) };
  m = f.match(/\b(?:EP|E)[\s._-]?(\d{1,3})\b/i);
  if (m) {
    const ms = /\/(?:S|Season)[._]?(\d{1,2})\//i.exec(url || "");
    return { season: ms ? parseInt(ms[1], 10) : 1, from: parseInt(m[1], 10), to: parseInt(m[1], 10) };
  }
  // anime bare numbering: «Kaijuu.8.Gou.01.1080p…» → number glued to a quality token
  m = f.match(/[._](\d{1,4})[._](?=(?:1080|720|480|540|2160|4k|web|bluray|bdrip|hdtv|x264|x265))/i);
  if (m) {
    const n = m[1];
    if (!/^(19|20)\d{2}$/.test(n)) {
      const ms = /\/(?:S|Season)[._]?(\d{1,2})\//i.exec(url || "");
      return { season: ms ? parseInt(ms[1], 10) : 1, from: parseInt(n, 10), to: parseInt(n, 10) };
    }
  }
  return null;
}

/* ---------- main ---------- */
const db = new PrismaClient({
  datasources: { db: { url: "file:" + path.join(ROOT, "db", "custom.db") } },
});

async function main() {
  const f2m = JSON.parse(fs.readFileSync(F2M_JSON, "utf8"));
  console.log(`f2m: ${f2m.titles.length} titles, ${f2m.files.length} files`);

  /* group files by (nameEn → slug); fall back to filename-derived name */
  const perSlug = new Map(); // slug → {nameEn, nameFa, year, type, files:[]}
  let fileSkips = 0;
  for (const f of f2m.files) {
    const nameEn = (f.nameEn || "").trim() || fallbackName(f) || cleanTitle(f.filename || "").title || "";
    if (!nameEn) { fileSkips++; continue; }
    const year = parseInt((f.year || "").trim(), 10) || null;
    const c = cleanTitle(nameEn);
    const slug = slugify(c.title, year ?? c.year);
    let g = perSlug.get(slug);
    if (!g) {
      g = { slug, nameEn, nameFa: "", year: year ?? c.year, type: null, files: [] };
      perSlug.set(slug, g);
    }
    if (!g.nameFa) g.nameFa = "";
    g.files.push(f);
  }
  // nameFa/type from the titles sheet
  for (const t of f2m.titles) {
    const nameEn = (t.nameEn || "").trim();
    if (!nameEn) continue;
    const year = parseInt((t.year || "").trim(), 10) || null;
    const c = cleanTitle(nameEn);
    const slug = slugify(c.title, year ?? c.year);
    const g = perSlug.get(slug);
    if (!g) continue;
    if (t.nameFa && !g.nameFa) g.nameFa = t.nameFa.trim();
    if (t.type) g.sheetType = g.sheetType || t.type;
  }
  console.log(`grouped: ${perSlug.size} distinct f2m slugs (${fileSkips} rows skipped, no name)`);

  /* DB lookup maps */
  const dbTitles = await db.title.findMany({
    select: { id: true, slug: true, title: true, titleEn: true, type: true, year: true, sources: true, videoUrl: true, quality: true },
  });
  const dbBySlug = new Map(dbTitles.map((t) => [t.slug, t]));
  const dbByNameYear = new Map();
  const dbByName = new Map();
  const dbByFa = new Map();
  for (const t of dbTitles) {
    const en = (t.titleEn || "").trim().toLowerCase();
    if (en.length >= 2) {
      const ky = `${en}|${t.year || 0}`;
      (dbByNameYear.get(ky) || dbByNameYear.set(ky, []).get(ky)).push(t);
      (dbByName.get(en) || dbByName.set(en, []).get(en)).push(t);
    }
    const fa = (t.title || "").trim().toLowerCase();
    if (fa && /[پ-ی]/.test(fa) && fa !== en) {
      (dbByFa.get(fa) || dbByFa.set(fa, []).get(fa)).push(t);
    }
  }

  function matchType(g) {
    // series if the sheet says سریال/انیمه, or any file carries an episode marker
    if (g.sheetType === "سریال") return "series";
    if (g.sheetType === "انیمه") {
      return g.files.some((f) => (f.season || f.episode) || epFromFilename(f.filename, f.url)) ? "series" : "movie";
    }
    if (g.sheetType === "فیلم") {
      const epFiles = g.files.filter((f) => f.season || f.episode || epFromFilename(f.filename, f.url));
      // miniseries stored as فیلم with E01..E09 files → keep movie (od does the same via parseMedia)
      return epFiles.length > g.files.length / 2 ? "series" : "movie";
    }
    return g.files.some((f) => f.season || f.episode || epFromFilename(f.filename, f.url)) ? "series" : "movie";
  }

  function matchDb(g) {
    const type = matchType(g);
    const hit = dbBySlug.get(g.slug);
    if (hit && hit.type === type) return { t: hit, how: "slug" };
    const en = g.nameEn.trim().toLowerCase();
    if (en.length < 2) return { t: null, how: type };
    const fy = g.year || 0;
    // exact name+year (both known) — take the first when DB has dupes
    const ny = (dbByNameYear.get(`${en}|${fy}`) || []).filter((t) => t.type === type);
    if (fy && ny.length) return { t: ny[0], how: "nameYear" };
    // name-only: needs a UNIQUE db candidate; year gate applies only when BOTH years are known
    const nn = (dbByName.get(en) || []).filter((t) => t.type === type);
    if (nn.length === 1) {
      const cy = nn[0].year || 0;
      if (!fy || !cy || Math.abs(fy - cy) <= 1) return { t: nn[0], how: "name" };
    }
    // persian name: same policy
    const fa = (g.nameFa || "").trim().toLowerCase();
    if (fa.length >= 2) {
      const ff = (dbByFa.get(fa) || []).filter((t) => t.type === type);
      if (ff.length === 1) {
        const cy = ff[0].year || 0;
        if (!fy || !cy || Math.abs(fy - cy) <= 1) return { t: ff[0], how: "fa" };
      }
    }
    return { t: null, how: type };
  }

  /* link row builder */
  function linkOf(f) {
    const { q, rank } = qOf(f.quality, f.filename);
    return { q, rank, v: vOf(f.audio, f.filename), url: f.url, mb: Math.round(parseFloat(f.sizeMB || "0")) || undefined };
  }

  const stats = { moviesMerged: 0, seriesMerged: 0, episodesMerged: 0, episodesCreated: 0, titlesCreated: 0, movieLinks: 0, epLinks: 0, skipped: 0, urlDupes: 0, hows: {} };
  const seenUrls = new Set();

  function dedupe(list) {
    const seen = new Set();
    const out = [];
    for (const s of list) {
      if (seen.has(s.url)) { stats.urlDupes++; continue; }
      seen.add(s.url);
      out.push(s);
    }
    return out;
  }

  if (DRY) console.log("— DRY RUN — no writes —");

  const groups = [...perSlug.values()];
  let done = 0;
  for (const g of groups) {
    done++;
    if (done % 1000 === 0) console.log(`  …${done}/${groups.length}`);
    if (!g.files.length) continue;

    const type = matchType(g);
    const { t, how } = matchDb(g);
    if (t) stats.hows[how] = (stats.hows[how] || 0) + 1;

    if (type === "movie") {
      const links = dedupe(g.files.map(linkOf));
      const best = links.reduce((a, b) => (b.rank > a.rank ? b : a), links[0]);
      if (!t) {
        stats.titlesCreated++;
        if (!DRY) {
          await db.title.create({
            data: {
              slug: g.slug,
              title: g.nameFa || g.nameEn,
              titleEn: g.nameEn,
              type: "movie",
              year: g.year ?? 0,
              rating: 0,
              duration: 0,
              description: "",
              genres: "[]",
              poster: `/api/cover/${g.slug}.svg`,
              backdrop: `/api/cover/${g.slug}-wide.svg`,
              videoUrl: best.url,
              country: "نامشخص",
              ageRating: "+13",
              quality: best.q,
              source: "f2m",
              sources: JSON.stringify(links.map(({ rank: _r, ...l }) => l)),
            },
          }).catch(async (e) => {
            // slug collision against a title that appeared meanwhile → merge instead
            const cur = await db.title.findUnique({ where: { slug: g.slug } });
            if (!cur) { stats.skipped++; return; }
            const curList = dedupe([...links.map(({ rank: _r, ...l }) => l), ...JSON.parse(cur.sources || "[]")]);
            await db.title.update({ where: { id: cur.id }, data: { sources: JSON.stringify(curList) } });
          });
        }
      } else {
        stats.moviesMerged++;
        if (!DRY) {
          // re-read CURRENT sources — other f2m groups may have merged into
          // this title meanwhile; the startup snapshot would silently drop them
          const cur = await db.title.findUnique({ where: { id: t.id }, select: { sources: true, videoUrl: true, quality: true } });
          if (!cur) { stats.skipped++; continue; }
          const curList = JSON.parse(cur.sources || "[]");
          const curUrls = new Set(curList.map((s) => s.url));
          const fresh = links
            .map(({ rank: _r, ...l }) => l)
            .filter((l) => !curUrls.has(l.url));
          if (fresh.length) {
            stats.movieLinks += fresh.length;
            // f2m first (its hosts answer worldwide), then od
            await db.title.update({
              where: { id: t.id },
              data: {
                sources: JSON.stringify([...fresh, ...curList]),
                ...(best.rank >= qOf(cur.quality, cur.videoUrl).rank ? { videoUrl: best.url, quality: best.q } : {}),
              },
            });
          }
        }
      }
      continue;
    }

    /* ---------- series ---------- */
    const eps = new Map(); // (season,number) → links[]
    for (const f of g.files) {
      let season = parseInt((f.season || "").trim(), 10) || 0;
      let number = parseInt((f.episode || "").trim(), 10) || 0;
      let rangeEnd = number;
      if (!season || !number) {
        const parsed = epFromFilename(f.filename, f.url);
        if (!parsed) { fileSkips++; continue; }
        season = season || parsed.season;
        if (!number) { number = parsed.from; rangeEnd = parsed.to; }
      }
      season = Math.max(1, season);
      number = Math.max(1, number);
      rangeEnd = Math.max(number, rangeEnd);
      const link = linkOf(f);
      // double-episode files (S01E23E24) attach to every episode they contain
      for (let n = number; n <= rangeEnd; n++) {
        const key = `${season}x${n}`;
        (eps.get(key) || eps.set(key, []).get(key)).push(link);
      }
    }
    if (!eps.size) { stats.skipped++; continue; }

    if (!t) {
      stats.titlesCreated++;
      if (!DRY) {
        try {
          await db.title.create({
            data: {
              slug: g.slug,
              title: g.nameFa || g.nameEn,
              titleEn: g.nameEn,
              type: "series",
              year: g.year ?? 0,
              rating: 0,
              duration: 45,
              description: "",
              genres: "[]",
              poster: `/api/cover/${g.slug}.svg`,
              backdrop: `/api/cover/${g.slug}-wide.svg`,
              videoUrl: "",
              country: "نامشخص",
              ageRating: "+13",
              quality: "HD",
              source: "f2m",
              sources: "[]",
            },
          });
        } catch {
          stats.skipped++;
          continue;
        }
      }
    } else {
      stats.seriesMerged++;
    }

    if (!DRY) {
      const titleRow = await db.title.findUnique({ where: { slug: t ? t.slug : g.slug } });
      if (!titleRow) { stats.skipped++; continue; }
      const existing = await db.episode.findMany({
        where: { titleId: titleRow.id },
        select: { id: true, season: true, number: true, videoUrl: true, sources: true },
      });
      const epMap = new Map(existing.map((e) => [`${e.season}x${e.number}`, e]));
      for (const [key, links] of eps) {
        const best = links.reduce((a, b) => (b.rank > a.rank ? b : a), links[0]);
        const ex = epMap.get(key);
        if (!ex) {
          stats.episodesCreated++;
          await db.episode.create({
            data: {
              titleId: titleRow.id,
              season: parseInt(key, 10),
              number: parseInt(key.split("x")[1], 10),
              name: `قسمت ${key.split("x")[1]}`,
              synopsis: "",
              duration: 45,
              videoUrl: best.url,
              thumbnail: titleRow.poster,
              sources: JSON.stringify(links.map(({ rank: _r, ...l }) => l)),
            },
          });
          stats.epLinks += links.length;
        } else {
          const curList = JSON.parse(ex.sources || "[]");
          const curUrls = new Set(curList.map((s) => s.url));
          const fresh = links.map(({ rank: _r, ...l }) => l).filter((l) => !curUrls.has(l.url));
          if (fresh.length) {
            stats.episodesMerged++;
            stats.epLinks += fresh.length;
            await db.episode.update({
              where: { id: ex.id },
              data: {
                sources: JSON.stringify([...fresh, ...curList]),
                ...(best.rank >= qOf("", ex.videoUrl).rank ? { videoUrl: best.url } : {}),
              },
            });
          }
        }
      }
    }
  }

  console.log("\n=== result ===");
  console.log(JSON.stringify(stats, null, 1));
  if (!DRY) {
    const total = await db.title.count();
    const epsTotal = await db.episode.count();
    console.log(`db now: ${total} titles, ${epsTotal} episodes`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
