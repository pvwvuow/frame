/* ------------------------------------------------------------------ */
/*  Jalali (Persian) calendar math — no dependencies                   */
/*  Standard algorithm (Birashk / jalaali-js compatible)               */
/* ------------------------------------------------------------------ */

export const JMONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند"];
export const JWEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"]; // Saturday-first

function div(a: number, b: number) {
  return ~~(a / b);
}

export function g2j(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function j2g(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let days =
    355666 +
    365 * jy +
    div(jy + 3, 4) -
    div(jy + 99, 100) +
    div(jy + 399, 400) +
    (jm <= 6 ? 31 * (jm - 1) : 186 + 30 * (jm - 7)) +
    jd -
    1;
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

export function jMonthLen(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // esfand: 30 in leap years (jy%33 in leap set), else 29
  const leaps = [1, 5, 9, 13, 17, 22, 26, 30];
  return leaps.includes(jy % 33) ? 30 : 29;
}

/** Day-of-week (0=Saturday … 6=Friday) of a jalali date. */
export function jWeekday(jy: number, jm: number, jd: number): number {
  const { gy, gm, gd } = j2g(jy, jm, jd);
  const d = new Date(gy, gm - 1, gd).getDay(); // 0=Sunday
  return (d + 1) % 7; // 0=Saturday
}

/** ISO date (yyyy-mm-dd, local) for a jalali date. */
export function jToISO(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = j2g(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/** Jalali grid for a month: array of {iso, jd, inMonth} starting Saturday. */
export function jMonthGrid(jy: number, jm: number) {
  const len = jMonthLen(jy, jm);
  const firstWd = jWeekday(jy, jm, 1);
  const cells: { iso: string; jd: number; inMonth: boolean }[] = [];
  // previous month fill
  const prevLen = jMonthLen(jm === 1 ? jy - 1 : jy, jm === 1 ? 12 : jm - 1);
  for (let i = firstWd - 1; i >= 0; i--) {
    const d = prevLen - i;
    cells.push({ iso: jToISO(jm === 1 ? jy - 1 : jy, jm === 1 ? 12 : jm - 1, d), jd: d, inMonth: false });
  }
  for (let d = 1; d <= len; d++) cells.push({ iso: jToISO(jy, jm, d), jd: d, inMonth: true });
  while (cells.length % 7 !== 0) {
    const nm = jm === 12 ? 1 : jm + 1;
    const ny = jm === 12 ? jy + 1 : jy;
    const d = cells.length - firstWd - len + 1;
    cells.push({ iso: jToISO(ny, nm, d), jd: d, inMonth: false });
  }
  return cells;
}

export function todayJ(): { jy: number; jm: number; jd: number } {
  const n = new Date();
  return g2j(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** "امروز"، "فردا"، یا «۱۲ مهر» */
export function jDayLabel(iso: string): string {
  const today = todayJ();
  const { jy, jm, jd } = jToJ(iso);
  if (jy === today.jy && jm === today.jm && jd === today.jd) return "امروز";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const t2 = g2j(tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate());
  if (jy === t2.jy && jm === t2.jm && jd === t2.jd) return "فردا";
  return `${jd} ${JMONTHS[jm - 1]}`;
}

function jToJ(iso: string) {
  const [gy, gm, gd] = iso.split("-").map(Number);
  return g2j(gy, gm, gd);
}
