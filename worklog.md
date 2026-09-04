# Worklog

---
Task ID: 1
Agent: Super Z (main)
Task: طراحی و ساخت پیش‌نمایش نرم‌افزار ویندوزی Electron برای فیلم و سریال («نواپلی NovaPlay») با طراحی Liquid Glass برگرفته از github.com/heyarny/oc_liquid_glass + پوسترهای AI برای دمو

Work Log:
- سورس oc_liquid_glass بررسی شد (پارامترها: refractStrength -0.08، blurRadiusPx 2، specStrength 25، lightbandColor cyan) و زبان طراحی به CSS برگردانده شد
- سیستم طراحی Liquid Glass در src/app/globals.css ساخته شد: کلاس‌های .lg، .lg-strong، .lg-pill، .lg-active، .lg-btn، .lg-btn-primary با lightband، specular streak، refraction ring
- ۱۷ پوستر عمودی (768x1344) + ۳ کاور عریض (1344x768) با z-ai CLI تولید شد (اسکریپت: scripts/gen_posters.sh)
- فونت فارسی Vazirmatn (۵ وزن) در public/fonts دانلود شد
- داده‌های دمو: src/lib/nova-data.ts — ۱۴ فیلم + ۳ سریال ساختگی با توضیحات فارسی، ژانر، امتیاز، کیفیت و حجم
- کامپوننت‌ها در src/components/nova/: aurora، titlebar (کنترل‌های ویندوزی RTL)، sidebar (nav pill انیمیشنی + ویجت فضای دیسک + پروفایل)، hero (چرخش خودکار ۳ فیلم ویژه)، rows (کارت پوستر + hover overlay + ادامه تماشا + رتبه‌دار)، grid + ژانرچیپس، detail-modal (انتخاب کیفیت/حجم/دانلود/لیست)، player (فول‌اسکرین با کنترل شیشه‌ای)، downloads (نوار شناور + ویو مدیریت با شبیه‌سازی پیشرفت)، settings، toasts
- باگ بحرانی رفع شد: تداخل نام `Home` (export پیش‌فرض صفحه) با آیکون lucide `Home` → بازگشت بی‌نهایت در SSR → OOM و HTML پنج‌مگابایتی؛ با تغییر نام به NovaApp و HomeIcon حل شد
- نکته محیطی: bunx/bun next را زیر runtime Bun اجرا می‌کند؛ برای runtime Node باید `node node_modules/next/dist/bin/next dev` مستقیم اجرا شود. سرور با این روش پایدار روی پورت 3000 بالا آمده
- نویگیشن پایین موبایل اضافه شد (سایدبار در <md مخفی)
- تست کامل با agent-browser: خانه، مودال جزئیات، شروع دانلود + توست، ویو دانلودها، پلیر، فیلم‌ها با فیلتر ژانر، تنظیمات، موبایل — همه 200 و بدون خطای کنسول

Stage Summary:
- پیش‌نمایش کامل اپ «نواپلی» روی http://localhost:3000 در حال سرو است (dev server با node runtime)
- ۱۹ فایل سورس جدید + ۲۰ تصویر AI تولید شد
- برای نسخه Electron بعداً: همین رندر در BrowserWindow لود می‌شود؛ اسکلت آماده است
