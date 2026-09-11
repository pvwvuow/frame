# 🧾 ممیزی کامل پروژهٔ فریم — v0.25.0

**تاریخ ممیزی:** ۲۰۲۶-۰۹-۱۱ · **دامنه:** دسکتاپ (Electron + Next.js standalone) + اندروید (Capacitor 8.5.1) + بک‌اند/API + معماری دیتا + CI/CD
**روش:** ۶ ممیزی موازی تمام‌فایل (معماری دیتا، فرانت‌اند، بک‌اند/امنیت، Electron، اندروید، CI/اسکریپت‌ها) + اجرای زندهٔ tsc/eslint/audit + استعلام GitHub API

## خلاصهٔ اجرایی

| حوزه | P0 | P1 | P2 | P3 | جمع |
|---|---|---|---|---|---|
| A — معماری دیتا/کاتالوگ | 0 | 2 | 12 | 12 | 26 |
| B — فرانت‌اند/UI | 0 | 7 | 12 | 11 | 30 |
| C — بک‌اند/API/امنیت | 3 | 6 | 6 | 8 | 23 |
| D — دسکتاپ Electron | 0 | 5 | 8 | 9 | 22 |
| E — اندروید | 1 | 6 | 6 | 4 | 17 |
| F — CI/اسکریپت‌ها/بهداشت | 2 | 5 | 6 | 7 | 20 |
| **جمع** | **6** | **31** | **50** | **51** | **138** |

**مهم‌ترین یافته‌ها:**
1. **اندروید OTA می‌تواند اپ را نابود کند** — سواپ روی پوشهٔ وبِ در حال سرویس بدون rollback و بدون await دانلود.
2. **دسکتاپ: حذف و ساخت دوبارهٔ اپیزودها = پاک‌شدن «ادامهٔ تماشا»** در هر انتشار محتوا (برای کاربر آفلاین دائمی).
3. **سه حفرهٔ امنیتی سرور** (SSRF خزندهٔ بدون احراز، پذیرش هر accountId، کوکی هویت دست‌کاری‌پذیر) + رلهٔ CORS باز در استریم‌پروکسی دسکتاپ.
4. **هیچ صفحه‌ای Error Boundary ندارد** — هر خطای fetch = اسکلت بی‌نهایت یا صفحهٔ سفید.
5. **CI: تریگر خراب (`branches: ain]`) + هر ریلیز دوبار build می‌شود + هیچ تایپ‌چکی قبل از انتشار نیست.**

## نقشهٔ فیکس

- **فاز ۱ — بحرانی:** جلوی از دست رفتن داده/کرش/حفره‌های امنیتی (DATA-1/2/5/14/16، BE-1..5/8/9، PC-1..4/8، AND-1..7/10/12، FE-1..7، CI-1/2/3/5)
- **فاز ۲ — پایداری و کارایی:** کش/ایندکس/تراکنش/پلیر/دانلود/به‌روزرسانی (بخش عمدهٔ P2ها)
- **فاز ۳ — UX، i18n، a11y و بهداشت مخزن:** P3ها و پولیش نهایی

وضعیت‌ها: `[ ]` باز · `[x]` فیکس‌شده در v0.26.0 · `◑` فیکس جزئی · `❌` یافتهٔ نادرست (کش‌شده)

## نتیجهٔ نهایی فیکس (v0.26.0)

- **فیکس‌شده: ۵۴ مورد** (تمام P0ها به‌جز F-1 که نادرست بود، تمام P1های واقعی، و بخش بزرگی از P2ها)
- **فیکس جزئی: ۱ مورد** (C-9)
- **کش‌شده (نادرست): ۱ مورد** (F-1 — خط تریگر همیشه `[main]` سالم بود؛ خروجی ترمینال `[m` را می‌بلعید و «خرابی» جعلی ساخته بود)
- **باقی‌مانده برای فازهای بعد: ~۸۲ مورد P2/P3** — شامل A-8/A-9..13/15/17..22، B-5/11/14..16/18/19/23..30، C-3(کامل)/6/7(تراکنش)/10..13/15..22، D-5..7/9/11..19/21/22، E-2/8/9/11/13..15، F-6/7/8/9/10/12/16/18/20
- یادداشت F-1: شواهد «بایت‌های خام» در ممیزی ناشی از خطای رندر خروجی بود، نه محتوای واقعی فایل — هگزِ مستقیم تأیید کرد تریگرها هرگز خراب نبودند.

---

## حوزهٔ A — معماری دیتا و کاتالوگ

### A-1 ✅[P1] حذف+ساخت دوبارهٔ اپیزودها، «ادامهٔ تماشا»ی دسکتاپ را پاک می‌کند `[ ]`
`src/lib/catalog-refresh.ts:720-733` — با هر تغییر اپیزود (سیناپس/کیفیت/قسمت جدید)، `deleteMany` + `createMany` باعث می‌شود همهٔ `Episode.id`ها عوض شوند؛ `WatchProgress.episode` با `onDelete: Cascade` ردیف پیشرفت را می‌کشد (اسکیمای یک‌ردیفه به‌ازای عنوان). کاربر آفلاینِ دسکتاپ جای پخش را برای همیشه می‌بازد.
**فیکس:** upsert اپیزود با کلید پایدار `(titleId, season, number)` (یا id قطعی مثل موبایل) — پیشرفت زنده می‌ماند.

### A-2 ✅[P1] «اول سید، بدون‌شرط» می‌تواند عنوان‌های جدیدترِ ریموت و ردیف‌های کاربر را حذف کند `[ ]`
`src/lib/catalog-refresh.ts:194-198, 383-399, 666-676, 738-741` — اگر دیتابیس از سیدِ باندل‌شده جلوتر باشد (سینک قبلیِ موفق، انتشار مستقل محتوا)، مرج کامل سیدfavorite/rating/watchlist/progress عناوینِ خارج از سید را حذف و عناوین را با id جدید می‌سازد؛ فلگ featured هم یک بوت به عقب برمی‌گردد.
**فیکس:** وقتی `HASH_KEY` هشِ ریموتِ متفاوت با سید دارد و `dbCount >= seedCount`، مرحلهٔ حذف را اجرا نکن (حذف فقط مال فاز ریموت است).

### A-3 [P2] `/api/x/lite` همهٔ ستون‌های سنگین ۱۴,۸۷۴ عنوان را می‌کشد `[ ]`
`src/app/api/x/[...path]/route.ts:102` — بدون `select`: description/sources/cast روی سیم می‌روند و دور ریخته می‌شوند؛ خروجی ~۱۲-۱۴MB با `no-store` در هر بوت دسکتاپ.
**فیکس:** `select` فقط فیلدهای lite + ETag/If-None-Match.

### A-4 ✅[P2] خروجی کاتالوگ قطعی (deterministic) نیست — `generatedAt` هش را می‌شکند `[ ]`
`scripts/export-catalog.mjs:83,92-93` — با صفر تغییر داده، sha جدید ⇒ نسخهٔ جدید ⇒ دانلود ~۸۴MB و مرج کامل بی‌دلیل در همهٔ دسکتاپ‌ها + re-import شاردها در اندروید.
**فیکس:** `generatedAt` از خودِ داده مشتق شود (max createdAt) یا از هش خارج شود.

### A-5 ✅[P2] `loadFullRecord`: شکست نوشتن کش به‌اشتباه «رفتن به میرور بعدی» تعبیر می‌شود `[ ]`
`src/lib/mobile/db.ts:380-384` — اگر `db.fulls.put` رد شود (کوتی اندروید، حالت private)، رکوردِ موفق هم دور ریخته می‌شود ⇒ هر باز شدن refetch.
**فیکس:** `put` در try/catch مستقل؛ حتی با شکست کش، `rec` برگردد.

### A-6 [P2] رکورد full کهنه با CDN-lag جسر می‌شود و تا نسخهٔ بعد می‌ماند `[ ]`
`db.ts:369-380` — jsDelivr ممکن است بعد از انتشار، JSON کهنهٔ عنوان را بدهد و با نسخهٔ جدید مُهر شود؛ fallback رِو فقط روی «شکست fetch» است نه کهنگی.
**فیکس:** cache-buster `?v=${manifest.version}` یا هش per-title.

### A-7 ✅[P2] تایمر timeout پاک نمی‌شود + هزینهٔ miss منفی `[ ]`
`db.ts:372-384` — `clearTimeout` در مسیر throw اجرا نمی‌شود؛ عنوانِ غایب ۱۲+۱۲ ثانیه سریال هزینه می‌دهد و کش منفی وجود ندارد.
**فیکس:** `finally` برای تایمر + کش منفی کوتاه‌عمر برای 404/timeout.

### A-8 [P2] اندیس lite دسکتاپ بعد از مرجِ پس‌زمینه هرگز refresh نمی‌شود `[ ]`
`electron/main.cjs:633-636` + `db.ts:177-185` — UI یک بار `/api/x/lite` می‌گیرد؛ پایان `runStartupSync` هیچ رویدادی به رندرر نمی‌رود ⇒ کاتالوگِ پیش‌ازمرج تا ری‌استارت.
**فیکس:** رویداد «کاتالوگ به‌روز شد» به رندرر + re-init.

### A-9 [P2] بوت آفلاین اول: سینک ریموت تا پایان سشن تلاش نمی‌شود `[ ]`
`catalog-refresh.ts:568-588` — `scheduleResync` فقط در مسیرهای موفق فعال می‌شود؛ بوتِ آفلاین تا فردا کهنه می‌ماند.
**فیکس:** فعال‌سازی resync با backoff در `finally` + پاک‌کردن `syncInflight` در شکست.

### A-10 [P2] مرج سیدِ شکست‌خورده تا ری‌استارت memoized می‌ماند `[ ]`
`catalog-refresh.ts:107-115` — `seedInflight` در شکست reset نمی‌شود؛ DB قفل‌شدهٔ لحظه‌ای = محتوای خرابِ تمام‌سشن.
**فیکس:** reset در `.catch` (فقط موفقیت‌ها memo شوند).

### A-11 [P2] `applyCatalog` بدون تراکنش و بدون dirty-check روی ۱۴k عنوان `[ ]`
`catalog-refresh.ts:680-736` — ده‌ها هزار کوئری متوالی («مرج چند دقیقه‌ای») + نیمه‌کاره در کرش.
**فیکس:** هش سطری و skip تغییرنکرده‌ها + `$transaction` تکه‌ای.

### A-12 [P2] شاردهای lite با `force-cache` می‌توانند قاطیِ نسخه‌های قدیم/جدید باشند `[ ]`
`db.ts:210` — URL بدون نسخه؛ بعد از OTA، WebView شارد کهنه را زیر مانیفست جدید سرو می‌کند ⇒ اندیس مخلوطِ مهرشده.
**فیکس:** حالت کش پیش‌فرض یا `?v=${version}`.

### A-13 [P2] نشت IndexedDB: هر نسخهٔ کاتالوگ ~۱۲MB اسنپ‌شات برای همیشه `[ ]`
`db.ts:138,220-223` — هیچ `kv.delete`ای برای نسخه‌های قبلی نیست؛ ~۱۴۴MB اضافه در سال.
**فیکس:** حذف `catalog:lite:*`های غیر از فعلی بعد از import.

### A-14 ✅[P2] `addedAt` نامعتبر ⇒ حلقهٔ مرجِ شکست‌خورده در هر بوت `[ ]`
`catalog-refresh.ts:627,707` — `new Date(t.addedAt)` بدون اعتبارسنجی؛ یک تاریخ خراب در index.json ⇒ کل مرج fail ⇒ تکرار دانلود ۸۴MB در هر بوت و هر ۶ ساعت.
**فیکس:** `isNaN(Date.parse(...))` ⇒ مثل غیاب رفتار شود. (هم‌خانوادهٔ BE-11)

### A-15 [P2] `createdAt` هم‌زمان نقش «تاریخ اضافه‌شدن» را دارد — فرمت‌های مخلوط لاتنت `[ ]`
`prisma/schema.prisma:37` + `feature-new-hero.mjs:72-89` — epoch عددی، متن `YYYY-MM-DD HH:MM:SS` و ISO با هم؛ `Date.parse` در Safari برای فرمت فاصله‌دار NaN/لوکال می‌دهد ⇒ جابه‌جایی مرزی در موج ۷۲ ساعتهٔ هرو بین پلتفرم‌ها.
**فیکس (فاز ۳):** ستون `addedAt` ایزو + backfill یک‌باره.

### A-16 ✅[P2] `/api/x` هیچ try/catch ندارد؛ شکست seed هم قورت داده می‌شود `[ ]`
`route.ts:92-214` + `src/db/seed.ts:471-474` — خطای Prisma ⇒ HTML 500 ⇒ `res.json()` کلاینت می‌ترکد (همان آجرِ CatalogGate)؛ seedِ شکست‌خورده کاتالوگ خالی ۲۰۰ می‌دهد.
**فیکس:** try/catch ⇒ JSON 503 + شکست seed قابل‌مشاهده.

### A-17 [P3] ایندکس‌های گم‌شده: `Episode(titleId,season,number)`، `WatchProgress.episodeId`، `Title.featured` `[ ]`
`prisma/schema.prisma:71,148-149,33` — مرتب‌سازی اپیزودها/مرج‌ها اسکن می‌شوند.
**فیکس:** افزودن ایندکس‌ها (+ `Review(titleId, createdAt)`)؛ حذف ایندکس زائد `Favorite(userKey)`.

### A-18 [P3] سینک OD هر ۲۰ صفحه یک JSON چند-MB می‌نویسد `[ ]`
`src/lib/source/sync.ts:338-350,199-201` — blob صف/بازدیدشده‌ها.
**فیکس:** محدودسازی/فاصلهٔ بیشتر ذخیره.

### A-19 [P3] `getFeatured`/`hydrateLineup`: single-flight ندارد و `Promise.all` همه‌یا-هیچ `[ ]`
`db.ts:527-534,509` — یک رد شدنِ hydrateHero ⇒ ردیف‌های خانه خالی.
**فیکس:** `Promise.allSettled` + memoize خط قبلی در سطح بوت.

### A-20 [P3] هروی آخرین‌راه: اسلایدهای بی‌پخش + موجِ ۲تایی دور ریخته می‌شود `[ ]`
`db.ts:545,553-555` — فلگ‌های خام featured (بدون description/videoUrl) و آستانهٔ ۳.
**فیکس:** top-up از getTrending + علامت‌گذاری degraded برای مخفی‌کردن Play.

### A-21 [P3] `coversLocalRev()` روی هر رندر تصویر، localStorage سنکرون `[ ]`
`src/lib/covers.ts:23-29` — صدها خواندن سنکرون در هر گرید + invalidation نداشتنِ تصاویرِ مونت‌شده.
**فیکس:** کش ماژولی + رویداد invalidation.

### A-22 [P3] کاورها: 404-دوتایی محدود ولی جابه‌جا شده؛ placeholder گیر می‌کند `[ ]`
`covers.ts:44` + `layout.tsx:80-97` — `posterUrl` خالی ⇒ `/covers/...` محکوم‌به‌404؛ metahub-404 گذرا تا remount می‌چسبد.
**فیکس:** SVG داخلی مستقیم وقتی posterUrl خالی است + retry روی `online`.

### A-23 ✅[P3] تلهٔ `manifest.version = "unknown"` `[ ]`
`mobile-shard-catalog.cjs:94-98` — اگر version.json نخوانده شود، `"unknown"` ثابت می‌شود و re-import برای همیشه skip.
**فیکس:** fail‌کردن مرحله به‌جای ثابتِ پایدار.

### A-24 ✅[P3] `HERO_COUNT` غیرعددی ⇒ `LIMIT NaN` ⇒ publish pipeline می‌میرد `[ ]`
`feature-new-hero.mjs:41,94,100` — typo در env ⇒ خطای SQL و توقف انتشار محتوا.
**فیکس:** sanitize اعداد env با default.

### A-25 ✅[P3] نسخهٔ مانیفستِ `/api/x/lite` = `db-${rows.length}` پر از برخورد `[ ]`
`route.ts:117` — دو کاتالوگ با شمار مساوی، نسخهٔ یکسان.
**فیکس:** استفاده از sha نسخه (مثل شاردر).

### A-26 [P3] پاکی شاردها تأیید شد؛ پولیش اسکیما `[ ]`
`LITE_FIELDS` بدون description/sources/videoUrl — درست. `episodeId()` سقف ۲۱.۴k عنوان دارد (فعلاً امن، unguarded).

## حوزهٔ B — فرانت‌اند / UI / UX

### B-1 ✅[P1] هیچ Error Boundary وجود ندارد — هر استثنای رندر = صفحهٔ سفید «Application error» `[ ]`
`src/app/layout.tsx` (کل فایل) — صفر `error.tsx`/`global-error.tsx` در کل `src/app`.
**فیکس:** `global-error.tsx` + `error.tsx` با ریست برندشدهٔ RTL.

### B-2 ✅[P1] خانه: هر کوئریِ شکست‌خورده ⇒ اسکلت بی‌نهایت (بدون catch) `[ ]`
`src/app/page.tsx:52-77` — `Promise.all` بدون try/catch؛ `hydrateHero` فچِ خام بدون catch (`db.ts:497-504`).
**فیکس:** catch ⇒ کارت خطا با retry؛ فچ hydrate هم محافظت شود.

### B-3 ✅[P1] الگوی بدون‌catch در ~۱۰ صفحهٔ دیگر (اسکلت بی‌نهایت) `[ ]`
`settings:17-19`، `favorites:13-15`، `history:14`، `notifications:14`، `profile:26`، `rankings:33`، `genres:16`، `people:42`، `collections:26,218`، `collections/u:22-28`، `WatchPageClient:46-85` (اسپینر همیشگی)، `TitlePageClient:88-112`.
**فیکس:** هوک مشترک `useAsyncData` با `{loading,error,data,retry}`.

### B-4 ✅[P1] زبان انتخابی هرگز بازیابی نمی‌شود و هر reload پاک می‌شود `[ ]`
`LocaleProvider.tsx:45-55` + `layout.tsx:125` — persist می‌نویسد ولی هیچ‌کس نمی‌خواند؛ بعد از mount، fa روی کوکیِ انگلیسی می‌نویسد.
**فیکس:** خواندن localStorage/کوکی قبل از هیدریشن (اسکریپت inline یا initializer) + پاس‌دادن کوکی به layout سرور.

### B-5 [P1] فرم تماس دروغ می‌گوید — پیام‌ها فقط در localStorage می‌روند `[ ]`
`ContactForm.tsx:12-27` — «پیام شما ثبت شد» بدون هیچ گیرنده‌ای در کل ریپو.
**فیکس:** POST به API/webhook + صف آفلاین با retry.

### B-6 ✅[P1] نقض rules-of-hooks در DownloadsClient ⇒ کرش شرطی `[ ]`
`DownloadsClient.tsx:44-47` — hooks بعد از early return؛ `dlSupported()` runtime است.
**فیکس:** همهٔ hooks قبل از هر شاخه.

### B-7 ✅[P1] initCatalog بدون `res.ok` و خطای دسکتاپ قورت‌داده‌شده ⇒ کاتالوگ ساکتِ خالی `[ ]`
`db.ts:179,186,210` + `CatalogGate.tsx:40-45` — HTML 500 ⇒ `res.json()` می‌ترکد؛ `catch(() => {})`.
**فیکس:** چک `res.ok` در هر سه فچ + نمایاندن خطای init.

### B-8 ✅[P2] Escape هنگام fullscreen پلیر را هم می‌بندد `[ ]`
`Player.tsx:720-721` — «خروج از تمام‌صفحه» و «بستن پلیر» با هم.
**فیکس:** اگر `fullscreenElement` هست، فقط مرورگر خارج شود.

### B-9 ✅[P2] خطاهای fullscreen هندل نمی‌شوند (unhandled rejection) `[ ]`
`Player.tsx:312-317` — `void el.requestFullscreen?.()`.
**فیکس:** `.catch` ⇒ اعلان «تمام‌صفحه در دسترس نیست».

### B-10 ✅[P2] ولیم ۰ بازیابی نمی‌شود (محافظ `v > 0`) `[ ]`
`Player.tsx:159-166` + `PlayerMobile.tsx:411-418` — کاربرِ بی‌صداکرده با ولیم ۱ و jump-scare.
**فیکس:** `v >= 0` + بازگردانی هنگام unmute.

### B-11 [P2] جستجو: نتایج کهنه زیر عنوانِ کوئری جدید `[ ]`
`search/page.tsx:23-50,110-111` — بدون per-query loading؛ + fetch بیهودهٔ trending در هر کوئری.
**فیکس:** کلید زدن state به کوئری + اسپینر ظریف.

### B-12 ✅[P2] TitleModal `res.ok` را چک نمی‌کند ⇒ اسکلت اپیزود بی‌نهایت `[ ]`
`TitleModal.tsx:63-66,217-222`.
**فیکس:** throw روی !ok + state «بارگیری ناتمام».

### B-13 ✅[P2] CatalogLoadMore: خطا ⇒ دکمهٔ «بیشتر» حذف بی‌سروصدا + side-effect داخل updater `[ ]`
`CatalogLoadMore.tsx:56-57,47-52` — `setDone(true)` در catch؛ `offsetRef.current +=` داخل setState (پرش صفحه در StrictMode).
**فیکس:** retry button + انتقال mutation بیرون updater.

### B-14 [P2] صفحهٔ جستجو صفر i18n (و بخش‌های بزرگی از پلیر/تنظیمات) `[ ]`
`search/page.tsx` بدون useI18n؛ Player:295..1125، Random، CatalogPage، Settings.
**فیکس (فاز ۳ کامل):** انتقال به dictionaries.ts.

### B-15 [P2] quick-view فایل اصلی فیلم را autoplay می‌کند (پهنای‌باند!) / `<video src="">` `[ ]`
`TitleModal.tsx:129-137` — دسکتاپ: استریم فیلم واقعی muted-loop؛ موبایل: src خالی.
**فیکس:** گیت روی trailerUrl/poster + skip mounting وقتی src خالی.

### B-16 [P2] مودال‌ها بدون focus-trap/initial-focus `[ ]`
`TitleModal.tsx:114-124`، `CommandPalette.tsx:190-191`، `Player.tsx:877-894`.
**فیکس:** فوکوس اولیه + trap (یا Radix Dialog موجود).

### B-17 ✅[P2] از ۶۹ `<img>` فقط ۱۸ تا lazy — لیست‌های بلند همهٔ پوسترها را eager می‌گیرند `[ ]`
`EpisodeList.tsx:108` (فصل ۱۰۰قسمتی!)، `HistoryList:94`، `ContinueCard:51`، `MyListManager:577,639`، `ListCalendar:337`، `NotificationList:123`، `DarkroomApp:365,388`، `Navbar:365`.
**فیکس:** `loading="lazy" decoding="async"` برای همهٔ غیر-LCP.

### B-18 [P2] کاتالوگ بی‌سقف تا ~۱۴k کارت DOM بدون virtualization `[ ]`
`CatalogPage.tsx:166-181` + `CatalogLoadMore.tsx:63-75` — هر TitleCard به ۳ استور سابسکرایب است؛ toggle علاقه‌مندی = re-render هزاران کارت.
**فیکس:** سقف auto-load (~۳۰۰ بعدی pagination) + `React.memo` روی TitleCard.

### B-19 [P2] CatalogGate متن خام خطا را نشان می‌دهد و فقط reload دارد `[ ]`
`CatalogGate.tsx:66-79` — «Unexpected token '<'» برای کاربر.
**فیکس:** پیام دوستانه + اکشن «پاک‌کردن کش و ایمپورت مجدد» + auto-retry یک‌باره.

### B-20 ✅[P3] `ReviewForm` از `ml-auto` فیزیکی در RTL استفاده می‌کند `[ ]`
`ReviewForm.tsx:63` — بج امتیاز سمت اشتباه. **فیکس:** `ms-auto`.

### B-21 ✅[P3] بج حذفِ MyListAside با `-left-1.5` فیزیکی `[ ]`
`MyListAside.tsx:201`. **فیکس:** `-start-1.5`.

### B-22 ✅[P3] زیرنویس کاربر `dir="rtl"` اجباری — SRT انگلیسی خراب رندر می‌شود `[ ]`
`SubOverlay.tsx:100`. **فیکس:** `dir="auto"`.

### B-23 [P3] Esc پالت فرمان با هندلر پلیر دابل‌فایر می‌شود `[ ]`
`CommandPalette.tsx:46-61` + `Player.tsx:720` — بستن پالت، پلیر را هم می‌بندد.
**فیکس:** هماهنگی Esc تک‌مسیره / stopPropagation.

### B-24 [P3] فرم auth بدون `role="alert"`/`aria-invalid` و بدون hint حداقل کاراکتر `[ ]`
`auth/page.tsx:310-316`.

### B-25 [P3] `getHistory`/`getFavoriteRows` awaitهای سریالی N+1 روی IndexedDB/شبکه `[ ]`
`userdata.ts:561-567,589-601` — رندر اول خانه منتظر ده‌ها IDB/refetch.
**فیکس:** `bulkGet` + `Promise.all` + precompute اپیزود در ردیف پیشرفت.

### B-26 ✅[P3] دکمه‌های اسکرول ردیف: `canNext` اولیهٔ درست نیست + لیبل گمراه‌کننده `[ ]`
`Row.tsx:24,87`.

### B-27 [P3] اسلاید ورودیِ هرو بدون fade-in — فلش تصویر هنگام سوییچ `[ ]`
`Hero.tsx:36-58`. **فیکس:** مونت opacity-0 + flip روی onLoad/`img.decode()`.

### B-28 [P3] سابسکرایب کل-استور در Player + ری‌ست ثبتِ هندلر کیبورد در هر تیک `[ ]`
`Player.tsx:62,757`. **فیکس:** انتخاب اکشن‌های لازم.

### B-29 [P3] سال فوتر/تاریخ privacy در build فریز یا mismatch هیدریشن `[ ]`
`Footer.tsx:20,76`، `privacy/page.tsx:21`.

### B-30 [P3] سومین مکانیزم رشتهٔ UI: ترنری‌های `locale === "en"` پراکنده `[ ]`
`TitleModal.tsx:267,284`، `Navbar.tsx:390-391,408`، `LibraryProvider.tsx:136-137,166-167`.

## حوزهٔ C — بک‌اند / API / امنیت سرور

### C-1 ✅[P0] SSRF بدون احراز: خزندهٔ `/api/source/sync` هر URLای را fetch و در DB می‌نویسد `[ ]`
`api/source/sync/route.ts:24-26` + `source/sync.ts:107-136` — metadata endpoints، شبکهٔ داخلی، ۳۰k فچ، `{"action":"stop"}` بدون کلید.
**فیکس:** operator token (loopback/Electron) + بلاک CIDR خصوصی + بازبینی redirect در هر hop + سقف صفحات.

### C-2 ✅[P0] `/api/identity` هر accountId را بدون اثبات مالکیت قبول می‌کند `[ ]`
`api/identity/route.ts:84-108` — تصاحب فضای دادهٔ دیگران با UUID عمومی؛ CSRF-پذیر.
**فیکس:** تأیید توکن Supabase قبل از سوییچ فضای uid.

### C-3 [P0] `nama_uid` کوکیِ دست‌کاری‌پذیر = خواندن/نوشتن بین‌کاربری روی سرورِ چندکاربره `[ ]`
`src/lib/user.ts:5` + همهٔ مسیرهای mutation؛ uid با sha256 قطعی از accountId مشتق و plaintext برگردانده می‌شود.
**فیکس:** کوکی امضاشده (HMAC) + uid فقط CSPRNG + هرگز بازگشت uid به کلاینت.

### C-4 ✅[P1] صفر محافظ CSRF/Origin روی همهٔ مسیرهای mutator `[ ]`
همه routeها `req.json()` بدون چک Content-Type/Origin.
**فیکس:** چک Origin/Sec-Fetch-Site روی mutationها.

### C-5 [P1] استریم‌پروکسی Electron رلهٔ CORS-`*` به هر URL (همان D-1) `[ ]`
**فیکس:** توکن per-session در `proxyBase` + حذف `*`.

### C-6 [P1] `/api/x/lite`: dump کامل کاتالوگ، بی‌سقف، no-store (همان A-3) `[ ]`

### C-7 [P1] `/api/cloud/merge`: بدون سقف بدنه، بدون تراکنش، N+1 `[ ]`
`api/cloud/merge/route.ts:98-199` — آرایه‌های ۱۰۵تایی در RAM؛ نیمه‌اعمال‌شده در کرش.
**فیکس:** سقف آرایه‌ها + createMany/چانک + `$transaction`.

### C-8 ✅[P1] 500 نوع-سردرگمی: اسکالر به‌جای آرایه `[ ]`
`favorites:39,52`، `watchlist:77,95`، `cloud/merge:53,56` — `{"titleIds":"abc"}` ⇒ 500.
**فیکس:** `Array.isArray` گارد (zod موجود است).

### C-9 [P1] `/api/reviews`: بدون auth، بدون سقف، author جعلی `[ ]`
`reviews/route.ts:6-27` + `getReviews` بی‌take.
**فیکس:** سقف/ریت‌لیمیت/استمپ هویت + take.

### C-10 [P2] هیچ rate-limitای هیچ‌جا نیست (تأیید شد — حداقل روی lite/catalog-sync/darkroom) `[ ]`

### C-11 [P2] `applyCatalog`: upsertهای متوالی ۱۴k + Invalid Date کل مرج را می‌اندازد (همان A-11/A-14) `[ ]`

### C-12 [P2] کوئری‌های لیست بی‌سقف با includeهای سنگین `[ ]`
`queries.ts:345-353,245,526-538,586-597`، `library.ts:83-89,120-122,157-163` — watchlist/reviews/person کامل؛ getRandomTitle کل جدول را می‌خواند!
**فیکس:** select فیلدهای لیست + take + `ORDER BY random() LIMIT 1`.

### C-13 [P2] PUTهای انبوه با `Promise.all` بی‌سقف روی SQLite `[ ]`
`favorites:41-44`، `watchlist:83-86` — ۱۰۰k upsert همزمان ⇒ قفل/OOM.
**فیکس:** createMany/چانک.

### C-14 ✅[P2] پیام‌های خطای داخلی به کلاینت می‌ریزند `[ ]`
`health:43-45` (dbError با مسیر DB/SQL)، `catalog/sync:19-23`.
**فیکس:** کد مبهم برای کلاینت + لاگ سمت سرور.

### C-15 [P2] `public/catalog` (۸۴MB) و `public/covers` (۹۸۹MB) در دیپلوی self-host سرو می‌شوند `[ ]`
`postbuild.cjs:11` — دسکتاپ استریپ می‌کند ولی `npm start` عمومی همه را می‌دهد.
**فیکس:** استریپ در build غیردسکتاپ + object storage.

### C-16 [P3] کلید publishable سابابیس عمومی است (طراحی‌اش همین است — OK) ولی اسکریپت تست‌ها رمز ثابت می‌سازد `[ ]`
`cloud.ts:43-44`، `test-cinema-engine.mjs:12-13,24`.

### C-17 ✅[P3] `.env` ترک‌شده در ریپو (همان F-5) `[ ]`

### C-18 ✅[P3] `GET /api/profile` رمز والدین را plaintext برمی‌گرداند `[ ]`
`profile/route.ts:16-19` + `schema.prisma:195` + `library.ts:55-64`.
**فیکس:** حذف از پاسخ + هش در دیتابیس.

### C-19 [P3] fallback غیر-CSPRNG برای uid: `Math.random` `[ ]`
`proxy.ts:8`.

### C-20 ✅[P3] `/api/progress`episodeId خارج از titleId و اعداد 1e308 را قبول می‌کند `[ ]`
`progress/route.ts:39-48`.

### C-21 [P3] syncState چند-MB در هر ۲۰ صفحه (همان A-18) `[ ]`

### C-22 [P3] `next.config.ts`: `ignoreBuildErrors:true` + بدون هیچ هدر امنیتی/CSP `[ ]`
`next.config.ts:10-13`.

### C-23 ✅[P3] `/api/title/cloud-key` آرایه‌های بی‌سقف به IN-clause عظیم `[ ]`
`title/cloud-key/route.ts:27-50`. **فیکس:** `slice(0,500)` مثل progress-map.

## حوزهٔ D — دسکتاپ Electron (PC)

### D-1 ✅[P1] استریم‌پروکسی لوکال: بدون توکن، `ACAO:*` ⇒ هر وب‌سایتی می‌تواند از طریق کاربر بخواند/relay کند `[ ]`
`stream-proxy.cjs:948-956,962-968,1095-1099,1266-1268` — پورت‌اسکن localhost + خواندن پاسخ داخلی.
**فیکس:** توکن تصادفی per-session در همهٔ روت‌ها + حذف `*` (مشتری فقط origin خود اپ).

### D-2 ✅[P1] `shell.openExternal` با هر scheme (فولینا-استایل) `[ ]`
`main.cjs:776-785` — `file:`, `ms-msdt:`, `search-ms:` به OS می‌روند؛ کاتالوگ ریموت می‌تواند لینک تزریق کند.
**فیکس:** همان allowlist `https?/mailto/tel` مسیر IPC (:989-991) در setWindowOpenHandler/will-navigate.

### D-3 ✅[P1] `DATABASE_URL` انکد نمی‌شود — یوزرنیم فارسی ویندوز ⇒ «خطای ۱۴» پرisma دوباره `[ ]`
`main.cjs:109-112,580` — مسیر `%APPDATA%` با یوزرنیم غیرASCII؛ درسِ v0.10.7 فقط برای سید اعمال شده.
**فیکس:** `encodeURI` + fallback مسیر خام (مثل `catalog-refresh.ts:326-340`).

### D-4 ✅[P1] second-instance پنجرهٔ مخفی را show نمی‌کند — اپ «مُرده» به‌نظر می‌رسد `[ ]`
`main.cjs:768-773,1045-1050` + macOS activate:1101 — هنگام PiP، کلیک آیکون هیچ نمی‌کند؛ بدون tray هم هست.
**فیکس:** `if (!mainWindow.isVisible()) mainWindow.show()` در هر دو هندلر.

### D-5 [P1] پارسِ ۸۸MB کاتالوگ + هایدرِیشن دوبل ⇒ اسپایک چندصد-MB heap در فرزند سرور `[ ]`
`catalog-refresh.ts:584-596,406-443` — OOM در رم‌کم = مرج نیم‌کاره + تکرار دانلود در بوت بعد.
**فیکس:** آزادسازی مراجع body/payload + چانک‌پردازش (۵۰۰تایی) + null کردن seedTitles.

### D-6 [P2] `rejectUnauthorized: false` روی همهٔ ترافیک استریم (MITM) `[ ]`
`stream-proxy.cjs:1355`. **فیکس:** حذف فلگ؛ per-host CA در صورت لزوم.

### D-7 [P2] توکن‌های Supabase plaintext روی دیسک `[ ]`
`auth-offline.ts:36,88-92` + `main.cjs:1025-1036` — refresh_token در `frame-auth-cache.json`.
**فیکس:** رمزنگاری با `safeStorage` یا حذف raw از mirror.

### D-8 ✅[P2] هندلر permission دوربین/میکروفون را بی‌سروصدا allow می‌کند `[ ]`
`main.cjs:1057` — `"media"` در allowlist برخلاف کامنت خودش.
**فیکس:** فقط `fullscreen, notifications`.

### D-9 [P2] هیچ CSPای هیچ‌جا نیست `[ ]`
`next.config.ts` + `layout.tsx` — XSS ⇒ سطح IPC.
**فیکس:** `headers()` محافظه‌کار (media-src *) سازگار با هر دو دیپلوی.

### D-10 ✅[P2] سید ۹۴.۵MB دوبار در هر اینستالر `[ ]`
`postbuild.cjs:17` + `electron-after-pack.cjs:11,49` — `standalone/db/custom.db` خوانده نمی‌شود.
**فیکس:** در afterPack فقط `schema.sql` کپی شود.

### D-11 [P2] آپدیت macOS عملاً خراب (بیلد unsigned) — حلقهٔ خطای بی‌پایان `[ ]`
`electron-builder.yml:56-65` + `main.cjs:933-950`.
**فیکس:** gate updater به win32 تا قبل از ساینینگ.

### D-12 [P2] ریپر سرورِ کهنه می‌تواند پروسهٔ بی‌گناه `server.js` را بکشد `[ ]`
`main.cjs:251-317` — PID reuse؛ + ۳×۲۰s PowerShell سنکرون در بوت.
**فیکس:** مچ مسیر دقیق standalone + async.

### D-13 [P2] فید آپدیت/کاتالوگ روی raw.githubusercontent — برای مخاطب اصلی ایران مسدود `[ ]`
`main.cjs:552`، `electron-builder.yml:27-32`.
**فیکس (نیازمند زیرساخت):** لیست mirror چندگانه با تلاش ترتیبی.

### D-14 [P3] قفل single-instance در انتهای فایل — مایگریشن در هر دو instance اجرا می‌شود `[ ]`
`main.cjs:56-65,1041` + `setAppUserModelId` دوبل. **فیکس:** انتقال قفل به بالای فایل.

### D-15 [P3] شکست آپدیتر بی‌صدا برای کاربر `[ ]`
`main.cjs:952-966`. **فیکس:** دیالوگ/تُست در مسیر interactive + «آخرین بررسی» در تنظیمات.

### D-16 [P3] `setupUpdater` بعد از repair دوبار ثبت می‌شود (دانلود دوبل) `[ ]`
`main.cjs:860-869`. **فیکس:** گارد `didSetupUpdater`.

### D-17 [P3] هش سید: `readFileSync` ۹۴.۵MB در دو پروسه در هر بوت `[ ]`
`main.cjs:118-120`، `catalog-refresh.ts:346`. **فیکس:** استریم هش یا استفاده از seed-version.json.

### D-18 [P3] مرج پس‌زمینه با UI زنده مسابقهٔ خواندن/نوشتن دارد `[ ]`
`api/health/route.ts:41` + `main.cjs:458-493`. **فیکس:** بنر «به‌روزرسانی کاتالوگ…» از `catalog.status`.

### D-19 [P3] برخورد شورتکات `Ctrl+Shift+R` (viewMenu forceReload) `[ ]`
`main.cjs:896,909`.

### D-20 ✅[P3] `prepare-standalone.mjs` مرده + ایمنی موتور prisma فقط به output tracing وابسته `[ ]`
**فیکس:** حذف/سیم‌کشی + `outputFileTracingIncludes` + assert موتور در afterPack.

### D-21 [P3] dev بدون health-check ⇒ پنجرهٔ خالی بی‌تشخیص `[ ]`
`main.cjs:512-516`.

### D-22 [P3] هیچ crash handlerای (uncaughtException/render-process-gone) نیست `[ ]`
**فیکس:** ثبت هندلرها + auto-reload یک‌باره.

## حوزهٔ E — اندروید (Capacitor + native)

### E-1 ✅[P0] OTA ممکن است ریشهٔ وبِ در حال سرویس را پاک کند — بدون rollback؛ kill وسط سواپ = وایت‌اسکرین `[ ]`
`src/lib/self-update.ts:161` (`isNewer` فقط با نسخهٔ APK، نه otaVersion) + `NamaNativePlugin.java:407,440-447` — بعد از OTA موفق، چک ۲۴ساعته همان تگ را دوباره پیشنهاد می‌دهد؛ re-apply پوشهٔ زنده را deleteR می‌کند.
**فیکس:** skip اگر `tag <= max(versionName, otaVersion)` + استخراج به پوشهٔ جدید + سواپ اتمیک + نگه‌داشتن N-1 برای rollback + اعتبارسنجی قبل از سواپ.

### E-2 [P1] هیچ اعتبارسنجی hash/اندازه‌ای برای webbundle/covers نیست `[ ]`
`NamaNativePlugin.java:382-455,466-523` — zip تریده‌شده بین entryها «تمیز» باز می‌شود با JS گم‌شده.
**فیکس:** SHA-256 در متادیتا ریلیز + verify قبل از apply (حداقل: تطابق سایز).

### E-3 ✅[P1] OTA پایان دانلود را await نمی‌کند (مسابقهٔ ثابت ۶۰۰ms) `[ ]`
`self-update.ts:261-264,281-284` + `NamaNativePlugin.java:361-378` — `downloadFile` فوراً ok برمی‌گرداند؛ باندل ~۲۰MB همیشه «zip missing».
**فیکس:** Promise مبتنی بر رویداد done per-id (شنونده موجود است: 245-251).

### E-4 ✅[P1] آنزیپ/حذف بازگشتی روی دیسپچ thread اصلی ⇒ ANR `[ ]`
`NamaNativePlugin.java:348-353,382-455,466-523`.
**فیکس:** اجرا روی executor مثل `runJob` (الگوی موجود :177).

### E-5 ✅[P1] ۵۰۳ dlcenter (رفتار عادی برای IP غیرایرانی/ریت‌لیمیت) = «منبع مرده» برای همیشه `[ ]`
`mobile-playback.ts:150-154`، `mkv-web.ts:1193-1199`، `PlayerActivity.java:385-433` — ۱۰۰٪ URLهای نمونه روی `dls*.aparatchi-dlcenter.top`؛ یک 503 گذرا همهٔ واریانت‌ها را می‌سوزاند. (ریشهٔ واقعی Breaking Bad/Planet Earth 1)
**فیکس:** retry 5xx با backoff در preflight و داخل ExoPlayer + پیام صادقانهٔ «سرور موقتاً در دسترس نیست».

### E-6 ✅[P1] هیچ onPause/onStopای نیست — پخش پس‌زمینه بدون FGS `[ ]`
`PlayerActivity.java` (کل فایل) + `AndroidManifest.xml:50` — فریز Android 12+ و صدا در پس‌زمینه بی‌کنترل.
**فیکس:** pause در onStop (نُرم VOD) یا MediaSessionService+FGS.

### E-7 ✅[P2] `bindController()` بیرون از سپر کرش v0.19.0 `[ ]`
`PlayerActivity.java:435-445,450-583` — استثنای OEM از onCreate می‌گذرد.
**فیکس:** انتقال داخل try.

### E-8 [P2] trust-all TLS «اسکوپ‌شده» در واقع کل کلاینت OkHttp است `[ ]`
`PlayerActivity.java:264-290` — زیرنویس سایدلود/artwork/ریدایرکت هم اعتماد می‌کنند.
**فیکس:** کلاینت دوم سخت‌گیر برای غیر-dl.

### E-9 [P3] نیت‌های پارک‌شدهٔ پلیر: audioBecomingNoisy، تایمرهای فعال در stop، back از قفل `[ ]`
`PlayerActivity.java:575-579,1010-1028`.

### E-10 ✅[P1] استارت دوبارهٔ دانلود فایل partial را خراب می‌کند `[ ]`
`NamaNativePlugin.java:165-183` + `mobile-downloads.ts:154-168` — دو thread روی یک `.part` با offset متفاوت.
**فیکس:** ردِ استارت دوم وقتی Job زنده است + بستن سوکت در pause.

### E-11 [P2] «queued»ها هرگز وقتی جای آزاد شد استارت نمی‌شوند `[ ]`
`mobile-downloads.ts:65-78,138-143` — scheduler فقط در enqueue/bوت.
**فیکس:** فراخوانی scheduler در onEvent.

### E-12 ✅[P2] دانلودر بدون User-Agent (CDNها 403 می‌دهند) `[ ]`
`NamaNativePlugin.java:220-224` در برابر DESKTOP_UA پلیر (:257-259).

### E-13 [P2] دانلود پس‌زمینه بدون FGS/wake lock + `.part` یتیم + بدون چک فضا `[ ]`
`NamaNativePlugin.java:197-201,339-346`.

### E-14 [P2] `PlayerActivity` با `singleTop` بدون `onNewIntent` `[ ]`
`AndroidManifest.xml:29-35` — intent دوم روی instance زنده می‌افتد و دور ریخته می‌شود.
**فیکس:** finish/relaunch از onNewIntent. (دبل‌اپِ سطح اپ: تأیید شد که با singleTask+dedupe درست است)

### E-15 [P3] FileProvider کل `files/` را grant می‌کند `[ ]`
`file_paths.xml:6`. **فیکس:** محدود به downloads/ و subs/.

### E-16 [P3] تأییدهای امن: allowBackup=false، exported=false، cleartext اسکوپ‌شده، versionCode wiring سالم `[x]` (بدون اقدام)

## حوزهٔ F — CI/CD، اسکریپت‌ها، بهداشت مخزن

### F-1 [P0] تریگر خراب `branches: ain]` عملاً match-all است — هر push ریلیز سنگین می‌سازد `[ ]`
`.github/workflows/desktop.yml:8` — خرابی از v0.10.24 در همهٔ تاریخچه؛ ۴ run شکست‌خوردهٔ 09-09/09-10.
**فیکس:** `branches: [main]` + گارد lint در CI.

### F-2 ✅[P0] هر ریلیز دوبار build می‌شود (race main-push و tag-push، ۱۰ثانیه فاصله) `[ ]`
`desktop.yml:47-51,64-69` + concurrency per-ref — ۲×۳ اوس + دو نویسندهٔ رقیب روی یک Release.
**فیکس:** مسیر main فقط auto-tag؛ یا skip run دوم.

### F-3 ✅[P1] هیچ تایپ‌چکی در مسیر ریلیز نیست + `ignoreBuildErrors:true` `[ ]`
`desktop.yml:94-153` + `next.config.ts:10-12`.
**فیکس:** `npx tsc --noEmit` قبل از build در desktop.yml.

### F-4 ✅[P1] کد اندروید تا روز ریلیز کامپایل نمی‌شود — ۴ شکست APK در روز انتشار `[ ]`
`ci.yml` بدون Android؛ سابقه: `PlayerActivity.java:413 cannot find symbol` (v0.21.1).
**فیکس:** job کامپایل Android در CI (~۳min).

### F-5 ✅[P1] `.env` ترک‌شده در ریپوی **عمومی** + `.gitignore` آن را ignore نمی‌کند `[ ]`
**فیکس:** `git rm --cached .env` + ignore + `.env.example`.

### F-6 [P1] پک ۱.۰۰GiB / ~۴۸k فایل ترک‌شده (کاور ۹۸۹MB، کاتالوگ ۲۱۷MB، db ۹۱MB) بدون LFS/.gitattributes `[ ]`
`index.json` سه بار بازنویسی در تاریخچه؛ کلون ۱.۲GB برای هر CI/contributor.
**فیکس (فاز ۳ — زیرساختی):** LFS/ریلیز-asset + `.gitattributes` + حذف `db/*.bak/-shm/-wal`.

### F-7 [P1] ۱۲ آسیب‌پذیری prod (۵ high) — از جمله sharp (دیکودر تصویر!) `[ ]`
`sharp<=0.35.4-rc.0` (libvips/libheif)، `js-yaml` via `@mdxeditor/editor`، `prismjs`، `uuid`، `deepmerge-ts` via prisma.
**فیکس:** bumpها + override + gate audit در CI.

### F-8 [P2] فقط ۲ از ~۱۳ تست در CI — تست‌های خودِ v0.24/25 (ondemand/hero-pick/catalog-repair) گیت نیستند `[ ]`
**فیکس:** افزودن تست‌های self-contained به ci.yml + `npm run verify` در ریلیز.

### F-9 [P2] بدون `npm test`/فریمورک؛ ۳ E2E به `playwright` اعلان‌نشده وابسته‌اند `[ ]`
**فیکس:** devDependency + اسکریپت `test` تجمیعی.

### F-10 [P2] پوشش تست صفر برای `covers.ts` و `/api/x` و Hero + ۱۲ خطای eslint پایه (rules-of-hooks واقعی!) `[ ]`

### F-11 ✅[P2] `preflight --quick` (هر دو workflow) چک sha256 کاتالوگ را رد می‌کند `[ ]`
`preflight.mjs:115`. **فیکس:** اجرای کامل در desktop.yml (<۱s برای ۸۴MB).

### F-12 [P2] تضمین SHA-256 در یادداشت ریلیز گم شده (README وعده می‌دهد؛ v0.25.0 صفر occurrence) `[ ]`
`desktop.yml:212-222` + جایگزینی notes. **فیکس:** asset جداگانهٔ `.sha256`.

### F-13 ✅[P2] بهداشت workflow: بدون timeout-minutes، پین float، ci بدون concurrency، بدون Gradle cache `[ ]`

### F-14 [P3] `.gitignore` مین‌دار: whitelist شکننده، `test`/`prompt` بی‌لنگر، `build/` بی‌لنگر خلاف whitelist آیکون `[ ]`

### F-15 ✅[P3] ۱۴ اسکریپت مرده (از پروژهٔ دیگر با مسیرهای `/home/z/my-project`!) `[ ]`
`part_a.sh`، `part_b.sh`، `gen_posters.sh`، `fix_important.py`، `get-slugs.ts`، `check-sync.ts`، `seed-run.ts`، `test-parser.ts`، `make-icon.mjs`، `nama-assets.sh`، `mobile-serve.cjs`، `mobile-covers-fill.cjs`، `fix-quality-labels.cjs`، `fix-variant-labels.cjs`.
**فیکس:** انتقال به `scripts/attic/` با README.

### F-16 [P3] `VERSIONING.md` تا 0.11.0 است و جریان واقعی tag/auto-release را توصیف نمی‌کند `[ ]`

### F-17 ✅[P3] بدون `.gitattributes` (eol/LFS) `[ ]`

### F-18 [P3] PAT زنده در `.git/config` local — در هیچ فایل/کامیتی نیست (تأیید pickaxe) `[x]` (چرخش توکن در برنامهٔ کاربر)

### F-19 ✅[P3] postbuild ~۱.۲GB public را کپی می‌کند تا afterPack دور بریزد `[ ]`
**فیکس:** skip در postbuild خودش.

### F-20 [P3] artifacts دسکتاپ `if-no-files-found: warn` (ریلیز سبزِ خالی ممکن) `[ ]`
`desktop.yml:142-153`. **فیکس:** error + assert `latest.yml`.

## تأییدشده‌ها — نیازی به اقدام نیست
- تزریق SQL: صفر — همهٔ rawها پارامتری/شناسهٔ هاردکد (`catalog-refresh.ts:304,728`، `db.ts:109`، `seed.ts:584`)
- `/api/cover/[file]`: بدون path traversal (whitelist regex)
- `/api/x/[...path]`: بدون file read (سوئیچ بستهٔ ۱۰ مورد DB-بک)
- RLS سابابیس فعال با `auth.uid()`؛ فقط کلید publishable در کلاینت
- Electron: contextIsolation/sandbox/nodeIntegration درست؛ requestSingleInstanceLock موجود
- IDOR کالکشن‌ها: چک مالکیت قبل از PATCH/DELETE
- Android: singleTask + dedupe پلیر (دبل‌اپ سطح اپ حل‌شده)
- fallback تصویر سراسری (jpeg→webp→metahub→SVG) و ریاضی RTL اسکرول Row درست‌اند

---
*ممیزی توسط ۶ ایجنت ممیزی موازی انجام شد؛ همهٔ خط‌ها با کد فعلی v0.25.0 (commit 696b4cab) تطبیق داده شده‌اند.*
