import SettingsForm from "@/components/library/SettingsForm";
import { SettingsIcon } from "@/components/Icons";
import { getProfile } from "@/lib/library";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";
export const metadata = { title: "تنظیمات" };

export default async function SettingsPage() {
  const userKey = await getUserKey();
  const p = await getProfile(userKey);
  return (
    <main className="pb-16">
      <div className="mx-auto max-w-4xl px-4 pt-28 sm:px-8 lg:pt-36">
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
            }}
          />
        </div>
      </div>
    </main>
  );
}
