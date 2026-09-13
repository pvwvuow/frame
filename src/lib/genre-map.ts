/**
 * genre-map (v0.32.0) — نگاشت ژانرها به فهرست معیار فریم و نرمال‌سازی آن‌ها.
 *
 * کاتالوگ از چند مسیر ژانر می‌گیرد (مدیریت محتوایی اولیه، تگ پوشه‌ی منبع،
 * و از این نسخه ویکی‌دیتا) — هر مسیر املای خودش را دارد:
 *   «علمی تخیلی» با فاصله، «علمی–تخیلی» با خط‌تیره، «زندگینامه» بدون پسوند،
 *   و مقادیر زباله مثل «—» و «نامشخص».
 * همه‌ی این‌ها باید به یک فهرست معیار برسند تا صفحه‌ی ژانرها و فیلترها کامل
 * کار کنند (قبلاً ~۲٬۶۰۰ عنوان بیرون از فهرست ۱۴تایی گم شده بودند).
 *
 * خالص و بدون وابستگی — هم در اپ (تست‌ها و enricher) هم در اسکریپت‌ها.
 */

/** فهرست معیار ژانرهای فریم — ترتیب: پرکاربرد به کم‌کاربرد */
export const CANONICAL_GENRES = [
  "اکشن", "درام", "کمدی", "هیجان‌انگیز", "جنایی", "علمی‌تخیلی", "ترسناک", "عاشقانه",
  "ماجراجویی", "معمایی", "تاریخی", "جنگی", "حماسی", "نوآر", "فانتزی", "انیمیشن",
  "مستند", "خانوادگی", "زندگینامه‌ای", "موزیکال", "موسیقی", "وسترن", "ورزشی", "رئالیتی",
] as const;

export type CanonicalGenre = (typeof CANONICAL_GENRES)[number];

const CANON = new Set<string>(CANONICAL_GENRES);

/** مقادیر زباله‌ای که در کاتالوگ دیده شده و ژانر واقعی نیستند */
const JUNK = new Set(["نامشخص", "—", "–", "-", "unknown", "n/a", "genre"]);

/** املاهای جایگزین → معیار (قبل از چک معیار بودن اعمال می‌شود) */
const VARIANTS: Array<[RegExp, CanonicalGenre]> = [
  [/^علمی[\s\u200c\-–—ـ]*تخیلی$/, "علمی‌تخیلی"],
  [/^زندگینامه$/, "زندگینامه‌ای"],
  [/^هیجان[\s\u200c\-–—ـ]*انگیز$/, "هیجان‌انگیز"],
  [/^ماجرا$/, "ماجراجویی"],
];

/** حداکثر ژانر برای هر عنوان — بیشتر از این شلوغ می‌شود */
export const MAX_GENRES = 4;

/** نرمال‌سازی یک آرایه ژانر خام (از هر منبعی) به فهرست معیار */
export function normalizeGenres(raw: unknown): string[] {
  const out: string[] = [];
  const arr = Array.isArray(raw) ? raw : [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    let g = item.trim().replace(/\s+/g, " ");
    if (!g || JUNK.has(g) || JUNK.has(g.toLowerCase())) continue;
    // نیم‌فاصله‌های استاندارد داخل خود ژانر (هیجان انگیز → هیجان‌انگیز)
    g = g.replace(/هیجان[\s\-–—ـ]*انگیز/, "هیجان‌انگیز");
    g = g.replace(/علمی[\s\-–—ـ]*تخیلی/, "علمی‌تخیلی");
    for (const [re, canon] of VARIANTS) {
      if (re.test(g)) { g = canon; break; }
    }
    if (!CANON.has(g)) continue; // مقدار ناشناخته → کنار (نباید چرت وارد فیلتر شود)
    if (!out.includes(g)) out.push(g);
    if (out.length >= MAX_GENRES) break;
  }
  return out;
}

/** آیا آرایه ژانر «پوچ» است — خالی، یا فقط زباله/نامشخص */
export function genresAreJunk(raw: unknown): boolean {
  return normalizeGenres(raw).length === 0;
}

/* ------------------------------------------------------------------ */
/* برچسب‌های ویکی‌دیتا → ژانر معیار                                    */
/* ------------------------------------------------------------------ */

/**
 * قواعد تشخیص از روی برچسب (fa یا en) — ترتیب مهم است؛ چندهمخوانی عمدی است
 * و چند ژانر از یک برچسب ترکیبی درمی‌آید («historical drama» → تاریخی+درام).
 */
const LABEL_RULES: Array<[RegExp, CanonicalGenre]> = [
  // چندکلمه‌ای‌های خاص اول
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
  // عمومی‌ها
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

/**
 * ژانرهای معیار را از برچسب‌های ویکی‌دیتا (P136) درمی‌آورد.
 * ورودی: هر تعداد برچسب fa/en («فیلم درام»، «drama television series»، …)
 * ترتیب خروجی = ترتیب برچسب‌ها؛ خروجی نرمال و سقف‌خورده.
 */
export function genresFromWikidataLabels(labels: string[]): string[] {
  const out: string[] = [];
  for (const label of labels) {
    if (!label) continue;
    for (const [re, genre] of LABEL_RULES) {
      if (re.test(label) && !out.includes(genre)) {
        out.push(genre);
        if (out.length >= MAX_GENRES) return out;
      }
    }
  }
  return normalizeGenres(out);
}

/** شماره به ارقام فارسی (برای متن توضیحات تولیدی) */
export function faDigits(n: number | string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return String(n).replace(/[0-9]/g, (d) => fa[Number(d)]);
}

/**
 * توضیح جایگزین صادقانه برای عنوانی که هیچ منبعی توضیح نداشت.
 * از چیزی که واقعاً می‌دانیم می‌سازد؛ ادعای دروغ ندارد.
 */
export function fallbackDescription(opts: { title: string; type: "movie" | "series"; year?: number; genres?: string[] }): string {
  const kind = opts.type === "series" ? "سریال" : "فیلم";
  const year = opts.year && opts.year > 1900 ? ` ${faDigits(opts.year)}` : "";
  const bits: string[] = [`«${opts.title}»`];
  if (opts.genres && opts.genres.length) {
    bits.push(`${kind}ی${year} در ژانر ${opts.genres.join("، ")}`);
  } else {
    bits.push(`${kind}${year}`);
  }
  bits.push("— آماده‌ی پخش آنلاین در نما.");
  return bits.join(" ");
}

/** تشخیص توضیح الگویی/پوچ که باید جایگزین شود */
const TEMPLATE_RE = /منبع دایرکتوری|آرشیو دنیای سریال|آرشیو دنیای فیلم|آماده‌ی پخش آنلاین در نما\.$/;
export function descriptionNeedsWork(d: string | null | undefined): boolean {
  const s = (d || "").trim();
  if (!s) return true;
  if (s.length < 80) return true;
  return TEMPLATE_RE.test(s);
}

/** استخراج شناسه IMDb از پوستر (/covers/tt…، metahub …/tt…/img) یا اسلاگ (tt…-hash) */
export function imdbIdFrom(poster: string | null | undefined, slug: string | null | undefined): string | null {
  const m =
    /\/covers\/(tt\d{6,10})\//.exec(poster || "") ||
    /metahub\.space\/poster\/[a-z]+\/(tt\d{6,10})\//.exec(poster || "") ||
    /metahub\.space\/poster\/(tt\d{6,10})\//.exec(poster || "");
  if (m) return m[1];
  const s = /^tt(\d{6,10})/.exec(slug || "");
  return s ? `tt${s[1]}` : null;
}
