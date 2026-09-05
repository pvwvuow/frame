import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import ContinueCard from "@/components/library/ContinueCard";
import { AVATARS } from "@/components/library/SettingsForm";
import { BookmarkIcon, HeartIcon, HistoryIcon, SettingsIcon, StarIcon, ClockIcon, CheckCircleIcon, ChevronLeft } from "@/components/Icons";
import { getProfile, getUserStats, getFavoriteRows, getMyListRows } from "@/lib/library";
import { getContinueWatching } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "پروفایل" };

export default async function ProfilePage() {
  const userKey = await getUserKey();
  const [p, stats, favs, list, cont] = await Promise.all([getProfile(userKey), getUserStats(userKey), getFavoriteRows(userKey), getMyListRows(userKey), getContinueWatching(userKey, 3)]);
  const level = stats.minutesWatched > 1200 ? "سینه‌فیل" : stats.minutesWatched > 300 ? "تماشاگر حرفه‌ای" : stats.minutesWatched > 60 ? "علاقه‌مند" : "تازه‌وارد";
  const maxGenre = stats.topGenres[0]?.count ?? 1;

  const quick = [
    { href: "/my-list", icon: BookmarkIcon, label: "لیست من", v: stats.listCount, tint: "text-brand" },
    { href: "/favorites", icon: HeartIcon, label: "علاقه‌مندی‌ها", v: stats.favCount, tint: "text-rose-400" },
    { href: "/history", icon: HistoryIcon, label: "تاریخچه", v: stats.historyCount, tint: "text-sky-400" },
    { href: "/settings", icon: SettingsIcon, label: "تنظیمات", v: null, tint: "text-zinc-300" },
  ];

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.18),transparent_60%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className={`grid h-28 w-28 shrink-0 place-items-center rounded-[28px] bg-gradient-to-br text-5xl font-black text-white shadow-2xl ${AVATARS[p.avatar] ?? AVATARS[0]}`}>
              {p.displayName.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-brand">{level}</p>
              <h1 className="mt-1 truncate text-4xl font-black text-white sm:text-5xl">{p.displayName}</h1>
              <p className="mt-2 text-sm text-zinc-400">
                عضو از {new Date(stats.memberSince).toLocaleDateString("fa-IR", { year: "numeric", month: "long" })} · {stats.minutesWatched ? formatDuration(stats.minutesWatched) : "۰ دقیقه"} تماشا
              </p>
            </div>
            <Link href="/settings" className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 text-sm font-bold text-white hover:bg-white/10">
              <SettingsIcon width={16} height={16} /> ویرایش پروفایل
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {quick.map((q) => (
              <Link key={q.href} href={q.href} className="glass group flex items-center gap-3 rounded-2xl px-4 py-4 transition hover:border-white/20">
                <span className={`grid h-11 w-11 place-items-center rounded-xl bg-white/5 ${q.tint}`}><q.icon width={20} height={20} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{q.label}</span>
                  {q.v != null && <span className="block text-xs text-zinc-400">{fa(q.v)} مورد</span>}
                </span>
                <ChevronLeft width={16} height={16} className="ms-auto text-zinc-500 transition group-hover:-translate-x-1 group-hover:text-white" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1600px] gap-10 px-4 sm:px-8 lg:grid-cols-[1fr_340px] lg:px-12">
        <div className="space-y-12">
          {cont.length > 0 && (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="text-xl font-extrabold text-white">ادامه تماشا</h2>
                <Link href="/history" className="text-xs text-zinc-400 hover:text-brand">همه</Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cont.map((c) => <ContinueCard key={c.title.id} c={c} />)}</div>
            </section>
          )}
          {favs.length > 0 && (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="flex items-center gap-2 text-xl font-extrabold text-white"><HeartIcon width={18} height={18} filled className="text-rose-500" /> علاقه‌مندی‌های اخیر</h2>
                <Link href="/favorites" className="text-xs text-zinc-400 hover:text-brand">همه</Link>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">{favs.slice(0, 6).map((f) => <div key={f.title.id} className="[&>div]:w-full"><TitleCard t={f.title} size="sm" /></div>)}</div>
            </section>
          )}
          {list.length > 0 && (
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="flex items-center gap-2 text-xl font-extrabold text-white"><BookmarkIcon width={18} height={18} className="text-brand" /> آخرین‌های لیست من</h2>
                <Link href="/my-list" className="text-xs text-zinc-400 hover:text-brand">مدیریت لیست</Link>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">{list.slice(0, 6).map((f) => <div key={f.title.id} className="[&>div]:w-full"><TitleCard t={f.title} size="sm" progress={f.progress} /></div>)}</div>
            </section>
          )}
          {!cont.length && !favs.length && !list.length && (
            <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center">
              <p className="text-xl font-black text-white">پروفایل شما هنوز خالی است</p>
              <p className="mt-2 text-sm text-zinc-500">چند فیلم ببینید یا ذخیره کنید تا این‌جا زنده شود.</p>
              <Link href="/" className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white">رفتن به خانه</Link>
            </div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-white/5 bg-ink-800/60 p-5">
            <h3 className="text-sm font-extrabold text-white">آمار شما</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                { icon: ClockIcon, k: "زمان تماشا", v: stats.minutesWatched ? formatDuration(stats.minutesWatched) : "۰" },
                { icon: CheckCircleIcon, k: "تمام‌شده از لیست", v: fa(stats.watchedCount) },
                { icon: StarIcon, k: "امتیاز داده‌اید", v: `${fa(stats.ratingCount)} عنوان` },
                { icon: HeartIcon, k: "علاقه‌مندی", v: fa(stats.favCount) },
              ].map((s) => (
                <li key={s.k} className="flex items-center gap-3">
                  <s.icon width={16} height={16} className="text-zinc-500" />
                  <span className="text-zinc-400">{s.k}</span>
                  <span className="ms-auto font-bold text-white num">{s.v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-white/5 bg-ink-800/60 p-5">
            <h3 className="text-sm font-extrabold text-white">ژانرهای محبوب شما</h3>
            {stats.topGenres.length ? (
              <ul className="mt-4 space-y-3">
                {stats.topGenres.map((g) => (
                  <li key={g.genre}>
                    <div className="flex items-center justify-between text-xs">
                      <Link href={`/movies?genre=${encodeURIComponent(g.genre)}`} className="font-bold text-zinc-200 hover:text-brand">{g.genre}</Link>
                      <span className="text-zinc-500">{fa(g.count)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-l from-brand to-rose-400" style={{ width: `${(g.count / maxGenre) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">با ذخیره کردن آثار، سلیقه‌تان این‌جا شکل می‌گیرد.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
