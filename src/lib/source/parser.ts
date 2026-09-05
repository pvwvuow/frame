/**
 * تشخیص فیلم/سریال از نام فایل و مسیر در دایرکتوری‌های اشتراک فیلم ایرانی.
 * همه توابع خالص هستند و قابل تست بدون شبکه.
 */

export const VIDEO_EXT = new Set(["mkv", "mp4", "avi", "mov", "wmv", "m4v", "ts", "mpg", "mpeg", "flv", "webm"]);
export const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "bmp", "avif"]);
/** پسوندهایی که هیچ‌وقت مدیا نیستند و باید در کرال نادیده گرفته شوند */
export const IGNORE_EXT = new Set(["nfo", "txt", "url", "html", "htm", "php", "srt", "ass", "ssa", "sub", "zip", "rar", "sfv", "exe", "db", "torrent", "json", "xml", "gif"]);

/** ترتیب کیفیت؛ هرچه بزرگ‌تر بهتر */
const QUALITY_RANK: Record<string, number> = {
  "2160p": 10, "4k": 10, uhd: 9,
  "1080p": 8, fhd: 8,
  "720p": 6, hd: 6,
  "576p": 4, "540p": 4, "480p": 3, sd: 3,
  "360p": 2, "240p": 1,
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی/عربی → لاتین */
export function normalizeDigits(s: string): string {
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

/** پوشه‌هایی که فقط شماره فصل هستند و در نام اثر نقشی ندارند */
const SEASON_DIR_RE = /^(?:s|season|f|فصل|سیزن)[\s._-]*(\d{1,2})$/i;
const CATEGORY_WORDS = new Set([
  "serial", "series", "serie", "tv", "tvshows", "tv-shows", "shows",
  "movie", "movies", "film", "films", "cinema",
  "anime", "animation", "cartoon", "dokumentary", "documentary", "doc",
  "korean", "turkish", "turk", "hindi", "bollywood", "english", "foreign",
  "irani", "iranian", "persian",
  "1080", "1080p", "720p", "2160p", "4k", "x265", "x264", "dual", "dubbed", "ganool", "donyayeserial",
  "hardsub", "softsub", "sub", "dub", "fa", "en", "new", "archive",
]);
const CATEGORY_FA = new Set([
  "سریال", "سریالها", "سریال‌ها", "فیلم", "فیلمها", "فیلم‌ها", "انیمه", "انیمیشن", "کارتون",
  "مستند", "کره‌ای", "کرهای", "ترکیه", "ترکی", "هندی", "خارجی", "ایرانی", "دوبله", "زیرنویس",
  "دنیایسریال", "دنیای سریال",
]);

export function isSeasonDir(name: string): number | null {
  const n = normalizeDigits(decodeURIComponent(name)).trim();
  const m = n.match(SEASON_DIR_RE);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function isCategoryDir(name: string): boolean {
  const n = normalizeDigits(decodeURIComponent(name)).trim().replace(/\/+$/, "").toLowerCase().replace(/\s+/g, "");
  if (!n) return false;
  if (CATEGORY_FA.has(n) || CATEGORY_FA.has(n.replace(/‌/g, ""))) return true;
  return CATEGORY_WORDS.has(n) || CATEGORY_WORDS.has(n.replace(/-/g, ""));
}

export interface EpisodeRef { season: number; number: number }

/**
 * شماره فصل/قسمت را از نام فایل درمی‌آورد.
 * پشتیبانی: S01E02 / 1x02 / E02 / EP02 / Episode 2 / قسمت 2 / فایل عددی خالص
 */
export function parseEpisodeMarker(filename: string, parentSeason: number | null): { season: number; number: number } | null {
  const f = normalizeDigits(decodeURIComponent(filename));

  // S01E02 / S01.E02
  let m = f.match(/\bs(\d{1,2})[\s._-]?e(?:p)?(\d{1,3})\b/i);
  if (m) return { season: parseInt(m[1], 10), number: parseInt(m[2], 10) };

  // 1x02
  m = f.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) return { season: parseInt(m[1], 10), number: parseInt(m[2], 10) };

  // قسمت ۲ / قسمت-۲ / قسمت_۲
  m = f.match(/قسمت[\s._-]*(\d{1,3})/);
  if (m) return { season: parentSeason ?? 1, number: parseInt(m[1], 10) };

  // Episode 2 / Ep 2 / E2
  m = f.match(/\b(?:ep|episode|e)[\s._-]*(\d{1,3})\b/i);
  if (m) return { season: parentSeason ?? 1, number: parseInt(m[1], 10) };

  // فایل عددی خالص: "05.mkv" داخل پوشه فصل
  const base = f.replace(/\.[a-z0-9]+$/i, "").trim();
  if (/^\d{1,3}$/.test(base)) return { season: parentSeason ?? 1, number: parseInt(base, 10) };

  return null;
}

export function qualityRank(filename: string): number {
  const f = normalizeDigits(decodeURIComponent(filename)).toLowerCase();
  let best = 0;
  for (const [tag, rank] of Object.entries(QUALITY_RANK)) {
    if (f.includes(tag) && rank > best) best = rank;
  }
  return best;
}

export function qualityLabel(filename: string): string {
  const r = qualityRank(filename);
  if (r >= 10) return "4K";
  if (r >= 8) return "1080p";
  if (r >= 6) return "720p";
  if (r >= 3) return "480p";
  return "HD";
}

/** تگ‌های کیفیتی/گروه که باید از نام پاک شوند */
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

export interface CleanTitle { title: string; year: number | null }

/** نام اثر را از رشته خام (نام پوشه) تمیز می‌کند؛ سال را جدا می‌کند */
export function cleanTitle(raw: string): CleanTitle {
  let s = normalizeDigits(decodeURIComponent(raw)).replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  const ym = s.match(/\b(19\d{2}|20\d{2})\b/);
  const year = ym ? parseInt(ym[1], 10) : null;
  s = s.replace(NOISE_RE, " ");
  if (ym) s = s.replace(ym[0], " ");
  s = s.replace(/[\s._-]{2,}/g, " ").replace(/^[\s._-]+|[\s._-]+$/g, "").trim();
  // برچسب‌های قسمت/فصل باقی‌مانده در نام پوشه
  s = s.replace(/\b(?:s\d{1,2}|season[ \t]*\d{1,2}|فصل[ \t]*\d{1,2})\b/gi, " ").trim();
  s = s.replace(/[\s._-]{2,}/g, " ").replace(/^[\s._-]+|[\s._-]+$/g, "");
  return { title: s || raw, year };
}

export function slugify(title: string, year: number | null): string {
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = ascii || "title";
  const h = hash8(`${title}|${year ?? ""}`);
  return year ? `${base}-${year}-${h}` : `${base}-${h}`;
}

export function hash8(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(6, "0").slice(0, 6);
}

export interface ParsedMedia {
  /** نام اثر پس از پاک‌سازی (می‌تواند فارسی باشد) */
  title: string;
  year: number | null;
  slug: string;
  type: "movie" | "series";
  season: number | null;
  episode: number | null;
  quality: string;
  qRank: number;
  /** آیا این فایل sample/تریلر/تبلیغ است */
  junk: boolean;
}

/**
 * تحلیل کامل یک فایل مدیا بر اساس زنجیره پوشه‌هایش (نسبت به ریشه سورس) و نام فایل.
 * segments: پوشه‌ها از ریشه تا پوشه حاوی فایل (مثل ["serial","Breaking Bad","S01"])
 */
export function parseMedia(segments: string[], filename: string): ParsedMedia {
  const f = normalizeDigits(decodeURIComponent(filename));
  const junk = /(?:\bsample\b|\btrailer\b|تیزر|تریلر|\bextras?\b|\bmenu\b|\bproof\b)/i.test(f);

  // فصل مؤثر: نزدیک‌ترین پوشه فصل به سمت فایل
  let parentSeason: number | null = null;
  for (let i = segments.length - 1; i >= 0; i--) {
    const sn = isSeasonDir(segments[i]);
    if (sn != null) { parentSeason = sn; break; }
  }

  const ep = parseEpisodeMarker(filename, parentSeason);

  // زنجیره پوشه‌ها بدون پوشه‌های فصل
  const dirs = segments.filter((s) => isSeasonDir(s) == null);
  // ریشه سورس خودش یک دسته است؛ از دومین پوشه به بعد نام اثر است.
  // اگر پوشه اول دسته نبود (مثلاً ریشه مستقیم شامل اثرهاست) همان اولی نام اثر است.
  let titleSeg: string;
  if (dirs.length === 0) {
    titleSeg = filename;
  } else if (dirs.length === 1) {
    titleSeg = dirs[0];
  } else {
    titleSeg = isCategoryDir(dirs[0]) ? dirs[1] : dirs[0];
  }

  const { title, year } = cleanTitle(titleSeg);
  const type: "movie" | "series" = ep ? "series" : "movie";

  return {
    title,
    year,
    slug: slugify(title, year),
    type,
    season: ep ? ep.season : null,
    episode: ep ? ep.number : null,
    quality: qualityLabel(filename),
    qRank: qualityRank(filename),
    junk,
  };
}

/** تشخیص ژانر اولیه از اولین پوشه مسیر */
export function categoryGenre(segments: string[]): string {
  const first = segments[0] ? normalizeDigits(decodeURIComponent(segments[0])).trim().toLowerCase() : "";
  if (/anime|انیمه|انیمیشن|کارتون/.test(first)) return "انیمیشن";
  if (/korean|کره/.test(first)) return "کره‌ای";
  if (/turk|ترکی/.test(first)) return "ترکیه‌ای";
  if (/hindi|بالیوود|هندی/.test(first)) return "هندی";
  if (/doc|مستند/.test(first)) return "مستند";
  if (/serial|series|tv|سریال/.test(first)) return "سریال";
  if (/movie|film|فیلم/.test(first)) return "سینما";
  return "";
}
