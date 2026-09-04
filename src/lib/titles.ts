/* ------------------------------------------------------------------
   GHAB · قاب — demo catalog (fake data for UI preview)
   All titles, people and artworks are fictional placeholders.
------------------------------------------------------------------- */

export type Episode = {
  num: string;
  title: string;
  dur: string;
  progress: number; // 0..100 watched
};

export type Kind = "film" | "series";

export type Title = {
  id: string;
  kind: Kind;
  fa: string;
  en: string;
  year: number;
  genres: string[];
  rating: number;
  duration: string;
  quality: "4K" | "2K" | "1080p";
  poster: string;
  backdrop?: string;
  stock: string; // fake film-stock label (Field Kit vibe)
  director: string;
  cast: string[];
  synopsis: string;
  dub: boolean;
  sub: boolean;
  badge?: string;
  // continue-watching
  progress?: number;
  remaining?: string;
  episodes?: Episode[];
};

export const HERO: Title = {
  id: "ember",
  kind: "film",
  fa: "دشتِ اخگر",
  en: "EMBER FIELD",
  year: 1404,
  genres: ["حماسی", "فانتزی", "درام"],
  rating: 8.7,
  duration: "۲ ساعت و ۲۸ دقیقه",
  quality: "4K",
  poster: "/posters/poster-orbit.png",
  backdrop: "/backdrops/hero-desert.png",
  stock: "KODAK VISION3 500T · 2.39:1",
  director: "آرمان صدر",
  cast: ["نوید فراهانی", "لیلا سامانی", "بهرام کیانی", "مریم دلشاد"],
  synopsis:
    "در سرزمینی که رودخانه‌هایش از آتش می‌جوشند، جوانی چوپان باید از دل دشت اخگر بگذرد تا آخرین بذرِ زندگی را به سرزمین‌های سوختهٔ شمال برساند. سفری حماسی میان خاکستر و نور، دربارهٔ امیدی که حتی خاکستر هم نمی‌تواند خاموشش کند.",
  dub: true,
  sub: true,
};

export const TREND: Title[] = [
  {
    id: "orbit", kind: "film", fa: "مدار نهایی", en: "FINAL ORBIT", year: 1403,
    genres: ["علمی‌تخیلی"], rating: 8.6, duration: "۲ ساعت و ۱۱ دقیقه", quality: "4K",
    poster: "/posters/poster-orbit.png", backdrop: "/backdrops/hero-galaxy.png",
    stock: "CINESTILL 800T · 2.39:1", director: "کیوان مرادی",
    cast: ["آرش هومن", "سارا مینویی", "فرزاد کاویانی"],
    synopsis: "خلبانی تنها در آخرین مأموریت زندگی‌اش، باید میان بازگشت به زمین و نجات ایستگاهی متروک یکی را انتخاب کند.",
    dub: true, sub: true,
  },
  {
    id: "neon", kind: "film", fa: "شبِ برقی", en: "NEON NIGHT", year: 1402,
    genres: ["نئو-نوآر", "جنایی"], rating: 8.1, duration: "۱ ساعت و ۵۴ دقیقه", quality: "4K",
    poster: "/posters/poster-noir.png", backdrop: "/backdrops/hero-noir.png",
    stock: "FUJI ETERNA 250D · 1.85:1", director: "شهاب رستگار",
    cast: ["امیر آذری", "رها کیانی", "جمشید مهر"],
    synopsis: "کارآگاهی بازنشسته در شهری که بارانش نور را پخش می‌کند، پرونده‌ای را باز می‌کند که همه می‌خواهند فراموش شود.",
    dub: true, sub: true,
  },
  {
    id: "cloud", kind: "film", fa: "خانه‌ای روی ابر", en: "HOUSE ABOVE CLOUDS", year: 1403,
    genres: ["درام"], rating: 7.9, duration: "۱ ساعت و ۴۸ دقیقه", quality: "2K",
    poster: "/posters/poster-house.png",
    stock: "KODAK PORTRA 400 · 1.85:1", director: "مینا اسحاقی",
    cast: ["شیرین نامجو", "پرهام اتحادی"],
    synopsis: "زنی پس از سال‌ها به خانهٔ پدری بر فراز ابرها برمی‌گردد تا رازی خانوادگی را با خودش بسوزاند — یا نجاتش دهد.",
    dub: false, sub: true,
  },
  {
    id: "front", kind: "film", fa: "خط مقدم", en: "FRONTLINE", year: 1401,
    genres: ["جنگی", "تاریخی"], rating: 8.3, duration: "۲ ساعت و ۳۶ دقیقه", quality: "4K",
    poster: "/posters/poster-frontline.png", backdrop: "/backdrops/hero-desert.png",
    stock: "KODAK 5219 · 2.39:1", director: "حمید رستمی",
    cast: ["سعید نیک‌روش", "کاوه شریفی", "میلاد زارع"],
    synopsis: "سه سرباز در دل تاریکیِ گرگ‌ومیش، باید خطی را نگه دارند که دیگر روی هیچ نقشه‌ای وجود ندارد.",
    dub: true, sub: true,
  },
  {
    id: "sea", kind: "film", fa: "نامه‌ای به دریا", en: "LETTERS TO THE SEA", year: 1404,
    genres: ["عاشقانه", "درام"], rating: 7.6, duration: "۱ ساعت و ۴۲ دقیقه", quality: "2K",
    poster: "/posters/poster-sea.png",
    stock: "AGFA VISTA 200 · 1.85:1", director: "نگار سلطانی",
    cast: ["آیدا برزگر", "سام مرادخانی"],
    synopsis: "دو غریبه در دو ساحلِ دور از هم، نامه‌هایی را در دریا می‌اندازند که همیشه به مقصد می‌رسند.",
    dub: false, sub: true,
  },
  {
    id: "room8", kind: "film", fa: "اتاق ۸", en: "ROOM NO. 8", year: 1402,
    genres: ["معمایی", "ترسناک"], rating: 7.8, duration: "۱ ساعت و ۳۹ دقیقه", quality: "4K",
    poster: "/posters/poster-room8.png",
    stock: "CINESTILL 800T · 1.85:1", director: "بردیا نیک",
    cast: ["ترلان پرویزی", "نوید فراهانی"],
    synopsis: "هتلداری متوجه می‌شود مهمان اتاق ۸ هر شب یک دقیقه زودتر از روز قبل، تحویل اتاق را می‌خواهد.",
    dub: true, sub: true,
  },
  {
    id: "caravan", kind: "film", fa: "کوچِ شمال", en: "THE NORTH CARAVAN", year: 1400,
    genres: ["ماجراجویی"], rating: 8.0, duration: "۲ ساعت و ۵ دقیقه", quality: "1080p",
    poster: "/posters/poster-caravan.png",
    stock: "KODAK VISION3 250D · 2.39:1", director: "رحیم رهنما",
    cast: ["جهانگیر علوی", "صدف رحیمی", "ایمان بلوچ"],
    synopsis: "کاروانی از کوچندگان باید پیش از طلوعِ توفانِ شن، از بلندترین رَملهٔ کویر بگذرند.",
    dub: true, sub: false,
  },
  {
    id: "round", kind: "film", fa: "راند آخر", en: "LAST ROUND", year: 1403,
    genres: ["ورزشی", "درام"], rating: 7.7, duration: "۱ ساعت و ۵۱ دقیقه", quality: "2K",
    poster: "/posters/poster-boxer.png",
    stock: "KODAK 5219 · 1.85:1", director: "بابک ضیایی",
    cast: ["پویا گرجی", "مریم دلشاد"],
    synopsis: "مشت‌زنی کهنه‌کار برای برگرداندن دخترش، تن به آخرین راندِ عمرش می‌دهد — مقابل کسی که شاگرد خودش بود.",
    dub: true, sub: true,
  },
];

export const SERIES: Title[] = [
  {
    id: "coldcase", kind: "series", fa: "پروندهٔ سرد", en: "COLD FILE", year: 1403,
    genres: ["جنایی", "معمایی"], rating: 8.9, duration: "۳ فصل · ۲۴ قسمت", quality: "4K",
    poster: "/posters/poster-coldcase.png", backdrop: "/backdrops/thumb-cinema.png",
    stock: "FUJI ETERNA 500T · 2.00:1", director: "آرمان صدر",
    cast: ["لیلا سامانی", "فرزاد کاویانی", "رها کیانی"],
    synopsis: "بخش پرونده‌های بی‌پاسخ پلیس، با بازگشایی یک نوار قدیمی، به قتلی می‌رسد که سی سال کسی نتوانست ببیند.",
    dub: true, sub: true, badge: "فصل ۳",
    episodes: [
      { num: "01", title: "نوارِ سی‌ساله", dur: "۵۲ دقیقه", progress: 100 },
      { num: "02", title: "اثر انگشتی که نبود", dur: "۴۸ دقیقه", progress: 62 },
      { num: "03", title: "شاهدِ اتاق تاریک", dur: "۵۵ دقیقه", progress: 0 },
      { num: "04", title: "سیاهیِ میان قاب‌ها", dur: "۵۰ دقیقه", progress: 0 },
      { num: "05", title: "ظهور در قرمزی", dur: "۴۷ دقیقه", progress: 0 },
    ],
  },
  {
    id: "station13", kind: "series", fa: "ایستگاه ۱۳", en: "STATION 13", year: 1404,
    genres: ["علمی‌تخیلی", "معمایی"], rating: 8.4, duration: "۲ فصل · ۱۶ قسمت", quality: "4K",
    poster: "/posters/poster-station13.png", backdrop: "/backdrops/thumb-aurora.png",
    stock: "KODAK VISION3 500T · 2.00:1", director: "کیوان مرادی",
    cast: ["آرش هومن", "سارا مینویی"],
    synopsis: "قطاری که هر شب ساعت ۱۳:۱۳ به ایستگاهی می‌رسد که روی نقشه‌های مترو وجود ندارد، مسافرانش را یکی‌یکی برمی‌گرداند.",
    dub: true, sub: true, badge: "سریال جدید",
    episodes: [
      { num: "01", title: "ساعت ۱۳:۱۳", dur: "۴۴ دقیقه", progress: 100 },
      { num: "02", title: "مسافر برگشتی", dur: "۴۱ دقیقه", progress: 100 },
      { num: "03", title: "نقشهٔ گم‌شده", dur: "۴۶ دقیقه", progress: 18 },
      { num: "04", title: "تونل بی‌انتها", dur: "۴۳ دقیقه", progress: 0 },
    ],
  },
  {
    id: "hunters", kind: "series", fa: "شکارچیان سایه", en: "SHADOW HUNTERS", year: 1402,
    genres: ["فانتزی", "اکشن"], rating: 8.2, duration: "۱ فصل · ۱۰ قسمت", quality: "4K",
    poster: "/posters/poster-hunters.png",
    stock: "KODAK 5219 · 2.39:1", director: "حمید رستمی",
    cast: ["کاوه شریفی", "صدف رحیمی", "بهرام کیانی"],
    synopsis: "در جنگلی که مه‌اش خاطره‌ها را می‌بلعد، گروهی شکارچی از سایه‌ها محافظت می‌کنند — یا شاید از ما.",
    dub: true, sub: true,
    episodes: [
      { num: "01", title: "مهِ سبز", dur: "۵۶ دقیقه", progress: 100 },
      { num: "02", title: "تیرِ خنجرِ کاج", dur: "۵۲ دقیقه", progress: 0 },
    ],
  },
  {
    id: "train", kind: "series", fa: "قطارِ شب", en: "NIGHT TRAIN", year: 1404,
    genres: ["درام"], rating: 7.9, duration: "۱ فصل · ۸ قسمت", quality: "2K",
    poster: "/posters/poster-train.png",
    stock: "AGFA XTREME 400 · 1.85:1", director: "نگار سلطانی",
    cast: ["شیرین نامجو", "سام مرادخانی"],
    synopsis: "زنی در واگنِ آخرِ قطار شبانه، هر ایستگاه یکی از خاطراتش را پیاده می‌کند.",
    dub: false, sub: true, badge: "مینی‌سریال",
    episodes: [
      { num: "01", title: "واگنِ آخر", dur: "۳۸ دقیقه", progress: 0 },
      { num: "02", title: "ایستگاهِ باران", dur: "۴۱ دقیقه", progress: 0 },
    ],
  },
];

export const CONTINUE: Title[] = [
  {
    id: "c-highway", kind: "film", fa: "شبِ برقی", en: "NEON NIGHT", year: 1402,
    genres: ["نئو-نوآر"], rating: 8.1, duration: "۱ ساعت و ۵۴ دقیقه", quality: "4K",
    poster: "/posters/poster-noir.png", backdrop: "/backdrops/thumb-highway.png",
    stock: "FUJI ETERNA 250D", director: "شهاب رستگار", cast: [],
    synopsis: "", dub: true, sub: true,
    progress: 62, remaining: "۴۲ دقیقه باقی‌مانده",
  },
  {
    id: "c-coldcase", kind: "series", fa: "پروندهٔ سرد", en: "COLD FILE", year: 1403,
    genres: ["جنایی"], rating: 8.9, duration: "قسمت ۲ · فصل ۳", quality: "4K",
    poster: "/posters/poster-coldcase.png", backdrop: "/backdrops/thumb-cinema.png",
    stock: "FUJI ETERNA 500T", director: "آرمان صدر", cast: [],
    synopsis: "", dub: true, sub: true,
    progress: 62, remaining: "۱۸ دقیقه باقی‌مانده",
  },
  {
    id: "c-station", kind: "series", fa: "ایستگاه ۱۳", en: "STATION 13", year: 1404,
    genres: ["علمی‌تخیلی"], rating: 8.4, duration: "قسمت ۳ · فصل ۱", quality: "4K",
    poster: "/posters/poster-station13.png", backdrop: "/backdrops/thumb-aurora.png",
    stock: "KODAK VISION3 500T", director: "کیوان مرادی", cast: [],
    synopsis: "", dub: true, sub: true,
    progress: 18, remaining: "۳۸ دقیقه باقی‌مانده",
  },
  {
    id: "c-cloud", kind: "film", fa: "خانه‌ای روی ابر", en: "HOUSE ABOVE CLOUDS", year: 1403,
    genres: ["درام"], rating: 7.9, duration: "۱ ساعت و ۴۸ دقیقه", quality: "2K",
    poster: "/posters/poster-house.png", backdrop: "/backdrops/thumb-lighthouse.png",
    stock: "KODAK PORTRA 400", director: "مینا اسحاقی", cast: [],
    synopsis: "", dub: false, sub: true,
    progress: 84, remaining: "۱۷ دقیقه باقی‌مانده",
  },
];

export const ALL: Title[] = [...TREND, ...SERIES];

export const GENRE_CHIPS = ["همه", "فیلم", "سریال", "اکشن", "درام", "علمی‌تخیلی", "جنایی", "فانتزی"] as const;

/* fake cast avatars → initials */
export function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("‌");
}
