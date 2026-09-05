"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fa } from "@/lib/format";
import { useIsElectron } from "@/lib/platform";

export default function Footer() {
  const pathname = usePathname();
  const electron = useIsElectron();
  if (pathname?.startsWith("/watch/")) return null;

  // Desktop app: no marketing / legal footer – just a slim status strip.
  if (electron) {
    return (
      <footer className="mt-16 border-t border-white/5 pb-24 lg:pb-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-[11px] text-zinc-500 sm:px-8 lg:px-12">
          <p>نما · نسخه‌ی دسکتاپ · © {fa(new Date().getFullYear())}</p>
          <nav className="flex items-center gap-4">
            <Link className="hover:text-white" href="/settings">تنظیمات</Link>
            <Link className="hover:text-white" href="/faq">راهنما</Link>
            <Link className="hover:text-white" href="/settings#about">درباره برنامه</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-20 border-t border-white/5 bg-ink-800 pb-24 lg:pb-10">
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="text-2xl font-black">
              نما<span className="text-brand">.</span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
              سینمای آنلاین نما؛ تماشای هزاران فیلم و سریال با کیفیت 4K HDR، بدون تبلیغ، روی همه‌ی دستگاه‌ها. هر شب یک تجربه‌ی سینمایی تازه.
            </p>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">دسته‌بندی‌ها</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/movies">فیلم‌ها</Link></li>
              <li><Link className="hover:text-white" href="/series">سریال‌ها</Link></li>
              <li><Link className="hover:text-white" href="/genres">ژانرها</Link></li>
              <li><Link className="hover:text-white" href="/collections">مجموعه‌ها</Link></li>
              <li><Link className="hover:text-white" href="/people">هنرمندان</Link></li>
              <li><Link className="hover:text-white" href="/random">امشب چی ببینم؟</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">پشتیبانی</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/about">درباره نما</Link></li>
              <li><Link className="hover:text-white" href="/faq">سوالات متداول</Link></li>
              <li><Link className="hover:text-white" href="/contact">تماس با ما</Link></li>
              <li><Link className="hover:text-white" href="/terms">قوانین استفاده</Link></li>
              <li><Link className="hover:text-white" href="/privacy">حریم خصوصی</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">نما</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/my-list">لیست من</Link></li>
              <li><Link className="hover:text-white" href="/favorites">علاقه‌مندی‌ها</Link></li>
              <li><Link className="hover:text-white" href="/history">تاریخچه تماشا</Link></li>
              <li><Link className="hover:text-white" href="/profile">پروفایل و تنظیمات</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
          <p>© {fa(new Date().getFullYear())} نما. تمامی حقوق محفوظ است.</p>
          <p className="flex items-center gap-3">
            <span className="rounded border border-white/10 px-2 py-0.5">4K</span>
            <span className="rounded border border-white/10 px-2 py-0.5">HDR</span>
            <span className="rounded border border-white/10 px-2 py-0.5">Dolby</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
