import Link from "next/link";
import { DownloadIcon, MonitorIcon, RefreshIcon, ShieldIcon, KeyboardIcon, BellIcon } from "@/components/Icons";
import { fa } from "@/lib/format";

export const revalidate = 600;
export const metadata = { title: "دانلود برنامه‌ی دسکتاپ" };

type Asset = { name: string; browser_download_url: string; size: number };
type Release = { tag_name: string; html_url: string; published_at: string; assets: Asset[] } | null;

async function getLatest(): Promise<Release> {
  try {
    const r = await fetch("https://api.github.com/repos/pvwvuow/frame/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "nama-web" },
      next: { revalidate: 600 },
    });
    if (!r.ok) return null;
    return (await r.json()) as Release;
  } catch {
    return null;
  }
}

const mb = (n: number) => `${fa((n / 1024 / 1024).toFixed(0))} مگابایت`;

const PLATFORMS = [
  {
    id: "win",
    name: "ویندوز",
    hint: "ویندوز ۱۰ و ۱۱ · ۶۴ بیت",
    logo: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M3 5.5 10.5 4.5v7H3zm8.5-1.2L21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zm8.5 0H21V21l-9.5-1.4z" /></svg>
    ),
    match: (a: Asset) => /win.*\.exe$/i.test(a.name),
    label: (a: Asset) => (/portable/i.test(a.name) ? "نسخه‌ی پرتابل (بدون نصب)" : "نصب‌کننده (پیشنهادی)"),
  },
  {
    id: "mac",
    name: "مک",
    hint: "macOS 12+ · Apple Silicon و Intel",
    logo: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8 2.2-1.2 3-2.4c.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.6-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.8-1.4z" /></svg>
    ),
    match: (a: Asset) => /mac.*\.(dmg|zip)$/i.test(a.name),
    label: (a: Asset) => `${/arm64/i.test(a.name) ? "Apple Silicon (M1/M2/M3)" : "Intel"} · ${/\.dmg$/i.test(a.name) ? "DMG" : "ZIP"}`,
  },
  {
    id: "linux",
    name: "لینوکس",
    hint: "AppImage همه‌ی توزیع‌ها · deb برای اوبونتو/دبیان",
    logo: (
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M12 2c-2.5 0-4 2-4 4.5 0 1.3.3 2.2.1 3.2-.3 1.4-2.1 3-2.6 5.3-.3 1.4.1 2.4.6 3.1-.6.4-1.3 1-1.1 1.9.3 1.2 2.2 1.1 3.3 1.6 1 .4 1.8.5 2.4-.1.7.1 1.9.1 2.6 0 .6.6 1.4.5 2.4.1 1.1-.5 3-.4 3.3-1.6.2-.9-.5-1.5-1.1-1.9.5-.7.9-1.7.6-3.1-.5-2.3-2.3-3.9-2.6-5.3-.2-1 .1-1.9.1-3.2C16 4 14.5 2 12 2zm-1.5 4a.8 1 0 1 1 0 2 .8 1 0 0 1 0-2zm3 0a.8 1 0 1 1 0 2 .8 1 0 0 1 0-2zM12 8.5c1 0 2.2.6 2.2 1.1s-1.3 1.2-2.2 1.2-2.2-.7-2.2-1.2S11 8.5 12 8.5z" /></svg>
    ),
    match: (a: Asset) => /\.(AppImage|deb)$/i.test(a.name),
    label: (a: Asset) => (/\.deb$/i.test(a.name) ? "بسته‌ی deb" : "AppImage (قابل‌حمل)"),
  },
];

const FEATURES = [
  { icon: MonitorIcon, t: "تجربه‌ی بومی", d: "پنجره‌ی اختصاصی، منوی برنامه، آیکون در تسک‌بار و اجرای سریع بدون مرورگر." },
  { icon: RefreshIcon, t: "به‌روزرسانی خودکار", d: "نسخه‌های جدید در پس‌زمینه دانلود و هنگام بستن برنامه نصب می‌شوند." },
  { icon: ShieldIcon, t: "داده‌های محلی", d: "لیست، تاریخچه و تنظیمات روی همین دستگاه و در پوشه‌ی داده‌ی برنامه ذخیره می‌شوند." },
  { icon: BellIcon, t: "نشان اعلان", d: "تعداد اعلان‌های خوانده‌نشده روی آیکون برنامه نمایش داده می‌شود." },
  { icon: KeyboardIcon, t: "میان‌برهای بیشتر", d: "F11 برای تمام‌صفحه، Ctrl+K برای فرمان سریع و کلیدهای کامل پخش‌کننده." },
];

export default async function DownloadPage() {
  const rel = await getLatest();
  const version = rel?.tag_name?.replace(/^v/, "") ?? null;

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.22),transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-28 sm:px-8 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <DownloadIcon width={16} height={16} /> برنامه‌ی دسکتاپ
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">نما را روی کامپیوترتان نصب کنید</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300">
            همان تجربه‌ی سینمایی نما، این‌بار به‌صورت یک برنامه‌ی مستقل برای ویندوز، مک و لینوکس؛ با به‌روزرسانی خودکار، اجرای سریع‌تر و بدون وابستگی به مرورگر.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            {version ? (
              <>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-bold text-white" dir="ltr">
                  v{version}
                </span>
                <span>منتشرشده در {new Date(rel!.published_at).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" })}</span>
                <a href={rel!.html_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  یادداشت انتشار ←
                </a>
              </>
            ) : (
              <span>در حال حاضر امکان دریافت فهرست نسخه‌ها از GitHub نیست؛ از صفحه‌ی انتشارها دانلود کنید.</span>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-10 grid max-w-6xl gap-4 px-4 sm:px-8 md:grid-cols-3">
        {PLATFORMS.map((p) => {
          const assets = (rel?.assets ?? []).filter(p.match).sort((a, b) => (/portable|zip/i.test(a.name) ? 1 : 0) - (/portable|zip/i.test(b.name) ? 1 : 0));
          return (
            <article key={p.id} className="glass flex flex-col rounded-3xl p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-white">{p.logo}</span>
                <div>
                  <h2 className="text-lg font-extrabold text-white">{p.name}</h2>
                  <p className="text-[11px] text-zinc-500">{p.hint}</p>
                </div>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {assets.length ? (
                  assets.map((a) => (
                    <li key={a.name}>
                      <a
                        href={a.browser_download_url}
                        className="group flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 transition hover:border-brand/40 hover:bg-brand/10"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-white">{p.label(a)}</span>
                          <span className="block truncate text-[10px] text-zinc-500" dir="ltr">
                            {a.name} · {mb(a.size)}
                          </span>
                        </span>
                        <DownloadIcon width={16} height={16} className="shrink-0 text-zinc-400 transition group-hover:text-brand" />
                      </a>
                    </li>
                  ))
                ) : (
                  <li>
                    <a
                      href="https://github.com/pvwvuow/frame/releases/latest"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-zinc-400 hover:text-white"
                    >
                      دریافت از صفحه‌ی انتشارها
                      <DownloadIcon width={16} height={16} />
                    </a>
                  </li>
                )}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-8">
        <h2 className="text-2xl font-black text-white">چرا نسخه‌ی دسکتاپ؟</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="rounded-3xl border border-white/5 bg-ink-800/60 p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand">
                <f.icon width={18} height={18} />
              </span>
              <p className="mt-3 text-sm font-extrabold text-white">{f.t}</p>
              <p className="mt-1 text-xs leading-6 text-zinc-400">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-8">
        <div className="rounded-3xl border border-white/5 bg-ink-800/60 p-6 sm:p-8">
          <h2 className="text-xl font-black text-white">نکات نصب</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-zinc-300">
            <li>
              <b className="text-white">ویندوز:</b> برنامه هنوز امضای دیجیتال ندارد؛ اگر SmartScreen هشدار داد روی «More info ← Run anyway» بزنید.
            </li>
            <li>
              <b className="text-white">مک:</b> در اولین اجرا از منوی راست‌کلیک «Open» را انتخاب کنید یا در System Settings ← Privacy &amp; Security اجازه‌ی اجرا بدهید.
            </li>
            <li>
              <b className="text-white">لینوکس:</b> برای AppImage ابتدا <code dir="ltr" className="rounded bg-white/10 px-1.5 py-0.5 text-xs">chmod +x Nama-*.AppImage</code> را اجرا کنید.
            </li>
            <li>
              داده‌های شما (لیست، تاریخچه، تنظیمات) در پوشه‌ی داده‌ی برنامه ذخیره می‌شود و با به‌روزرسانی از بین نمی‌رود. از <Link href="/settings#privacy" className="text-brand hover:underline">تنظیمات ← داده و حریم خصوصی</Link> می‌توانید پشتیبان JSON بگیرید.
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
