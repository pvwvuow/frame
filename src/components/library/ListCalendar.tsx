"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { ListRow } from "@/lib/library";
import {
  JMONTHS,
  JWEEKDAYS,
  jMonthGrid,
  todayJ,
  jToISO,
  jDayLabel,
} from "@/lib/jalali";
import { fa } from "@/lib/format";
import { CalendarIcon, PlusIcon, CloseIcon, FilmIcon, TvIcon, CheckIcon } from "../Icons";

type CalItem = { row: ListRow; kind: "added" | "planned" };

/**
 * تقویم «لیست من» — نمایش شمسیِ اینکه هر فیلم/سریال کِی اضافه شده و
 * کِی قرار است تماشا شود. کاربر می‌تواند برای هر عنوان تاریخ تماشا ثبت کند.
 */
export default function ListCalendar({ rows }: { rows: ListRow[] }) {
  const router = useRouter();
  const today = todayJ();
  const [view, setView] = useState({ jy: today.jy, jm: today.jm });
  const [selected, setSelected] = useState<string>(jToISO(today.jy, today.jm, today.jd));
  const [pending, startTransition] = useTransition();
  const [schedOpen, setSchedOpen] = useState(false);

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    const push = (iso: string, item: CalItem) => {
      let a = m.get(iso);
      if (!a) m.set(iso, (a = []));
      a.push(item);
    };
    for (const r of rows) {
      if (r.plannedDate) push(r.plannedDate, { row: r, kind: "planned" });
      push(r.addedAt.slice(0, 10), { row: r, kind: "added" });
    }
    return m;
  }, [rows]);

  const cells = useMemo(() => jMonthGrid(view.jy, view.jm), [view]);
  const plannedSet = useMemo(() => new Set(rows.filter((r) => r.plannedDate).map((r) => r.title.id)), [rows]);
  const unscheduled = rows.filter((r) => !r.plannedDate && r.status !== "watched");

  const nav = (delta: number) => {
    let { jy, jm } = view;
    jm += delta;
    if (jm > 12) ((jm = 1), (jy += 1));
    if (jm < 1) ((jm = 12), (jy -= 1));
    setView({ jy, jm });
  };

  const setPlan = async (titleId: number, iso: string | null, name: string) => {
    const r = await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId, plannedDate: iso }),
    });
    if (!r.ok) return toast.error("ثبت تاریخ ناموفق بود");
    toast.success(iso ? `«${name}» برای ${jDayLabel(iso)} ثبت شد` : `برنامه‌ی «${name}» حذف شد`);
    setSchedOpen(false);
    startTransition(() => router.refresh());
  };

  const dayItems = byDay.get(selected) ?? [];
  const plannedInMonth = cells.filter((c) => c.inMonth && (byDay.get(c.iso) ?? []).some((i) => i.kind === "planned")).length;

  return (
    <div className="overflow-hidden rounded-3xl border border-white/5 bg-ink-700/40">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4 sm:p-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand">
          <CalendarIcon width={20} height={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-white">تقویم تماشا</h3>
          <p className="text-[11px] text-zinc-500">
            {fa(plannedInMonth)} روزِ برنامه‌دار در {JMONTHS[view.jm - 1]} · افزودن‌ها با <span className="text-brand">نقطه‌ی قرمز</span>، برنامه‌ها با{" "}
            <span className="text-amber-400">نقطه‌ی طلایی</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setView({ jy: today.jy, jm: today.jm })}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-zinc-200 transition hover:bg-white/10"
          >
            امروز
          </button>
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label="ماه قبل"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
          >
            <PlusIcon width={13} height={13} className="rotate-45" />
          </button>
          <span className="min-w-28 text-center text-sm font-black text-white">
            {JMONTHS[view.jm - 1]} {fa(view.jy)}
          </span>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label="ماه بعد"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
          >
            <PlusIcon width={13} height={13} className="-rotate-45" />
          </button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
        {/* grid */}
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-500">
            {JWEEKDAYS.map((w) => (
              <span key={w} className="pb-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => {
              const items = byDay.get(c.iso) ?? [];
              const planned = items.filter((i) => i.kind === "planned");
              const added = items.filter((i) => i.kind === "added");
              const isToday = c.iso === jToISO(today.jy, today.jm, today.jd);
              const isSel = c.iso === selected;
              return (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => setSelected(c.iso)}
                  aria-label={`${c.jd} ${JMONTHS[view.jm - 1]}`}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition sm:text-sm ${
                    !c.inMonth ? "text-zinc-700" : isSel ? "bg-brand text-white shadow-[0_0_0_2px_rgba(229,9,20,0.35)]" : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <span className={`font-bold ${isToday && !isSel ? "text-brand" : ""}`}>{c.inMonth ? fa(c.jd) : fa(c.jd)}</span>
                  <span className="absolute bottom-1.5 flex gap-0.5">
                    {added.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? "bg-white" : "bg-brand"}`} />}
                    {planned.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? "bg-white" : "bg-amber-400"}`} />}
                  </span>
                  {items.length > 3 && (
                    <span className={`absolute end-1 top-1 text-[8px] font-black ${isSel ? "text-white/80" : "text-zinc-500"}`}>
                      {fa(items.length)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* day panel */}
        <div className="border-t border-white/5 p-4 lg:border-s lg:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-white">{jDayLabel(selected)}</p>
            {!schedOpen ? (
              <button
                type="button"
                onClick={() => setSchedOpen(true)}
                disabled={unscheduled.length === 0}
                className="flex items-center gap-1 rounded-full border border-brand/40 bg-brand/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand/30 disabled:opacity-40"
              >
                <PlusIcon width={12} height={12} /> ثبت تماشا در این روز
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSchedOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/5 text-zinc-300 hover:bg-white/10"
                aria-label="بستن"
              >
                <CloseIcon width={13} height={13} />
              </button>
            )}
          </div>

          {schedOpen ? (
            <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pe-1">
              {unscheduled.length === 0 && <p className="py-6 text-center text-xs text-zinc-500">همه‌ی عناوین برنامه دارند 🎉</p>}
              {unscheduled.slice(0, 60).map((r) => (
                <li key={r.title.id}>
                  <button
                    type="button"
                    onClick={() => setPlan(r.title.id, selected, r.title.title)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-start transition hover:border-brand/40 hover:bg-brand/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.title.poster} alt="" className="h-12 w-8 shrink-0 rounded-md object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-white">{r.title.title}</span>
                      <span className="block text-[10px] text-zinc-500">
                        {r.title.type === "movie" ? "فیلم" : "سریال"} · {fa(r.title.year)}
                      </span>
                    </span>
                    <PlusIcon width={14} height={14} className="shrink-0 text-brand" />
                  </button>
                </li>
              ))}
            </ul>
          ) : dayItems.length === 0 ? (
            <div className="grid place-items-center py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-zinc-600">
                <CalendarIcon width={22} height={22} />
              </span>
              <p className="mt-3 text-xs leading-6 text-zinc-500">
                این روز خالی است.
                <br />
                از دکمه‌ی بالا یک عنوان برای تماشا ثبت کنید.
              </p>
            </div>
          ) : (
            <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pe-1">
              {dayItems.map(({ row, kind }) => (
                <li
                  key={`${kind}-${row.title.id}`}
                  className={`flex items-center gap-2.5 rounded-xl border p-2 ${
                    kind === "planned" ? "border-amber-400/20 bg-amber-400/5" : "border-white/5 bg-white/[0.03]"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.title.poster} alt="" className="h-12 w-8 shrink-0 rounded-md object-cover" />
                  <Link href={`/title/${row.title.slug}`} className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-white">{row.title.title}</span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                      {kind === "planned" ? (
                        <>
                          <span className="text-amber-400">برنامه‌ی تماشا</span> · {row.title.type === "movie" ? "فیلم" : "سریال"}
                        </>
                      ) : (
                        <>
                          {row.title.type === "movie" ? <FilmIcon width={10} height={10} /> : <TvIcon width={10} height={10} />} اضافه‌شده به لیست
                        </>
                      )}
                    </span>
                  </Link>
                  {kind === "planned" && (
                    <button
                      type="button"
                      onClick={() => setPlan(row.title.id, null, row.title.title)}
                      aria-label="حذف برنامه"
                      title="حذف برنامه"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-rose-600 hover:text-white"
                    >
                      <CloseIcon width={12} height={12} />
                    </button>
                  )}
                  {kind === "added" && !plannedSet.has(row.title.id) && row.status !== "watched" && (
                    <button
                      type="button"
                      onClick={() => setPlan(row.title.id, selected, row.title.title)}
                      aria-label="برنامه‌ریزی"
                      title="برنامه‌ریزی برای این روز"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-amber-400 hover:text-black"
                    >
                      <PlusIcon width={12} height={12} />
                    </button>
                  )}
                  {kind === "added" && row.status === "watched" && (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400" title="تماشا شده">
                      <CheckIcon width={12} height={12} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pending && <p className="mt-2 text-center text-[10px] text-zinc-500">در حال به‌روزرسانی…</p>}
        </div>
      </div>
    </div>
  );
}
