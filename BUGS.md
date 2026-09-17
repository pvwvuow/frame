# 🐞 گزارش کامل باگ‌یابی پروژه Frame — نسخه پایه v0.41.2

**تاریخ:** ۲۰۲۶-۰۹-۱۷ · **روش:** ۷ ایجنت موازی (کامپوننت‌های دسکتاپ / موبایل / هسته‌ی lib / مسیرهای API / الکترون / CSS-تم / بیلد-CI) + `tsc` + `eslint` کامل + `npm audit`
**وضعیت اجرا (۲۰۲۶-۰۹-۱۷):** فاز ۱ (۱۲/۱۲) + فاز ۲ (۳۸/۳۸) + بخش عمده فاز ۳ و quick-winهای فاز ۴ فیکس و در v0.42.0 منتشر شد — ۷۲ مورد فیکس‌شده، ۵۴ مورد باقی‌مانده مستند در همین فایل. (BUG-104: `npm audit fix` بدون force نیازی را بسته نکرد — همه‌ی موارد باقی‌مانده transitive/dev یا نیازمند major bump هستند؛ BUG-134: تست test-split-catalog به assetهای export شده نیاز دارد و به‌جای ci.yml به desktop.yml بعد از مرحله export متصل شد.)

**خلاصه:** tsc پاک ✅ · eslint: ۱۲ error + ۴۲ warning · npm audit: ۵ high + ۷ moderate · **۱۳۴ باگ واقعی شناسایی شد**

## راهنما
- شدت: 🔴 بحرانی (دیتالاس/امنیت/خرابی جدی) · 🟠 بالا (باگ کاربر-محور مهم) · 🟡 متوسط · 🟢 کم
- وضعیت: ⬜ در صف · ✅ فیکس شد (شماره commit در انتهای فایل)
- فاز ۱→۴ ترتیب اجراست؛ داخل هر فاز به ترتیب اولویت.

---

## فاز ۱ — بحرانی (۱۲ مورد)

- [x] **BUG-001** 🔴 امنیت/حریم: `getLibrarySnapshot` رمز والدین (`parentalPin`) را خام به `/api/library` می‌دهد و با `pushProfile` به Supabase می‌فرستد — برخلاف `publicProfile()`. → حذف فیلد از `profileFull` و payload ابری. `src/lib/library.ts:66` + `src/lib/cloud.ts:1184`
- [x] **BUG-002** 🔴 امنیت: چک `url.startsWith(serverUrl)` با userinfo بای‌پس می‌شود (`http://127.0.0.1:47213@evil.com`) → صفحه‌ی远程 با preload کامل اپ باز می‌شود. → مقایسه‌ی `new URL(url).origin`. `electron/main.cjs:1039-1048`
- [x] **BUG-003** 🔴 دیتا: آپ‌های صف سینک در حالت آفلاین بعد ~۵ دقیقه «قرنطینه» و حذف می‌شوند (attempts بدون گیت connectivity) → حذف‌ها رستاخیز می‌شوند. → attempts فقط برای خطای غیرگذرا + early-return وقتی آفلاین. `src/lib/sync-queue.ts:143` + `src/lib/cloud.ts:1391`
- [x] **BUG-004** 🔴 دیتا: امضای dedup آپ‌های خام (`{titleId}` بدون slug) به `"favorite:"` فرو می‌ریزد → دو تغییر مختلف آفلاین، اولی حذف می‌شود. → ورود titleId/hash به sig. `src/lib/sync-queue.ts:109-122`
- [x] **BUG-005** 🔴 دیتا: کرسر رویدادهای حذف قبل از موفقیت merge نوشته می‌شود → شکست merge = از دست رفتن همیشگی حذف‌های سایر دستگاه‌ها (و رستاخیز). → نوشتن کرسر بعد از merge OK. `src/lib/cloud.ts:1032-1054`
- [x] **BUG-006** 🔴 بصری: Hero — `swapGen` هرگز در `go()` بامپ نمی‌شود → revealهای در flight اسلاید قبلی، پوسترِ فیلم قبلی را روی اسلاید جدید می‌کشند + نشت callback در `heroArt`. → بامپ نسل در go + unsubscribe. `src/components/Hero.tsx:296,320-366,419-440`
- [x] **BUG-007** 🔴 بصری-موبایل: بلوک info موبایل از کلاس‌های `ch-*` استفاده می‌کند ولی `--chu` فقط روی `.ch-stage` تعریف شده → `calc()` نامعتبر → تایپوگرافی/پدینگ موبایل فرو می‌ریزد. → default `--chu/--chs` در `:root` + مقدار مخصوص موبایل. `src/app/globals.css:750` + `src/components/Hero.tsx:605,713,742`
- [x] **BUG-008** 🔴 بصری: `.glass-btn` با `rgb(255 255 255/α)` هاردکد → در تم روز دکمه‌های Row/quick-view/random نامرئی. → توکنیزه با `var(--color-white)`. `src/app/globals.css:400-407`
- [x] **BUG-009** 🔴 بصری: `GlassCard` اسلب تیره‌ی هاردکد → عنوان quick-view (متن سفیدِ توکن‌معکوس‌شده) روی زمینه‌ی تیره در تم روز تقریباً ناخوانا. → توکن `--glass-card-bg` برای دو تم. `src/components/ui/glass.tsx:136-142` + `TitleModal.tsx:148`
- [x] **BUG-010** 🔴 API: درج با `titleId` ناموجود → `P2003` → ۵۰۰ HTML (به‌جای JSON) در progress/watchlist/rating/favorites/reviews (FK ها واقعاً فعال‌اند — آزمایش شد). → بررسی وجود یا catch `P2003/P2002`. مسیرهای مذکور
- [x] **BUG-011** 🔴 امنیت: `safeStorePath` با segment یعنی `".."` عبور می‌کند (regex نقطه را مجاز می‌داند) → مسیر خروج از `covers/`. → رد صریح `.` و `..`. `src/lib/cover-store.ts:75-82`
- [x] **BUG-012** 🔴 امنیت: گارد `api-guard` با `Origin==Host` باز است → DNS-rebinding همه‌ی mutationها را از هر وب‌سایتی می‌تواند بزند (wipe پروفایل، merge، crawler). → allowlist هاست (localhost/127.0.0.1/[::1]). `src/lib/api-guard.ts:41`

---

## فاز ۲ — بالا (۳۸ مورد)

### لگ تعویض تم (شکایت مستقیم کاربر) — زنجیره‌ی علت
- [x] **BUG-013** 🟠 تم-لگ ①: `body` ترنزیشن 350ms خودش را روی متغیرهای در حال انیمیت 800ms اجرا می‌کند → «چیزر» دومرحله‌ای و ری‌استارت ترنزیشن هر فریم. → حذف ترنزیشن body (ramp توکن html کافی است). `globals.css:310-316`
- [x] **BUG-014** 🟠 تم-لگ ②: hero در طول مورف هر فریم `box-shadow` پلیت + `text-shadow` تیتر + گرین `mix-blend-mode:overlay` روی ۱۰ لایه‌ی محو-شونده را رستر می‌کند. → مخفی‌کردن grain در مورف + crossfade سایه‌ها با لایه‌ی opacity. `globals.css:805-1164`
- [x] **BUG-015** 🟠 تم-لگ ③: `site-header` حتی در حالت شفاف `saturate(160%)` روی hero فعال دارد → re-filter هر فریم. → `backdrop-filter:none` در `[data-solid="0"]`. `globals.css:536-557`
- [x] **BUG-016** 🟠 پرش وسط مورف: `--glass-shadow`/`--shadow-color` در رجیستری `@property` نیستند → snap در t=0 روی همه‌ی شیشه‌ها/گلوها. → رجیستر `<color>`/stop + افزودن به لیست ترنزیشن html. `globals.css:95,152,233-251`
- [x] **BUG-017** 🟠 reduce-motion خود `html` را نمی‌گیرد (`*` فقط فرزندان است) → کاربر حساس به حرکت هنوز مورف 800ms می‌بیند. → افزودن سلکتور خود html. `globals.css:452-458`
- [x] **BUG-018** 🟠 کنتراست: VIP با `amber-300` روی پرده‌ی روشن ≈1.6:1 → تقریباً نامرئی در روز (UserMenu + pill نوبار). → توکن رنگ دوعصابی. `UserMenu.tsx:354` + `Navbar.tsx:467`
- [x] **BUG-019** 🟠 Hero دوبل‌مونت: موبایل هر ۴ بورد سینمایی دسکتاپ را دانلود/دیکود می‌کند؛ دسکتاپ MobileHero را با interval نگه می‌دارد. → gate رندر با mediaQuery. `Hero.tsx:605-745`

### خروج/تعویض اکانت (شکایت «آینه» کاربر)
- [x] **BUG-020** 🟠 پاسخ‌های stale‌ی `/api/library` دیتای اکانت قبلی را بعد از خروج روی state می‌ریزند (بدون نسل/abort). → توکن نسل در refresh. `LibraryProvider.tsx:77-104,130-149`
- [x] **BUG-021** 🟠 `router.refresh()` همزمان با چرخش cookie → صفحاتی که در همین پنجره mount می‌شوند دیتای اکانت قبلی را fetch می‌کنند. → await کردن خروج + key شدن fetch صفحات کتابخانه. `UserMenu.tsx:386-404`

### پخش/پلیر
- [x] **BUG-022** 🟠 دسکتاپ: لیسنر «flush هنگام pause» به `videoRef.current`ِ null بایند می‌شود (effect [] با ویدیوی مونت‌نشده) → feature مرده. → وابسته به `videoEl`. `Player.tsx:320-335`
- [x] **BUG-023** 🟠 موبایل: همان باگ + `setSubDelayState(getSubDelay(slug))` هرگز بعد از باز شدن تیتر اجرا نمی‌شود (delay ذخیره‌شده بازیابی نمی‌شود). `PlayerMobile.tsx:548-563,364-375`
- [x] **BUG-024** 🟠 داده: restore بکاپ، `episodeId` را نادیده می‌گیرد (hardcode season:0,episode:0) → ازسرگیری اپیزود غلط بعد از restore. → decode با فرمول پایدار. `cloud.ts:1741` + `userdata.ts:486-488`
- [x] **BUG-025** 🟠 موبایل: چک duplicate دانلود `userKey` را ignore می‌کند → اکانت B هرگز نمی‌تواند چیزی را که اکانت A دانلود کرده دانلود کند. → فیلتر userKey. `mobile-downloads.ts:185-188`
- [x] **BUG-026** 🟠 MSE: watchdog استال بعد از seek هرگز re-arm نمی‌شود (`cleanupMedia` تایمر را می‌کُشد، `start()` فقط یک‌بار) → هنگ ابدی روی فریزِ بعد از seek بدون fallback. `mkv-mse.ts:444-456,240,528-532`
- [x] **BUG-027** 🟠 MSE: `fetchRange` بدون retry 5xx → یک 503 گذرای CDN (رایج روی dls*.aparatchi) فایل سالم را می‌کُشد. → `fetchRangeRetry5xx`. `mkv-mse.ts:163,386`
- [x] **BUG-028** 🟠 موبایل: اسکرول‌لاک body با mini player هم فعال می‌ماند → کل اپ پشت پلیر کوچک غیرقابل اسکرول. → skip/undo در mini. `PlayerMobile.tsx:509-516,2097`

### الکترون
- [x] **BUG-029** 🟠 دانلود: هیچ timeoutی قبل از headers نیست → سرورِ هنگ، اسلات فعال (از ۲) برای همیشه می‌بلعد. → `timeout` روی request. `downloads.cjs:193-227`
- [x] **BUG-030** 🟠 دانلود: pause در پنجره‌ی `res end`→`stream finish` هیچ eventی `finish` را صدا نمی‌زند → اسلات + تایمر ابدی، resume هم بی‌اثر. → finish مستقیم در halt وقتی resEnded. `downloads.cjs:386-394,332-351,551-561`

### CI/بیلد
- [x] **BUG-031** 🟠 `scripts/covers-rev.txt` کامیت‌ناپذیر (گم در whitelist گیت‌ایگنور) → rev همیشه ۱ → کاور آفلاین تا ابد آپدیت نمی‌شود. → کامیت فایل + whitelist. `mobile-build.cjs:48-57` + `.gitignore`
- [x] **BUG-032** 🟠 CI فقط catalog-core/f2m را آپلود می‌کند نه `catalog-part-*.json` → موج >60MB کل سینک ریموت را ۴۰۴ می‌کند. → glob `catalog-*.json`. `desktop.yml:156-163`
- [x] **BUG-033** 🟠 بیلد اندروید از `--webpack` عبور می‌کند (گارد Turbopack-فارسی) → با ارتقای بعدی همه‌ی بیلدهای اندروید می‌میرند. → افزودن فلگ. `mobile-build.cjs:172`
- [x] **BUG-034** 🟠 `test-catalog-cache.mjs` و `test-split-catalog.mjs` هرگز در CI/ریلیز اجرا نمی‌شوند. → افزودن به ci.yml. `ci.yml:39-49`
- [x] **BUG-035** 🟠 `npm run verify` شکسته است (`test-genre-map.mjs` وجود ندارد و whitelist هم ندارد). `package.json:8`
- [x] **BUG-036** 🟠 «restore» در mobile-build عملاً `src/app/api` را `rmSync` می‌کند (بیلد بدون API + درخت خراب). → rename برگشتی. `mobile-build.cjs:161-169`

### کاتالوگ/سینک
- [x] **BUG-037** 🟠 سینک اول با probe ناموفق → فقط core مرج می‌شود → `applyCatalog` همه‌ی تیترهای پارت‌محور (f2m) + ردیف‌های کاربر را حذف می‌کند. → رد merge فقط-core وقتی probe=null. `catalog-refresh.ts:806-882`
- [x] **BUG-038** 🟠 یک شکست در چک ۶ساعته → تایمر رفرش کاتالوگ برای همیشه نمی‌آید (فقط روی ok دوباره schedule می‌شود). → finally. `catalog-refresh.ts:273-287`
- [x] **BUG-039** 🟠 `asSourcesJson` با فیلد missing/null → `"[]"` روی سورس‌های سالم می‌نویسد → مرگ همه‌ی لینک‌های کیفیت. → حفظ مقدار فعلی. `catalog-refresh.ts:878-882`
- [x] **BUG-040** 🟠 attach همزمان دو اکانت می‌تواند هر دو را روی یک uid نقشه کند → خون‌ریزی داده بین اکانت‌ها. → کلیم اتمیک فضای مهمان. `identity/route.ts:135-141`

### امنیت/پایداری ابری
- [x] **BUG-041** 🟠 `explicitSignOut` بدون timeout → هنگِ revoke، لاگین بعدی را بلع می‌دارد. → race با timeout + شرطی‌سازی پاکسازی. `cloud.ts:291-323`
- [x] **BUG-042** 🟠 `cloud/merge` غیرتراکنشی و ردیف‌به‌ردیف → خطای وسط راه = نیمه‌اعمال‌شده + 500. → تراکنش per-section + کچ P2003. `cloud/merge/route.ts:287-475`
- [x] **BUG-043** 🟠 `flushProgressOne` ردیف‌ها را قبل از push حذف می‌کند؛ بدون سشن، دقیقه‌های آخر تماشا برای همیشه می‌پرد. → بازگرداندن به pending. `cloud.ts:760-782`

### MKV/پخش وب
- [x] **BUG-044** 🟠 بدون چک 206 → هاستِ Range-ناجی کل فایل چند-GB را در حافظه می‌ریزد (OOM). → برخورد با 200 به‌عنوان range-unsupported. `mkv-web.ts:990-997`
- [x] **BUG-045** 🟠 lacing EBML با keepMarker خوانده می‌شود → فرمول دلتا شیفت → همه‌ی فریم‌های laced حذف. → `peekVint(...,false)`. `mkv-web.ts:901-924`

### کش/دیسک
- [x] **BUG-046** 🟠 trim کمتر-استفاده‌ها هرگز اجرا نمی‌شود اگر یک فایل خارج-الگو در کش باشد → رشد بی‌نهایت دیسک (سقف 800MB بی‌اثر). → شمارش فقط matching. `cover-store.ts:166-195`
- [x] **BUG-047** 🟠 نوبار موبایل: `transition-all` + `backdrop-filter blur(22px)` هنگام اسلاید هر فریم re-blur می‌کند (علت «لگ دراور/نوبار»). → `transition-[transform,opacity]` + حذف blur حین انیمیشن. `Navbar.tsx:497-505` + `glass.tsx:94-109`

### API متفرقه‌ی ۵۰۰دهنده
- [x] **BUG-048** 🟠 toggle همزمان → `P2025` در delete → 500. → `deleteMany` ایدمپوتنت. `favorites/route.ts:26` + `watchlist:29`
- [x] **BUG-049** 🟠 bulk PUT بدون dedupe/cap → P2002 تضمینی با `[5,5]` → 500 با نوشتن جزئی. → dedupe+cap+تراکنش. `favorites:26,50` + `watchlist:94`

---

## فاز ۳ — متوسط (۴۵ مورد)

### هسته/سینک
- [x] **BUG-050** 🟡 `replaySyncOp` آپ‌های حل‌نشده را «موفق» جا می‌زند (برخلاف قرارداد صف) → تغییر گم می‌شود. `cloud.ts:1418-1421`
- [ ] **BUG-051** 🟡 wipeProfile بدون tombstone/cloud-delete → پاک‌سازی‌های کلی رستاخیز می‌شوند. `userdata.ts:419-440`
- [ ] **BUG-052** 🟡 نوتیف «ادامه تماشا» هر اسکن بازنویسی می‌شود → خوانده‌شده دوباره نخوانده + پوش تکراری تا سقف روزانه. `userdata.ts:1083-1109`
- [ ] **BUG-053** 🟡 re-add محلی tombstone را پاک نمی‌کند → re-add کراس-دوایس تا ۳روز بلاک. `userdata.ts:497-511`
- [ ] **BUG-054** 🟡 lock دانلود per-account → ۲ اکانت = ۴ دانلود همزمان. `mobile-downloads.ts:112-116`
- [ ] **BUG-055** 🟡 subDelay: ریست=0 با «تنظیم‌نشده» قاطی → فال‌بک global همیشه برمی‌گردد. `player-prefs.ts:117-127`
- [ ] **BUG-056** 🟡 کیفیت دانلود هنوز چین انتخاب پلیر را دنبال نمی‌کند (نصفِ باگ قدیمی). `MobileDownloads.tsx:95-111`
- [x] **BUG-057** 🟡 `resumeQueueOnBoot` بدون catch روی fileStat → بوت‌ریکاوری کامل متوقف. `mobile-downloads.ts:273`
- [ ] **BUG-058** 🟡 کاتالوگ: `recheckCatalogNow` گارد inflight را null می‌کند → دو merge همزمان. `catalog-refresh.ts:152-163`
- [ ] **BUG-059** 🟡 self-update: نتیجه‌ی `downloadFile` بررسی نمی‌شود، id ثابت `"frame-update"` تداخل دارد، cancel در خطا نیست. `self-update.ts:310-362`
- [x] **BUG-060** 🟡 mkv-web: unknown-size برای vint طول ≥5 wrap می‌کند → skip نجومی. `mkv-web.ts:557`
- [x] **BUG-061** 🟡 mkv-web: chunk صفر → حلقه‌ی بی‌نهایت روی همان رنج. `mkv-web.ts:1264-1294`
- [ ] **BUG-062** 🟡 mkv-web: 416 در اولین jump → اسکن را «done» جا می‌زند. `mkv-web.ts:1256-1275`
- [ ] **BUG-063** 🟡 fmp4: `sampleRate<<16` برای 88.2/96kHz wrap. `fmp4.ts:229`
- [x] **BUG-064** 🟡 کرسر `gt` + limit500 رویدادهای هم‌میلی‌ثانیه‌ی مرز را می‌پرد. `cloud.ts:1042-1054`

### API
- [x] **BUG-065** 🟡 `cloud-key`: `decodeURIComponent` دوباره → URIError → 500 روی `%`. `title/cloud-key:62-66`
- [x] **BUG-066** 🟡 نقشه‌ی negative در `/api/art` بدون evict → رشد بی‌حد حافظه. `art/route.ts:169-192`
- [ ] **BUG-067** 🟡 ریلی هنر بدون `nosniff`/allowlist content-type (SVG same-origin). `art/route.ts:202-221` + `proxy.ts`
- [ ] **BUG-068** 🟡 پاسخ POST reviews شامل `userKey` خام (همان کوکی httpOnly). `reviews/route.ts:29-33`
- [ ] **BUG-069** 🟡 cap سراسری ۲۰۰ پوستر → کالکشن‌های ۳۵+ بدون پیش‌نمایش. `collections/route.ts:28-32`
- [ ] **BUG-070** 🟡 رقابت manifest در `covers/merge` → گم‌شدن پارت/دوبارشماری. `covers/merge:67-112`
- [ ] **BUG-071** 🟡 ایندکس جستجو کل ردیف‌ها را کش می‌کند (spike حافظه در 15k ردیف). `queries.ts:306-314`
- [x] **BUG-072** 🟡 `Math.max(...rows)` در `/api/x/lite` → RangeError در رشد کاتالوگ. `x/[...path]:175-178`
- [ ] **BUG-073** 🟡 LIKE wildcardها escape نمی‌شوند (جستجو `_`/`%` دروغ می‌گوید). `darkroom/search:15` + `queries.ts`
- [ ] **BUG-074** 🟡 seed: ریکاوری partial-seed کد مرده است (`count>0` کل loop را رد می‌کند). `seed.ts:683-693`
- [x] **BUG-075** 🟡 Prisma: ایندکس `Title.title` (sort=name) و `Episode(titleId,season,number)` نیست. `schema.prisma`

### الکترون
- [x] **BUG-076** 🟡 covers-sync: `timeoutMs` دور ریخته شده → هنگ ابدی sync کاور. `covers-sync.cjs:71-77`
- [ ] **BUG-077** 🟡 covers-sync: writeSync کوتاه + شمارش خوش‌بینانه + `.tmp` رهاشده. `covers-sync.cjs:95-122`
- [ ] **BUG-078** 🟡 `setupUpdater` در مسیر repair دوباره اجرا می‌شود → لیسنر/رپر دوبل. `main.cjs:1135`
- [x] **BUG-079** 🟡 differential: `deltaMode` در download-progress نیست؛ arm-from-disk هاردکد x64. `main.cjs:1462-1495,1409`
- [ ] **BUG-080** 🟡 Range resume بدون If-Range/ETag → چسباندن دو فایل مختلف (خراب). `downloads.cjs:353-357,412-425`
- [x] **BUG-081** 🟡 stream-proxy: `server.once('error')` مصرف می‌شود → خطای بعدی کرش کل اپ. `stream-proxy.cjs:1532-1543`
- [x] **BUG-082** 🟡 stream-proxy: abort در redirect re-arm نمی‌شود. `stream-proxy.cjs:1549-1572`
- [x] **BUG-083** 🟡 stream-proxy: `rejectUnauthorized:false` (MITM). `stream-proxy.cjs:1560`
- [ ] **BUG-084** 🟡 CI: win/mac با seed-version.json کهنه بیلد می‌شوند → sync کامل بی‌مورد در نصب تازه. `desktop.yml:154-166`
- [ ] **BUG-085** 🟡 mac بدون امضا + publishAutoUpdate → هر آپدیت شکست می‌خورد. `electron-builder.yml:33-75`

### UI/UX
- [x] **BUG-086** 🟡 Hero دسکتاپ: باز شدن <1024px و بعد بزرگ‌شدن → صحنه‌ی سینمایی مرده (بدون engine). `Hero.tsx:203-207`
- [x] **BUG-087** 🟡 جستجوی Darkroom بدون abort → نتیجه‌ی قدیمی روی جدید. `DarkroomApp.tsx:168-186`
- [x] **BUG-088** 🟡 سورت «نام» در My List معکوسِ لیبل است (نقیض اضافه). `MyListManager.tsx:136-141,433`
- [ ] **BUG-089** 🟡 دیمر سورت داخل sticky z-30 → هدر/نوبار بالای دیم. `MyListManager.tsx:416-417`
- [ ] **BUG-090** 🟡 نردبان z: palette 120 روی پلیر 100 + tie چهارگانه‌ی z-95. `CommandPalette:203` و غیره
- [x] **BUG-091** 🟡 `h-[82vh]` موبایل → پرش با جمع‌شدن نوار URL (dvh لازم). `Hero.tsx:713`
- [ ] **BUG-092** 🟡 dust hero بدون gate خروج از دید. `Hero.tsx:215-224` + `globals.css:990-1000`
- [x] **BUG-093** 🟡 vignette محیطی هاردکد تیره در تم روز. `page.tsx:156` + `vip/page.tsx:93`
- [x] **BUG-094** 🟡 `::selection` در روز کم‌کنتراست. `globals.css:440`
- [x] **BUG-095** 🟡 track اسلایدر در روز نامرئی. `globals.css:429-431`
- [x] **BUG-096** 🟡 CatalogGate همیشه تیره (`bg-[#070709]`). `CatalogGate.tsx:76`
- [ ] **BUG-097** 🟡 flush native→web موقعیت پخش را گم می‌کند. `PlayerMobile.tsx:3174-3183`
- [ ] **BUG-098** 🟡 MediaSession بعد از بستن پلیر پاک نمی‌شود. `PlayerMobile.tsx:1693-1707`
- [ ] **BUG-099** 🟡 تایمرهای یتیم PlayerMobile/CatalogGate. چندجا
- [ ] **BUG-100** 🟡 PersonPage: «فعالیت ۰ تا ۱۴۰۲» برای سال نامشخص. `PersonPageClient.tsx:91`
- [x] **BUG-101** 🟡 پول 1.5s هر دکمه‌ی دانلود (ده‌ها اسکن/ثانیه در sheet اپیزودها). `MobileDownloads.tsx:55-65`

---

## فاز ۴ — کم/پالایش (۲۹ مورد)

- [ ] **BUG-102** 🟢 خطاهای eslint (React Compiler): TDZ-style در `Player.tsx:295,298` و `CatalogGate.tsx:61` + my-list:55 + memoization skipها — بررسی و اصلاح ارزان‌ها
- [x] **BUG-103** 🟢 unused eslint-disable ها (~۸ مورد) — پاکسازی
- [ ] **BUG-104** 🟢 npm audit: deepmerge-ts/js-yaml/sharp (high) + prismjs/uuid (moderate) — `npm audit fix` محتاط + رگرسیون
- [x] **BUG-105** 🟢 `dl:remove` فایل `.part` را یتیم می‌گذارد. `downloads.cjs:593-601`
- [ ] **BUG-106** 🟢 `writeState` غیراتمیک (خرابی = گم شدن کل صف). `downloads.cjs:56-63`
- [ ] **BUG-107** 🟢 pip: saveBounds آخرین windowی ساخته‌شده را ذخیره می‌کند نه آخرین جابه‌جاشده. `pip.cjs:55-66`
- [ ] **BUG-108** 🟢 pip: bounds بدون x/y → NaN → کرش سازنده. `pip.cjs:45-53`
- [ ] **BUG-109** 🟢 pip: پنجره‌ی fail-load اسلات MAX_PIPS را اشغال می‌کند. `pip.cjs:148`
- [ ] **BUG-110** 🟢 `nama:win` بدون چک sender (هر پنجره‌ای main را کنترل می‌کند). `main.cjs:1585-1591`
- [ ] **BUG-111** 🟢 `loadURL` بدون catch/ریتری. `main.cjs:1050`
- [ ] **BUG-112** 🟢 `install-update` بدون چک downloaded → throw. `main.cjs:1575-1579`
- [ ] **BUG-113** 🟢 reaper: الگوی `server.js` خیلی باز (kill پروسه‌ی بیگناه). `main.cjs:290-327`
- [x] **BUG-114** 🟢 `/subs` بدون گارد empty-target (SubStore("") زباله). `stream-proxy.cjs:1168-1169`
- [ ] **BUG-115** 🟢 copyFileSync 150MB روی main thread (فریز UI). `main.cjs:1334`
- [x] **BUG-116** 🟢 `will-change` روی paint props بی‌اثر. `globals.css:557`
- [ ] **BUG-117** 🟢 tailwind.config.ts در v4 مرده است (بدون @config) — حذف یا سیم‌کشی. `tailwind.config.ts`
- [ ] **BUG-118** 🟢 `.gitignore`: `build/` انکرنشده سایه می‌اندازد. `.gitignore:131-142`
- [ ] **BUG-120** 🟢 اسکریپت‌های POSIX-only (`NODE_ENV=... start`) در ویندوز می‌شکنند. `package.json`
- [ ] **BUG-121** 🟢 gradle cache key ناقص + fallback APK unsigned کرش می‌کند. `desktop.yml:240-273` + `ci.yml:75-82`
- [ ] **BUG-122** 🟢 mkv-web: پروب forced کش نمی‌شود/کش کهنه باطل نمی‌شود. `mkv-web.ts:1086-1131`
- [ ] **BUG-123** 🟢 PipClient حجم 0 را رد می‌کند (عدم هم‌ترازی با فیکس B-10). `PipClient.tsx:203-211`
- [x] **BUG-124** 🟢 ReviewForm بدون catch (شکست بی‌صدا). `ReviewForm.tsx:24-38`
- [ ] **BUG-125** 🟢 search page/ListCalendar بدون catch → اسپینر ابدی. `search/page.tsx:38-50`
- [ ] **BUG-126** 🟢 use-toast: تأخیر حذف 1000000ms + دو سیستم توست موازی. `use-toast.ts:12`
- [ ] **BUG-127** 🟢 وزن‌های فونت: 600=Bold (SemiBold غایب). `globals.css:14-17`
- [ ] **BUG-128** 🟢 CollectionPicker `text-right` در LTR. `CollectionPicker.tsx:130`
- [ ] **BUG-129** 🟢 هیچ `X-Content-Type-Options` سراسری نیست. `proxy.ts` + `next.config.ts`
- [ ] **BUG-130** 🟢 negative-art keys طول نامحدود + `q` طول نامحدود در جستجو. `art/route.ts` + `darkroom/search`

## صف‌های محصولی قبلی (خارج از این آکاردئون — با تایید کاربر صف شده)
- [ ] merge ۸۵۹ عنوان تکراری (با حفظ favorites/progress)
- [ ] تکمیل ژانر تیترهای f2m
- [ ] About دوزبانه
- [ ] سیستم نوتیفیکیشن دسکتاپ
- [ ] ریشه‌یابی کامل fallback آپدیت دیفرنسیل (BUG-079 گام اول است)

---
*گزارش توسط راند ۷-ایجنته‌ی باگ‌هانت تولید شد؛ هر مورد با خواندن کد پیرامونی تأیید شده. مواردی که در آزمون عملی (FK/P2003، traversal، URIError) تأیید شد علامت خورده‌اند.*
