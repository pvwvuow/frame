"use client";

import { useEffect, useState } from "react";
import { fa } from "@/lib/format";

type SyncResult = {
  ok: boolean;
  skipped?: boolean;
  titles?: number;
  episodes?: number;
  created?: number;
  updated?: number;
  removed?: number;
  error?: string | null;
};

/**
 * کارت «به‌روزرسانی خودکار محتوا»:
 * کاتالوگ به‌صورت خودکار از GitHub (یا سرور میزبان) همگام می‌شود؛
 * این کارت وضعیت را نشان می‌دهد و دکمه بررسی فوری دارد.
 */
export default function CatalogUpdateCard() {
  const [titles, setTitles] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const c = j?.catalog;
        if (typeof c?.titles === "number") setTitles(c.titles);
        else if (typeof j?.db?.ok === "boolean") setTitles(null);
      })
      .catch(() => {});
  }, []);

  async function check() {
    setChecking(true);
    setResult(null);
    try {
      const r = await fetch("/api/catalog/sync", { method: "POST" });
      const j: SyncResult = await r.json();
      setResult(j);
      if (j.ok && typeof j.titles === "number") setTitles(j.titles);
    } catch {
      setResult({ ok: false, error: "network" });
    } finally {
      setChecking(false);
    }
  }

  let msg = "";
  let tone = "text-zinc-400";
  if (result) {
    if (result.ok && result.skipped) {
      msg = "کاتالوگ به‌روز است — چیز جدیدی نیست.";
      tone = "text-emerald-400";
    } else if (result.ok) {
      const parts: string[] = [];
      if (result.created) parts.push(`${fa(result.created)} عنوان جدید`);
      if (result.updated) parts.push(`${fa(result.updated)} عنوان به‌روز شد`);
      if (result.removed) parts.push(`${fa(result.removed)} عنوان حذف شد`);
      msg = parts.length ? `${parts.join("، ")} — همگام‌سازی انجام شد. ✔` : "همگام‌سازی انجام شد.";
      tone = "text-emerald-400";
    } else if (result.error === "remote-catalog-disabled") {
      msg = "همگام‌سازی اینترنتی در این نسخه فعال نیست.";
      tone = "text-amber-400";
    } else {
      msg = "اتصال به منبع کاتالوگ برقرار نشد — بعداً دوباره تلاش کنید.";
      tone = "text-rose-400";
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-white/8 bg-white/[0.03] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-white">
            به‌روزرسانی خودکار محتوا
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">فعال</span>
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-zinc-400">
            فیلم‌ها و سریال‌های جدید به‌صورت خودکار از اینترنت دریافت می‌شوند — نیازی به نصب نسخه جدید نیست.
            هر بار برنامه را باز کنید (و هر ۶ ساعت) لیست از GitHub بررسی و محتوای جدید بدون دست‌زدن به
            پروفایل‌ها، علاقه‌مندی‌ها و ادامه‌ی تماشا اضافه می‌شود.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking}
          className="h-11 shrink-0 rounded-xl bg-brand px-6 text-sm font-bold text-white transition hover:bg-brand/85 disabled:opacity-50"
        >
          {checking ? "در حال بررسی…" : "بررسی به‌روزرسانی"}
        </button>
      </div>

      {msg && <p className={`mt-4 text-xs font-bold ${tone}`}>{msg}</p>}
      {typeof titles === "number" && (
        <p className="mt-2 text-[11px] text-zinc-500">کتابخانه فعلی: {fa(titles)} عنوان</p>
      )}
    </section>
  );
}
