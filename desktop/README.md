<div dir="rtl">

# دسکتاپ فریم (Electron)

کلاینت دسکتاپ فریم برای ویندوز، مک و لینوکس. این پوشه کل چیزی است که برای بیلد نصب‌کننده‌ها لازم است.

## چه چیزی داخلش است؟

| مسیر | نقش |
|---|---|
| `src/main.js` | پروسه‌ی اصلی الکترون: پنجره، حفظ ابعاد، تک‌نسخه بودن، محدودسازی دسترسی‌ها، IPC |
| `src/preload.js` | پل امن (`contextIsolation`) بین رابط و سیستم |
| `src/store.js` | ذخیره‌ی ساده‌ی JSON در `userData` (لیست من، ابعاد پنجره) |
| `src/updater.js` | به‌روزرسانی خودکار از GitHub Releases همین مخزن |
| `app/` | رابط کاربری فارسی (RTL): جستجو، فیلتر ژانر/نوع، لیست من، کارت عنوان |
| `scripts/sync-catalog.mjs` | کشیدن آخرین کاتالوگ + فونت + آیکون از ریشه‌ی مخزن پیش از بیلد |
| `electron-builder.yml` | تنظیمات بسته‌بندی و اسامی فایل‌های خروجی |

## داده از کجا می‌آید؟

پیش از هر بیلد، `npm run sync:catalog` فایل `docs/browse.json` (خروجی کاتالوگ عمومی مخزن) را داخل بسته کپی می‌کند؛ پس اپ آفلاین هم بالا می‌آید. در اجرا، کاربر می‌تواند با «به‌روزرسانی داده» نسخه‌ی تازه‌تر را از همان مخزن بگیرد و در `userData` کش کند.

کاورها از `tvframe.vip/covers-web/...` خوانده می‌شوند و اگر در دسترس نباشند، کارت متنی جایگزین می‌شود.

## بیلد محلی

```bash
cd desktop
npm install          # postinstall داده و فونت‌ها را همگام می‌کند
npm start            # اجرا در حالت توسعه

npm run pack:win     # Frame-<ver>-win-x64-setup.exe + -portable.exe
npm run pack:mac     # Frame-<ver>-mac-arm64.dmg + -mac-x64.dmg
npm run pack:linux   # Frame-<ver>-linux-x86_64.AppImage + -amd64.deb
npm run pack:dir     # فقط پوشه‌ی بازشده برای تست سریع
```

خروجی در `desktop/dist/`.

> نکته: بیلد مک فقط روی macOS انجام می‌شود؛ برای ویندوز و لینوکس می‌توان روی هر سیستمی بیلد گرفت، ولی توصیه‌شده همان ورک‌فلو CI است.

## بیلد در گیت‌هاب

ورک‌فلو: `.github/workflows/desktop-release.yml`

- **بیلد آزمایشی:** هر بار که چیزی در `desktop/` روی شاخه‌ی `main` تغییر کند، چهار جاب (Windows، macOS arm64، macOS x64، Linux) بیلد می‌گیرند و خروجی‌ها به‌عنوان Artifact آپلود می‌شوند.
- **انتشار:** با پوش کردن تگ نسخه‌ای ساخته و در Releases منتشر می‌شود:

```bash
git tag v0.9.2
git push --tags
```

- یا اجرای دستی: *Actions → desktop-release → Run workflow* و گزینه‌ی `publish=true`.

پس از انتشار، ورک‌فلو `site-refresh` خودش لینک‌های سایت معرفی را به‌روز می‌کند و کلاینت‌های نصب‌شده نسخه‌ی جدید را از Releases می‌گیرند.

## امضای کد

بیلدها بدون گواهی ساخته می‌شوند (`CSC_IDENTITY_AUTO_DISCOVERY=false`)، پس ویندوز SmartScreen و macOS Gatekeeper هشدار می‌دهند؛ این طبیعی است. برای امضا کافی است سکرت‌های `CSC_LINK` / `CSC_KEY_PASSWORD` (ویندوز) یا `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` (مک) را در مخزن ست کنی؛ بقیه‌ی تنظیمات آماده است.

</div>
