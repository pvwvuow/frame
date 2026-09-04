/* small shared helpers for the LUMINA skin */

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert latin digits inside a string/number to Persian digits */
export function toFa(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

/** pad a number to 2 latin digits (for rank numerals — kept LTR) */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** seconds → "1:12:04" mono timecode */
export function hms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}
