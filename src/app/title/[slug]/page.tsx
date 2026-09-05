import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import WatchlistButton from "@/components/WatchlistButton";
import ReviewForm from "@/components/ReviewForm";
import { PlayIcon, StarIcon, ClockIcon, EyeIcon } from "@/components/Icons";
import { getTitleBySlug, getEpisodes, getSimilar, getReviews, isInWatchlist, getProgressFor } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatDuration, formatViews, typeLabel, formatClock } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTitleBySlug(slug);
  return { title: t ? `${t.title} | نما` : "نما" };
}

export default async function TitlePage({ params }: Props) {
  const { slug } = await params;
  const t = await getTitleBySlug(slug);
  if (!t) notFound();
  const userKey = await getUserKey();
  const [eps, similar, revs, inList, progress] = await Promise.all([
    t.type === "series" ? getEpisodes(t.id) : Promise.resolve([]),
    getSimilar(t),
    getReviews(t.id),
    isInWatchlist(userKey, t.id),
    getProgressFor(userKey, t.id),
  ]);

  const avgUser = revs.length ? revs.reduce((a, r) => a + r.rating, 0) / revs.length : null;
  const resumeHref = progress?.episodeId ? `/watch/${t.slug}?ep=${progress.episodeId}` : `/watch/${t.slug}`;
  const hasProgress = progress && progress.duration > 0 && progress.position / progress.duration < 0.97 && progress.position > 5;
  const seasons = Array.from(new Set(eps.map((e) => e.season)));

  return (
    <main className="pb-10">
      {/* hero */}
      <section className="relative min-h-[70vh] overflow-hidden">
        { }
        <img src={t.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/95 via-ink/70 to-ink/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-black/30" />

        <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col gap-8 px-4 pb-14 pt-28 sm:px-8 lg:flex-row lg:items-end lg:px-12 lg:pt-36">
          <div className="hidden w-[240px] shrink-0 overflow-hidden rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] ring-1 ring-white/10 lg:block">
            { }
            <img src={t.poster} alt={t.title} className="aspect-[2/3] w-full object-cover" />
          </div>

          <div className="max-w-3xl animate-fade-up">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-md bg-brand px-2 py-1 text-white">{typeLabel(t.type)}</span>
              <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200">{t.quality}</span>
              <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200">{t.ageRating}</span>
              <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200">زیرنویس فارسی</span>
              <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-200">دوبله</span>
            </div>
            <h1 className="text-glow text-4xl font-black text-white sm:text-5xl">{t.title}</h1>
            <p className="mt-1 text-sm text-zinc-400" dir="ltr">
              {t.titleEn} ({t.year})
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-200">
              <span className="flex items-center gap-1 rounded-lg bg-amber-400/10 px-2 py-1 font-extrabold text-amber-400">
                <StarIcon width={16} height={16} /> {fa(t.rating)}
                <span className="text-xs font-normal text-amber-200/70">/۱۰</span>
              </span>
              <span className="flex items-center gap-1">
                <ClockIcon width={16} height={16} className="text-zinc-400" />
                {t.type === "series" ? `${fa(eps.length)} قسمت · هر قسمت ${formatDuration(t.duration)}` : formatDuration(t.duration)}
              </span>
              <span className="flex items-center gap-1">
                <EyeIcon width={16} height={16} className="text-zinc-400" />
                {formatViews(t.views)} بازدید
              </span>
              <span className="text-zinc-400">{t.country}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {t.genres.map((g) => (
                <Link
                  key={g}
                  href={`/${t.type === "series" ? "series" : "movies"}?genre=${encodeURIComponent(g)}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                >
                  {g}
                </Link>
              ))}
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-8 text-zinc-300 sm:text-base">{t.description}</p>

            <div className="mt-5 grid gap-1 text-sm text-zinc-400 sm:grid-cols-2">
              <p>
                <span className="text-zinc-500">کارگردان: </span>
                <span className="text-zinc-200">{t.director}</span>
              </p>
              <p>
                <span className="text-zinc-500">بازیگران: </span>
                <span className="text-zinc-200">{t.cast.join("، ")}</span>
              </p>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={resumeHref}
                className="flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-sm font-extrabold text-white shadow-[0_10px_40px_var(--color-brand-glow)] transition hover:scale-[1.03] hover:bg-brand-600"
              >
                <PlayIcon width={20} height={20} />
                {hasProgress ? `ادامه از ${formatClock(progress.position)}` : t.type === "series" ? "پخش قسمت اول" : "پخش فیلم"}
              </Link>
              {t.trailerUrl && (
                <Link href={t.trailerUrl} className="flex h-12 items-center rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur hover:bg-white/20">
                  تریلر
                </Link>
              )}
              <WatchlistButton titleId={t.id} initial={inList} />
            </div>
          </div>
        </div>
      </section>

      {/* episodes */}
      {eps.length > 0 && (
        <section className="mx-auto mt-6 max-w-[1600px] px-4 sm:px-8 lg:px-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-white">قسمت‌ها</h2>
            <span className="text-sm text-zinc-500">
              {seasons.length > 1 ? `${fa(seasons.length)} فصل · ` : "فصل ۱ · "}
              {fa(eps.length)} قسمت
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {eps.map((e) => {
              const active = progress?.episodeId === e.id;
              return (
                <Link
                  key={e.id}
                  href={`/watch/${t.slug}?ep=${e.id}`}
                  className={`group flex gap-4 rounded-2xl border p-3 transition ${
                    active ? "border-brand/50 bg-brand/10" : "border-white/5 bg-ink-700/50 hover:border-white/15 hover:bg-ink-700"
                  }`}
                >
                  <div className="relative h-[84px] w-[150px] shrink-0 overflow-hidden rounded-xl">
                    { }
                    <img src={e.thumbnail} alt={e.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                    <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                      <PlayIcon width={28} height={28} className="text-white" />
                    </div>
                    <span className="absolute bottom-1 end-1 rounded bg-black/70 px-1.5 text-[10px] text-white">{fa(e.duration)} دقیقه</span>
                    {active && progress && progress.duration > 0 && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                        <div className="h-full bg-brand" style={{ width: `${(progress.position / progress.duration) * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 py-1">
                    <p className="text-xs text-zinc-500">قسمت {fa(e.number)}</p>
                    <p className="truncate font-bold text-white">{e.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{e.synopsis}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* reviews */}
      <section className="mx-auto mt-14 max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-white">نظرات کاربران</h2>
          {avgUser !== null && (
            <span className="flex items-center gap-1 text-sm text-zinc-400">
              میانگین کاربران: <StarIcon width={14} height={14} className="text-amber-400" />
              <span className="font-bold text-white">{fa(avgUser.toFixed(1))}</span> ({fa(revs.length)} نظر)
            </span>
          )}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {revs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
                هنوز نظری ثبت نشده. اولین نفر باشید!
              </div>
            ) : (
              <ul className="space-y-3">
                {revs.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-white/5 bg-ink-700/50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-sm font-bold text-white">
                        {r.author.slice(0, 1)}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">{r.author}</p>
                        <p className="text-[11px] text-zinc-500">{new Date(r.createdAt).toLocaleDateString("fa-IR")}</p>
                      </div>
                      <span className="ms-auto flex items-center gap-1 text-sm font-bold text-amber-400">
                        <StarIcon width={14} height={14} /> {fa(r.rating)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="lg:col-span-2">
            <ReviewForm titleId={t.id} slug={t.slug} />
          </div>
        </div>
      </section>

      {similar.length > 0 && (
        <div className="mt-14">
          <Row title="آثار مشابه" subtitle="اگر این را دوست داشتید">
            {similar.map((s) => (
              <TitleCard key={s.id} t={s} />
            ))}
          </Row>
        </div>
      )}
    </main>
  );
}
