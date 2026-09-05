import Link from "next/link";
import { getGenreSummaries } from "@/lib/queries";
import { fa } from "@/lib/format";
import { SparkIcon, StarIcon, FilmIcon, TvIcon, ChevronLeft } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "ژانرها | نما" };

const HUES = [350, 265, 200, 150, 35, 320, 15, 230, 100, 45, 280, 180, 0, 210];

export default async function GenresPage() {
  const genres = await getGenreSummaries();
  const big = genres.slice(0, 2);
  const rest = genres.slice(2);

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.2),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(124,58,237,0.18),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <SparkIcon width={16} height={16} /> کاوش در نما
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">ژانرها</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">
            امشب چه حال‌وهوایی دارید؟ از نوآرهای بارانی تا سفرهای فضایی؛ {fa(genres.length)} ژانر برای هر سلیقه‌ای.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        {/* featured genres */}
        <div className="grid gap-4 lg:grid-cols-2">
          {big.map((g, i) => (
            <Link
              key={g.genre}
              href={`/movies?genre=${encodeURIComponent(g.genre)}`}
              className="group relative flex min-h-[240px] overflow-hidden rounded-3xl border border-white/5 bg-ink-700/40 transition hover:border-white/15"
            >
              <div className="absolute inset-0 grid grid-cols-4 opacity-40 transition duration-700 group-hover:scale-105 group-hover:opacity-60">
                {g.covers.map((c, j) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={j} src={c} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-l from-ink via-ink/80 to-ink/30" />
              <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at bottom right, hsl(${HUES[i]} 80% 50% / 0.35), transparent 60%)` }} />
              <div className="relative flex flex-1 flex-col justify-end p-7">
                <span className="w-fit rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur">محبوب‌ترین ژانر</span>
                <h2 className="mt-3 text-3xl font-black text-white">{g.genre}</h2>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-300">
                  <span className="flex items-center gap-1"><FilmIcon width={12} height={12} /> {fa(g.movies)} فیلم</span>
                  <span className="flex items-center gap-1"><TvIcon width={12} height={12} /> {fa(g.series)} سریال</span>
                  <span className="flex items-center gap-1 text-amber-400"><StarIcon width={12} height={12} /> {fa(g.avgRating)}</span>
                </p>
                <span className="mt-4 flex w-fit items-center gap-1 text-sm font-bold text-white transition group-hover:gap-2">
                  مشاهده آثار <ChevronLeft width={16} height={16} />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* all genres */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {rest.map((g, i) => {
            const hue = HUES[(i + 2) % HUES.length];
            return (
              <Link
                key={g.genre}
                href={`/movies?genre=${encodeURIComponent(g.genre)}`}
                className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl border border-white/5 bg-ink-700/40 p-4 transition hover:-translate-y-1 hover:border-white/15 hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
              >
                {g.covers[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.covers[0]} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 transition duration-700 group-hover:scale-110 group-hover:opacity-50" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-transparent" />
                <span
                  className="absolute -end-8 -top-8 h-28 w-28 rounded-full blur-3xl transition group-hover:scale-125"
                  style={{ background: `hsl(${hue} 80% 55% / 0.45)` }}
                />
                <div className="relative">
                  <h3 className="text-lg font-black text-white">{g.genre}</h3>
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                    {fa(g.count)} عنوان
                    <span className="flex items-center gap-0.5 text-amber-400"><StarIcon width={10} height={10} /> {fa(g.avgRating)}</span>
                  </p>
                </div>
                <div className="absolute end-3 top-3 flex -space-x-2 space-x-reverse opacity-0 transition group-hover:opacity-100">
                  {g.covers.slice(1, 4).map((c, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={c} alt="" className="h-9 w-6 rounded object-cover ring-1 ring-black/60" />
                  ))}
                </div>
              </Link>
            );
          })}
        </div>

        {/* quick links */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          <Link href="/movies" className="group flex items-center justify-between rounded-3xl border border-white/5 bg-gradient-to-l from-brand/20 to-ink-700/40 p-6 transition hover:border-brand/40">
            <div>
              <p className="text-xs text-zinc-400">مرور کامل</p>
              <p className="mt-1 text-2xl font-black text-white">همه فیلم‌ها</p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition group-hover:bg-brand"><FilmIcon /></span>
          </Link>
          <Link href="/series" className="group flex items-center justify-between rounded-3xl border border-white/5 bg-gradient-to-l from-purple-600/20 to-ink-700/40 p-6 transition hover:border-purple-400/40">
            <div>
              <p className="text-xs text-zinc-400">مرور کامل</p>
              <p className="mt-1 text-2xl font-black text-white">همه سریال‌ها</p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition group-hover:bg-purple-600"><TvIcon /></span>
          </Link>
        </div>
      </div>
    </main>
  );
}
