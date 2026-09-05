import Link from "next/link";
import { getPeopleIndex } from "@/lib/queries";
import { fa } from "@/lib/format";
import { UsersIcon, StarIcon, ClapperIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "هنرمندان" };

const HUES = [350, 265, 200, 150, 35, 320, 15, 230, 100, 45, 280, 180];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const all = await getPeopleIndex();
  const people = role === "director" ? all.filter((p) => p.roles.includes("director")) : role === "actor" ? all.filter((p) => p.roles.includes("actor")) : all;

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(229,9,20,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <UsersIcon width={16} height={16} /> پشت و جلوی دوربین
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">هنرمندان</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">{fa(all.length)} کارگردان و بازیگر؛ روی هر نام بزنید تا همه‌ی آثارشان در نما را ببینید.</p>
          <div className="mt-6 flex gap-2">
            {[
              ["", "همه"],
              ["director", "کارگردان‌ها"],
              ["actor", "بازیگران"],
            ].map(([v, l]) => (
              <Link
                key={v}
                href={v ? `/people?role=${v}` : "/people"}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${(role ?? "") === v ? "bg-white text-black" : "glass-btn text-zinc-200"}`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {people.map((p, i) => (
            <Link
              key={p.name}
              href={`/person/${encodeURIComponent(p.name)}`}
              className="glass group relative flex flex-col items-center overflow-hidden rounded-3xl p-5 text-center transition hover:-translate-y-1"
            >
              <span className="absolute -end-8 -top-8 h-24 w-24 rounded-full blur-2xl" style={{ background: `hsl(${HUES[i % HUES.length]} 80% 55% / 0.35)` }} />
              <span
                className="relative grid h-20 w-20 place-items-center rounded-full text-2xl font-black text-white shadow-xl ring-2 ring-white/20"
                style={{ background: `linear-gradient(135deg, hsl(${HUES[i % HUES.length]} 70% 45%), hsl(${(HUES[i % HUES.length] + 40) % 360} 70% 35%))` }}
              >
                {p.name.slice(0, 1)}
              </span>
              <h3 className="mt-3 truncate text-sm font-bold text-white">{p.name}</h3>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                {p.roles.includes("director") && (
                  <span className="flex items-center gap-0.5">
                    <ClapperIcon width={11} height={11} /> کارگردان
                  </span>
                )}
                {p.roles.includes("director") && p.roles.includes("actor") && "·"}
                {p.roles.includes("actor") && "بازیگر"}
              </p>
              <p className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                {fa(p.count)} اثر
                <span className="flex items-center gap-0.5 text-amber-400">
                  <StarIcon width={10} height={10} /> {fa(p.avg)}
                </span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
