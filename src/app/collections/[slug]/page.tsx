import Link from "next/link";
import { notFound } from "next/navigation";
import TitleCard from "@/components/TitleCard";
import { COLLECTIONS, getCollection, getProgressMap } from "@/lib/queries";
import { getUserKey } from "@/lib/user";
import { fa, formatDuration } from "@/lib/format";
import { LayersIcon, ChevronRight, StarIcon, ClockIcon, PlayIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COLLECTIONS.find((x) => x.slug === slug);
  return { title: c ? `مجموعه ${c.title}` : "مجموعه" };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await getCollection(slug);
  if (!c) notFound();
  const userKey = await getUserKey();
  const progress = await getProgressMap(userKey, c.items.map((t) => t.id));
  const avg = c.items.length ? c.items.reduce((a, t) => a + t.rating, 0) / c.items.length : 0;
  const total = c.items.reduce((a, t) => a + t.duration, 0);
  const lead = c.items[0];
  const others = COLLECTIONS.filter((x) => x.slug !== slug).slice(0, 6);

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        {lead && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lead.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-l from-ink/95 via-ink/80 to-ink/50" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/30" />
          </>
        )}
        <span className="absolute -start-20 top-10 h-72 w-72 rounded-full blur-3xl" style={{ background: `hsl(${c.hue} 85% 55% / 0.35)` }} />
        <div className="relative mx-auto flex max-w-[1600px] flex-col gap-6 px-4 pb-10 pt-28 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 lg:pt-36">
          <div className="max-w-2xl">
            <Link href="/collections" className="mb-3 flex w-fit items-center gap-1 text-xs font-bold text-brand hover:underline">
              <ChevronRight width={14} height={14} /> همه مجموعه‌ها
            </Link>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-400">
              <LayersIcon width={14} height={14} /> مجموعه
            </p>
            <h1 className="text-4xl font-black text-white sm:text-5xl">{c.title}</h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300">{c.tagline}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="glass rounded-full px-3 py-1.5 font-bold text-white">{fa(c.items.length)} عنوان</span>
              <span className="glass flex items-center gap-1 rounded-full px-3 py-1.5 font-bold text-amber-400">
                <StarIcon width={12} height={12} /> میانگین {fa(Math.round(avg * 10) / 10)}
              </span>
              <span className="glass flex items-center gap-1 rounded-full px-3 py-1.5 text-zinc-200">
                <ClockIcon width={12} height={12} /> {formatDuration(total)} محتوا
              </span>
            </div>
          </div>
          {lead && (
            <Link href={`/watch/${lead.slug}`} className="glass-btn flex h-12 w-fit items-center gap-2 rounded-full px-6 text-sm font-extrabold text-white">
              <PlayIcon width={18} height={18} /> پخش «{lead.title}»
            </Link>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {c.items.map((t, i) => (
            <div key={t.id} className="[&>div]:w-full">
              <TitleCard t={t} progress={progress.get(t.id)} rank={slug === "top-rated" ? i + 1 : undefined} />
            </div>
          ))}
        </div>

        <section className="mt-16">
          <h2 className="mb-4 text-lg font-extrabold text-white">مجموعه‌های دیگر</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link key={o.slug} href={`/collections/${o.slug}`} className="glass-btn rounded-full px-4 py-2 text-sm font-bold text-white">
                <span className="me-2 inline-block h-2 w-2 rounded-full" style={{ background: `hsl(${o.hue} 85% 55%)` }} />
                {o.title}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
