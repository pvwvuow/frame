import Link from "next/link";
import ListCard from "@/components/ListCard";
import TitleCard from "@/components/TitleCard";
import { BookmarkIcon, PlayIcon, ClockIcon, FilmIcon, TvIcon, SparkIcon } from "@/components/Icons";
import { getWatchlist, getContinueWatching, getProgressMap, getTrending } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatClock, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "لیست من | نما" };

export default async function MyListPage() {
  const userKey = await getUserKey();
  const [list, cont, trending] = await Promise.all([getWatchlist(userKey), getContinueWatching(userKey, 20), getTrending(8)]);
  const progress = await getProgressMap(
    userKey,
    list.map((l) => l.title.id)
  );

  const movies = list.filter((l) => l.title.type === "movie").length;
  const series = list.length - movies;
  const totalMinutes = list.reduce((a, l) => a + l.title.duration, 0);
  const genreCount = new Map<string, number>();
  list.forEach((l) => l.title.genres.forEach((g) => genreCount.set(g, (genreCount.get(g) ?? 0) + 1)));
  const topGenre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const heroBackdrop = cont[0]?.title.backdrop ?? list[0]?.title.backdrop ?? trending[0]?.backdrop;

  return (
    <main className="pb-16">
      {/* header */}
      <section className="relative overflow-hidden">
        {heroBackdrop && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroBackdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 blur-sm" />
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
                آثاری که ذخیره کرده‌اید و آن‌هایی که نیمه‌کاره مانده‌اند؛ همه در یک‌جا، همیشه همراه شما.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: BookmarkIcon, v: fa(list.length), k: "ذخیره‌شده" },
                { icon: FilmIcon, v: fa(movies), k: "فیلم" },
                { icon: TvIcon, v: fa(series), k: "سریال" },
                { icon: ClockIcon, v: totalMinutes ? formatDuration(totalMinutes) : "۰", k: "زمان تماشا" },
              ].map((s) => (
                <div key={s.k} className="glass rounded-2xl px-4 py-3">
                  <s.icon width={16} height={16} className="text-zinc-400" />
                  <p className="mt-2 text-lg font-black text-white">{s.v}</p>
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
          <section className="mt-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">ادامه تماشا</h2>
                <p className="text-xs text-zinc-500">از همان‌جا که رها کردید</p>
              </div>
              <span className="text-xs text-zinc-500">{fa(cont.length)} مورد</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cont.map((c) => {
                const p = (c.position / c.duration) * 100;
                return (
                  <div key={c.title.id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-ink-700/40 transition hover:border-white/15">
                    <div className="flex gap-4 p-3">
                      <Link href={`/watch/${c.title.slug}${c.episodeId ? `?ep=${c.episodeId}` : ""}`} className="relative h-[96px] w-[170px] shrink-0 overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.title.backdrop} alt={c.title.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                            <PlayIcon width={18} height={18} className="ms-0.5" />
                          </span>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                          <div className="h-full bg-brand" style={{ width: `${p}%` }} />
                        </div>
                      </Link>
                      <div className="min-w-0 flex-1 py-1">
                        <Link href={`/title/${c.title.slug}`} className="block truncate font-bold text-white hover:text-brand">
                          {c.title.title}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {c.episodeId ? `فصل ${fa(c.season ?? 1)} · قسمت ${fa(c.episodeNumber ?? 1)} · ${c.episodeName}` : `فیلم · ${fa(c.title.year)}`}
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-zinc-300">{fa(Math.round(p))}٪</span>
                          <span>{formatClock(c.duration - c.position)} باقی‌مانده</span>
                        </div>
                        <Link
                          href={`/watch/${c.title.slug}${c.episodeId ? `?ep=${c.episodeId}` : ""}`}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-brand"
                        >
                          <PlayIcon width={12} height={12} /> ادامه
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* saved */}
        <section className="mt-14">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-extrabold text-white">ذخیره‌شده‌ها</h2>
              <p className="text-xs text-zinc-500">
                {list.length ? (
                  <>
                    {fa(list.length)} عنوان{topGenre && <> · بیشتر از همه <span className="text-zinc-300">{topGenre}</span> دوست دارید</>}
                  </>
                ) : (
                  "هنوز چیزی ذخیره نکرده‌اید"
                )}
              </p>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/10 p-12 text-center">
              <div className="absolute -top-20 start-1/2 h-40 w-80 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
              <div className="relative">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <BookmarkIcon width={30} height={30} />
                </span>
                <p className="mt-5 text-xl font-black text-white">لیست شما خالی است</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-500">
                  روی هر پوستر کلیک کنید و با دکمه «+» آن را ذخیره کنید تا بعداً به‌راحتی پیدایش کنید.
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <Link href="/movies" className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
                    مرور فیلم‌ها
                  </Link>
                  <Link href="/series" className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-bold text-white hover:bg-white/10">
                    مرور سریال‌ها
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {list.map(({ title, addedAt }) => (
                <ListCard key={title.id} t={title} progress={progress.get(title.id)} addedAt={new Date(addedAt).toLocaleDateString("fa-IR")} />
              ))}
            </div>
          )}
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
            <Link href="/movies?sort=trending" className="text-xs text-zinc-400 hover:text-brand">
              مشاهده همه
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {trending
              .filter((t) => !list.some((l) => l.title.id === t.id))
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
