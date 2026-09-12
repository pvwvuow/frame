"use client";

import HistoryList from "@/components/library/HistoryList";
import LoadErrorCard from "@/components/LoadErrorCard";
import { HistoryIcon, ClockIcon, CheckCircleIcon, PlayIcon } from "@/components/Icons";
import { getHistory } from "@/lib/mobile/userdata";
import { fa, formatDuration } from "@/lib/format";
import { useAsyncData } from "@/lib/use-async-data";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function HistoryPage() {
  const { t: tr } = useI18n();
  const { data: rows, error, retry } = useAsyncData(() => getHistory(), []);

  const minutes = rows ? Math.round(rows.reduce((a, r) => a + r.position, 0) / 60) : 0;
  const finished = rows?.filter((r) => r.finished).length ?? 0;

  return (
    <main className="pb-16">
      <section className="relative overflow-hidden">
        {rows?.[0] && (
          <>
            { }
            <img src={rows[0].title.backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-sm" />
            <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/85 to-ink" />
          </>
        )}
        <div className="relative mx-auto max-w-[1600px] px-4 pb-8 pt-28 sm:px-8 lg:px-12 lg:pt-36">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 flex items-center gap-2 text-xs font-bold text-brand"><HistoryIcon width={16} height={16} /> {tr("history.yourActivity")}</p>
              <h1 className="text-4xl font-black text-white sm:text-5xl">{tr("user.history")}</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-300">{tr("history.sub")}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: PlayIcon, v: fa(rows?.length ?? 0), k: tr("catalog.titles") },
                { icon: CheckCircleIcon, v: fa(finished), k: tr("history.finished") },
                { icon: ClockIcon, v: minutes ? formatDuration(minutes) : fa(0), k: tr("profile.watchTime") },
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
        {error ? (
          <LoadErrorCard onRetry={retry} />
        ) : rows ? (
          <HistoryList rows={rows} />
        ) : (
          <div className="py-16 text-center text-sm text-zinc-500">{tr("history.loading")}</div>
        )}
      </div>
    </main>
  );
}
