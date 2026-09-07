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
  /* g2j بالا درست و اکیداً یکنواست؛ روزِ میلادیِ متناظر را باینری‌جستجو می‌کنیم —
     روی «شماره‌ی روزِ صحیح» نه میلی‌ثانیه، تا نیم‌روزِ وسطِ جستجو مسیر را منحرف نکند.
     (فرمول بسته‌ی قبلی ~۱۰۰۰ سال خطا داشت و تقویمِ «لیست من» هرگز رویداد نمی‌گرفت.) */
  const target = jy * 10000 + jm * 100 + jd;
  // سال شمسی jy ≈ مارسِ (jy+621) میلادی؛ بازه سخاوتمندانه در واحدهی روز:
  let lo = Math.floor(Date.UTC(jy + 620, 0, 1) / 86400000);
  let hi = Math.floor(Date.UTC(jy + 622, 11, 31) / 86400000);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const d = new Date(mid * 86400000);
    const j = g2j(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const v = j.jy * 10000 + j.jm * 100 + j.jd;
    if (v === target) return { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
  }
  // برای تاریخ معتبر نباید رخ دهد — fallback امن (نزدیکِ ابتدای سال)
  const d = new Date(Date.UTC(jy + 621, 2, 21));
  return { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
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
