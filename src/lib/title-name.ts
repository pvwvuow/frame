import { getActiveLocale, type Locale } from "@/lib/i18n";

type Named = { title: string; titleEn: string; country?: string | null };

const IRAN = /^(ایران|iran)$/i;
const HAS_LATIN = /[A-Za-z]/;

/** True when the production is not Iranian, i.e. its original title is the English one. */
export function isForeign(t: Named) {
  return !!t.country && !IRAN.test(t.country.trim());
}

export type TitleNames = {
  /** Main display name in its natural script. */
  primary: string;
  primaryDir: "rtl" | "ltr";
  /** Small companion name in the other language (may be empty). */
  secondary: string;
  secondaryDir: "rtl" | "ltr";
  /** Accessible full label: "Primary (Secondary)". */
  label: string;
};

/**
 * Bilingual naming rules:
 *  • English-language productions → English title first, Persian title small next to it.
 *  • Persian productions in the Persian UI → Persian first, English small.
 *  • Persian productions in the English UI → English first, Persian small.
 */
export function titleNames(t: Named, locale: Locale = getActiveLocale()): TitleNames {
  const en = (t.titleEn || "").trim();
  const faName = (t.title || "").trim();
  const englishFirst = isForeign(t) || locale === "en";
  const primary = englishFirst ? en || faName : faName || en;
  const secondary = englishFirst ? (faName !== primary ? faName : "") : en !== primary ? en : "";
  const dirFor = (s: string): "rtl" | "ltr" => (HAS_LATIN.test(s) && !/[\u0600-\u06FF]/.test(s) ? "ltr" : "rtl");
  return {
    primary,
    primaryDir: dirFor(primary),
    secondary,
    secondaryDir: dirFor(secondary),
    label: secondary ? `${primary} (${secondary})` : primary,
  };
}
