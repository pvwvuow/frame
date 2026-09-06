import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";

const V = (n: number) => `/videos/v${n}.mp4`;
const TH = (n: number) => `/thumbs/t${n}.jpg`;
const POSTER = (slug: string) => `/posters/${slug}.jpg`;
const BACKDROP = (slug: string) => `/backdrops/${slug}.jpg`;

type SeedEpisode = { name: string; synopsis: string; duration: number };

type SeedTitle = {
  slug: string;
  title: string;
  titleEn: string;
  type: "movie" | "series";
  year: number;
  rating: number;
  duration: number;
  description: string;
  genres: string[];
  video: number;
  director: string;
  cast: string[];
  ageRating: string;
  quality: string;
  /** Production country – non-Iranian titles are shown English-first in the UI. */
  country?: string;
  featured: boolean;
  trendingScore: number;
  views: number;
  eps?: SeedEpisode[];
};

const seedTitles: SeedTitle[] = [
  {
    slug: "endless-night",
    title: "شب بی‌پایان",
    titleEn: "Endless Night",
    type: "movie",
    year: 2024,
    rating: 8.7,
    duration: 128,
    description:
      "کارآگاه سابقی که سال‌هاست از شهر دور بوده، برای حل آخرین پرونده‌اش به تهرانِ بارانی برمی‌گردد؛ شهری که در یک شب بی‌پایان گرفتار شده و هر چراغ نئونی، رازی را پنهان می‌کند.",
    genres: ["هیجان‌انگیز", "جنایی", "نوآر"],
    video: 1,
    director: "سامان مقدم",
    cast: ["نوید محمدزاده", "ترانه علیدوستی", "پیمان معادی"],
    ageRating: "+16",
    quality: "4K",
    featured: true,
    trendingScore: 98,
    views: 1248000,
  },
  {
    slug: "orbit-of-silence",
    country: "آمریکا",
    title: "مدار سکوت",
    titleEn: "Orbit of Silence",
    type: "movie",
    year: 2025,
    rating: 9.1,
    duration: 142,
    description:
      "پس از قطع ارتباط با زمین، فضانورد تنهای ایستگاه «آرش» باید بین بازگشت به خانه و کشف سیگنالی ناشناخته از آن‌سوی حلقه‌های زحل، یکی را انتخاب کند.",
    genres: ["علمی‌تخیلی", "درام", "ماجراجویی"],
    video: 2,
    director: "بهرام توکلی",
    cast: ["شهاب حسینی", "هدیه تهرانی", "بابک حمیدیان"],
    ageRating: "+13",
    quality: "4K HDR",
    featured: true,
    trendingScore: 100,
    views: 2310000,
  },
  {
    slug: "desert-winds",
    title: "بادهای کویر",
    titleEn: "Desert Winds",
    type: "movie",
    year: 2023,
    rating: 8.2,
    duration: 116,
    description:
      "زنی جوان در دل کویر لوت به دنبال کاروانی گمشده می‌گردد که پدرش ده سال پیش با آن ناپدید شد. سفری حماسی در برابر طوفان شن و گذشته‌ای که رهایش نمی‌کند.",
    genres: ["درام", "ماجراجویی", "حماسی"],
    video: 3,
    director: "نرگس آبیار",
    cast: ["فاطمه معتمدآریا", "حامد بهداد", "مهتاب کرامتی"],
    ageRating: "+13",
    quality: "4K",
    featured: true,
    trendingScore: 82,
    views: 890000,
  },
  {
    slug: "last-train",
    country: "فرانسه",
    title: "آخرین قطار تهران",
    titleEn: "The Last Train",
    type: "movie",
    year: 2024,
    rating: 7.9,
    duration: 104,
    description:
      "یک مأمور امنیتی خسته، در آخرین قطار شبانه‌ی تهران، متوجه بمبی می‌شود که با سرعت قطار همگام شده است. اگر قطار بایستد، همه می‌میرند.",
    genres: ["اکشن", "هیجان‌انگیز"],
    video: 4,
    director: "محمدحسین مهدویان",
    cast: ["امیر جدیدی", "سحر دولتشاهی", "هوتن شکیبا"],
    ageRating: "+16",
    quality: "FHD",
    featured: false,
    trendingScore: 91,
    views: 1560000,
  },
  {
    slug: "city-shadows",
    title: "سایه‌های شهر",
    titleEn: "City Shadows",
    type: "movie",
    year: 2022,
    rating: 8.4,
    duration: 135,
    description:
      "کارآگاهی میان‌سال با پرونده‌ی قتلی روبه‌رو می‌شود که رد پایش به قدرتمندترین خانواده‌ی شهر می‌رسد. هرچه بیشتر می‌کاود، سایه‌ها بلندتر می‌شوند.",
    genres: ["جنایی", "درام", "نوآر"],
    video: 1,
    director: "اصغر فرهادی",
    cast: ["پیمان معادی", "لیلا حاتمی", "علی مصفا"],
    ageRating: "+16",
    quality: "4K",
    featured: false,
    trendingScore: 76,
    views: 740000,
  },
  {
    slug: "the-deep",
    country: "بریتانیا",
    title: "اعماق",
    titleEn: "The Deep",
    type: "movie",
    year: 2025,
    rating: 7.6,
    duration: 98,
    description:
      "تیمی از غواصان تحقیقاتی در عمق سه هزار متری خلیج فارس، با چیزی مواجه می‌شوند که هرگز نباید بیدار می‌شد. اکسیژن تمام می‌شود و ترس تازه آغاز شده است.",
    genres: ["ترسناک", "هیجان‌انگیز", "علمی‌تخیلی"],
    video: 2,
    director: "شهرام مکری",
    cast: ["بهرام رادان", "پریناز ایزدیار", "مهران مدیری"],
    ageRating: "+18",
    quality: "4K",
    featured: false,
    trendingScore: 88,
    views: 1120000,
  },
  {
    slug: "summit",
    title: "قله",
    titleEn: "Summit",
    type: "movie",
    year: 2023,
    rating: 8.0,
    duration: 121,
    description:
      "دو برادر که سال‌هاست با هم حرف نزده‌اند، برای برآوردن آخرین آرزوی پدرشان تصمیم می‌گیرند در زمستان به قله‌ی دماوند صعود کنند. طوفان اما برنامه‌ی دیگری دارد.",
    genres: ["درام", "ماجراجویی"],
    video: 3,
    director: "رضا میرکریمی",
    cast: ["محسن تنابنده", "جواد عزتی", "الناز شاکردوست"],
    ageRating: "+13",
    quality: "FHD",
    featured: false,
    trendingScore: 64,
    views: 480000,
  },
  {
    slug: "pomegranate",
    title: "رنگ انار",
    titleEn: "Color of Pomegranate",
    type: "movie",
    year: 2024,
    rating: 8.5,
    duration: 109,
    description:
      "داستان عاشقانه‌ای در باغ‌های انار ساوه؛ دختری نقاش و پسری که هرگز رنگ‌ها را ندیده، در پاییزی که همه چیز را تغییر می‌دهد به هم می‌رسند.",
    genres: ["عاشقانه", "درام"],
    video: 4,
    director: "سعید روستایی",
    cast: ["ترانه علیدوستی", "نوید محمدزاده"],
    ageRating: "+13",
    quality: "4K",
    featured: false,
    trendingScore: 79,
    views: 930000,
  },
  {
    slug: "red-winter",
    title: "زمستان سرخ",
    titleEn: "Red Winter",
    type: "movie",
    year: 2022,
    rating: 8.8,
    duration: 151,
    description:
      "روایتی تکان‌دهنده از سه سرباز جوان که در سخت‌ترین زمستان جنگ، در سنگری دورافتاده باید بین وظیفه و انسانیت انتخاب کنند.",
    genres: ["جنگی", "درام", "تاریخی"],
    video: 3,
    director: "ابراهیم حاتمی‌کیا",
    cast: ["هادی حجازی‌فر", "پژمان جمشیدی", "بهنوش طباطبایی"],
    ageRating: "+16",
    quality: "4K",
    featured: false,
    trendingScore: 71,
    views: 810000,
  },
  {
    slug: "night-shift",
    title: "شیفت شب",
    titleEn: "Night Shift",
    type: "movie",
    year: 2025,
    rating: 7.3,
    duration: 95,
    description:
      "کمدی سیاهی درباره‌ی نگهبان شبِ یک پارکینگ طبقاتی که ناخواسته وارد بزرگ‌ترین سرقت تاریخ شهر می‌شود و باید تا صبح زنده بماند.",
    genres: ["کمدی", "جنایی"],
    video: 1,
    director: "سروش صحت",
    cast: ["رضا عطاران", "ژاله صامتی", "سیامک انصاری"],
    ageRating: "+13",
    quality: "FHD",
    featured: false,
    trendingScore: 69,
    views: 610000,
  },
  {
    slug: "fog-road",
    title: "جاده‌ی مه",
    titleEn: "Fog Road",
    type: "movie",
    year: 2023,
    rating: 7.1,
    duration: 101,
    description:
      "پنج مسافر غریبه در اتوبوسی شبانه گرفتار مهی می‌شوند که راه بازگشتی از آن نیست. هر توقف، یکی از آن‌ها را کم می‌کند.",
    genres: ["ترسناک", "معمایی"],
    video: 2,
    director: "هومن سیدی",
    cast: ["نازنین بیاتی", "بابک کریمی", "مهرداد صدیقیان"],
    ageRating: "+16",
    quality: "FHD",
    featured: false,
    trendingScore: 58,
    views: 390000,
  },
  // ---------- SERIES ----------
  {
    slug: "house-seven",
    title: "خانه‌ی شماره هفت",
    titleEn: "House No. 7",
    type: "series",
    year: 2024,
    rating: 9.0,
    duration: 48,
    description:
      "دختری جوان عمارتی قدیمی را به ارث می‌برد که ۷۰ سال است کسی پا در آن نگذاشته. با هر دری که باز می‌کند، رازی از خانواده‌اش آشکار می‌شود که بهتر بود پنهان می‌ماند.",
    genres: ["معمایی", "درام", "ترسناک"],
    video: 1,
    director: "سعید نعمت‌الله",
    cast: ["پردیس احمدیه", "بهرام افشاری", "مریلا زارعی"],
    ageRating: "+16",
    quality: "4K",
    featured: true,
    trendingScore: 97,
    views: 3400000,
    eps: [
      { name: "کلید زنگ‌زده", synopsis: "سارا وارد عمارت می‌شود و اولین در بسته را پیدا می‌کند.", duration: 52 },
      { name: "اتاق آینه‌ها", synopsis: "تصویری در آینه که متعلق به سارا نیست.", duration: 47 },
      { name: "نامه‌های سوخته", synopsis: "بقایای نامه‌هایی در شومینه از سال ۱۳۳۲.", duration: 49 },
      { name: "صدای زیرزمین", synopsis: "هر شب ساعت سه، صدایی از زیرزمین می‌آید.", duration: 45 },
      { name: "مهمان ناخوانده", synopsis: "مردی ادعا می‌کند وارث اصلی خانه است.", duration: 50 },
      { name: "هفتمین در", synopsis: "دری که روی هیچ نقشه‌ای وجود ندارد.", duration: 58 },
    ],
  },
  {
    slug: "dark-capital",
    title: "پایتخت تاریک",
    titleEn: "Dark Capital",
    type: "series",
    year: 2025,
    rating: 8.9,
    duration: 55,
    description:
      "دادستان جوانی که می‌خواهد شبکه‌ی فساد را در بالاترین سطوح شهر افشا کند، درمی‌یابد که تنها متحدش، همان کسی است که باید محاکمه‌اش کند.",
    genres: ["جنایی", "درام", "هیجان‌انگیز"],
    video: 3,
    director: "همایون اسعدیان",
    cast: ["امین حیایی", "مهناز افشار", "فرهاد اصلانی"],
    ageRating: "+16",
    quality: "4K HDR",
    featured: true,
    trendingScore: 95,
    views: 2900000,
    eps: [
      { name: "پرونده‌ی صفر", synopsis: "اولین پرونده‌ی دادستان تازه‌وارد بوی خون می‌دهد.", duration: 56 },
      { name: "برج", synopsis: "قراردادی که هرگز امضا نشده بود.", duration: 54 },
      { name: "شاهد", synopsis: "تنها شاهد پرونده ناپدید می‌شود.", duration: 52 },
      { name: "معامله", synopsis: "پیشنهادی که نمی‌توان رد کرد.", duration: 57 },
      { name: "خیانت", synopsis: "دشمن نزدیک‌تر از آن چیزی است که فکرش را می‌کرد.", duration: 55 },
      { name: "دادگاه", synopsis: "روز محاکمه فرا می‌رسد.", duration: 61 },
      { name: "سقوط", synopsis: "پایان یک امپراتوری.", duration: 63 },
      { name: "سپیده", synopsis: "شهر بعد از طوفان.", duration: 59 },
    ],
  },
  {
    slug: "galaxy-migrants",
    country: "کانادا",
    title: "مهاجران کهکشان",
    titleEn: "Galaxy Migrants",
    type: "series",
    year: 2024,
    rating: 8.6,
    duration: 50,
    description:
      "دویست سال پس از ترک زمین، نسل سوم ساکنان سفینه‌ی «کاوه» به سیاره‌ی مقصد می‌رسند؛ اما آنچه پیدا می‌کنند، شبیه هیچ‌کدام از وعده‌ها نیست.",
    genres: ["علمی‌تخیلی", "ماجراجویی", "درام"],
    video: 2,
    director: "کامبوزیا پرتوی",
    cast: ["ساره بیات", "حسین یاری", "پانته‌آ پناهی‌ها"],
    ageRating: "+13",
    quality: "4K",
    featured: false,
    trendingScore: 86,
    views: 1800000,
    eps: [
      { name: "بیداری", synopsis: "خواب سرد به پایان می‌رسد.", duration: 51 },
      { name: "دو ماه", synopsis: "اولین تصویر از سیاره‌ی نو.", duration: 48 },
      { name: "فرود", synopsis: "سفینه به مدار می‌رسد.", duration: 53 },
      { name: "سکوت سبز", synopsis: "جنگلی که نفس می‌کشد.", duration: 47 },
      { name: "سیگنال", synopsis: "پیامی از خودشان، از آینده.", duration: 55 },
      { name: "انتخاب", synopsis: "ماندن یا بازگشتن.", duration: 60 },
    ],
  },
  {
    slug: "dynasty",
    title: "دودمان",
    titleEn: "Dynasty",
    type: "series",
    year: 2023,
    rating: 9.2,
    duration: 60,
    description:
      "حماسه‌ای تاریخی از برآمدن و فروپاشی یک سلسله‌ی باستانی؛ جایی که برادر در برابر برادر می‌ایستد و تاج، سنگین‌تر از هر شمشیری است.",
    genres: ["تاریخی", "درام", "حماسی"],
    video: 4,
    director: "داوود میرباقری",
    cast: ["پارسا پیروزفر", "مهدی پاکدل", "ویشکا آسایش"],
    ageRating: "+13",
    quality: "4K HDR",
    featured: true,
    trendingScore: 93,
    views: 4100000,
    eps: [
      { name: "تاج‌گذاری", synopsis: "شاه جوان بر تخت می‌نشیند.", duration: 62 },
      { name: "توطئه", synopsis: "زمزمه‌هایی در راهروهای کاخ.", duration: 58 },
      { name: "نبرد دشت", synopsis: "اولین جنگ بزرگ.", duration: 65 },
      { name: "برادر", synopsis: "خون در برابر خون.", duration: 60 },
      { name: "شهبانو", synopsis: "قدرت پشت پرده.", duration: 57 },
      { name: "خیانت در تخت‌جمشید", synopsis: "شبی که همه چیز تغییر کرد.", duration: 63 },
      { name: "تبعید", synopsis: "شاه بدون تاج.", duration: 59 },
      { name: "بازگشت", synopsis: "قیام از خاکستر.", duration: 61 },
      { name: "فرجام", synopsis: "پایان دودمان.", duration: 70 },
    ],
  },
  {
    slug: "midnight-cafe",
    title: "کافه نیمه‌شب",
    titleEn: "Midnight Café",
    type: "series",
    year: 2025,
    rating: 8.3,
    duration: 35,
    description:
      "کافه‌ای کوچک که فقط از نیمه‌شب تا سپیده باز است و هر شب، آدمی با قصه‌ای تازه پشت پیشخوانش می‌نشیند. مجموعه‌ای آرام، انسانی و پر از طعم.",
    genres: ["درام", "کمدی", "عاشقانه"],
    video: 5,
    director: "مانی حقیقی",
    cast: ["بهاره کیان‌افشار", "حامد کمیلی", "آتیلا پسیانی"],
    ageRating: "+13",
    quality: "FHD",
    featured: false,
    trendingScore: 74,
    views: 950000,
    eps: [
      { name: "قهوه‌ی ترک", synopsis: "مردی که هر شب یک صندلی خالی رزرو می‌کند.", duration: 34 },
      { name: "کیک هویج", synopsis: "دختری با چمدانی که هیچ‌وقت بازش نمی‌کند.", duration: 36 },
      { name: "چای دارچین", synopsis: "راننده‌ی تاکسی و آخرین مسافرش.", duration: 33 },
      { name: "شکلات داغ", synopsis: "دو غریبه و یک چتر.", duration: 37 },
      { name: "نعنا", synopsis: "شبی که کافه برق نداشت.", duration: 35 },
    ],
  },
];

const sampleReviews: Record<string, { author: string; rating: number; body: string }[]> = {
  "orbit-of-silence": [
    { author: "مهدی", rating: 10, body: "بهترین فیلم علمی‌تخیلی ایرانی که دیدم. جلوه‌های ویژه در حد هالیوود، صدا و موسیقی فوق‌العاده." },
    { author: "نگار", rating: 9, body: "نیم ساعت آخر نفسم بند اومده بود. حتماً روی صفحه بزرگ ببینید." },
  ],
  "endless-night": [
    { author: "آرش", rating: 9, body: "فضاسازی نوآر عالی. نورپردازی و فیلم‌برداری چشم‌نواز." },
  ],
  dynasty: [
    { author: "سارا", rating: 10, body: "قسمت آخر اشکم رو درآورد. بازی‌ها و طراحی صحنه بی‌نظیر." },
    { author: "کیان", rating: 9, body: "بهترین سریال تاریخی این سال‌ها." },
  ],
  "house-seven": [
    { author: "پریسا", rating: 9, body: "هر قسمت با کلیف‌هنگر تموم می‌شه، نمی‌شه دست ازش کشید!" },
  ],
};

let seeded = false;
/** In-flight seeding promise – concurrent first requests share one seed run instead of racing. */
let seeding: Promise<void> | null = null;

let pragmasApplied = false;
/**
 * SQLite hardening for the desktop build (v0.10.2):
 *   - journal_mode=WAL → readers never block the (background) catalog merge
 *     and vice-versa; also survives process kills far better than the default
 *     rollback journal. Persistent in the database file, so once is enough.
 *   - busy_timeout=10000 → a locked database waits instead of surfacing
 *     "database is locked" to the UI (e.g. while a leftover server process
 *     from a previous crash still holds the file).
 *   - synchronous=NORMAL → WAL-safe durability with much less fsync churn.
 */
async function applyConnectionPragmas() {
  if (pragmasApplied) return;
  pragmasApplied = true;
  try {
    await db.$queryRawUnsafe("PRAGMA journal_mode=WAL");
    await db.$queryRawUnsafe("PRAGMA busy_timeout=10000");
    await db.$executeRawUnsafe("PRAGMA synchronous=NORMAL");
  } catch (e) {
    console.warn("[seed] connection pragmas skipped:", e instanceof Error ? e.message : e);
  }
}

export async function ensureSeeded() {
  if (seeded) return;
  if (seeding) return seeding;
  seeding = seedOnce()
    .catch((e) => {
      console.error("[seed] failed:", e);
    })
    .finally(() => {
      seeding = null;
    });
  return seeding;
}

/**
 * Self-heal: create the full Prisma schema from the shipped DDL when the
 * SQLite file exists but has no tables (e.g. an empty nama.db created by a
 * failed first-run copy, or a user DB from an older app version that is
 * missing newly added tables). DDL is generated at build time via
 * `prisma migrate diff` (scripts/postbuild.cjs) and shipped as db/schema.sql.
 */
let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  const probe = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='Title'`
  );
  if (Array.isArray(probe) && probe.length > 0) {
    schemaEnsured = true;
    return;
  }
  const candidates = [path.join(process.cwd(), "db", "schema.sql"), path.join(process.cwd(), "prisma", "schema.sql")];
  const ddlPath = candidates.find((p) => fs.existsSync(p));
  if (!ddlPath) {
    console.error("[seed] schema.sql not found – cannot self-heal database schema");
    return;
  }
  console.log("[seed] Title table missing → applying DDL from", ddlPath);
  const ddl = fs.readFileSync(ddlPath, "utf8");
  for (const raw of ddl.split(/;\s*\n/)) {
    const stmt = raw
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim();
    if (!stmt) continue;
    try {
      await db.$executeRawUnsafe(stmt.endsWith(";") ? stmt : stmt + ";");
    } catch (e) {
      // "table/index already exists" is fine during partial heals; log the rest but continue
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(msg)) console.warn("[seed] DDL statement skipped:", msg);
    }
  }
  schemaEnsured = true;
}

async function seedOnce() {
  await applyConnectionPragmas();
  try {
    await ensureSchema();
  } catch (e) {
    console.error("[seed] ensureSchema failed:", e);
  }
  const count = await db.title.count();
  if (count > 0) {
    await syncCountries();
    seeded = true;
    return;
  }

  for (const t of seedTitles) {
    // idempotent: skip titles that already exist (e.g. partial previous seed)
    const exists = await db.title.findUnique({ where: { slug: t.slug }, select: { id: true } });
    if (exists) continue;
    const inserted = await db.title.create({
      data: {
        slug: t.slug,
        title: t.title,
        titleEn: t.titleEn,
        type: t.type,
        year: t.year,
        rating: t.rating,
        duration: t.duration,
        description: t.description,
        genres: JSON.stringify(t.genres),
        poster: POSTER(t.slug),
        backdrop: BACKDROP(t.slug),
        videoUrl: V(t.video),
        director: t.director,
        cast: JSON.stringify(t.cast),
        ageRating: t.ageRating,
        quality: t.quality,
        country: t.country ?? "ایران",
        featured: t.featured,
        trendingScore: t.trendingScore,
        views: t.views,
      },
      select: { id: true },
    });
    if (t.eps?.length) {
      await db.episode.createMany({
        data: t.eps.map((e, i) => ({
          titleId: inserted.id,
          season: 1,
          number: i + 1,
          name: e.name,
          synopsis: e.synopsis,
          duration: e.duration,
          videoUrl: V(t.video),
          thumbnail: TH((i % 9) + 1),
        })),
      });
    }
    const revs = sampleReviews[t.slug];
    if (revs?.length) {
      await db.review.createMany({
        data: revs.map((r) => ({ ...r, titleId: inserted.id })),
      });
    }
  }
  seeded = true;
}

/** Lightweight data migration: apply production countries to titles seeded before the field existed. */
async function syncCountries() {
  const withCountry = seedTitles.filter((t) => t.country);
  for (const t of withCountry) {
    await db.title.updateMany({ where: { slug: t.slug, country: "ایران" }, data: { country: t.country } });
  }
}
