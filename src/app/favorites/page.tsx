import Link from "next/link";
import FavoritesGrid from "@/components/library/FavoritesGrid";
import { HeartIcon, BookmarkIcon, StarIcon, FilmIcon, TvIcon } from "@/components/Icons";
import { getFavoriteRows } from "@/lib/library";
import { getUserKey } from "@/lib/user";
import { fa } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "علاقه‌مندی‌ها" };

export default async function FavoritesPage() {
  const userKey = await getUserKey();
  const rows = await getFavoriteRows(userKey);
  const movies = rows.filter((r) => r.title.type === "movie").length;
  const avg = rows.length ? (rows.reduce((a, r) => a + r.title.rating, 0) / rows.length).toFixed(1) : "—";
  const backdrop = rows[0]?.title.backdrop;

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        {backdrop && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-sm" />
            <div className="absolute inset-0 bg-gradient-to-b from-rose-950/40 via-ink/85 to-ink" />
          </>
        )}
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-bold text-rose-400">
                <HeartIcon width={16} height={16} filled /> آثاری که عاشقشان هستید
              </p>
              <h1 className="text-4xl font-black text-white sm:text-5xl">علاقه‌مندی‌ها</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">قلبِ مجموعه‌ی شما. علاقه‌مندی‌ها جدا از «لیست من» هستند؛ این‌جا فقط بهترین‌ها می‌مانند.</p>
              <Link href="/my-list" className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10">
                <BookmarkIcon width={13} height={13} /> رفتن به لیست من
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: HeartIcon, v: fa(rows.length), k: "علاقه‌مندی" },
                { icon: FilmIcon, v: fa(movies), k: "فیلم" },
                { icon: TvIcon, v: fa(rows.length - movies), k: "سریال" },
                { icon: StarIcon, v: fa(avg), k: "میانگین امتیاز" },
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
        <FavoritesGrid rows={rows} />
      </div>
    </main>
  );
}
