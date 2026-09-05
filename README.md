# نما · سینمای آنلاین (Next.js 16 + Prisma/SQLite + Electron)

پلتفرم استریم فارسی با رابط RTL، پخش‌کننده اختصاصی، کاتالوگ، جستجو، مرکز اعلان‌ها و فضای شخصی کامل کاربر — به‌صورت **وب** و **برنامه‌ی دسکتاپ** (ویندوز / مک / لینوکس).

[![Desktop release](https://github.com/pvwvuow/frame/actions/workflows/desktop.yml/badge.svg)](https://github.com/pvwvuow/frame/actions/workflows/desktop.yml)
[![CI](https://github.com/pvwvuow/frame/actions/workflows/ci.yml/badge.svg)](https://github.com/pvwvuow/frame/actions/workflows/ci.yml)

## اجرا (وب)

```bash
npm install          # prisma generate به‌صورت خودکار اجرا می‌شود
npx prisma db push   # ساخت/به‌روزرسانی db/custom.db
npm run dev          # http://localhost:3000
```

## برنامه‌ی دسکتاپ (Electron)

| دستور | کار |
| --- | --- |
| `npm run electron:dev` | اجرای پوسته‌ی Electron روی `npm run dev` (هات‌ریلود) |
| `npm run build && npm run electron:start` | اجرای Electron با سرور standalone تولیدی |
| `npm run desktop` | بیلد کامل وب + ساخت نصب‌کننده‌ها در `release/` |
| `npm run electron:build:win` / `:mac` / `:linux` | فقط یک پلتفرم |

- خروجی‌ها: **Windows** (NSIS installer + portable)، **macOS** (dmg/zip، x64 و arm64)، **Linux** (AppImage + deb).
- معماری: پوسته‌ی Electron (`electron/main.cjs`) سرور standalone نکست را با `ELECTRON_RUN_AS_NODE` روی یک پورت آزاد لوکال بالا می‌آورد؛ دیتابیس SQLite در اولین اجرا به `userData/nama.db` کپی می‌شود تا با به‌روزرسانی از بین نرود.
- پل امن `window.nama` (preload با contextIsolation) برای: اطلاعات نسخه، بررسی به‌روزرسانی، باز کردن پوشه‌ی داده، لینک خارجی، نشان اعلان.
- **به‌روزرسانی خودکار** با `electron-updater` از GitHub Releases.
- در حالت دسکتاپ، فوتر بازاریابی/حقوقی حذف و بخش «درباره برنامه» در تنظیمات فعال می‌شود (`html[data-electron]`, کلاس `.web-only`).

### انتشار نسخه‌ی جدید

```bash
npm version minor        # یا patch/major → تگ vX.Y.Z
git push --follow-tags
```

اکشن `Desktop (Electron) release` روی هر سه سیستم‌عامل بیلد می‌گیرد و فایل‌ها را در **GitHub Releases** منتشر می‌کند.

فایل `.env` شامل `DATABASE_URL="file:./db/custom.db"` است (در صورت نبود، مقدار پیش‌فرض به‌صورت خودکار استفاده می‌شود). دیتابیس در اولین درخواست به‌صورت خودکار seed می‌شود.

## صفحات

| مسیر | توضیح |
| --- | --- |
| `/` | خانه (هیرو، ادامه تماشا، از لیست شما، علاقه‌مندی‌ها، ردیف‌ها) |
| `/movies` `/series` `/genres` `/search` | کاتالوگ و جستجو با فیلتر |
| `/title/[slug]` `/watch/[slug]` | صفحه اثر و پخش‌کننده |
| `/my-list` | **مدیریت حرفه‌ای لیست**: تب‌ها، جستجو، فیلتر ژانر، مرتب‌سازی، نمای شبکه/فهرست، وضعیت تماشا، یادداشت، سنجاق، امتیاز شخصی، انتخاب گروهی، خروجی CSV/JSON، اشتراک‌گذاری، «امشب چی ببینم؟» |
| `/favorites` | علاقه‌مندی‌ها (♥) |
| `/history` | تاریخچه تماشا (گروه‌بندی روزانه، حذف تکی/کلی) |
| `/profile` | داشبورد کاربر و آمار |
| `/settings` | تنظیمات کامل با ناوبری کناری: پروفایل، پخش (کیفیت/زیرنویس/سرعت/صدا/رد تیتراژ/صرفه‌جویی داده)، ظاهر و زبان، اعلان‌ها، کنترل والدین (حالت کودک + پین)، داده و حریم خصوصی (پشتیبان JSON، پاک‌سازی)، میان‌برها، درباره برنامه |
| `/notifications` | **مرکز اعلان‌ها**: قسمت‌های جدید سریال‌های لیست، یادآوری ادامه تماشا، پیشنهاد بر اساس ژانر محبوب، تازه‌های کاتالوگ؛ فیلتر، خوانده‌شده/حذف، نشان روی آیکون برنامه |
| `/collections` `/collections/[slug]` | **مجموعه‌ها**: قفسه‌های موضوعی خودکار (شاهکارها، شب‌های نوآر، کمتر از دو ساعت، مناسب خانواده و …) |
| `/people` `/person/[name]` | **هنرمندان**: فهرست کارگردان‌ها/بازیگران و صفحه‌ی اختصاصی هر نفر با همه‌ی آثار و همکاران مکرر |
| `/random` | **امشب چی ببینم؟** انتخاب شانسی با فیلتر نوع/ژانر و «یکی دیگه!» بدون تکرار |
| `/about` `/faq` `/contact` `/terms` `/privacy` | صفحات اطلاعاتی |

## تم روشن / تیره و Liquid Glass

- سه حالت **تیره / روشن / خودکار (سیستم)** با `next-themes` (کلاس `.dark` / `.light` روی `<html>`، بدون فلش تم اشتباه).
- سوییچ تم در نوار بالا، منوی پروفایل، تنظیمات > ظاهر و Command Palette.
- توکن‌های تم در `src/app/globals.css` تعریف شده‌اند؛ چون Tailwind v4 هر رنگ را با `var(--color-*)` خروجی می‌دهد، تم روشن با بازنگاشت پالت خنثی (`white ↔ black`, `zinc-100 ↔ zinc-900`) روی همه‌ی کامپوننت‌ها بدون تغییر مارک‌آپ اعمال می‌شود. بخش‌هایی که باید همیشه تیره بمانند (پخش‌کننده، نوار مدیا) کلاس `force-dark` می‌گیرند.
- کلاس‌های **`glass` / `glass-strong` / `glass-btn`** یک نسخه‌ی CSS از افکت Liquid Glass (الهام‌گرفته از [ybouane/liquidglass](https://github.com/ybouane/liquidglass)) هستند: بلور + اشباع بالا، لبه‌ی شکست نور (rim) با ماسک گرادیانی، براقیت مورب، تینت سرد و سایه‌ی نرم؛ برای مودال‌ها، منوها، نوار ناوبری، Command Palette و توست‌ها استفاده شده‌اند.

## میان‌برها

- `Ctrl+K` / `⌘K` یا `/` → **Command Palette** (جستجوی عنوان، ناوبری، تغییر تم)
- پخش‌کننده: `Space` پخش/توقف · `← →` ۱۰ ثانیه · `↑ ↓` صدا · `M` بی‌صدا · `F` تمام‌صفحه

## مودال پیش‌نمایش (Quick View)

با کلیک روی هر کارت، یک کارت جمع‌وجور شیشه‌ای باز می‌شود: پیش‌نمایش ویدیویی کوتاه، پوستر، امتیاز/سال/مدت، سه خط خلاصه، برای سریال‌ها دو قسمت (قسمت در حال تماشا + بعدی)، دکمه‌های پخش/لیست/علاقه‌مندی و «ادامه در جزئیات» برای رفتن به صفحه کامل.

## API

`/api/library` · `/api/notifications` · `/api/watchlist` (POST/PATCH/PUT/DELETE) · `/api/favorites` (POST/PUT/DELETE) · `/api/rating` · `/api/profile` (GET/PATCH/DELETE) · `/api/progress` (POST/DELETE) · `/api/title/[slug]` · `/api/search` · `/api/reviews`

## فونت

- **Vazirmatn** برای متن بدنه
- **Estedad (FD)** برای تیترها — هر دو به‌صورت لوکال در `public/fonts` (بدون وابستگی به اینترنت)
