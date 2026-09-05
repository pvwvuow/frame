"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLibrary } from "./LibraryProvider";
import { CheckIcon, TrashIcon } from "../Icons";
import { ThemeSegment } from "../theme/ThemeToggle";

export const AVATARS = [
  "from-brand to-purple-600",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-lime-400",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-400",
  "from-violet-500 to-fuchsia-500",
  "from-slate-500 to-zinc-400",
  "from-teal-500 to-emerald-400",
  "from-red-600 to-amber-500",
  "from-indigo-500 to-sky-400",
  "from-fuchsia-600 to-rose-500",
  "from-lime-500 to-emerald-600",
];

export type ProfileData = {
  displayName: string;
  avatar: number;
  autoplay: boolean;
  autoNext: boolean;
  quality: string;
  subtitle: string;
  matureContent: boolean;
  reduceMotion: boolean;
};

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 transition hover:border-white/10">
      <span>
        <span className="block text-sm font-bold text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "start-[22px]" : "start-0.5"}`} />
      </button>
    </label>
  );
}

export default function SettingsForm({ initial }: { initial: ProfileData }) {
  const [p, setP] = useState<ProfileData>(initial);
  const [pending, start] = useTransition();
  const [danger, setDanger] = useState<string | null>(null);
  const router = useRouter();
  const lib = useLibrary();
  const dirty = JSON.stringify(p) !== JSON.stringify(initial);

  const save = () =>
    start(async () => {
      try {
        const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
        if (!r.ok) throw new Error();
        lib.setProfile({ displayName: p.displayName, avatar: p.avatar, reduceMotion: p.reduceMotion });
        toast.success("تنظیمات ذخیره شد");
        router.refresh();
      } catch {
        toast.error("ذخیره ناموفق بود");
      }
    });

  const wipe = (scope: string) =>
    start(async () => {
      try {
        await fetch("/api/profile", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
        toast.success("داده‌ها پاک شد");
        setDanger(null);
        await lib.refresh();
        router.refresh();
      } catch {
        toast.error("عملیات ناموفق بود");
      }
    });

  const set = <K extends keyof ProfileData>(k: K, v: ProfileData[K]) => setP((s) => ({ ...s, [k]: v }));

  return (
    <div className="space-y-10">
      {/* profile */}
      <section className="rounded-3xl border border-white/5 bg-ink-800/60 p-6">
        <h2 className="text-lg font-extrabold text-white">پروفایل</h2>
        <p className="text-xs text-zinc-500">نام و آواتار شما در سراسر نما نمایش داده می‌شود.</p>
        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className={`grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br text-4xl font-black text-white shadow-xl ${AVATARS[p.avatar] ?? AVATARS[0]}`}>
            {(p.displayName.trim() || "ن").slice(0, 1)}
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-zinc-400">نام نمایشی</label>
            <input
              value={p.displayName}
              onChange={(e) => set("displayName", e.target.value.slice(0, 40))}
              className="mt-1.5 h-11 w-full max-w-sm rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white focus:border-white/30 focus:outline-none"
              placeholder="مثلاً: آرش"
            />
            <label className="mt-4 block text-xs font-bold text-zinc-400">رنگ آواتار</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVATARS.map((g, i) => (
                <button key={g} type="button" onClick={() => set("avatar", i)} aria-label={`آواتار ${i + 1}`} className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${g} ring-offset-2 ring-offset-ink transition ${p.avatar === i ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}>
                  {p.avatar === i && <CheckIcon width={16} height={16} className="text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* playback */}
      <section className="rounded-3xl border border-white/5 bg-ink-800/60 p-6">
        <h2 className="text-lg font-extrabold text-white">پخش</h2>
        <p className="text-xs text-zinc-500">تجربه‌ی تماشا را شخصی‌سازی کنید.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Toggle checked={p.autoplay} onChange={(v) => set("autoplay", v)} label="پخش خودکار پیش‌نمایش" hint="هنگام باز کردن جزئیات، تریلر بی‌صدا پخش شود" />
          <Toggle checked={p.autoNext} onChange={(v) => set("autoNext", v)} label="پخش خودکار قسمت بعد" hint="در پایان هر قسمت، قسمت بعدی شروع شود" />
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <span className="block text-sm font-bold text-white">کیفیت پیش‌فرض</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                ["auto", "خودکار"],
                ["4k", "4K"],
                ["1080p", "1080p"],
                ["720p", "720p"],
                ["480p", "480p"],
              ].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set("quality", v)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${p.quality === v ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <span className="block text-sm font-bold text-white">زیرنویس پیش‌فرض</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                ["fa", "فارسی"],
                ["en", "English"],
                ["off", "خاموش"],
              ].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set("subtitle", v)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${p.subtitle === v ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* appearance */}
      <section className="rounded-3xl border border-white/5 bg-ink-800/60 p-6">
        <h2 className="text-lg font-extrabold text-white">ظاهر</h2>
        <p className="text-xs text-zinc-500">تم برنامه بلافاصله اعمال می‌شود و روی همین دستگاه ذخیره می‌ماند.</p>
        <div className="mt-5">
          <ThemeSegment />
        </div>
      </section>

      {/* accessibility & content */}
      <section className="rounded-3xl border border-white/5 bg-ink-800/60 p-6">
        <h2 className="text-lg font-extrabold text-white">محتوا و دسترسی‌پذیری</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Toggle checked={p.matureContent} onChange={(v) => set("matureContent", v)} label="نمایش محتوای بزرگسال (+۱۸)" hint="در صورت غیرفعال بودن، این آثار پنهان می‌شوند" />
          <Toggle checked={p.reduceMotion} onChange={(v) => set("reduceMotion", v)} label="کاهش انیمیشن‌ها" hint="برای دستگاه‌های ضعیف یا حساسیت به حرکت" />
        </div>
      </section>

      {/* save bar */}
      <div className={`sticky bottom-20 z-30 transition md:bottom-4 ${dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}>
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl">
          <span className="text-xs text-zinc-300">تغییرات ذخیره‌نشده دارید</span>
          <button type="button" onClick={() => setP(initial)} className="ms-auto h-10 rounded-full px-4 text-xs font-bold text-zinc-300 hover:bg-white/10">بازنشانی</button>
          <button type="button" onClick={save} disabled={pending} className="h-10 rounded-full bg-brand px-6 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50">ذخیره تغییرات</button>
        </div>
      </div>

      {/* danger zone */}
      <section className="rounded-3xl border border-rose-500/20 bg-rose-950/10 p-6">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-rose-300"><TrashIcon width={18} height={18} /> منطقه خطر</h2>
        <p className="text-xs text-zinc-500">این عملیات‌ها قابل بازگشت نیستند.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["history", "پاک کردن تاریخچه تماشا"],
            ["list", "پاک کردن لیست من"],
            ["favorites", "پاک کردن علاقه‌مندی‌ها"],
            ["ratings", "پاک کردن امتیازهای من"],
            ["all", "حذف تمام داده‌های من"],
          ].map(([scope, label]) => (
            <button key={scope} type="button" onClick={() => setDanger(scope)} className={`rounded-full border px-4 py-2 text-xs font-bold transition ${scope === "all" ? "border-rose-500 bg-rose-600 text-white hover:bg-rose-700" : "border-rose-500/30 text-rose-200 hover:bg-rose-500/10"}`}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {danger && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setDanger(null)}>
          <div className="glass w-full max-w-sm rounded-3xl p-6 text-center">
            <h3 className="text-lg font-black text-white">مطمئن هستید؟</h3>
            <p className="mt-2 text-sm leading-7 text-zinc-400">این داده‌ها برای همیشه حذف می‌شوند.</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setDanger(null)} className="h-11 flex-1 rounded-full border border-white/15 text-sm font-bold text-white hover:bg-white/10">انصراف</button>
              <button type="button" onClick={() => wipe(danger)} disabled={pending} className="h-11 flex-1 rounded-full bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">حذف کن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
