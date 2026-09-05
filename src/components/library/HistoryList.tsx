"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { HistoryRow } from "@/lib/library";
import { fa, formatClock, typeLabel } from "@/lib/format";
import FavoriteButton from "../FavoriteButton";
import WatchlistButton from "../WatchlistButton";
import { PlayIcon, TrashIcon, HistoryIcon, CheckCircleIcon } from "../Icons";
import TitleName from "@/components/TitleName";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (diff === 0) return "امروز";
  if (diff === 1) return "دیروز";
  if (diff < 7) return `${fa(diff)} روز پیش`;
  return d.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long" });
}

export default function HistoryList({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<"all" | "unfinished" | "finished">("all");
  const [confirm, setConfirm] = useState(false);

  const filtered = useMemo(() => rows.filter((r) => (filter === "all" ? true : filter === "finished" ? r.finished : !r.finished)), [rows, filter]);
  const groups = useMemo(() => {
    const m = new Map<string, HistoryRow[]>();
    filtered.forEach((r) => {
      const k = dayLabel(r.updatedAt);
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return [...m.entries()];
  }, [filtered]);

  const remove = (ids?: number[]) =>
    start(async () => {
      try {
        await fetch("/api/progress", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { titleIds: ids } : {}) });
        toast.success(ids ? "از تاریخچه حذف شد" : "تاریخچه پاک شد");
        setConfirm(false);
        router.refresh();
      } catch {
        toast.error("عملیات ناموفق بود");
      }
    });

  if (rows.length === 0) {
    return (
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-dashed border-white/10 p-12 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-zinc-500"><HistoryIcon width={30} height={30} /></span>
        <p className="mt-5 text-xl font-black text-white">تاریخچه‌ای وجود ندارد</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-500">هر چیزی که پخش کنید، این‌جا با درصد پیشرفت ذخیره می‌شود تا از همان‌جا ادامه دهید.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600">شروع تماشا</Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "unfinished", "finished"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${filter === f ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
            {f === "all" ? "همه" : f === "unfinished" ? "نیمه‌کاره" : "تمام‌شده"}
            <span className="ms-1 text-[10px] opacity-60">{fa(f === "all" ? rows.length : rows.filter((r) => (f === "finished" ? r.finished : !r.finished)).length)}</span>
          </button>
        ))}
        <button type="button" onClick={() => setConfirm(true)} className="ms-auto flex items-center gap-1.5 rounded-full border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10">
          <TrashIcon width={13} height={13} /> پاک کردن تاریخچه
        </button>
      </div>

      <div className="mt-6 space-y-8">
        {groups.map(([day, items]) => (
          <section key={day}>
            <h3 className="mb-3 flex items-center gap-3 text-sm font-extrabold text-zinc-300">
              {day}
              <span className="h-px flex-1 bg-white/5" />
              <span className="text-[11px] font-normal text-zinc-500">{fa(items.length)} مورد</span>
            </h3>
            <div className="space-y-2">
              {items.map((r) => {
                const pct = r.duration > 0 ? Math.round((r.position / r.duration) * 100) : 0;
                const href = `/watch/${r.title.slug}${r.episodeId ? `?ep=${r.episodeId}` : ""}`;
                return (
                  <div key={`${r.title.id}-${r.episodeId}`} className="group flex items-center gap-4 rounded-2xl border border-white/5 bg-ink-700/40 p-2.5 transition hover:border-white/15">
                    <Link href={href} className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.title.backdrop} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100"><PlayIcon width={22} height={22} className="text-white" /></span>
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><span className={`block h-full ${r.finished ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} /></span>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/title/${r.title.slug}`} className="block text-sm font-extrabold text-white hover:text-brand"><TitleName t={r.title} layout="inline" secondaryClass="text-[11px]" /></Link>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                        {r.episodeId ? `فصل ${fa(r.season ?? 1)} · قسمت ${fa(r.episodeNumber ?? 1)} · ${r.episodeName}` : `${typeLabel(r.title.type)} · ${fa(r.title.year)}`}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                        {r.finished ? (
                          <span className="flex items-center gap-1 text-emerald-400"><CheckCircleIcon width={12} height={12} /> تمام شد</span>
                        ) : (
                          <span>{fa(pct)}٪ · {formatClock(r.duration - r.position)} مانده</span>
                        )}
                        <span>·</span>
                        <span>{new Date(r.updatedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 opacity-70 transition group-hover:opacity-100">
                      <FavoriteButton titleId={r.title.id} name={r.title.title} variant="mini" />
                      <WatchlistButton titleId={r.title.id} name={r.title.title} variant="mini" />
                      <Link href={href} className="grid h-8 w-8 place-items-center rounded-full bg-white text-black hover:bg-brand hover:text-white" aria-label="پخش"><PlayIcon width={13} height={13} className="ms-0.5" /></Link>
                      <button type="button" disabled={pending} onClick={() => remove([r.title.id])} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-zinc-300 hover:bg-brand hover:text-white" aria-label="حذف"><TrashIcon width={13} height={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(false)}>
          <div className="glass w-full max-w-sm rounded-3xl p-6 text-center">
            <h3 className="text-lg font-black text-white">پاک کردن تاریخچه؟</h3>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{fa(rows.length)} مورد و پیشرفت تماشای آن‌ها حذف می‌شود.</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="h-11 flex-1 rounded-full border border-white/15 text-sm font-bold text-white hover:bg-white/10">انصراف</button>
              <button type="button" onClick={() => remove()} disabled={pending} className="h-11 flex-1 rounded-full bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">پاک کن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
