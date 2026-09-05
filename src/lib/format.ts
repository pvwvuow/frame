import { getActiveLocale, t } from "@/lib/i18n";

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Persian digits when the UI is Persian, Western digits otherwise. */
export function fa(n: number | string): string {
  const s = String(n);
  if (getActiveLocale() !== "fa") return s;
  return s.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Always Persian digits (for content that is intrinsically Persian). */
export function faDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (getActiveLocale() === "en") {
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m} min`;
  }
  if (h && m) return `${fa(h)} ${t("common.hour")} ${t("common.and")} ${fa(m)} ${t("common.minute")}`;
  if (h) return `${fa(h)} ${t("common.hour")}`;
  return `${fa(m)} ${t("common.minute")}`;
}

export function formatViews(v: number): string {
  const en = getActiveLocale() === "en";
  if (v >= 1_000_000) return en ? `${(v / 1_000_000).toFixed(1)}M` : `${fa((v / 1_000_000).toFixed(1))} ${t("common.million")}`;
  if (v >= 1_000) return en ? `${Math.round(v / 1000)}K` : `${fa(Math.round(v / 1000))} ${t("common.thousand")}`;
  return fa(v);
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function typeLabel(type: string) {
  return type === "series" ? t("common.series") : t("common.movie");
}

/** "Season 2 · Episode 4" in the active language. */
export function episodeLabel(season: number, number: number) {
  return `${t("common.season")} ${fa(season)} ${getActiveLocale() === "en" ? "·" : ""} ${t("common.episode")} ${fa(number)}`.replace(/\s+/g, " ");
}
