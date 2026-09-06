import Link from "next/link";
import SettingsForm from "@/components/library/SettingsForm";
import SourceSyncCard from "@/components/settings/SourceSyncCard";
import CatalogUpdateCard from "@/components/settings/CatalogUpdateCard";
import { SettingsIcon, HelpIcon, ShieldIcon, KeyboardIcon, InfoIcon, MailIcon } from "@/components/Icons";
import { getProfile } from "@/lib/library";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";
export const metadata = { title: "تنظیمات" };

export default async function SettingsPage() {
  const userKey = await getUserKey();
  const p = await getProfile(userKey);
  return (
    <main className="pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-28 sm:px-8 lg:pt-36">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand"><SettingsIcon width={16} height={16} /> شخصی‌سازی</p>
        <h1 className="text-4xl font-black text-white sm:text-5xl">تنظیمات</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">پروفایل، پخش و حریم خصوصی خود را از این‌جا مدیریت کنید. تنظیمات روی همین دستگاه ذخیره می‌شود.</p>
        <div className="mt-10">
          <SettingsForm
            initial={{
              displayName: p.displayName,
              avatar: p.avatar,
              autoplay: p.autoplay,
              autoNext: p.autoNext,
              quality: p.quality,
              subtitle: p.subtitle,
              matureContent: p.matureContent,
              reduceMotion: p.reduceMotion,
              skipIntro: p.skipIntro,
              playbackSpeed: p.playbackSpeed,
              volume: p.volume,
              dataSaver: p.dataSaver,
              notifyNewEpisodes: p.notifyNewEpisodes,
              notifyRecommendations: p.notifyRecommendations,
              notifyContinue: p.notifyContinue,
              kidsMode: p.kidsMode,
              parentalPin: p.parentalPin,
              language: p.language,
            }}
          />
        </div>
        <CatalogUpdateCard />
        <SourceSyncCard />

        {/* support — merged into settings (menu only links here) */}
        <section id="support" className="mt-8 scroll-mt-28 rounded-3xl border border-white/5 bg-ink-700/40 p-5 sm:p-6">
          <h2 className="text-sm font-extrabold text-white">پشتیبانی و راهنما</h2>
          <p className="mt-1 text-xs text-zinc-500">همه‌ی بخش‌های کمکی یک‌جا، داخل تنظیمات.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { href: "/settings#parental", icon: ShieldIcon, label: "کنترل والدین و PIN", d: "حالت کودک، قفل محتوای بزرگسال" },
              { href: "/settings#shortcuts", icon: KeyboardIcon, label: "میان‌برهای صفحه‌کلید", d: "کلیدهای سریع پخش‌کننده" },
              { href: "/faq", icon: HelpIcon, label: "سوالات پرتکرار", d: "راهنمای استفاده از فریم" },
              { href: "/contact", icon: MailIcon, label: "تماس با ما", d: "گزارش مشکل یا پیشنهاد" },
              { href: "/about", icon: InfoIcon, label: "درباره فریم", d: "نسخه، تیم و توضیحات" },
            ].map((x) => (
              <Link
                key={x.href}
                href={x.href}
                className="group flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3.5 transition hover:border-brand/40 hover:bg-brand/5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-300 transition group-hover:bg-brand/15 group-hover:text-brand">
                  <x.icon width={18} height={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{x.label}</span>
                  <span className="block text-[11px] text-zinc-500">{x.d}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
