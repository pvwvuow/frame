"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import InfoPage, { Section } from "@/components/pages/InfoPage";
import { SparkIcon, FilmIcon, TvIcon, GlobeIcon, ShieldIcon, SubtitleIcon, ClapperIcon, DownloadIcon } from "@/components/Icons";
import { getCatalogStats } from "@/lib/mobile/db";
import { fa, formatViews } from "@/lib/format";
import { useI18n } from "@/components/i18n/LocaleProvider";

/* v0.34.4 — the about page is now fully bilingual (fa/en). All copy lives in
 * the shared dictionaries (`about.*`), so switching the interface language
 * re-renders this page natively — same mechanism as every other surface. */
export default function AboutPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<{ m: Awaited<ReturnType<typeof getCatalogStats>>; s: Awaited<ReturnType<typeof getCatalogStats>> } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getCatalogStats("movie"), getCatalogStats("series")]).then(([m, s]) => alive && setStats({ m, s }));
    return () => {
      alive = false;
    };
  }, []);

  const m = stats?.m;
  const s = stats?.s;
  const feats = [
    { icon: ClapperIcon, t: t("about.f1t"), d: t("about.f1d") },
    { icon: SubtitleIcon, t: t("about.f2t"), d: t("about.f2d") },
    { icon: GlobeIcon, t: t("about.f3t"), d: t("about.f3d") },
    { icon: ShieldIcon, t: t("about.f4t"), d: t("about.f4d") },
    { icon: DownloadIcon, t: t("about.f5t"), d: t("about.f5d") },
    { icon: SparkIcon, t: t("about.f6t"), d: t("about.f6d") },
  ];
  return (
    <InfoPage current="/about" icon={SparkIcon} eyebrow={t("about.eyebrow")} title={t("about.title")} lead={t("about.lead")}>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: FilmIcon, v: fa(m?.count ?? 0), k: t("about.statMovies") },
          { icon: TvIcon, v: fa(s?.count ?? 0), k: t("about.statSeries") },
          { icon: SparkIcon, v: formatViews((m?.totalViews ?? 0) + (s?.totalViews ?? 0)), k: t("about.statViews") },
          { icon: ClapperIcon, v: fa(m && s ? ((m.avgRating + s.avgRating) / 2).toFixed(1) : "0"), k: t("about.statRating") },
        ].map((x) => (
          <div key={x.k} className="glass rounded-2xl px-4 py-3">
            <x.icon width={16} height={16} className="text-zinc-400" />
            <p className="mt-2 text-lg font-black text-white num">{x.v}</p>
            <p className="text-[11px] text-zinc-400">{x.k}</p>
          </div>
        ))}
      </div>
      <Section title={t("about.whyTitle")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {feats.map((f) => (
            <div key={f.t} className="flex gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand"><f.icon width={18} height={18} /></span>
              <div>
                <p className="font-bold text-white">{f.t}</p>
                <p className="mt-1 text-xs leading-6 text-zinc-400">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t("about.missionTitle")}>
        <p>{t("about.missionP1")}</p>
        <p>
          {t("about.missionP2a")}
          <Link href="/contact" className="text-brand hover:underline">{t("about.missionP2b")}</Link>
          {t("about.missionP2c")}
        </p>
      </Section>
    </InfoPage>
  );
}
