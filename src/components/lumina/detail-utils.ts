/* shared tiny helpers for the detail sheet */

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toFa(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

/** first letters of a Persian name → 2-char initial */
export function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("");
}
