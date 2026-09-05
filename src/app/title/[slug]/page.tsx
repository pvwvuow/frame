import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import WatchlistButton from "@/components/WatchlistButton";
import FavoriteButton from "@/components/FavoriteButton";
import RatingControl from "@/components/RatingControl";
import StatusSelect from "@/components/StatusSelect";
import ReviewForm from "@/components/ReviewForm";
import DetailTabs from "@/components/title/DetailTabs";
import EpisodeList from "@/components/title/EpisodeList";
import { TrailerButton, ShareButton } from "@/components/title/TitleActions";
import {
  PlayIcon,
  StarIcon,
  ClockIcon,
  EyeIcon,
  CalendarIcon,
  GlobeIcon,
  ClapperIcon,
  UsersIcon,
  SubtitleIcon,
  FlameIcon,
} from "@/components/Icons";
import {
  getTitleBySlug,
  getEpisodes,
  getSimilar,
  getReviews,
  isInWatchlist,
  getProgressFor,
  getByDirector,
} from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatDuration, formatViews, typeLabel, formatClock } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTitleBySlug(slug);
  return { title: t ? `${t.title} (${t.year}) | نما` : "نما", description: t?.description };
}

const AVATAR_GRADIENTS = [
  "from-rose-500 to-orange-400",
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-cyan-400",
  "from-emerald-500 to-lime-400",
  "from-amber-500 to-yellow-400",
  "from-pink-500 to-rose-400",
];

export default async function TitlePage({ params }: Props) {
  const { slug } = await params;
  const t = await getTitleBySlug(slug);
  if (!t) notFound();
  const userKey = await getUserKey();
  const [eps, similar, revs, inList, progress, byDirector] = await Promise.all([
    t.type === "series" ? getEpisodes(t.id) : Promise.resolve([]),
    getSimilar(t),
    getReviews(t.id),
    isInWatchlist(userKey, t.id),
    getProgressFor(userKey, t.id),
    getByDirector(t.director, t.id),
  ]);

  const avgUser = revs.length ? revs.reduce((a, r) => a + r.rating, 0) / revs.length : null;
  const resumeHref = progress?.episodeId ? `/watch/${t.slug}?ep=${progress.episodeId}` : `/watch/${t.slug}`;
  const hasProgress = !!(progress && progress.duration > 0 && progress.position / progress.duration < 0.97 && progress.position > 5);
  const pct = hasProgress && progress ? Math.round((progress.position / progress.duration) * 100) : 0;
  const seasons = Array.from(new Set(eps.map((e) => e.season)));
  const score10 = Math.max(0, Math.min(10, t.rating));
  const ring = (score10 / 10) * 100;

  // rating histogram (10 → 1)
  const hist = Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => ({
    n,
    c: revs.filter((r) => r.rating === n).length,
  }));
  const maxC = Math.max(1, ...hist.map((h) => h.c));

  const tabs = [
    { id: "overview", label: "درباره اثر" },
    ...(eps.length ? [{ id: "episodes", label: "قسمت‌ها", count: eps.length }] : []),
    { id: "cast", label: "عوامل" },
    { id: "reviews", label: "نظرات", count: revs.length },
    { id: "similar", label: "مشابه" },
  ];

  return (
    <main className="pb-16">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-[88vh] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/95 via-ink/60 to-ink/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/50 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

        {/* breadcrumbs */}
        <nav className="absolute inset-x-0 top-20 z-10 mx-auto max-w-[1600px] px-4 text-xs text-zinc-400 sm:top-24 sm:px-8 lg:px-12" aria-label="مسیر">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-white">خانه</Link>
            </li>
            <li className="opacity-40">/</li>
            <li>
              <Link href={t.type === "series" ? "/series" : "/movies"} className="hover:text-white">{t.type === "series" ? "سریال‌ها" : "فیلم‌ها"}</Link>
            </li>
            <li className="opacity-40">/</li>
            <li className="truncate text-zinc-200">{t.title}</li>
          </ol>
        </nav>

        <div className="relative z-10 mx-auto flex max-w-[1600px] flex-col gap-10 px-4 pb-16 pt-32 sm:px-8 lg:flex-row lg:items-end lg:px-12 lg:pt-44">
          {/* poster */}
          <div className="relative hidden w-[260px] shrink-0 lg:block">
            <div className="absolute -inset-4 rounded-[28px] bg-brand/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.75)] ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.poster} alt={t.title} className="aspect-[2/3] w-full object-cover" />
              {hasProgress && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
                  <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* info */}
          <div className="max-w-3xl animate-fade-up">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-md bg-brand px-2.5 py-1 text-white shadow-[0_0_20px_var(--color-brand-glow)]">{typeLabel(t.type)}</span>
              {t.trendingScore >= 90 && (
                <span className="flex items-center gap-1 rounded-md border border-orange-400/30 bg-orange-500/15 px-2 py-1 text-orange-300">
                  <FlameIcon width={12} height={12} /> ترند
                </span>
              )}
              <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-100 backdrop-blur">{t.quality}</span>
              <span className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-100 backdrop-blur">{t.ageRating}</span>
              <span className="flex items-center gap-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-zinc-100 backdrop-blur">
                <SubtitleIcon width={12} height={12} /> زیرنویس · دوبله
              </span>
            </div>

            <h1 className="text-glow text-4xl font-black leading-[1.15] text-white sm:text-5xl lg:text-6xl">{t.title}</h1>
            <p className="mt-2 text-sm font-medium tracking-wide text-zinc-400" dir="ltr">
              {t.titleEn} · {t.year}
            </p>

            {/* stats row */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {/* score ring */}
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 py-2 pe-4 ps-2 backdrop-blur">
                <div
                  className="relative grid h-12 w-12 place-items-center rounded-full"
                  style={{ background: `conic-gradient(#fbbf24 ${ring}%, rgba(255,255,255,0.1) 0)` }}
                >
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-ink-800 text-sm font-black text-amber-400">{fa(t.rating)}</div>
                </div>
                <div className="text-xs leading-5">
                  <p className="font-bold text-white">امتیاز نما</p>
                  <p className="text-zinc-400">{avgUser ? `کاربران ${fa(avgUser.toFixed(1))} · ${fa(revs.length)} نظر` : "از ۱۰"}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-200">
                <span className="flex items-center gap-1.5">
                  <ClockIcon width={16} height={16} className="text-zinc-400" />
                  {t.type === "series" ? `${fa(eps.length)} قسمت · ${formatDuration(t.duration)}` : formatDuration(t.duration)}
                </span>
                <span className="flex items-center gap-1.5">
                  <EyeIcon width={16} height={16} className="text-zinc-400" />
                  {formatViews(t.views)} بازدید
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarIcon width={16} height={16} className="text-zinc-400" />
                  {fa(t.year)}
                </span>
                <span className="flex items-center gap-1.5">
                  <GlobeIcon width={16} height={16} className="text-zinc-400" />
                  {t.country}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {t.genres.map((g) => (
                <Link
                  key={g}
                  href={`/${t.type === "series" ? "series" : "movies"}?genre=${encodeURIComponent(g)}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:border-brand/60 hover:bg-brand/10 hover:text-white"
                >
                  {g}
                </Link>
              ))}
            </div>

            <p className="mt-5 line-clamp-3 max-w-2xl text-sm leading-8 text-zinc-300 sm:text-base">{t.description}</p>

            {/* actions */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={resumeHref}
                className="group flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-sm font-extrabold text-white shadow-[0_10px_40px_var(--color-brand-glow)] transition hover:scale-[1.03] hover:bg-brand-600"
              >
                <PlayIcon width={20} height={20} className="transition group-hover:scale-110" />
                {hasProgress && progress ? `ادامه از ${formatClock(progress.position)}` : t.type === "series" ? "پخش قسمت اول" : "پخش فیلم"}
              </Link>
              <TrailerButton src={t.trailerUrl ?? t.videoUrl} poster={t.backdrop} title={t.title} />
              <WatchlistButton titleId={t.id} name={t.title} initial={inList} variant="icon" />
              <FavoriteButton titleId={t.id} name={t.title} variant="icon" />
              <ShareButton title={t.title} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3">
              <RatingControl titleId={t.id} />
              <StatusSelect titleId={t.id} size="sm" />
            </div>

            {hasProgress && (
              <p className="mt-3 text-xs text-zinc-400">
                {fa(pct)}٪ تماشا شده · {formatClock((progress?.duration ?? 0) - (progress?.position ?? 0))} باقی‌مانده
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── STICKY TABS ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <DetailTabs tabs={tabs} />
      </div>

      <div className="mx-auto mt-10 grid max-w-[1600px] gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_320px] lg:px-12">
        {/* ── MAIN COLUMN ──────────────────────────────────────────── */}
        <div className="min-w-0 space-y-16">
          {/* overview */}
          <section id="overview" className="scroll-mt-32">
            <h2 className="mb-4 text-xl font-extrabold text-white">داستان {t.type === "series" ? "سریال" : "فیلم"}</h2>
            <p className="max-w-3xl text-[15px] leading-9 text-zinc-300">{t.description}</p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: "کیفیت", v: t.quality },
                { k: "مدت", v: formatDuration(t.duration) },
                { k: "رده سنی", v: t.ageRating },
                { k: "محصول", v: `${t.country} · ${fa(t.year)}` },
              ].map((x) => (
                <div key={x.k} className="rounded-2xl border border-white/5 bg-ink-700/40 p-4">
                  <p className="text-[11px] text-zinc-500">{x.k}</p>
                  <p className="mt-1 font-bold text-white">{x.v}</p>
                </div>
              ))}
            </div>
          </section>

          {/* episodes */}
          {eps.length > 0 && (
            <section id="episodes" className="scroll-mt-32">
              <div className="mb-2 flex items-end justify-between">
                <h2 className="text-xl font-extrabold text-white">قسمت‌ها</h2>
                <span className="text-sm text-zinc-500">
                  {fa(seasons.length)} فصل · {fa(eps.length)} قسمت
                </span>
              </div>
              <EpisodeList
                slug={t.slug}
                episodes={eps}
                progress={progress ? { episodeId: progress.episodeId, position: progress.position, duration: progress.duration } : null}
              />
            </section>
          )}

          {/* cast */}
          <section id="cast" className="scroll-mt-32">
            <h2 className="mb-5 text-xl font-extrabold text-white">عوامل و بازیگران</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <Link
                href={`/person/${encodeURIComponent(t.director)}`}
                className="group flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-3 transition hover:border-brand/50 hover:bg-brand/10"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-white">
                  <ClapperIcon width={20} height={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-white">{t.director}</span>
                  <span className="block text-[11px] text-zinc-400">کارگردان</span>
                </span>
              </Link>
              {t.cast.map((c, i) => (
                <Link
                  key={c}
                  href={`/person/${encodeURIComponent(c)}`}
                  className="group flex items-center gap-3 rounded-2xl border border-white/5 bg-ink-700/40 p-3 transition hover:border-white/15 hover:bg-ink-700"
                >
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-base font-black text-white ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}`}
                  >
                    {c.trim().charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-white">{c}</span>
                    <span className="block text-[11px] text-zinc-400">بازیگر</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* reviews */}
          <section id="reviews" className="scroll-mt-32">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-xl font-extrabold text-white">نظرات کاربران</h2>
              <span className="text-sm text-zinc-500">{fa(revs.length)} نظر</span>
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
              {/* summary */}
              <div className="rounded-3xl border border-white/5 bg-ink-700/40 p-5 lg:col-span-2">
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-black text-white">{avgUser ? fa(avgUser.toFixed(1)) : "—"}</span>
                  <div className="pb-1.5">
                    <div className="flex gap-0.5 text-amber-400">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <StarIcon key={i} width={14} height={14} className={avgUser && i < Math.round(avgUser / 2) ? "" : "opacity-25"} />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">میانگین {fa(revs.length)} نظر</p>
                  </div>
                </div>
                <div className="mt-5 space-y-1.5">
                  {hist.map((h) => (
                    <div key={h.n} className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="w-4 text-end">{fa(h.n)}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${(h.c / maxC) * 100}%` }} />
                      </div>
                      <span className="w-4">{fa(h.c)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-3">
                <ReviewForm titleId={t.id} slug={t.slug} />
              </div>
            </div>

            {revs.length > 0 && (
              <ul className="mt-6 grid gap-4 md:grid-cols-2">
                {revs.map((r, i) => (
                  <li key={r.id} className="rounded-2xl border border-white/5 bg-ink-700/40 p-5 transition hover:border-white/10">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br text-sm font-black text-white ${AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}`}
                      >
                        {r.author.charAt(0)}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-white">{r.author}</p>
                        <p className="text-[11px] text-zinc-500">{new Date(r.createdAt).toLocaleDateString("fa-IR")}</p>
                      </div>
                      <span className="ms-auto flex items-center gap-1 rounded-lg bg-amber-400/10 px-2 py-1 text-sm font-bold text-amber-400">
                        <StarIcon width={13} height={13} /> {fa(r.rating)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-36 lg:self-start">
          <div className="rounded-3xl border border-white/5 bg-ink-700/40 p-5">
            <h3 className="mb-4 text-sm font-extrabold text-white">مشخصات</h3>
            <dl className="space-y-3 text-sm">
              {[
                { k: "عنوان اصلی", v: t.titleEn, ltr: true },
                { k: "کارگردان", v: t.director },
                { k: "ژانر", v: t.genres.join("، ") },
                { k: "کشور", v: t.country },
                { k: "سال انتشار", v: fa(t.year) },
                { k: "زبان", v: "فارسی · زیرنویس انگلیسی" },
                { k: "کیفیت پخش", v: `${t.quality} · Dolby Audio` },
                ...(eps.length ? [{ k: "تعداد فصل", v: fa(seasons.length) }] : []),
              ].map((row) => (
                <div key={row.k} className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <dt className="shrink-0 text-zinc-500">{row.k}</dt>
                  <dd className={`text-end text-zinc-200 ${row.ltr ? "font-medium" : ""}`} dir={row.ltr ? "ltr" : undefined}>
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/5 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />
            <div className="absolute inset-0 bg-gradient-to-b from-ink-700/70 to-ink-800" />
            <div className="relative">
              <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                <UsersIcon width={14} height={14} /> محبوبیت
              </p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-black text-white">{fa(t.trendingScore)}</span>
                <span className="pb-1 text-xs text-zinc-400">/ ۱۰۰ امتیاز ترند</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-l from-brand to-orange-400" style={{ width: `${t.trendingScore}%` }} />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-zinc-400">
                {formatViews(t.views)} بار در نما تماشا شده و در حال حاضر بین {t.trendingScore >= 90 ? "۵" : "۲۰"} اثر برتر قرار دارد.
              </p>
            </div>
          </div>

          {byDirector.length > 0 && (
            <div className="rounded-3xl border border-white/5 bg-ink-700/40 p-5">
              <h3 className="mb-3 text-sm font-extrabold text-white">دیگر آثار {t.director}</h3>
              <ul className="space-y-2">
                {byDirector.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <Link href={`/title/${s.slug}`} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-white/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.poster} alt={s.title} className="h-14 w-10 rounded-md object-cover" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-white">{s.title}</span>
                        <span className="block text-[11px] text-zinc-500">
                          {fa(s.year)} · ⭐ {fa(s.rating)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* ── SIMILAR ──────────────────────────────────────────────────── */}
      {similar.length > 0 && (
        <section id="similar" className="mt-16 scroll-mt-32">
          <Row title="آثار مشابه" subtitle="اگر این را دوست داشتید، این‌ها را هم ببینید" href={`/${t.type === "series" ? "series" : "movies"}?genre=${encodeURIComponent(t.genres[0] ?? "")}`}>
            {similar.map((s) => (
              <TitleCard key={s.id} t={s} />
            ))}
          </Row>
        </section>
      )}
    </main>
  );
}
