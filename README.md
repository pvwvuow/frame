# نما · سینمای آنلاین (Next.js 16 + Prisma/SQLite)

پلتفرم استریم فارسی با رابط RTL، پخش‌کننده اختصاصی، کاتالوگ، جستجو و فضای شخصی کامل کاربر.

## اجرا

```bash
npm install          # یا bun install
npx prisma generate
npx prisma db push   # ساخت/به‌روزرسانی db/custom.db
npm run dev          # http://localhost:3000
```

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
| `/settings` | پروفایل، پخش، دسترسی‌پذیری، منطقه خطر |
| `/about` `/faq` `/contact` `/terms` `/privacy` | صفحات اطلاعاتی |

## API

`/api/library` · `/api/watchlist` (POST/PATCH/PUT/DELETE) · `/api/favorites` (POST/PUT/DELETE) · `/api/rating` · `/api/profile` (GET/PATCH/DELETE) · `/api/progress` (POST/DELETE) · `/api/title/[slug]` · `/api/search` · `/api/reviews`

## فونت

- **Vazirmatn** برای متن بدنه
- **Estedad (FD)** برای تیترها — هر دو به‌صورت لوکال در `public/fonts` (بدون وابستگی به اینترنت)
