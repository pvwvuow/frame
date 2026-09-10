"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import TitleCard from "@/components/TitleCard";
import { getByPerson } from "@/lib/mobile/db";
import { getProgressMap } from "@/lib/mobile/userdata";
import { fa, formatDuration } from "@/lib/format";
import { backdropSrc } from "@/lib/covers";
import { ChevronRight, StarIcon, ClapperIcon, UsersIcon, FilmIcon, TvIcon } from "@/components/Icons";
import { titleHref, personHref , useRouteSlug } from "@/lib/mobile-links";

export default function PersonPage() {
  const name = decodeURIComponent(useRouteSlug("name") ?? "");
  const [st, setSt] = useState<{ p: Awaited<ReturnType<typeof getByPerson>>; progress: Map<number, { position: number; duration: number }> } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!name) return;
    let alive = true;
    (async () => {
      const p = await getByPerson(name);
      const all = Array.from(new Map([...p.directed, ...p.acted].map((t) => [t.id, t])).values());
      if (!all.length) {
        if (alive) setMissing(true);
        return;
      }
      const progress = await getProgressMap(all.map((t) => t.id));
      if (alive) setSt({ p, progress });
    })();
    return () => {
      alive = false;
    };
  }, [name]);

  if (missing) notFound();
  if (!st) {
    return (
      <main className="pb-16">
        <div className="mx-auto max-w-[1600px] px-4 pt-32 sm:px-8 lg:px-12">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-white/10" />
        </div>
      </main>
    );
  }

  const { p, progress } = st;
  const all = Array.from(new Map([...p.directed, ...p.acted].map((t) => [t.id, t])).values());
  const avg = all.reduce((a, t) => a + t.rating, 0) / all.length;
  const best = [...all].sort((a, b) => b.rating - a.rating)[0];
  const years = all.map((t) => t.year);
  const collaborators = Array.from(new Set(all.flatMap((t) => [t.director, ...t.cast]).filter((n) => n && n !== name))).slice(0, 8);

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdropSrc(best)} alt="" decoding="async" data-ph-title={best?.title ?? ""} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/95 via-ink/85 to-ink/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/30" />
        <div className="relative mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <Link href="/people" className="mb-4 flex w-fit items-center gap-1 text-xs font-bold text-brand hover:underline">
            <ChevronRight width={14} height={14} /> همه هنرمندان
          </Link>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <span className="grid h-28 w-28 shrink-0 place-items-center rounded-[28px] bg-gradient-to-br from-brand to-purple-600 text-5xl font-black text-white shadow-2xl ring-2 ring-white/20">
              {name.slice(0, 1)}
            </span>
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                {p.directed.length > 0 && (
                  <span className="flex items-center gap-1">
                    <ClapperIcon width={13} height={13} /> کارگردان
                  </span>
                )}
                {p.directed.length > 0 && p.acted.length > 0 && "·"}
                {p.acted.length > 0 && (
                  <span className="flex items-center gap-1">
                    <UsersIcon width={13} height={13} /> بازیگر
                  </span>
                )}
              </p>
              <h1 className="mt-1 text-4xl font-black text-white sm:text-5xl">{name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span className="glass rounded-full px-3 py-1.5 font-bold text-white">{fa(all.length)} اثر در نما</span>
                <span className="glass flex items-center gap-1 rounded-full px-3 py-1.5 font-bold text-amber-400">
                  <StarIcon width={12} height={12} /> میانگین {fa(Math.round(avg * 10) / 10)}
                </span>
                <span className="glass rounded-full px-3 py-1.5 text-zinc-200">
                  فعالیت {fa(Math.min(...years))} تا {fa(Math.max(...years))}
                </span>
                <span className="glass rounded-full px-3 py-1.5 text-zinc-200">{formatDuration(all.reduce((a, t) => a + t.duration, 0))} محتوا</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1600px] space-y-14 px-4 sm:px-8 lg:px-12">
        {p.directed.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-white">
              <ClapperIcon width={18} height={18} className="text-brand" /> به کارگردانی {name}
              <span className="text-xs font-normal text-zinc-500">({fa(p.directed.length)})</span>
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {p.directed.map((t) => (
                <div key={t.id} className="[&>div]:w-full">
                  <TitleCard t={t} progress={progress.get(t.id)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {p.acted.length > 0 && (
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-white">
              <UsersIcon width={18} height={18} className="text-brand" /> با بازی {name}
              <span className="text-xs font-normal text-zinc-500">({fa(p.acted.length)})</span>
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {p.acted.map((t) => (
                <div key={t.id} className="[&>div]:w-full">
                  <TitleCard t={t} progress={progress.get(t.id)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {collaborators.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-extrabold text-white">همکاران مکرر</h2>
            <div className="flex flex-wrap gap-2">
              {collaborators.map((c) => (
                <Link key={c} href={personHref(c)} className="glass-btn rounded-full px-4 py-2 text-sm font-bold text-white">
                  {c}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="glass rounded-3xl p-6">
          <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-300">
            <span className="flex items-center gap-2">
              <FilmIcon width={16} height={16} className="text-zinc-500" /> {fa(all.filter((t) => t.type === "movie").length)} فیلم
            </span>
            <span className="flex items-center gap-2">
              <TvIcon width={16} height={16} className="text-zinc-500" /> {fa(all.filter((t) => t.type === "series").length)} سریال
            </span>
            <span className="ms-auto text-xs text-zinc-500">
              پرامتیازترین: <Link href={titleHref(best.slug)} className="font-bold text-white hover:text-brand">{best.title}</Link> ({fa(best.rating)})
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
