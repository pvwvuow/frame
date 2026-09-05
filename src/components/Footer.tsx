"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fa } from "@/lib/format";

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/watch/")) return null;

  return (
    <footer className="mt-20 border-t border-white/5 bg-ink-800 pb-24 md:pb-10">
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 md:grid-cols-4">
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
              <li><Link className="hover:text-white" href="/movies?genre=اکشن">اکشن</Link></li>
              <li><Link className="hover:text-white" href="/movies?genre=علمی‌تخیلی">علمی‌تخیلی</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-white">نما</p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link className="hover:text-white" href="/my-list">لیست تماشا</Link></li>
              <li><span className="hover:text-white">درباره ما</span></li>
              <li><span className="hover:text-white">قوانین و حریم خصوصی</span></li>
              <li><span className="hover:text-white">تماس با ما</span></li>
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
