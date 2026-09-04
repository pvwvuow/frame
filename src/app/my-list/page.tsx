import Link from "next/link";
import TitleCard from "@/components/TitleCard";
import { BookmarkIcon } from "@/components/Icons";
import { getWatchlist, getContinueWatching, getProgressMap } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatClock } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "لیست من | نما" };

export default async function MyListPage() {
  const userKey = await getUserKey();
  const [list, cont] = await Promise.all([getWatchlist(userKey), getContinueWatching(userKey, 20)]);
  const progress = await getProgressMap(
    userKey,
    list.map((l) => l.title.id)
  );

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-8 lg:px-12">
      <h1 className="text-3xl font-black text-white sm:text-4xl">لیست من</h1>
      <p className="mt-2 text-sm text-zinc-400">آثاری که ذخیره کرده‌اید و آن‌هایی که نیمه‌کاره مانده‌اند.</p>

      {cont.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-extrabold text-white">ادامه تماشا</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cont.map((c) => (
              <Link
                key={c.title.id}
                href={`/watch/${c.title.slug}${c.episodeId ? `?ep=${c.episodeId}` : ""}`}
                className="group relative overflow-hidden rounded-2xl ring-1 ring-white/5 transition hover:ring-white/20"
              >
                { }
                <img src={c.title.backdrop} alt={c.title.title} className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="card-gradient absolute inset-0" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="truncate font-bold text-white">{c.title.title}</p>
                  <p className="text-[11px] text-zinc-300">
                    {c.episodeId ? `فصل ${fa(c.season ?? 1)} قسمت ${fa(c.episodeNumber ?? 1)}` : "فیلم"} · {formatClock(c.duration - c.position)} باقی‌مانده
                  </p>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                  <div className="h-full bg-brand" style={{ width: `${(c.position / c.duration) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-extrabold text-white">
          ذخیره‌شده‌ها <span className="text-sm font-normal text-zinc-500">({fa(list.length)})</span>
        </h2>
        {list.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 p-16 text-center">
            <BookmarkIcon width={40} height={40} className="mx-auto text-zinc-600" />
            <p className="mt-4 text-lg font-bold text-white">لیست شما خالی است</p>
            <p className="mt-1 text-sm text-zinc-500">با زدن دکمه «افزودن به لیست» آثار مورد علاقه‌تان را اینجا ذخیره کنید.</p>
            <Link href="/movies" className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
              مرور فیلم‌ها
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {list.map(({ title }) => (
              <div key={title.id} className="[&>a]:w-full">
                <TitleCard t={title} progress={progress.get(title.id)} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
