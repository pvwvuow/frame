import TitleCard from "@/components/TitleCard";
import { search, getTrending } from "@/lib/queries";
import { fa } from "@/lib/format";
import { SearchIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "جستجو | نما" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = q.trim() ? await search(q) : [];
  const suggestions = results.length === 0 ? await getTrending(6) : [];

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-8 lg:px-12">
      <form action="/search" className="mx-auto mb-10 flex max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-ink-700/70 px-4 py-3 focus-within:border-brand">
        <SearchIcon className="text-zinc-400" />
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="نام فیلم، سریال، بازیگر یا کارگردان..."
          className="w-full bg-transparent text-base text-white placeholder:text-zinc-500 focus:outline-none"
        />
        <button type="submit" className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-600">
          جستجو
        </button>
      </form>

      {q.trim() ? (
        <>
          <h1 className="mb-6 text-xl font-extrabold text-white">
            نتایج برای «{q}» <span className="text-sm font-normal text-zinc-500">({fa(results.length)} مورد)</span>
          </h1>
          {results.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center">
              <p className="text-lg font-bold text-white">چیزی پیدا نشد</p>
              <p className="mt-2 text-sm text-zinc-500">املای کلمه را بررسی کنید یا این‌ها را امتحان کنید:</p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                {suggestions.map((t) => (
                  <TitleCard key={t.id} t={t} size="sm" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {results.map((t) => (
                <div key={t.id} className="[&>a]:w-full">
                  <TitleCard t={t} />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="text-center">
          <p className="text-zinc-400">چیزی بنویسید تا جستجو شروع شود.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {suggestions.map((t) => (
              <TitleCard key={t.id} t={t} size="sm" />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
