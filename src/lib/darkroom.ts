/**
 * Darkroom (تاریکخانه) — share-card generator domain types & tables.
 * Client-safe: no server imports (jalali.ts is dependency-free math).
 * Seven structures × two formats (post 1080×1080 / story 1080×1920).
 */
import { g2j } from "@/lib/jalali";

export type DrFormat = "post" | "story";
export type DrTemplateId = "spotlight" | "strip" | "type" | "split" | "journal" | "ticket" | "slate" | "framed";
export type DrLang = "fa" | "en";

export const DR_FORMATS: { id: DrFormat; w: number; h: number }[] = [
  { id: "post", w: 1080, h: 1080 },
  { id: "story", w: 1080, h: 1920 },
];

export const DR_TEMPLATES: { id: DrTemplateId; fa: string; en: string }[] = [
  { id: "spotlight", fa: "اسپات‌لایت", en: "Spotlight" },
  { id: "strip", fa: "نوار فیلم", en: "Strip" },
  { id: "type", fa: "پوستر تایپی", en: "Type Poster" },
  { id: "split", fa: "دوپاره", en: "Split" },
  { id: "journal", fa: "مجله", en: "Journal" },
  { id: "ticket", fa: "بلیت", en: "Ticket" },
  { id: "slate", fa: "کلاپر", en: "Slate" },
  { id: "framed", fa: "قاب", en: "Framed" },
];

/** One pickable title, serialized from the server page or the search API. */
export type DrTitle = {
  id: number;
  slug: string;
  title: string;
  titleEn: string;
  type: string; // movie | series
  year: number;
  genres: string[];
  poster: string;
  backdrop: string;
  duration: number; // minutes
  director: string;
  country: string;
  rating: number; // global score /10
  myScore: number | null;
  /** ISO date of the latest rating/watch activity — default «زمان تماشا» */
  when: string | null;
};

/* ------------------------------------------------------------------ */
/* Genre FA → EN (covers every genre that appears in the catalog)      */
/* ------------------------------------------------------------------ */
export const GENRE_EN: Record<string, string> = {
  "اکشن": "Action",
  "درام": "Drama",
  "کمدی": "Comedy",
  "هیجان‌انگیز": "Thriller",
  "هیجان انگیز": "Thriller",
  "جنایی": "Crime",
  "علمی‌تخیلی": "Sci-Fi",
  "علمی تخیلی": "Sci-Fi",
  "ترسناک": "Horror",
  "عاشقانه": "Romance",
  "ماجراجویی": "Adventure",
  "معمایی": "Mystery",
  "تاریخی": "History",
  "جنگی": "War",
  "حماسی": "Epic",
  "نوآر": "Film-Noir",
  "خانوادگی": "Family",
  "انیمیشن": "Animation",
  "فانتزی": "Fantasy",
  "زندگینامه": "Biography",
  "موسیقی": "Music",
  "موزیکال": "Musical",
  "ورزشی": "Sport",
  "مستند": "Documentary",
  "وسترن": "Western",
  "رئالیتی": "Reality",
  "کوتاه": "Short",
  "مسابقه‌ای": "Game-Show",
  "مسابقه ای": "Game-Show",
  "گفت‌وگو": "Talk-Show",
  "گفت وگو": "Talk-Show",
  "خبری": "News",
  "—": "",
};

export function genresOf(t: DrTitle, lang: DrLang): string[] {
  const list = t.genres.filter((g) => g && g !== "—");
  if (lang === "en") {
    const en = list.map((g) => GENRE_EN[g] ?? "").filter(Boolean);
    return en.length ? en.slice(0, 3) : list.slice(0, 3);
  }
  return list.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Dates — Jalali for fa, English months for en                        */
/* ------------------------------------------------------------------ */
export const EN_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const EN_MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type DrWhen = { gy: number; gm: number }; // gregorian month anchor

/** Jalali month/year labels for a gregorian anchor (uses lib/jalali math). */
export function whenLabels(when: DrWhen) {
  const { jy, jm } = g2j(when.gy, when.gm, 1);
  return {
    fa: `${JMONTHS_FA[jm - 1]} ${faDigits(jy)}`,
    faMonth: JMONTHS_FA[jm - 1],
    faYear: jy,
    en: `${EN_MONTHS[when.gm - 1]} ${when.gy}`,
    enMonth: EN_MONTHS[when.gm - 1],
    enYear: when.gy,
  };
}

export const JMONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export function faDigits(v: string | number): string {
  return String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/* ------------------------------------------------------------------ */
/* Score helpers                                                       */
/* ------------------------------------------------------------------ */
/** 9 → "9.0" (the editorial look used by the cards). */
export function scoreText(score: number): string {
  return `${Math.round(score)}.0`;
}

/** score/2 → five stars with a half at .5 → returns filled cells ×2. */
export function starUnits(score: number): number {
  return Math.round((score / 2) * 2); // halves kept, i.e. integer half-units
}

export function durationLabel(minutes: number, lang: DrLang): string {
  if (!minutes) return "";
  return lang === "en" ? `${minutes} MIN` : `${faDigits(minutes)} دقیقه`;
}

/* ------------------------------------------------------------------ */
/* The full card payload (generator state → renderer)                  */
/* ------------------------------------------------------------------ */
export type DrCardData = {
  title: DrTitle;
  tpl: DrTemplateId;
  fmt: DrFormat;
  lang: DrLang;
  /** 1..10 personal score */
  score: number;
  comment: string;
  finalWords: string;
  handle: string;
  when: DrWhen;
  showLogo: boolean;
  /** editorial serial "NO. 07" derived from the title id */
  no: string;
  userInitial: string;
  avatarGrad: string;
  /** uploaded avatar (data URL) — null = gradient + initial */
  avatarImage: string | null;
};

/* ------------------------------------------------------------------ */
/* Shared palette of the editorial card system                         */
/* ------------------------------------------------------------------ */
export const DR_INK = "#0a0a0c";
export const DR_PANEL = "#0e0e11";
export const DR_PAPER = "#f4f2ec";
export const DR_RED = "#e50914";
export const DR_GOLD = "#f5b81b";

export const drMute = (a = 0.62) => `rgba(244,242,236,${a})`;
export const drFaint = (a = 0.4) => `rgba(244,242,236,${a})`;
export const drLine = (a = 0.14) => `rgba(255,255,255,${a})`;
