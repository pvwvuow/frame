/**
 * UI dictionaries. Persian (fa) is the source language; English (en) mirrors
 * every key. Keys are grouped by surface (nav, hero, card, modal, …).
 * Use `t("nav.home")` from `useI18n()` (client) or `getT()` (server).
 * Placeholders use `{name}` syntax → t("card.play", { name }).
 */
export const fa = {
  app: { name: "فریم", tagline: "سینمای آنلاین", desktop: "نسخه‌ی دسکتاپ", metaTitle: "فریم | سینمای آنلاین", metaDesc: "تماشای آنلاین جدیدترین فیلم‌ها و سریال‌ها با کیفیت 4K در فریم" },
  common: {
    movie: "فیلم", series: "سریال", movies: "فیلم‌ها", seriesPlural: "سریال‌ها",
    play: "پخش", resume: "ادامه تماشا", details: "جزئیات", moreDetails: "جزئیات بیشتر", viewDetails: "مشاهده جزئیات",
    close: "بستن", back: "بازگشت", more: "بیشتر", all: "همه", viewAll: "مشاهده همه", new: "جدید", top: "برتر",
    loading: "در حال بارگذاری...", searching: "در حال جستجو...", noResults: "نتیجه‌ای پیدا نشد.",
    minute: "دقیقه", hour: "ساعت", and: "و", episode: "قسمت", episodes: "قسمت", season: "فصل", perEpisode: "هر قسمت",
    remaining: "باقی‌مانده", million: "میلیون", thousand: "هزار", year: "سال", views: "بازدید",
    mute: "بی‌صدا", unmute: "روشن کردن صدا", language: "زبان", persian: "فارسی", english: "English",
    inFavorites: "در علاقه‌مندی‌ها", inYourList: "در لیست شما", rights: "تمامی حقوق محفوظ است.",
    director: "کارگردان", cast: "بازیگران", country: "کشور", genre: "ژانر", rating: "امتیاز", quality: "کیفیت", ageRating: "رده سنی",
  },
  nav: {
    home: "خانه", movies: "فیلم‌ها", series: "سریال‌ها", genres: "ژانرها", collections: "مجموعه‌ها", myList: "لیست من",
    people: "هنرمندان", peopleHint: "کارگردان‌ها و بازیگران", random: "امشب چی ببینم؟", randomHint: "انتخاب شانسی",
    notifications: "اعلان‌ها", notificationsHint: "تازه‌ها و یادآوری‌ها", profile: "پروفایل", more: "بیشتر",
    rankings: "رنکینگ", rankingsHint: "بهترین‌های فیلم و سریال",
    search: "جستجو", searchPlaceholder: "جستجوی فیلم، سریال، بازیگر...", clear: "پاک کردن", allResults: "مشاهده همه نتایج",
    noResultsFor: "نتیجه‌ای برای «{q}» پیدا نشد.", mainNav: "ناوبری اصلی", mobileNav: "ناوبری موبایل",
    switchLanguage: "تغییر زبان", theme: "تم", themeCurrent: "تم فعلی: {name} – تغییر تم",
  },
  theme: { dark: "تیره", darkHint: "سینمایی و کم‌نور", light: "روشن", lightHint: "شفاف و پرنور", system: "خودکار", systemHint: "هماهنگ با سیستم" },
  hero: { featured: "پیشنهاد ویژه", trending: "پرطرفدار", watchNow: "پخش", moreInfo: "جزئیات بیشتر", top10: "برترین‌ها" },
  home: {
    continueTitle: "ادامه تماشا", continueSub: "از همان‌جا که رها کردید",
    queueTitle: "در صف تماشای شما", queueSub: "از لیست من",
    favoritesTitle: "علاقه‌مندی‌های شما", favoritesSub: "قلب‌هایی که زده‌اید",
    trendingTitle: "پرطرفدارترین‌ها", trendingSub: "داغ‌ترین عناوین این هفته",
    newestTitle: "تازه‌ها", newestSub: "جدیدترین اضافه‌شده‌ها",
    topRatedTitle: "برترین‌ها از نگاه کاربران", topRatedSub: "بالاترین امتیازها",
    seriesTitle: "سریال‌های برگزیده", seriesSub: "داستان‌هایی برای شب‌های طولانی",
    thrillerTitle: "هیجان‌انگیز و پرتعلیق", thrillerSub: "نفس‌گیر تا آخرین ثانیه",
    scifiTitle: "علمی‌تخیلی", scifiSub: "فراتر از مرزهای زمان",
    ctaTitle: "امشب چی ببینم؟", ctaSub: "بگذارید فریم برایتان انتخاب کند.", ctaBtn: "انتخاب شانسی",
  },
  card: { details: "جزئیات {name}", play: "پخش {name}" },
  modal: { continueInDetails: "ادامه در صفحه جزئیات", similar: "مشابه‌ها", episodesTeaser: "قسمت‌ها", allEpisodes: "همه قسمت‌ها", reviews: "نقد", yourScore: "امتیاز شما", noEpisodes: "قسمتی ثبت نشده" },
  footer: {
    about: "سینمای آنلاین نما؛ تماشای هزاران فیلم و سریال با کیفیت 4K HDR، بدون تبلیغ، روی همه‌ی دستگاه‌ها. هر شب یک تجربه‌ی سینمایی تازه.",
    categories: "دسته‌بندی‌ها", support: "پشتیبانی", aboutUs: "درباره فریم", faq: "سوالات متداول", contact: "تماس با ما", terms: "قوانین استفاده", privacy: "حریم خصوصی",
    library: "کتابخانه", favorites: "علاقه‌مندی‌ها", history: "تاریخچه تماشا", profileSettings: "پروفایل و تنظیمات", downloadApp: "دانلود برنامه‌ی دسکتاپ",
    settings: "تنظیمات", help: "راهنما", aboutApp: "درباره برنامه",
  },
  user: {
    profile: "پروفایل من", myList: "لیست من", favorites: "علاقه‌مندی‌ها", history: "تاریخچه تماشا", notifications: "اعلان‌ها",
    collections: "مجموعه‌ها", people: "هنرمندان", random: "امشب چی ببینم؟", settings: "تنظیمات", parental: "کنترل والدین",
    shortcuts: "میان‌برها", help: "راهنما", personal: "شخصی", discover: "کشف", support: "پشتیبانی و تنظیمات", theme: "تم", language: "زبان",
    checkUpdate: "بررسی به‌روزرسانی", openMenu: "منوی کاربر", closeMenu: "بستن منو", guest: "کاربر مهمان",
  },
  settings: {
    language: "زبان رابط کاربری", languageHint: "زبان منوها و متن‌های برنامه. نام فیلم‌ها همیشه به هر دو زبان نمایش داده می‌شود.",
    languageChanged: "زبان برنامه تغییر کرد.",
  },
  catalog: { sort: "مرتب‌سازی", filter: "فیلتر", results: "{n} عنوان", empty: "چیزی مطابق فیلترها پیدا نشد.", reset: "حذف فیلترها" },
} as const;

type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]> };
export type Dictionary = DeepStringify<typeof fa>;

export const en: Dictionary = {
  app: { name: "Frame", tagline: "Online Cinema", desktop: "Desktop edition", metaTitle: "Frame | Online Cinema", metaDesc: "Stream the latest movies and series in 4K on Frame" },
  common: {
    movie: "Movie", series: "Series", movies: "Movies", seriesPlural: "Series",
    play: "Play", resume: "Resume", details: "Details", moreDetails: "More info", viewDetails: "View details",
    close: "Close", back: "Back", more: "More", all: "All", viewAll: "View all", new: "New", top: "Top",
    loading: "Loading...", searching: "Searching...", noResults: "No results found.",
    minute: "min", hour: "h", and: "", episode: "Episode", episodes: "episodes", season: "Season", perEpisode: "per episode",
    remaining: "left", million: "M", thousand: "K", year: "Year", views: "views",
    mute: "Mute", unmute: "Unmute", language: "Language", persian: "فارسی", english: "English",
    inFavorites: "In favorites", inYourList: "In your list", rights: "All rights reserved.",
    director: "Director", cast: "Cast", country: "Country", genre: "Genre", rating: "Rating", quality: "Quality", ageRating: "Age rating",
  },
  nav: {
    home: "Home", movies: "Movies", series: "Series", genres: "Genres", collections: "Collections", myList: "My List",
    people: "People", peopleHint: "Directors & actors", random: "What to watch?", randomHint: "Random pick",
    notifications: "Notifications", notificationsHint: "News & reminders", profile: "Profile", more: "More",
    rankings: "Rankings", rankingsHint: "Best movies & series",
    search: "Search", searchPlaceholder: "Search movies, series, people...", clear: "Clear", allResults: "See all results",
    noResultsFor: "No results for “{q}”.", mainNav: "Main navigation", mobileNav: "Mobile navigation",
    switchLanguage: "Switch language", theme: "Theme", themeCurrent: "Current theme: {name} – change theme",
  },
  theme: { dark: "Dark", darkHint: "Cinematic & dim", light: "Light", lightHint: "Bright & clear", system: "Auto", systemHint: "Follow system" },
  hero: { featured: "Featured", trending: "Trending", watchNow: "Play", moreInfo: "More info", top10: "Top picks" },
  home: {
    continueTitle: "Continue watching", continueSub: "Pick up where you left off",
    queueTitle: "Up next for you", queueSub: "From My List",
    favoritesTitle: "Your favorites", favoritesSub: "Titles you've loved",
    trendingTitle: "Trending now", trendingSub: "The hottest titles this week",
    newestTitle: "New arrivals", newestSub: "Latest additions",
    topRatedTitle: "Top rated by viewers", topRatedSub: "Highest scores",
    seriesTitle: "Featured series", seriesSub: "Stories for long nights",
    thrillerTitle: "Thrillers & suspense", thrillerSub: "Breathless until the last second",
    scifiTitle: "Science fiction", scifiSub: "Beyond the edges of time",
    ctaTitle: "What should I watch tonight?", ctaSub: "Let Frame pick for you.", ctaBtn: "Surprise me",
  },
  card: { details: "Details of {name}", play: "Play {name}" },
  modal: { continueInDetails: "Open full details", similar: "More like this", episodesTeaser: "Episodes", allEpisodes: "All episodes", reviews: "reviews", yourScore: "Your score", noEpisodes: "No episodes yet" },
  footer: {
    about: "Frame online cinema — thousands of movies and series in 4K HDR, ad-free, on every device. A fresh cinematic experience every night.",
    categories: "Browse", support: "Support", aboutUs: "About Frame", faq: "FAQ", contact: "Contact", terms: "Terms of use", privacy: "Privacy",
    library: "Library", favorites: "Favorites", history: "Watch history", profileSettings: "Profile & settings", downloadApp: "Download desktop app",
    settings: "Settings", help: "Help", aboutApp: "About",
  },
  user: {
    profile: "My profile", myList: "My List", favorites: "Favorites", history: "Watch history", notifications: "Notifications",
    collections: "Collections", people: "People", random: "What to watch?", settings: "Settings", parental: "Parental controls",
    shortcuts: "Shortcuts", help: "Help", personal: "Personal", discover: "Discover", support: "Support & settings", theme: "Theme", language: "Language",
    checkUpdate: "Check for updates", openMenu: "User menu", closeMenu: "Close menu", guest: "Guest",
  },
  settings: {
    language: "Interface language", languageHint: "Language of menus and app text. Title names are always shown in both languages.",
    languageChanged: "Language updated.",
  },
  catalog: { sort: "Sort", filter: "Filter", results: "{n} titles", empty: "Nothing matches your filters.", reset: "Reset filters" },
};

export const dictionaries = { fa, en } as const;
