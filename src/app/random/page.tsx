import Link from "next/link";
import { GENRES, getRandomTitle } from "@/lib/queries";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { ShuffleIcon, PlayIcon, StarIcon, ClockIcon, InfoIcon } from "@/components/Icons";
import WatchlistButton from "@/components/WatchlistButton";
import FavoriteButton from "@/components/FavoriteButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "امشب چی ببینم؟" };

type SP = { type?: string; genre?: string; not?: string };

export default async function RandomPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const type = sp.type === "movie" || sp.type === "series" ? sp.type : undefined;
  const genre = sp.genre && GENRES.includes(sp.genre) ? sp.genre : undefined;
  const exclude = sp.not ? sp.not.split(",").map(Number).filter(Boolean).slice(-10) : [];
  const t = (await getRandomTitle({ type, genre, excludeIds: exclude })) ?? (await getRandomTitle({ type, genre }));

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { type, genre, not: exclude.join(","), ...extra };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return `/random${s ? `?${s}` : ""}`;
  };
  const again = qs({ not: [...exclude, ...(t ? [t.id] : [])].join(",") });

  return (
    <main className="relative min-h-screen overflow-hidden pb-24 pt-24">
      {t && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.backdrop} alt="" className="animate-ken absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/40" />
          <div className="absolute inset-0 bg-gradient-to-l from-ink/70 to-transparent" />
        </>
      )}

      <div className="relative mx-auto max-w-[1100px] px-4 sm:px-8">
        <div className="mb-8 text-center">
          <p className="flex items-center justify-center gap-2 text-xs font-bold text-brand">
            <ShuffleIcon width={16} height={16} /> انتخاب شانسی
          </p>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">امشب چی ببینم؟</h1>
          <p className="mt-2 text-sm text-zinc-400">حوصله‌ی گشتن ندارید؟ بگذارید نما یکی را برایتان انتخاب کند.</p>
        </div>

        {/* filters */}
        <div className="glass mx-auto mb-8 flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-3xl p-3">
          {[
            [undefined, "همه"],
            ["movie", "فقط فیلم"],
            ["series", "فقط سریال"],
          ].map(([v, l]) => (
            <Link key={l} href={qs({ type: v as string | undefined, not: "" })} className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${type === v ? "bg-white text-black" : "bg-white/5 text-zinc-200 hover:bg-white/10"}`}>
              {l}
            </Link>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" />
          <Link href={qs({ genre: undefined, not: "" })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${!genre ? "bg-brand text-white" : "bg-white/5 text-zinc-200 hover:bg-white/10"}`}>
            هر ژانری
          </Link>
          {GENRES.slice(0, 8).map((g) => (
            <Link key={g} href={qs({ genre: g, not: "" })} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${genre === g ? "bg-brand text-white" : "bg-white/5 text-zinc-200 hover:bg-white/10"}`}>
              {g}
            </Link>
          ))}
        </div>

        {t ? (
          <div className="glass-strong glass-in mx-auto flex max-w-3xl flex-col gap-6 rounded-[32px] p-5 sm:flex-row sm:p-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.poster} alt={t.title} className="mx-auto h-[300px] w-[200px] shrink-0 rounded-2xl object-cover shadow-2xl ring-1 ring-white/20 sm:mx-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="rounded-md bg-brand px-2 py-0.5 text-white">{typeLabel(t.type)}</span>
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-zinc-200">{t.quality}</span>
                <span className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-zinc-200">{t.ageRating}</span>
              </div>
              <h2 className="mt-3 text-3xl font-black text-white">{t.title}</h2>
              <p className="text-xs text-zinc-500" dir="ltr">
                {t.titleEn} · {t.year}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
                <span className="flex items-center gap-1 font-extrabold text-amber-400">
                  <StarIcon width={14} height={14} /> {fa(t.rating)}
                </span>
                <span className="flex items-center gap-1">
                  <ClockIcon width={14} height={14} className="text-zinc-500" /> {formatDuration(t.duration)}
                </span>
                <span className="text-xs text-zinc-400">{t.genres.join(" · ")}</span>
              </div>
              <p className="mt-4 line-clamp-4 text-sm leading-7 text-zinc-300">{t.description}</p>
              <p className="mt-2 text-xs text-zinc-500">کارگردان: <Link href={`/person/${encodeURIComponent(t.director)}`} className="text-zinc-300 hover:text-brand">{t.director}</Link></p>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
                <Link href={`/watch/${t.slug}`} className="flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-black transition hover:scale-[1.03]">
                  <PlayIcon width={18} height={18} /> پخش
                </Link>
                <Link href={`/title/${t.slug}`} className="glass-btn flex h-12 items-center gap-2 rounded-full px-5 text-sm font-bold text-white">
                  <InfoIcon width={16} height={16} /> جزئیات
                </Link>
                <WatchlistButton titleId={t.id} name={t.title} variant="icon" />
                <FavoriteButton titleId={t.id} name={t.title} variant="icon" />
              </div>
            </div>
          </div>
        ) : (
          <div className="glass mx-auto max-w-md rounded-3xl p-10 text-center text-sm text-zinc-400">با این فیلترها چیزی پیدا نشد.</div>
        )}

        <div className="mt-8 text-center">
          <Link href={again} className="glass-btn inline-flex h-14 items-center gap-3 rounded-full px-8 text-base font-extrabold text-white">
            <ShuffleIcon width={20} height={20} /> یکی دیگه!
          </Link>
        </div>
      </div>
    </main>
  );
}
