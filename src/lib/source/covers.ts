import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import path from "path";
import { hash8 } from "./parser";

/**
 * تولید کاور (پوستر کوچک 2:3 و بک‌دراپ بزرگ 16:9) برای عناوینی که در منبع تصویر ندارند.
 * خروجی SVG سبک (چند KB) با گرادیان قطعی بر اساس نام اثر؛ بدون هیچ وابستگی خارجی.
 */

/** پالت‌های هماهنگ با تم تیره/قرمز برنامه */
const PALETTES: Array<{ from: string; to: string; glow: string }> = [
  { from: "#3b0d12", to: "#12060a", glow: "#e50914" },
  { from: "#0d1f3b", to: "#060a12", glow: "#3b82f6" },
  { from: "#251a3b", to: "#0c0713", glow: "#a855f7" },
  { from: "#0f2e26", to: "#06110d", glow: "#10b981" },
  { from: "#3b2a0d", to: "#120d06", glow: "#f59e0b" },
  { from: "#33120f", to: "#120706", glow: "#f97316" },
  { from: "#101d33", to: "#070b13", glow: "#38bdf8" },
  { from: "#2b0f26", to: "#0e0610", glow: "#ec4899" },
];

export function paletteFor(key: string) {
  const h = parseInt(hash8(key).slice(0, 4), 36) % PALETTES.length;
  return PALETTES[h];
}

export function coversDir(): string {
  return process.env.COVERS_DIR || path.join(process.cwd(), "public", "covers");
}

/** اولین کاراکتر قابل نمایش از نام (برای حرف بزرگ روی کاور) */
function initialOf(title: string): string {
  const t = title.replace(/[\s._\-–—:|]+/g, " ").trim();
  const ch = Array.from(t)[0] || "ن";
  return ch.toUpperCase();
}

function artSvg(title: string, wide: boolean): string {
  const p = paletteFor(title);
  const W = wide ? 1280 : 342;
  const H = wide ? 720 : 513;
  const ini = initialOf(title);
  const esc = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fs = wide ? 380 : 190;
  const cx = W / 2;
  const cy = wide ? H / 2 + 30 : H / 2 - 20;
  const tSize = wide ? 44 : 26;
  const tY = H - (wide ? 64 : 52);
  // الگوی نقطه‌های محو برای بافت
  const dots = Array.from({ length: 24 }, (_, i) => {
    const dx = ((i * 137) % W);
    const dy = ((i * 251) % H);
    const r = 1 + ((i * 53) % 5);
    return `<circle cx="${dx}" cy="${dy}" r="${r}" fill="#ffffff" opacity="0.05"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.from}"/>
      <stop offset="1" stop-color="${p.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.65">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${dots}
  <text x="${cx}" y="${cy}" font-family="Vazirmatn, 'Segoe UI', Tahoma, sans-serif" font-size="${fs}"
        font-weight="800" fill="#ffffff" opacity="0.14" text-anchor="middle" dominant-baseline="central">${ini}</text>
  <rect x="0" y="${H - 3}" width="${W}" height="3" fill="${p.glow}" opacity="0.85"/>
  <text x="${cx}" y="${tY}" font-family="Vazirmatn, 'Segoe UI', Tahoma, sans-serif" font-size="${tSize}"
        font-weight="700" fill="#ffffff" opacity="0.92" text-anchor="middle" direction="rtl">${esc}</text>
</svg>`;
}

/** Generate cover SVG on the fly (no disk file) – served by /api/cover when
 *  no pre-generated file exists (cover-light packages ship no covers dir). */
export function artSvgFor(title: string, wide = false): string {
  return artSvg(title || "Nama", wide);
}

/** مسیر عمومی کاورها برای <img> */
export function coverPosterUrl(slug: string): string {
  return `/api/cover/${slug}.svg`;
}
export function coverBackdropUrl(slug: string): string {
  return `/api/cover/${slug}-wide.svg`;
}

/** ساخت هر دو کاور اگر وجود نداشته باشند؛ مسیر فایل واقعی روی دیسک را برمی‌گرداند */
export function ensureCovers(slug: string, title: string): { poster: string; backdrop: string } {
  const dir = coversDir();
  mkdirSync(dir, { recursive: true });
  const pf = path.join(dir, `${slug}.svg`);
  const bf = path.join(dir, `${slug}-wide.svg`);
  if (!existsSync(pf)) writeFileSync(pf, artSvg(title, false), "utf8");
  if (!existsSync(bf)) writeFileSync(bf, artSvg(title, true), "utf8");
  return { poster: pf, backdrop: bf };
}

/** خواندن فایل کاور برای روت API؛ null اگر نبود */
export function readCover(file: string): { body: string; type: string } | null {
  if (!/^[\w-]+(-wide)?\.svg$/.test(file)) return null;
  const p = path.join(coversDir(), file);
  if (!existsSync(p)) return null;
  return { body: readFileSync(p, "utf8"), type: "image/svg+xml; charset=utf-8" };
}
