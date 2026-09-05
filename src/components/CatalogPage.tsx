import { Suspense } from "react";
import TitleCard from "@/components/TitleCard";
import CatalogFilters from "@/components/CatalogFilters";
import { GENRES, getByType, getProgressMap } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa } from "@/lib/format";

export default async function CatalogPage({
  type,
  heading,
  blurb,
  searchParams,
}: {
  type: "movie" | "series";
  heading: string;
  blurb: string;
  searchParams: Promise<{ genre?: string; sort?: string }>;
}) {
  const { genre, sort = "trending" } = await searchParams;
  const userKey = await getUserKey();
  const items = await getByType(type, { genre, sort });
  const progress = await getProgressMap(
    userKey,
    items.map((t) => t.id)
  );

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-8 lg:px-12">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-black text-white sm:text-4xl">
          {heading}
          {genre && <span className="text-brand"> · {genre}</span>}
        </h1>
        <p className="text-sm text-zinc-400">{blurb}</p>
      </div>

      <Suspense>
        <CatalogFilters genres={GENRES} genre={genre} sort={sort} />
      </Suspense>

      <p className="mt-6 text-xs text-zinc-500">{fa(items.length)} عنوان</p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-white/10 p-16 text-center text-zinc-500">
          عنوانی در این دسته پیدا نشد.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {items.map((t) => (
            <div key={t.id} className="[&>a]:w-full">
              <TitleCard t={t} progress={progress.get(t.id)} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
