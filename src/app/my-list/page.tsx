import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import MyListManager from "@/components/library/MyListManager";
import ContinueCard from "@/components/library/ContinueCard";
import { BookmarkIcon, ClockIcon, FilmIcon, TvIcon, SparkIcon, HeartIcon, HistoryIcon, CheckCircleIcon } from "@/components/Icons";
import { getContinueWatching, getTrending } from "@/lib/queries";
import { getMyListRows, getUserStats } from "@/lib/library";
import { getUserKey } from "@/lib/user";
import { fa, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "لیست من" };

export default async function MyListPage() {
  const userKey = await getUserKey();
  const [rows, cont, trending, stats] = await Promise.all([getMyListRows(userKey), getContinueWatching(userKey, 6), getTrending(16), getUserStats(userKey)]);

  const movies = rows.filter((l) => l.title.type === "movie").length;
  const series = rows.length - movies;
  const totalMinutes = rows.reduce((a, l) => a + l.title.duration, 0);
  const topGenre = stats.topGenres[0]?.genre;
  const heroBackdrop = cont[0]?.title.backdrop ?? rows[0]?.title.backdrop ?? trending[0]?.backdrop;
  const watchedPct = rows.length ? Math.round((stats.watchedCount / rows.length) * 100) : 0;

  return (
    <main className="pb-16">
      {/* header */}
      <section className="relative overflow-hidden">
        {heroBackdrop && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroBackdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm" />
            <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/85 to-ink" />
          </>
        )}
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
                <BookmarkIcon width={16} height={16} /> فضای شخصی شما
              </p>
              <h1 className="text-4xl font-black text-white sm:text-5xl">لیست من</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">
                همه‌ی آثاری که ذخیره کرده‌اید را این‌جا مدیریت کنید: وضعیت تماشا، یادداشت، سنجاق، امتیاز شخصی، انتخاب گروهی و خروجی گرفتن.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Link href="/favorites" className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-bold text-rose-300 hover:bg-rose-500/20">
                  <HeartIcon width={13} height={13} filled /> علاقه‌مندی‌ها ({fa(stats.favCount)})
                </Link>
                <Link href="/history" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-zinc-200 hover:bg-white/10">
                  <HistoryIcon width={13} height={13} /> تاریخچه تماشا ({fa(stats.historyCount)})
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { icon: BookmarkIcon, v: fa(rows.length), k: "ذخیره‌شده" },
                { icon: FilmIcon, v: fa(movies), k: "فیلم" },
                { icon: TvIcon, v: fa(series), k: "سریال" },
                { icon: CheckCircleIcon, v: `${fa(watchedPct)}٪`, k: "تماشا شده" },
                { icon: ClockIcon, v: totalMinutes ? formatDuration(totalMinutes) : "۰", k: "زمان کل" },
              ].map((s) => (
                <div key={s.k} className="glass rounded-2xl px-4 py-3">
                  <s.icon width={16} height={16} className="text-zinc-400" />
                  <p className="mt-2 text-lg font-black text-white num">{s.v}</p>
                  <p className="text-[11px] text-zinc-400">{s.k}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        {/* continue watching */}
        {cont.length > 0 && (
          <section className="mt-2">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">ادامه تماشا</h2>
                <p className="text-xs text-zinc-500">از همان‌جا که رها کردید</p>
              </div>
              <Link href="/history" className="text-xs text-zinc-400 hover:text-brand">تاریخچه کامل</Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cont.map((c) => (
                <ContinueCard key={c.title.id} c={c} />
              ))}
            </div>
          </section>
        )}

        {/* manager */}
        <section className="mt-12">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-white">مدیریت لیست</h2>
              <p className="text-xs text-zinc-500">
                {rows.length ? <>{fa(rows.length)} عنوان{topGenre && <> · بیشتر از همه <span className="text-zinc-300">{topGenre}</span> دوست دارید</>}</> : "هنوز چیزی ذخیره نکرده‌اید"}
              </p>
            </div>
          </div>
          <MyListManager rows={rows} />
        </section>

        {/* suggestions */}
        <section className="mt-16">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-white">
                <SparkIcon width={18} height={18} className="text-brand" /> پیشنهاد برای شما
              </h2>
              <p className="text-xs text-zinc-500">{topGenre ? `بر اساس علاقه‌تان به ${topGenre}` : "پرطرفدارترین‌های این هفته"}</p>
            </div>
            <Link href="/movies?sort=trending" className="text-xs text-zinc-400 hover:text-brand">مشاهده همه</Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {trending
              .filter((t) => !rows.some((l) => l.title.id === t.id))
              .sort((a, b) => (topGenre ? Number(b.genres.includes(topGenre)) - Number(a.genres.includes(topGenre)) : 0))
              .slice(0, 8)
              .map((t) => (
                <div key={t.id} className="[&>div]:w-full">
                  <TitleCard t={t} />
                </div>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
