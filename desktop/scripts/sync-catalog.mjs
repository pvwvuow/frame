#!/usr/bin/env node
/**
 * همگام‌سازی دارایی‌های اپ دسکتاپ از ریشه‌ی مخزن:
 *  - کاتالوگ مرور (docs/browse.json)  →  app/data/browse.json
 *  - فونت‌های فارسی (docs/fonts)      →  app/fonts/
 *  - آیکون برنامه (docs/assets)       →  build/icon.png
 *
 * در postinstall و همچنین پیش از هر بیلد اجرا می‌شود، بنابراین بیلد تازه همیشه
 * همراهِ آخرین کاتالوگ منتشرشده در مخزن است.
 */
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const repo = join(desktop, "..");

const FONTS = [
  "Vazirmatn-Regular.woff2",
  "Vazirmatn-Medium.woff2",
  "Vazirmatn-SemiBold.woff2",
  "Vazirmatn-Bold.woff2",
];

const EMPTY = {
  generatedFrom: "public/catalog/mobile",
  counts: { movies: 0, series: 0, total: 0 },
  titles: [],
};

function copy(from, to) {
  if (!existsSync(from)) return false;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  return true;
}

// 1) کاتالوگ
const catalogSrc = join(repo, "docs", "browse.json");
const catalogDest = join(desktop, "app", "data", "browse.json");
if (existsSync(catalogSrc)) {
  mkdirSync(dirname(catalogDest), { recursive: true });
  copyFileSync(catalogSrc, catalogDest);
  const parsed = JSON.parse(readFileSync(catalogDest, "utf8"));
  console.log(`[sync] catalog → app/data/browse.json (${parsed?.counts?.total ?? parsed.titles.length} عنوان)`);
} else {
  mkdirSync(dirname(catalogDest), { recursive: true });
  writeFileSync(catalogDest, JSON.stringify(EMPTY));
  console.warn("[sync] docs/browse.json یافت نشد؛ کاتالوگ خالی نوشته شد");
}

// 2) فونت‌ها
let fontCount = 0;
for (const f of FONTS) {
  if (copy(join(repo, "docs", "fonts", f), join(desktop, "app", "fonts", f))) fontCount += 1;
}
console.log(`[sync] fonts → app/fonts/ (${fontCount}/${FONTS.length})`);

// 3) آیکون بیلد
const iconOk = copy(join(repo, "docs", "assets", "icon-512.png"), join(desktop, "build", "icon.png"));
if (!iconOk) {
  console.warn("[sync] هشدار: آیکون یافت نشد؛ electron-builder از آیکون پیش‌فرض استفاده می‌کند");
} else {
  console.log("[sync] icon → build/icon.png");
}

// 4) نسخه‌ی اپ را با docs/version.json هماهنگ کن (در صورت وجود)
const versionFile = join(repo, "docs", "version.json");
try {
  const raw = JSON.parse(readFileSync(versionFile, "utf8")).version || "";
  const clean = String(raw).replace(/^v/, "").trim();
  const pkgPath = join(desktop, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const num = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
  const isNewer = (a, b) => {
    const [x, y] = [num(a), num(b)];
    for (let i = 0; i < 3; i += 1) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  };
  // نسخه هرگز عقب نمی‌رود؛ فقط اگر سایت جلوتر باشد هم‌تراز می‌شود
  if (/^\d+\.\d+\.\d+/.test(clean) && isNewer(clean, pkg.version)) {
    pkg.version = clean;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`[sync] version → ${clean}`);
  } else {
    console.log(`[sync] version = ${pkg.version}`);
  }
} catch {
  console.warn("[sync] docs/version.json خوانده نشد؛ نسخه دستی حفظ شد");
}
