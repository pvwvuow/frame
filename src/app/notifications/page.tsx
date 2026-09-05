import NotificationList from "@/components/library/NotificationList";
import { BellIcon } from "@/components/Icons";
import { getNotifications } from "@/lib/notifications";
import { getUserKey } from "@/lib/user";
import { fa } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعلان‌ها" };

export default async function NotificationsPage() {
  const userKey = await getUserKey();
  const items = await getNotifications(userKey);
  return (
    <main className="pb-16">
      <div className="mx-auto max-w-3xl px-4 pt-28 sm:px-8 lg:pt-36">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand"><BellIcon width={16} height={16} /> مرکز اعلان‌ها</p>
        <h1 className="text-4xl font-black text-white sm:text-5xl">اعلان‌ها</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">{fa(items.length)} اعلان بر اساس لیست، تماشاهای نیمه‌کاره و سلیقه‌ی شما.</p>
        <div className="mt-8">
          <NotificationList items={items} />
        </div>
      </div>
    </main>
  );
}
