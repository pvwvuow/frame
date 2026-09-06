import Link from "next/link";
import { getPeopleIndex } from "@/lib/queries";
import { fa } from "@/lib/format";
import { UsersIcon, StarIcon, ClapperIcon } from "@/components/Icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "هنرمندان" };

const HUES = [350, 265, 200, 150, 35, 320, 15, 230, 100, 45, 280, 180];

const SORTS = [
  { v: "rating", label: "بهترین امتیاز" },
  { v: "count", label: "بیشترین اثر" },
  { v: "name", label: "نام (الفبا)" },
] as const;

const RANK_STYLES = [
  "from-amber-300 to-yellow-500 text-black shadow-[0_0_20px_rgba(251,191,36,0.45)]", // gold
  "from-zinc-200 to-zinc-400 text-black", // silver
  "from-amber-600 to-orange-700 text-white", // bronze
];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string; sort?: string }> }) {
  const { role, sort = "rating" } = await searchParams;
  const all = await getPeopleIndex();
  const roleFiltered = role === "director" ? all.filter((p) => p.roles.includes("director")) : role === "actor" ? all.filter((p) => p.roles.includes("actor")) : all;

  // رنک‌بندی: بر اساس میانگین امتیاز آثار / تعداد اثر / نام
  const people = [...roleFiltered].sort((a, b) =>
    sort === "count" ? b.count - a.count || b.avg - a.avg : sort === "name" ? a.name.localeCompare(b.name) : b.avg - a.avg || b.count - a.count
  );

  const top3 = sort === "name" ? [] : people.slice(0, 3);

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(229,9,20,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand">
            <UsersIcon width={16} height={16} /> رنک‌بندی هنرمندان
          </p>
          <h1 className="text-4xl font-black text-white sm:text-5xl">بازیگران و کارگردانان</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">{fa(all.length)} کارگردان و بازیگر؛ رتبه‌ی هر هنرمند از میانگین امتیاز آثارش در نما محاسبه می‌شود.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              ["", "همه"],
              ["director", "کارگردان‌ها"],
              ["actor", "بازیگران"],
            ].map(([v, l]) => (
              <Link
                key={v}
                href={v ? `/people?role=${v}&sort=${sort}` : `/people?sort=${sort}`}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                  (role ?? "") === v ? "border-white bg-white text-black" : "border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l}
              </Link>
            ))}
            <span className="mx-1 hidden w-px bg-white/10 sm:block" />
            {SORTS.map((s) => (
              <Link
                key={s.v}
                href={`/people?${role ? `role=${role}&` : ""}sort=${s.v}`}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                  sort === s.v ? "border-brand/60 bg-brand/15 text-white" : "border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-12">
        {/* podium — ۳ نفر اول */}
        {top3.length === 3 && (
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {top3.map((p, i) => (
              <Link
                key={p.name}
                href={`/person/${encodeURIComponent(p.name)}`}
                className={`relative flex items-center gap-4 overflow-hidden rounded-3xl border p-5 transition hover:-translate-y-1 ${
                  i === 0 ? "border-amber-400/30 bg-gradient-to-bl from-amber-500/10 to-ink-700/60" : "border-white/10 bg-ink-700/50"
                }`}
              >
                <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br text-base font-black ${RANK_STYLES[i]} num`}>{fa(i + 1)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-black text-white">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                    <span className="flex items-center gap-0.5 text-amber-400">
                      <StarIcon width={11} height={11} /> <span className="num font-bold">{fa(p.avg)}</span>
                    </span>
                    · <span className="num">{fa(p.count)}</span> اثر
                  </span>
                </span>
                <span className="absolute -end-6 -top-6 h-20 w-20 rounded-full bg-amber-400/10 blur-2xl" />
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {people.map((p, i) => {
            const rank = i + 1;
            const medal = sort !== "name" && rank <= 3 ? RANK_STYLES[rank - 1] : "";
            return (
              <Link
                key={p.name}
                href={`/person/${encodeURIComponent(p.name)}`}
                className="glass group relative flex flex-col items-center overflow-hidden rounded-3xl p-5 text-center transition hover:-translate-y-1"
              >
                {sort !== "name" && (
                  <span className={`absolute end-3 top-3 grid h-7 min-w-7 place-items-center rounded-full text-[11px] font-black num ${medal ? `bg-gradient-to-br ${medal}` : "bg-white/5 text-zinc-400"}`}>
                    {fa(rank)}
                  </span>
                )}
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
            );
          })}
        </div>
      </div>
    </main>
  );
}
