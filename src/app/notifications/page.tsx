"use client";

import NotificationList from "@/components/library/NotificationList";
import LoadErrorCard from "@/components/LoadErrorCard";
import { BellIcon } from "@/components/Icons";
import { getNotifications } from "@/lib/mobile/userdata";
import { fa } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";

export default function NotificationsPage() {
  const { data: items, error, retry } = useAsyncData(() => getNotifications(), []);

  return (
    <main className="pb-16">
      <div className="mx-auto max-w-3xl px-4 pt-28 sm:px-8 lg:pt-36">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand"><BellIcon width={16} height={16} /> مرکز اعلان‌ها</p>
        <h1 className="text-4xl font-black text-white sm:text-5xl">اعلان‌ها</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">{fa(items?.length ?? 0)} اعلان بر اساس لیست، تماشاهای نیمه‌کاره و سلیقه‌ی شما.</p>
        <div className="mt-8">
          {error ? (
            <LoadErrorCard onRetry={retry} />
          ) : items ? (
            <NotificationList items={items} />
          ) : (
            <div className="py-16 text-center text-sm text-zinc-500">در حال بارگذاری…</div>
          )}
        </div>
      </div>
    </main>
  );
}
