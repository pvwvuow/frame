# نما · سینمای آنلاین (Next.js 16 + Prisma/SQLite + Electron)

پلتفرم استریم فارسی با رابط RTL، پخش‌کننده اختصاصی، کاتالوگ، جستجو، مرکز اعلان‌ها و فضای شخصی کامل کاربر — به‌صورت **وب** و **برنامه‌ی دسکتاپ** (ویندوز / مک / لینوکس).

[![Desktop release](https://github.com/pvwvuow/frame/actions/workflows/desktop.yml/badge.svg)](https://github.com/pvwvuow/frame/actions/workflows/desktop.yml)
[![CI](https://github.com/pvwvuow/frame/actions/workflows/ci.yml/badge.svg)](https://github.com/pvwvuow/frame/actions/workflows/ci.yml)


## v0.5.0 – English UI, bilingual titles, header & quick-view fixes

- **English language** – full UI language switcher (navbar globe, user drawer, Settings → ظاهر و زبان). Layout flips to LTR, digits/durations follow the language, choice is persisted (cookie + localStorage) and applied on the server render (no flash).
- **Bilingual title names** – English-language productions show their English title first with the Persian name small beside it; Persian productions do the opposite (and flip in the English UI). Applied to cards, hero, quick-view, title page, search, command palette, history, my-list and continue-watching.
- **Header fix** – the top bar no longer flashes a phantom border when scrolling back to the top (web + Electron). The header now keeps a permanent transparent border and only animates colour/blur, with scroll hysteresis.
- **Quick-view fix** – the poster no longer overlaps the type/quality/age badges of the media strip.
- **Standalone/`npm start` fix** – the SQLite database is now resolved to an absolute path and shipped next to the standalone server; foreign `DATABASE_URL`s injected by hosts are ignored.
- User drawer is direction-aware (slides from the avatar side in both languages), PWA manifest added, row arrows mirror in LTR.

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
- صفحات مخصوص وب (`/about` `/contact` `/terms` `/privacy` `/download`) در دسکتاپ به‌صورت خودکار به معادل داخل برنامه (`/settings#about` …) هدایت می‌شوند (`WEB_ONLY_ROUTES` در `ElectronBridge`).
- روی macOS (title bar از نوع hiddenInset) فضای چراغ‌های پنجره در نوار بالا رزرو می‌شود تا با آواتار/جستجو هم‌پوشانی نداشته باشد.
- نصب فوری به‌روزرسانی از داخل توست («همین حالا») با `installUpdate` در پل `window.nama`.

### انتشار نسخه‌ی جدید

```bash
npm version minor        # یا patch/major → نسخه در package.json + تگ vX.Y.Z
git push --follow-tags   # (اگر تگ را push نکنید هم مشکلی نیست؛ پایین را ببینید)
```

اکشن `Desktop (Electron) release` با هر push روی `main` اجرا می‌شود: اگر برای نسخه‌ی فعلی `package.json` تگی وجود نداشته باشد، خودش تگ `vX.Y.Z` را می‌سازد، روی هر سه سیستم‌عامل بیلد می‌گیرد و فایل‌ها را در **GitHub Releases** منتشر می‌کند. اگر تگ از قبل وجود داشته باشد، کاری نمی‌کند (برای بیلد مجدد اجباری از **Run workflow → force** استفاده کنید).

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
| `/download` | **دانلود برنامه‌ی دسکتاپ** (وب): فهرست زنده‌ی آخرین بیلدهای ویندوز/مک/لینوکس از GitHub Releases + نکات نصب |
| `/about` `/faq` `/contact` `/terms` `/privacy` | صفحات اطلاعاتی (فقط وب – در دسکتاپ به تنظیمات هدایت می‌شوند) |

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


## تغییرات نسخه‌ها

### v0.4.0
- **رفع باگ:** کاور (پوستر) داخل مودال نمای سریع زیر تصویر بالایی می‌رفت → لایه‌بندی صریح (`z-0` نوار مدیا / `z-10` بدنه / `z-20` پوستر).
- **رفع باگ:** منوی کشویی پروفایل (drawer) بازنویسی شد: موقعیت `fixed` با `inset-inline-end`، ارتفاع امن با `100dvh`، انیمیشن ورود از سمت درست در RTL، پشتیبانی از reduce-motion، فوکوس صحیح و بدون ری‌مونت آیتم‌ها؛ به‌علاوه نشان تعداد اعلان خوانده‌نشده روی آواتار و در خود منو.
- **رفع باگ نوار بالا:** روی مک در Electron چراغ‌های پنجره روی آواتار می‌افتادند؛ فلش‌های ردیف‌ها (Row) جهت/گرادیان اشتباه داشتند و در ابتدا/انتهای ردیف هم نمایش داده می‌شدند.
- **دسکتاپ:** صفحات مخصوص وب در برنامه حذف/هدایت می‌شوند؛ منوی راست‌کلیک مرورگر غیرفعال؛ لینک‌های `mailto:`/`tel:` در برنامه‌ی پیش‌فرض سیستم باز می‌شوند؛ نصب فوری به‌روزرسانی.
- **جدید:** صفحه‌ی `/download` با فهرست زنده‌ی آخرین انتشار.
- **بیلد ویندوز:** نصب‌کننده و نسخه‌ی پرتابل هر دو با یک نام (`Nama-x.y.z-win-x64.exe`) ساخته می‌شدند و روی هم نوشته می‌شدند؛ همین باعث timeout در آپلود و نبودن `latest.yml` (به‌روزرسانی خودکار ویندوز) می‌شد. حالا `-setup.exe` و `-portable.exe` جدا هستند و مرحله‌ی انتشار در CI با retry اجرا می‌شود.
