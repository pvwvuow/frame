"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLibrary } from "./LibraryProvider";
import { CheckIcon, TrashIcon, UserIcon, PlayIcon, SunIcon, BellIcon, ShieldIcon, LockIcon, KeyboardIcon, InfoIcon, FolderIcon, RefreshIcon, DownloadIcon, ExternalIcon, MonitorIcon } from "../Icons";
import { ThemeSegment } from "../theme/ThemeToggle";
import { bridge, useIsElectron } from "@/lib/platform";
import { fa } from "@/lib/format";

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
  skipIntro: boolean;
  playbackSpeed: number;
  volume: number;
  dataSaver: boolean;
  notifyNewEpisodes: boolean;
  notifyRecommendations: boolean;
  notifyContinue: boolean;
  kidsMode: boolean;
  parentalPin: string;
  language: string;
};

const SECTIONS = [
  { id: "profile", label: "پروفایل", icon: UserIcon },
  { id: "playback", label: "پخش", icon: PlayIcon },
  { id: "appearance", label: "ظاهر و زبان", icon: SunIcon },
  { id: "notifications", label: "اعلان‌ها", icon: BellIcon },
  { id: "parental", label: "کنترل والدین", icon: LockIcon },
  { id: "privacy", label: "داده و حریم خصوصی", icon: ShieldIcon },
  { id: "shortcuts", label: "میان‌برها", icon: KeyboardIcon },
  { id: "about", label: "درباره برنامه", icon: InfoIcon },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const SHORTCUTS: { keys: string[]; label: string; scope: string }[] = [
  { keys: ["Ctrl", "K"], label: "باز کردن Command Palette", scope: "همه‌جا" },
  { keys: ["/"], label: "جستجو", scope: "همه‌جا" },
  { keys: ["Esc"], label: "بستن مودال / منو", scope: "همه‌جا" },
  { keys: ["Space"], label: "پخش / توقف", scope: "پخش‌کننده" },
  { keys: ["→"], label: "۱۰ ثانیه جلو", scope: "پخش‌کننده" },
  { keys: ["←"], label: "۱۰ ثانیه عقب", scope: "پخش‌کننده" },
  { keys: ["↑", "↓"], label: "کم و زیاد کردن صدا", scope: "پخش‌کننده" },
  { keys: ["M"], label: "بی‌صدا", scope: "پخش‌کننده" },
  { keys: ["F"], label: "تمام‌صفحه", scope: "پخش‌کننده" },
  { keys: ["N"], label: "قسمت بعدی", scope: "پخش‌کننده" },
  { keys: ["Ctrl", "R"], label: "بارگذاری مجدد", scope: "برنامه دسکتاپ" },
  { keys: ["F11"], label: "تمام‌صفحه پنجره", scope: "برنامه دسکتاپ" },
];

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 transition hover:border-white/10 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm font-bold text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "start-[22px]" : "start-0.5"}`} />
      </button>
    </label>
  );
}

function Chips<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <span className="block text-sm font-bold text-white">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)} aria-pressed={value === v} className={`rounded-full px-3 py-1 text-xs font-bold transition ${value === v ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({ title, desc, children, id }: { title: string; desc?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-3xl border border-white/5 bg-ink-800/60 p-5 sm:p-6">
      <h2 className="text-lg font-extrabold text-white">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function SettingsForm({ initial }: { initial: ProfileData }) {
  const [p, setP] = useState<ProfileData>(initial);
  const [pending, start] = useTransition();
  const [danger, setDanger] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>("profile");
  const [pinDraft, setPinDraft] = useState("");
  const [info, setInfo] = useState<Awaited<ReturnType<NonNullable<ReturnType<typeof bridge>>["getInfo"]>> | null>(null);
  const [checking, setChecking] = useState(false);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);
  const router = useRouter();
  const lib = useLibrary();
  const electron = useIsElectron();
  const dirty = useMemo(() => JSON.stringify(p) !== JSON.stringify(initial), [p, initial]);

  // deep-link: /settings#shortcuts
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "") as SectionId;
      if (SECTIONS.some((s) => s.id === h)) setSection(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    if (electron) bridge()?.getInfo().then(setInfo).catch(() => {});
    navigator.storage?.estimate?.().then((e) => setStorage({ used: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {});
  }, [electron]);

  // warn on unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = () =>
    start(async () => {
      try {
        const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
        if (!r.ok) throw new Error();
        lib.setProfile({ displayName: p.displayName, avatar: p.avatar, reduceMotion: p.reduceMotion, kidsMode: p.kidsMode, hasPin: !!p.parentalPin });
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

  const exportAll = async () => {
    try {
      const r = await fetch("/api/library");
      const d = await r.json();
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: p, ...d }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `nama-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("پشتیبان دانلود شد");
    } catch {
      toast.error("خروجی گرفتن ناموفق بود");
    }
  };

  const checkUpdates = async () => {
    const b = bridge();
    if (!b) return;
    setChecking(true);
    try {
      const r = await b.checkForUpdates();
      if (r.status === "available") toast.info(`نسخه‌ی ${r.version ?? "جدید"} پیدا شد و در حال دانلود است.`);
      else if (r.status === "not-available") toast.success("شما آخرین نسخه را دارید.");
      else if (r.status === "disabled") toast.message("به‌روزرسانی خودکار فقط در نسخه‌ی نصب‌شده فعال است.");
      else toast.error(r.message ?? "بررسی به‌روزرسانی ناموفق بود.");
    } finally {
      setChecking(false);
    }
  };

  const set = <K extends keyof ProfileData>(k: K, v: ProfileData[K]) => setP((s) => ({ ...s, [k]: v }));
  const visibleSections = SECTIONS.filter((s) => s.id !== "about" || true);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* side nav */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <nav className="no-scrollbar flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="بخش‌های تنظیمات">
          {visibleSections.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSection(s.id);
                  history.replaceState(null, "", `#${s.id}`);
                }}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon width={16} height={16} className={active ? "text-brand" : ""} />
                {s.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        {section === "profile" && (
          <Card title="پروفایل" desc="نام و آواتار شما در سراسر نما نمایش داده می‌شود.">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className={`grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br text-4xl font-black text-white shadow-xl ${AVATARS[p.avatar] ?? AVATARS[0]}`}>
                {(p.displayName.trim() || "ن").slice(0, 1)}
              </div>
              <div className="flex-1">
                <label htmlFor="displayName" className="block text-xs font-bold text-zinc-400">نام نمایشی</label>
                <input
                  id="displayName"
                  value={p.displayName}
                  onChange={(e) => set("displayName", e.target.value.slice(0, 40))}
                  className="mt-1.5 h-11 w-full max-w-sm rounded-xl border border-white/10 bg-black/40 px-4 text-sm text-white focus:border-white/30 focus:outline-none"
                  placeholder="مثلاً: آرش"
                />
                <p className="mt-1 text-[10px] text-zinc-600">{fa(p.displayName.length)}/{fa(40)}</p>
                <label className="mt-3 block text-xs font-bold text-zinc-400">رنگ آواتار</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AVATARS.map((g, i) => (
                    <button key={g} type="button" onClick={() => set("avatar", i)} aria-label={`آواتار ${i + 1}`} aria-pressed={p.avatar === i} className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${g} ring-offset-2 ring-offset-ink transition ${p.avatar === i ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`}>
                      {p.avatar === i && <CheckIcon width={16} height={16} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {section === "playback" && (
          <>
            <Card title="پخش" desc="رفتار پیش‌فرض پخش‌کننده را تعیین کنید.">
              <div className="grid gap-3 md:grid-cols-2">
                <Toggle checked={p.autoplay} onChange={(v) => set("autoplay", v)} label="پخش خودکار پیش‌نمایش" hint="هنگام باز کردن جزئیات، تریلر بی‌صدا پخش شود" />
                <Toggle checked={p.autoNext} onChange={(v) => set("autoNext", v)} label="پخش خودکار قسمت بعد" hint="در پایان هر قسمت، قسمت بعدی شروع شود" />
                <Toggle checked={p.skipIntro} onChange={(v) => set("skipIntro", v)} label="دکمه‌ی رد کردن تیتراژ" hint="نمایش «رد کردن» در ابتدای قسمت‌ها" />
                <Toggle checked={p.dataSaver} onChange={(v) => set("dataSaver", v)} label="صرفه‌جویی در مصرف داده" hint="کیفیت پایین‌تر و بدون پیش‌بارگذاری" />
                <Chips label="کیفیت پیش‌فرض" value={p.quality} onChange={(v) => set("quality", v)} options={[["auto", "خودکار"], ["4k", "4K"], ["1080p", "1080p"], ["720p", "720p"], ["480p", "480p"]]} />
                <Chips label="زیرنویس پیش‌فرض" value={p.subtitle} onChange={(v) => set("subtitle", v)} options={[["fa", "فارسی"], ["en", "English"], ["off", "خاموش"]]} />
                <Chips label="سرعت پخش پیش‌فرض" value={p.playbackSpeed} onChange={(v) => set("playbackSpeed", v)} options={[[0.5, "۰.۵×"], [0.75, "۰.۷۵×"], [1, "۱×"], [1.25, "۱.۲۵×"], [1.5, "۱.۵×"], [2, "۲×"]]} />
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">صدای پیش‌فرض</span>
                    <span className="text-xs text-zinc-400 num">{fa(p.volume)}٪</span>
                  </div>
                  <input type="range" min={0} max={100} value={p.volume} onChange={(e) => set("volume", Number(e.target.value))} className="range-input mt-3 w-full" dir="ltr" aria-label="صدای پیش‌فرض" />
                </div>
              </div>
            </Card>
          </>
        )}

        {section === "appearance" && (
          <>
            <Card title="ظاهر" desc="تم برنامه بلافاصله اعمال می‌شود و روی همین دستگاه ذخیره می‌ماند.">
              <ThemeSegment />
            </Card>
            <Card title="زبان و دسترسی‌پذیری">
              <div className="grid gap-3 md:grid-cols-2">
                <Chips label="زبان رابط کاربری" value={p.language} onChange={(v) => set("language", v)} options={[["fa", "فارسی"], ["en", "English (به‌زودی)"]]} />
                <Toggle checked={p.reduceMotion} onChange={(v) => set("reduceMotion", v)} label="کاهش انیمیشن‌ها" hint="برای دستگاه‌های ضعیف یا حساسیت به حرکت" />
              </div>
            </Card>
          </>
        )}

        {section === "notifications" && (
          <Card title="اعلان‌ها" desc="اعلان‌ها در مرکز اعلان‌های نما (و در نسخه‌ی دسکتاپ روی نشان برنامه) نمایش داده می‌شوند.">
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle checked={p.notifyNewEpisodes} onChange={(v) => set("notifyNewEpisodes", v)} label="قسمت‌های جدید" hint="برای سریال‌های داخل لیست شما" />
              <Toggle checked={p.notifyRecommendations} onChange={(v) => set("notifyRecommendations", v)} label="پیشنهادهای ویژه" hint="بر اساس ژانرهای مورد علاقه‌تان" />
              <Toggle checked={p.notifyContinue} onChange={(v) => set("notifyContinue", v)} label="یادآوری ادامه تماشا" hint="آثاری که نیمه‌کاره رها کرده‌اید" />
            </div>
          </Card>
        )}

        {section === "parental" && (
          <>
            <Card title="کنترل والدین" desc="محتوای نامناسب را محدود کنید و برای خروج از حالت کودک، پین تعیین کنید.">
              <div className="grid gap-3 md:grid-cols-2">
                <Toggle checked={p.matureContent} onChange={(v) => set("matureContent", v)} label="نمایش محتوای بزرگسال (+۱۸)" hint="در صورت غیرفعال بودن، این آثار پنهان می‌شوند" disabled={p.kidsMode} />
                <Toggle
                  checked={p.kidsMode}
                  onChange={(v) => {
                    set("kidsMode", v);
                    if (v) set("matureContent", false);
                  }}
                  label="حالت کودک"
                  hint="فقط آثار رده‌ی سنی «همه» و +۷ نمایش داده می‌شود"
                />
              </div>
              <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">پین ۴ رقمی</p>
                    <p className="text-[11px] text-zinc-500">{p.parentalPin ? "پین تنظیم شده است." : "پینی تنظیم نشده است."}</p>
                  </div>
                  {p.parentalPin && (
                    <button type="button" onClick={() => set("parentalPin", "")} className="rounded-full border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/10">
                      حذف پین
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    aria-label="پین جدید"
                    dir="ltr"
                    className="h-11 w-32 rounded-xl border border-white/10 bg-black/40 px-4 text-center text-lg tracking-[0.5em] text-white focus:border-white/30 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={pinDraft.length !== 4}
                    onClick={() => {
                      set("parentalPin", pinDraft);
                      setPinDraft("");
                      toast.message("پین تنظیم شد؛ فراموش نکنید ذخیره کنید.");
                    }}
                    className="h-11 rounded-xl bg-white px-4 text-xs font-bold text-black disabled:opacity-40"
                  >
                    {p.parentalPin ? "تغییر پین" : "تنظیم پین"}
                  </button>
                </div>
              </div>
            </Card>
          </>
        )}

        {section === "privacy" && (
          <>
            <Card title="داده‌های شما" desc="تمام داده‌ها به‌صورت محلی روی همین دستگاه ذخیره می‌شوند.">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-sm font-bold text-white">پشتیبان‌گیری</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">خروجی JSON از لیست، علاقه‌مندی‌ها، امتیازها و تنظیمات</p>
                  <button type="button" onClick={exportAll} className="mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-zinc-200">
                    <DownloadIcon width={14} height={14} /> دانلود پشتیبان
                  </button>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="text-sm font-bold text-white">حافظه‌ی مرورگر / برنامه</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {storage ? `${(storage.used / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت استفاده شده` : "در حال محاسبه…"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem("nama-recent");
                      sessionStorage.clear();
                      toast.success("کش موقت پاک شد");
                    }}
                    className="mt-3 rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
                  >
                    پاک کردن کش
                  </button>
                </div>
              </div>
            </Card>
            <section className="rounded-3xl border border-rose-500/20 bg-rose-950/10 p-5 sm:p-6">
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
          </>
        )}

        {section === "shortcuts" && (
          <Card id="shortcuts" title="میان‌برهای صفحه‌کلید" desc="برای کار سریع‌تر با نما.">
            <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5">
              {SHORTCUTS.filter((s) => electron || s.scope !== "برنامه دسکتاپ").map((s) => (
                <li key={s.label} className="flex items-center gap-3 bg-white/[0.02] px-4 py-3">
                  <span className="flex-1 text-sm text-zinc-200">{s.label}</span>
                  <span className="hidden text-[10px] text-zinc-500 sm:block">{s.scope}</span>
                  <span className="flex items-center gap-1" dir="ltr">
                    {s.keys.map((k) => (
                      <kbd key={k} className="min-w-[28px] rounded-md border border-white/15 bg-white/5 px-2 py-1 text-center font-mono text-[11px] text-zinc-200">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {section === "about" && (
          <Card id="about" title={electron ? "برنامه‌ی دسکتاپ نما" : "درباره نما"} desc={electron ? "اطلاعات نسخه، به‌روزرسانی و مسیر داده‌ها." : "اطلاعات نسخه‌ی وب."}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-white"><MonitorIcon width={16} height={16} className="text-brand" /> نسخه</p>
                <dl className="mt-3 space-y-1.5 text-xs text-zinc-400" dir="ltr">
                  <div className="flex justify-between"><dt>App</dt><dd className="text-zinc-200">v{info?.version ?? bridge()?.version ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "0.2.1"}</dd></div>
                  {info && (
                    <>
                      <div className="flex justify-between"><dt>Electron</dt><dd className="text-zinc-200">{info.electron}</dd></div>
                      <div className="flex justify-between"><dt>Chromium</dt><dd className="text-zinc-200">{info.chrome}</dd></div>
                      <div className="flex justify-between"><dt>Node</dt><dd className="text-zinc-200">{info.node}</dd></div>
                      <div className="flex justify-between"><dt>Platform</dt><dd className="text-zinc-200">{info.platform} / {info.arch}</dd></div>
                    </>
                  )}
                </dl>
              </div>
              {electron ? (
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-white"><RefreshIcon width={16} height={16} className="text-brand" /> به‌روزرسانی</p>
                  <p className="mt-1 text-[11px] text-zinc-500">نسخه‌های جدید از GitHub Releases دریافت می‌شوند.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={checkUpdates} disabled={checking} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-zinc-200 disabled:opacity-50">
                      <RefreshIcon width={14} height={14} className={checking ? "animate-spin" : ""} /> بررسی به‌روزرسانی
                    </button>
                    <button type="button" onClick={() => bridge()?.openDataDir()} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/10">
                      <FolderIcon width={14} height={14} /> پوشه‌ی داده‌ها
                    </button>
                    <button type="button" onClick={() => bridge()?.openExternal("https://github.com/pvwvuow/frame/releases")} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/10">
                      <ExternalIcon width={14} height={14} /> صفحه‌ی انتشار
                    </button>
                  </div>
                  {info && <p className="mt-3 truncate text-[10px] text-zinc-600" dir="ltr" title={info.dbPath}>{info.dbPath}</p>}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-white"><DownloadIcon width={16} height={16} className="text-brand" /> نسخه‌ی دسکتاپ</p>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">نما را به‌صورت برنامه‌ی ویندوز، مک یا لینوکس نصب کنید؛ با پخش آفلاین‌تر، به‌روزرسانی خودکار و میان‌برهای بیشتر.</p>
                  <a href="https://github.com/pvwvuow/frame/releases/latest" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black hover:bg-zinc-200">
                    <DownloadIcon width={14} height={14} /> دریافت از GitHub
                  </a>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* save bar */}
        <div className={`sticky bottom-20 z-30 transition lg:bottom-4 ${dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}>
          <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl">
            <span className="text-xs text-zinc-300">تغییرات ذخیره‌نشده دارید</span>
            <button type="button" onClick={() => setP(initial)} className="ms-auto h-10 rounded-full px-4 text-xs font-bold text-zinc-300 hover:bg-white/10">بازنشانی</button>
            <button type="button" onClick={save} disabled={pending} className="h-10 rounded-full bg-brand px-6 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50">
              {pending ? "در حال ذخیره…" : "ذخیره تغییرات"}
            </button>
          </div>
        </div>
      </div>

      {danger && (
        <div className="fixed inset-0 z-[90] grid place-items-center p-4" style={{ background: "var(--overlay)", backdropFilter: "blur(6px)" }} onMouseDown={(e) => e.target === e.currentTarget && setDanger(null)}>
          <div role="alertdialog" aria-modal="true" className="glass-strong glass-in w-full max-w-sm rounded-3xl p-6">
            <h3 className="text-lg font-extrabold text-white">مطمئن هستید؟</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {danger === "all" ? "تمام داده‌های شما شامل لیست، علاقه‌مندی‌ها، تاریخچه، امتیازها و پروفایل حذف می‌شود." : "این داده‌ها برای همیشه حذف می‌شوند و قابل بازیابی نیستند."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDanger(null)} className="h-10 rounded-full px-4 text-sm font-bold text-zinc-300 hover:bg-white/10">انصراف</button>
              <button type="button" onClick={() => wipe(danger)} disabled={pending} className="h-10 rounded-full bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                {pending ? "در حال حذف…" : "بله، حذف کن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
