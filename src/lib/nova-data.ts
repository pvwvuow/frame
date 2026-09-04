export type Quality = "4K" | "1080p" | "720p";

export interface MediaItem {
  id: string;
  title: string;
  titleEn: string;
  type: "movie" | "series";
  year: number;
  genres: string[];
  rating: number;
  duration: string;
  quality: Quality[];
  poster: string;
  backdrop?: string;
  description: string;
  director: string;
  cast: string[];
  sizeGb: Record<string, number>;
  ageRating: string;
  featured?: boolean;
}

export const MOVIES: MediaItem[] = [
  {
    id: "galaxy-empire",
    title: "امپراتوری کهکشان",
    titleEn: "Galaxy Empire",
    type: "movie",
    year: 2025,
    genres: ["علمی-تخیلی", "اکشن", "فضایی"],
    rating: 8.7,
    duration: "۲ ساعت و ۲۸ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/galaxy-empire.png",
    backdrop: "/backdrops/hero-galaxy.png",
    description:
      "در آستانه فروپاشی کهکشان، ناخدای جوانی فرماندهی آخرین ناوگان بشریت را بر عهده می‌گیرد تا در برابر امپراتوری تاریک بایستد. نبردی حماسی که سرنوشت هزار سیاره را رقم می‌زند.",
    director: "آرمان رستمی",
    cast: ["آرمان رستمی", "لیلا فرهمند", "بابک کیانی", "سارا مهدوی"],
    sizeGb: { "4K": 14.2, "1080p": 4.8, "720p": 2.1 },
    ageRating: "+۱۳",
    featured: true,
  },
  {
    id: "ash-city",
    title: "شهر خاکستر",
    titleEn: "Ash City",
    type: "movie",
    year: 2024,
    genres: ["نئو-نوآر", "معمایی", "هیجان‌انگیز"],
    rating: 8.2,
    duration: "۲ ساعت و ۲ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/ash-city.png",
    backdrop: "/backdrops/hero-noir.png",
    description:
      "کارآگاهی خسته در شهری بارانی پرونده قتل‌های زنجیره‌ای مرموز را پیگیری می‌کند؛ پرونده‌ای که او را به اعماق فساد و خاطرات فراموش‌شده خودش می‌کشاند.",
    director: "کاوه صادقی",
    cast: ["کاوه صادقی", "مینا رحیمی", "نیما شریفی"],
    sizeGb: { "4K": 12.6, "1080p": 4.2, "720p": 1.9 },
    ageRating: "+۱۶",
    featured: true,
  },
  {
    id: "last-guardian",
    title: "آخرین نگهبان",
    titleEn: "The Last Guardian",
    type: "movie",
    year: 2025,
    genres: ["فانتزی", "ماجراجویی", "حماسی"],
    rating: 8.9,
    duration: "۲ ساعت و ۳۶ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/last-guardian.png",
    description:
      "آخرین عضو فرقه نگهبانان باستانی باید شمشیر افسانه‌ای را از دل کوهستان قدیمی بیرون بکشد تا دروازه‌های تاریکی برای همیشه بسته شوند؛ سفری پر از اژدها، راز و فداکاری.",
    director: "شهرام علی‌پور",
    cast: ["شهرام علی‌پور", "پرنیان اکبری", "رضا توکلی"],
    sizeGb: { "4K": 15.1, "1080p": 5.1, "720p": 2.3 },
    ageRating: "+۱۳",
  },
  {
    id: "red-storm",
    title: "طوفان قرمز",
    titleEn: "Red Storm",
    type: "movie",
    year: 2023,
    genres: ["جنگی", "اکشن", "تاریخی"],
    rating: 7.8,
    duration: "۲ ساعت و ۱۱ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/red-storm.png",
    description:
      "گروهی از سربازان در دل توفانی شن‌گرفته باید از یک پایگاه استراتژیک دفاع کنند؛ روایتی واقعی از شجاعت، برادری و امید در سخت‌ترین شرایط ممکن.",
    director: "مهدی جلالی",
    cast: ["مهدی جلالی", "بابک کیانی", "حسین قره‌باغی"],
    sizeGb: { "1080p": 4.5, "720p": 2.0 },
    ageRating: "+۱۶",
  },
  {
    id: "old-scar",
    title: "زخم کهنه",
    titleEn: "Old Scar",
    type: "movie",
    year: 2024,
    genres: ["درام", "خانوادگی"],
    rating: 8.4,
    duration: "۱ ساعت و ۵۲ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/old-scar.png",
    description:
      "پدری سال‌ها پس از جدایی، برای دیدن دخترش سفری به سرزمین مادری می‌رود؛ سفری ملایم و دردناک برای ترمیم زخمی کهنه که هرگز التيام نیافته بود.",
    director: "لیلا فرهمند",
    cast: ["لیلا فرهمند", "اکبر هاشمی", "شبنم رستمی"],
    sizeGb: { "1080p": 3.8, "720p": 1.7 },
    ageRating: "همه",
  },
  {
    id: "code-zero",
    title: "کد صفر",
    titleEn: "Code Zero",
    type: "movie",
    year: 2025,
    genres: ["سایبرپانک", "هیجان‌انگیز", "مهیج"],
    rating: 8.6,
    duration: "۲ ساعت و ۷ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/code-zero.png",
    description:
      "هکری نابغه کدی پیدا می‌کند که می‌تواند واقعیت را بازنویسی کند؛ اما هر بار اجرای آن، چیزی از انسانیتش را پاک می‌کند. مسابقه‌ای با زمان برای نجات ذهن خودش.",
    director: "نیما شریفی",
    cast: ["نیما شریفی", "سارا مهدوی", "فرزاد نیک‌پور"],
    sizeGb: { "4K": 13.4, "1080p": 4.6, "720p": 2.0 },
    ageRating: "+۱۶",
  },
  {
    id: "silent-forest",
    title: "جنگل بی‌صدا",
    titleEn: "Silent Forest",
    type: "movie",
    year: 2024,
    genres: ["ترسناک", "معمایی"],
    rating: 7.2,
    duration: "۱ ساعت و ۳۸ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/silent-forest.png",
    description:
      "پنج دوست برای کمپ به جنگلی دورافتاده می‌روند؛ جایی که هر صدایی خاموش می‌شود و هرگز پاسخی نمی‌شنوید. آنچه در مه پنهان است، منتظر آن‌هاست.",
    director: "فرزاد نیک‌پور",
    cast: ["فرزاد نیک‌پور", "پرنیان اکبری", "آرش مقدم"],
    sizeGb: { "1080p": 3.4, "720p": 1.5 },
    ageRating: "+۱۸",
  },
  {
    id: "big-heist",
    title: "سرقت بزرگ",
    titleEn: "The Big Heist",
    type: "movie",
    year: 2025,
    genres: ["جنایی", "کمدی سیاه"],
    rating: 8.1,
    duration: "۱ ساعت و ۵۸ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/big-heist.png",
    description:
      "چهار دوست قدیمی برای نجات خانه‌ی سالمندانشان تصمیم می‌گیرند بزرگ‌ترین سرقت تاریخ را انجام دهند؛ نقشه‌ای پرهیجان، پرمخاطره و البته فوق‌العاده مضحک.",
    director: "بابک کیانی",
    cast: ["بابک کیانی", "اکبر هاشمی", "مینا رحیمی", "آرش مقدم"],
    sizeGb: { "4K": 11.8, "1080p": 4.0, "720p": 1.8 },
    ageRating: "+۱۳",
  },
  {
    id: "frozen-heart",
    title: "قلب یخی",
    titleEn: "Frozen Heart",
    type: "movie",
    year: 2023,
    genres: ["عاشقانه", "درام"],
    rating: 7.9,
    duration: "۱ ساعت و ۴۴ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/frozen-heart.png",
    description:
      "دو غریبه در شهری یخ‌زده زیر شفق قطبی همدیگر را می‌یابند؛ عشقی که باید بیاموزد در سرما ریشه بزند یا پیش از بهار آب شود.",
    director: "شبنم رستمی",
    cast: ["شبنم رستمی", "حسین قره‌باغی"],
    sizeGb: { "1080p": 3.6, "720p": 1.6 },
    ageRating: "+۱۳",
  },
  {
    id: "beyond",
    title: "ماوراء",
    titleEn: "Beyond",
    type: "movie",
    year: 2025,
    genres: ["معمایی", "علمی-تخیلی", "سورئال"],
    rating: 8.8,
    duration: "۲ ساعت و ۱۹ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/beyond.png",
    description:
      "مسافری تنها در جاده‌ای متروک با مونولیتی شناور روبه‌رو می‌شود که در را به دنیایی موازی باز می‌کند؛ جایی که هر پاسخ، پرسشی تازه می‌آفریند.",
    director: "آرمان رستمی",
    cast: ["آرمان رستمی", "مینا رحیمی"],
    sizeGb: { "4K": 14.8, "1080p": 4.9, "720p": 2.2 },
    ageRating: "+۱۶",
  },
  {
    id: "desert-king",
    title: "پادشاه صحرا",
    titleEn: "Desert King",
    type: "movie",
    year: 2024,
    genres: ["تاریخی", "حماسی", "اکشن"],
    rating: 8.5,
    duration: "۲ ساعت و ۴۲ دقیقه",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/desert-king.png",
    backdrop: "/backdrops/hero-desert.png",
    description:
      "روایتی حماسی از برخاستن پادشاهی از میان تپه‌های طلایی؛ مردی که با شمشیر و خرد، قبایل پراکنده را زیر یک پرچم متحد کرد.",
    director: "شهرام علی‌پور",
    cast: ["شهرام علی‌پور", "رضا توکلی", "حسین قره‌باغی", "پرنیان اکبری"],
    sizeGb: { "4K": 15.6, "1080p": 5.3, "720p": 2.4 },
    ageRating: "+۱۶",
    featured: true,
  },
  {
    id: "final-race",
    title: "مسابقه نهایی",
    titleEn: "Final Race",
    type: "movie",
    year: 2023,
    genres: ["اکشن", "مسابقه‌ای"],
    rating: 7.4,
    duration: "۱ ساعت و ۴۹ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/final-race.png",
    description:
      "راننده‌ای بازنشسته برای نجات گاراژ خانوادگی باید در خطرناک‌ترین مسابقه‌ی خیابانی شهر شرکت کند؛ جایی که سرعت، تنها قانون است.",
    director: "مهدی جلالی",
    cast: ["مهدی جلالی", "آرش مقدم", "فرزاد نیک‌پور"],
    sizeGb: { "1080p": 3.9, "720p": 1.7 },
    ageRating: "+۱۳",
  },
  {
    id: "purgatory",
    title: "برزخ",
    titleEn: "Purgatory",
    type: "movie",
    year: 2024,
    genres: ["ترسناک", "فراطبیعی"],
    rating: 7.6,
    duration: "۱ ساعت و ۴۱ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/purgatory.png",
    description:
      "نگهبان شب یک بیمارستان متروکه متوجه می‌شود راهروهای آن میان گذشته و حال گیر افتاده‌اند؛ و چیزهایی که در آنجا مانده‌اند، می‌خواهند او هم بماند.",
    director: "فرزاد نیک‌پور",
    cast: ["فرزاد نیک‌پور", "شبنم رستمی"],
    sizeGb: { "1080p": 3.5, "720p": 1.5 },
    ageRating: "+۱۸",
  },
  {
    id: "dark-alley",
    title: "کوچه سیاه",
    titleEn: "Dark Alley",
    type: "movie",
    year: 2022,
    genres: ["جنایی", "نوآر"],
    rating: 8.0,
    duration: "۱ ساعت و ۵۶ دقیقه",
    quality: ["1080p", "720p"],
    poster: "/posters/dark-alley.png",
    description:
      "دهه‌ی پنجاه؛ کارآگاهی با گذشته‌ای تاریک در تاریک‌ترین کوچه‌های شهر دنبال قاچاقچی‌ای می‌گردد که هرکس او را دیده، دیگر حرفی نزده است.",
    director: "کاوه صادقی",
    cast: ["کاوه صادقی", "اکبر هاشمی", "مینا رحیمی"],
    sizeGb: { "1080p": 4.1, "720p": 1.8 },
    ageRating: "+۱۶",
  },
];

export const SERIES: MediaItem[] = [
  {
    id: "tehran-nights",
    title: "شب‌های تهران",
    titleEn: "Tehran Nights",
    type: "series",
    year: 2025,
    genres: ["درام", "خانوادگی", "اجتماعی"],
    rating: 9.1,
    duration: "۲ فصل • ۱۶ قسمت",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/tehran-nights.png",
    description:
      "سه خانواده در محله‌ای قدیمی تهران؛ زندگی‌شان مثل شبکه‌ای از نورهای شهر به هم گره خورده است. روایتی گرم و تلخ از عشق، خیانت و امید در شب‌های بزرگ‌ترین شهر ایران.",
    director: "لیلا فرهمند",
    cast: ["لیلا فرهمند", "شهرام علی‌پور", "شبنم رستمی", "اکبر هاشمی"],
    sizeGb: { "4K": 1.8, "1080p": 0.62, "720p": 0.28 },
    ageRating: "+۱۳",
    featured: true,
  },
  {
    id: "double-agent",
    title: "مأمور دو چهره",
    titleEn: "Double Agent",
    type: "series",
    year: 2024,
    genres: ["جاسوسی", "هیجان‌انگیز", "سیاسی"],
    rating: 8.7,
    duration: "۳ فصل • ۲۴ قسمت",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/double-agent.png",
    description:
      "جاسوسی دوجانبه که سال‌هاست در دو سازمان موازی زندگی می‌کند، این‌بار باید بین وفاداری به خانواده‌اش و وظیفه‌ای که هرگز نخواست، انتخاب کند. هر قسمت، یک نوبت شطرنج مرگبار.",
    director: "کاوه صادقی",
    cast: ["کاوه صادقی", "سارا مهدوی", "نیما شریفی", "رضا توکلی"],
    sizeGb: { "4K": 1.7, "1080p": 0.58, "720p": 0.26 },
    ageRating: "+۱۶",
  },
  {
    id: "echo",
    title: "پژواک",
    titleEn: "Echo",
    type: "series",
    year: 2025,
    genres: ["علمی-تخیلی", "معمایی"],
    rating: 8.3,
    duration: "۱ فصل • ۸ قسمت",
    quality: ["4K", "1080p", "720p"],
    poster: "/posters/echo.png",
    description:
      "گروهی از دانشمندان صدایی از اعماق زمین ضبط می‌کنند که دقیقاً یک روز بعد اتفاق‌های آینده را می‌گوید؛ تا اینکه یک شب، صدا نام یکی از خودشان را زمزمه می‌کند.",
    director: "نیما شریفی",
    cast: ["نیما شریفی", "پرنیان اکبری", "بابک کیانی"],
    sizeGb: { "4K": 1.6, "1080p": 0.55, "720p": 0.24 },
    ageRating: "+۱۶",
  },
];

export const ALL_ITEMS: MediaItem[] = [...MOVIES, ...SERIES];

export const getById = (id: string) => ALL_ITEMS.find((i) => i.id === id);

export interface WatchProgress {
  id: string;
  percent: number;
  episode?: string;
  remaining: string;
}

export const CONTINUE_WATCHING: WatchProgress[] = [
  { id: "galaxy-empire", percent: 45, remaining: "۸۱ دقیقه باقی‌مانده" },
  { id: "tehran-nights", percent: 62, episode: "فصل ۲ • قسمت ۶", remaining: "۲۴ دقیقه باقی‌مانده" },
  { id: "code-zero", percent: 18, remaining: "۱ ساعت و ۴۴ دقیقه باقی‌مانده" },
  { id: "desert-king", percent: 81, remaining: "۳۱ دقیقه باقی‌مانده" },
];

export const GENRES = [
  "همه",
  "اکشن",
  "درام",
  "علمی-تخیلی",
  "ترسناک",
  "جنایی",
  "فانتزی",
  "عاشقانه",
  "تاریخی",
  "معمایی",
  "کمدی",
];

export interface DownloadTask {
  id: string;
  itemId: string;
  quality: Quality;
  label: string;
  percent: number;
  speed: number; // MB/s
  status: "active" | "paused" | "done";
}

export const INITIAL_DOWNLOADS: DownloadTask[] = [
  { id: "d1", itemId: "last-guardian", quality: "1080p", label: "آخرین نگهبان", percent: 62, speed: 12.4, status: "active" },
  { id: "d2", itemId: "tehran-nights", quality: "1080p", label: "شب‌های تهران — فصل ۲ قسمت ۷", percent: 34, speed: 8.1, status: "active" },
  { id: "d3", itemId: "code-zero", quality: "4K", label: "کد صفر", percent: 88, speed: 0, status: "paused" },
  { id: "d4", itemId: "big-heist", quality: "1080p", label: "سرقت بزرگ", percent: 100, speed: 0, status: "done" },
];

export const faNum = (n: number | string): string =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
