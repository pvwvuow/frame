import Link from "next/link";
import Row from "@/components/Row";
import TitleCard from "@/components/TitleCard";
import { getCollections } from "@/lib/queries";
import { fa } from "@/lib/format";
import { LayersIcon, ChevronLeft } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "مجموعه‌ها" };

export default async function CollectionsPage() {
  const collections = await getCollections(12);
  const hero = collections.slice(0, 4);

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <LayersIcon width={16} height={16} /> دست‌چین تحریریه
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">مجموعه‌ها</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">
            {fa(collections.length)} مجموعه‌ی موضوعی که هر شب به‌روز می‌شوند؛ از شاهکارهای پرامتیاز تا فیلم‌های جمع‌وجور برای وقتی حوصله‌ی انتخاب ندارید.
          </p>
        </div>
      </section>

      {/* hero tiles */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {hero.map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="glass group relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-3xl p-5 transition hover:-translate-y-1"
            >
              <div className="absolute inset-0 grid grid-cols-3 opacity-60 transition duration-700 group-hover:scale-105">
                {c.items.slice(0, 3).map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={t.id} src={t.poster} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/10" />
              <span className="absolute -end-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: `hsl(${c.hue} 85% 55% / 0.5)` }} />
              <div className="relative">
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur">{fa(c.count)} عنوان</span>
                <h2 className="mt-2 text-2xl font-black text-white">{c.title}</h2>
                <p className="mt-1 text-xs text-zinc-300">{c.tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* shelves */}
      <div className="mt-14 space-y-2">
        {collections.map((c) => (
          <Row key={c.slug} title={c.title} subtitle={c.tagline} href={`/collections/${c.slug}`}>
            {c.items.map((t) => (
              <TitleCard key={t.id} t={t} />
            ))}
            <Link
              href={`/collections/${c.slug}`}
              className="glass-btn flex w-[150px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl text-sm font-bold text-white sm:w-[190px]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
                <ChevronLeft width={20} height={20} />
              </span>
              مشاهده همه
              <span className="text-[11px] font-normal text-zinc-400">{fa(c.count)} عنوان</span>
            </Link>
          </Row>
        ))}
      </div>
    </main>
  );
}
