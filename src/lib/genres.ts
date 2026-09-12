import type { Locale } from "@/lib/i18n";

/* v0.30.10 — the catalog's genres are stored in the DB as PERSIAN strings
 * (JSON arrays on every title). In English mode the raw Persian leaked
 * into every genre chip, the catalog heading, card captions and the hero
 * meta line — the user flagged the mixed-language UI. This map covers the
 * curated GENRES list plus the extra genres that appear in title data;
 * unknown strings fall back to the raw value (better a Persian word than
 * a broken label). Keys must match the DB bytes EXACTLY (ZWNJ included). */
const FA_TO_EN: Record<string, string> = {
  "اکشن": "Action",
  "درام": "Drama",
  "کمدی": "Comedy",
  "هیجان‌انگیز": "Thriller",
  "جنایی": "Crime",
  "علمی‌تخیلی": "Sci-Fi",
  "ترسناک": "Horror",
  "عاشقانه": "Romance",
  "ماجراجویی": "Adventure",
  "معمایی": "Mystery",
  "تاریخی": "History",
  "جنگی": "War",
  "حماسی": "Epic",
  "نوآر": "Film Noir",
  "انیمیشن": "Animation",
  "خانوادگی": "Family",
  "فانتزی": "Fantasy",
  "مستند": "Documentary",
  "بیوگرافی": "Biography",
  "موسیقی": "Music",
  "ورزشی": "Sport",
  "کوتاه": "Short",
  "وسترن": "Western",
  "رازآلود": "Mystery",
  "پرهیجان": "Thriller",
};

/** Display label for a stored genre in the active UI language. */
export function genreLabel(genre: string, locale: Locale): string {
  if (locale !== "en") return genre;
  return FA_TO_EN[genre] ?? genre;
}

/** Map a whole genre array for one-line meta displays ("Action · Drama"). */
export function genreListLabel(genres: string[], locale: Locale, sep = " · "): string {
  return genres.map((g) => genreLabel(g, locale)).join(sep);
}
