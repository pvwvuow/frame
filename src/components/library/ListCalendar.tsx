"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { ListRow } from "@/lib/mobile/userdata";
import { JMONTHS, JWEEKDAYS, jMonthGrid, todayJ, jToISO, jDayLabel, g2j } from "@/lib/jalali";
import { fa } from "@/lib/format";
import { CalendarIcon, PlusIcon, CloseIcon, ChevronRight } from "../Icons";
import { titleHref } from "@/lib/mobile-links";

/** رویداد تماشای واقعی (از تاریخچه) که صفحه به‌صورت server-side می‌سازد. */
export type WatchEvent = {
  titleId: number;
  slug: string;
  name: string;
  poster: string;
  backdrop: string | null;
  date: string; // yyyy-mm-dd میلادی — هم‌نوع کلیدهای خانه‌های تقویم
  iso: string; // ISO کامل برای استخراج ساعت
};

type CalItem = {
  titleId: number;
  slug: string;
  name: string;
  poster: string;
  backdrop: string | null;
  dot: "watched" | "planned" | "added";
  time: string | null;
};

type Mode = "month" | "week" | "day";

const MODES: { id: Mode; label: string }[] = [
  { id: "month", label: "ماه" },
  { id: "week", label: "هفته" },
  { id: "day", label: "روز" },
];

const DOT_CLS: Record<CalItem["dot"], string> = {
  watched: "bg-emerald-400",
  planned: "bg-amber-400",
  added: "bg-brand",
};
const DOT_LABEL: Record<CalItem["dot"], string> = {
  watched: "دیده‌شده",
  planned: "برنامه‌ی تماشا",
  added: "افزوده‌شده به لیست",
};
const PRIORITY: Record<CalItem["dot"], number> = { watched: 3, planned: 2, added: 1 };

function timeLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return fa(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToJ(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return g2j(y, m, d);
}

/**
 * تقویم v2 «لیست من» — مطابق طرح جدید: خانه‌های دارای پوستر، حلقه‌ی قرمزِ امروز،
 * حالت‌های ماه/هفته/روز و نوارِ روز انتخابی با ساعت و نقطه‌ی وضعیت.
 * نقطه‌ها: سبز = دیده‌شده (تاریخچه) · طلایی = برنامه‌ریزی‌شده · قرمز = افزودن به لیست.
 */
export default function ListCalendar({ rows, events }: { rows: ListRow[]; events: WatchEvent[] }) {
  const router = useRouter();
  const today = todayJ();
  const todayISO = jToISO(today.jy, today.jm, today.jd);
  const [mode, setMode] = useState<Mode>("month");
  const [view, setView] = useState({ jy: today.jy, jm: today.jm });
  const [selected, setSelected] = useState<string>(todayISO);
  const [pending, startTransition] = useTransition();
  const [schedOpen, setSchedOpen] = useState(false);

  /* ---- ادغام سه منبع رویداد در هر روز؛ برای هر عنوان روزی یکی (اولویت: دیده‌شده > برنامه > افزودن) ---- */
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    const put = (iso: string, item: CalItem) => {
      const arr = m.get(iso) ?? [];
      const prev = arr.find((a) => a.titleId === item.titleId);
      if (prev) {
        if (PRIORITY[item.dot] > PRIORITY[prev.dot]) Object.assign(prev, item);
        return;
      }
      arr.push(item);
      m.set(iso, arr);
    };
    for (const r of rows) {
      const base = { titleId: r.title.id, slug: r.title.slug, name: r.title.title, poster: r.title.poster, backdrop: r.title.backdrop };
      if (r.plannedDate) put(r.plannedDate, { ...base, dot: "planned", time: null });
      put(r.addedAt.slice(0, 10), { ...base, dot: "added", time: timeLabel(r.addedAt) });
    }
    for (const e of events)
      put(e.date, { titleId: e.titleId, slug: e.slug, name: e.name, poster: e.poster, backdrop: e.backdrop, dot: "watched", time: timeLabel(e.iso) });
    return m;
  }, [rows, events]);

  const cells = useMemo(() => jMonthGrid(view.jy, view.jm), [view]);
  const weekRows = useMemo(() => {
    const out: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);
  const activeWeek = weekRows.find((w) => w.some((c) => c.iso === selected)) ?? weekRows[0];

  const itemsOf = (iso: string) => (byDay.get(iso) ?? []).slice().sort((a, b) => PRIORITY[b.dot] - PRIORITY[a.dot]);
  const dayItems = itemsOf(selected);
  const unscheduled = rows.filter((r) => !r.plannedDate && r.status !== "watched");

  const setPlan = async (titleId: number, iso: string | null, name: string) => {
    const r = await fetch("/api/watchlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId, plannedDate: iso }),
    });
    if (!r.ok) return toast.error("ثبت تاریخ ناموفق بود");
    toast.success(iso ? `«${name}» برای ${fa(jDayLabel(iso))} ثبت شد` : `برنامه‌ی «${name}» حذف شد`);
    setSchedOpen(false);
    startTransition(() => router.refresh());
  };

  const nav = (delta: number) => {
    if (mode === "month") {
      let { jy, jm } = view;
      jm += delta;
      if (jm > 12) {
        jm = 1;
        jy += 1;
      }
      if (jm < 1) {
        jm = 12;
        jy -= 1;
      }
      setView({ jy, jm });
    } else {
      const iso = shiftISO(selected, delta * (mode === "week" ? 7 : 1));
      setSelected(iso);
      const j = isoToJ(iso);
      setView({ jy: j.jy, jm: j.jm });
    }
  };

  /* ---- رندر خانه‌ها ---- */
  const renderCell = (c: { iso: string; jd: number; inMonth: boolean }, tall = false) => {
    const items = itemsOf(c.iso);
    const thumbs = items.slice(0, 2);
    const extra = items.length - thumbs.length;
    const isToday = c.iso === todayISO;
    const isSel = c.iso === selected;
    return (
      <button
        key={c.iso}
        type="button"
        onClick={() => setSelected(c.iso)}
        aria-label={`${c.jd} ${JMONTHS[view.jm - 1]}`}
        className={`relative flex flex-col rounded-xl border p-1.5 text-start transition ${
          tall ? "min-h-[220px]" : "min-h-[74px] sm:min-h-[88px]"
        } ${!c.inMonth ? "opacity-35" : ""} ${isToday ? "ring-2 ring-brand" : ""} ${
          isSel ? "border-white/20 bg-white/[0.08]" : "border-white/5 bg-transparent hover:bg-white/5"
        }`}
      >
        <span className={`text-[11px] font-black ${isToday ? "text-brand" : isSel ? "text-white" : "text-zinc-400"}`}>{fa(c.jd)}</span>
        {thumbs.length > 0 && (
          <span className={`flex flex-1 items-center justify-center gap-1 ${tall ? "flex-wrap content-start overflow-hidden pt-1" : "pt-1"}`}>
            {(tall ? items.slice(0, 4) : thumbs).map((t) => (
              <span key={t.titleId} className="relative block">
                <img
                  src={t.poster}
                  alt=""
                  loading="lazy"
                  className={`block rounded-md object-cover ${tall ? "h-14 w-9" : "h-10 w-7 sm:h-11 sm:w-8"}`}
                />
                <span className={`absolute -bottom-1 -end-1 h-2.5 w-2.5 rounded-full ${DOT_CLS[t.dot]} ring-2 ring-ink-800`} />
              </span>
            ))}
            {extra > 0 && (
              <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-white/10 px-1 text-[9px] font-black text-zinc-300">
                +{fa(extra)}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/5 bg-ink-700/40">
      {/* ---- سربرگ: ماه + جهت‌نما + سوییچ ماه/هفته/روز ---- */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4 sm:px-5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label={mode === "month" ? "ماه قبل" : mode === "week" ? "هفته قبل" : "روز قبل"}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
          >
            <ChevronRight width={14} height={14} />
          </button>
          <span className="min-w-32 text-center text-base font-black text-white sm:text-lg">
            {JMONTHS[view.jm - 1]} <span className="num">{fa(view.jy)}</span>
          </span>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label={mode === "month" ? "ماه بعد" : mode === "week" ? "هفته بعد" : "روز بعد"}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
          >
            <ChevronRight width={14} height={14} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => {
              setView({ jy: today.jy, jm: today.jm });
              setSelected(todayISO);
            }}
            className="ms-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-zinc-200 transition hover:bg-white/10"
          >
            امروز
          </button>
        </div>
        <div className="ms-auto flex rounded-full border border-white/10 bg-white/5 p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${
                mode === m.id ? "bg-brand text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- بدنه ---- */}
      {mode === "day" ? (
        <div className="p-4 sm:p-5">
          <p className="text-sm font-black text-white">{fa(jDayLabel(selected))}</p>
          {dayItems.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-500">این روز خالی است — از نوار پایین برایش برنامه ثبت کنید.</p>
          ) : (
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {dayItems.map((t) => (
                <li key={t.titleId} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2.5">
                  <img src={t.backdrop ?? t.poster} alt="" loading="lazy" className="h-16 w-28 shrink-0 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1">
                    <Link href={titleHref(t.slug)} className="block truncate text-[13px] font-bold text-white hover:text-brand">
                      {t.name}
                    </Link>
                    <span className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className={`h-2 w-2 rounded-full ${DOT_CLS[t.dot]}`} /> {DOT_LABEL[t.dot]}
                      {t.time && <span className="num text-zinc-400">{t.time}</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className={mode === "week" ? "overflow-x-auto p-3 sm:p-4" : "p-3 sm:p-4"}>
          <div className={`grid grid-cols-7 gap-1 pb-1.5 text-center text-[10px] font-bold text-zinc-500 ${mode === "week" ? "min-w-[672px]" : ""}`}>
            {JWEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          {mode === "month" ? (
            <div className="grid grid-cols-7 gap-1">{cells.map((c) => renderCell(c))}</div>
          ) : (
            <div className="grid min-w-[672px] grid-cols-7 gap-1.5">{activeWeek.map((c) => renderCell(c, true))}</div>
          )}
        </div>
      )}

      {/* ---- نوار روز انتخابی ---- */}
      <div className="border-t border-white/5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{fa(jDayLabel(selected))}</p>
            <p className="text-[11px] text-zinc-500">
              {dayItems.length ? (
                <>
                  <span className="num">{fa(dayItems.length)}</span> عنوان ·{" "}
                  <span className="text-emerald-400">■</span> دیده‌شده <span className="text-brand">■</span> افزودن{" "}
                  <span className="text-amber-400">■</span> برنامه
                </>
              ) : (
                "این روز خالی است"
              )}
            </p>
          </div>
          {!schedOpen ? (
            <button
              type="button"
              onClick={() => setSchedOpen(true)}
              disabled={unscheduled.length === 0}
              className="flex shrink-0 items-center gap-1 rounded-full border border-brand/40 bg-brand/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand/30 disabled:opacity-40"
            >
              <PlusIcon width={12} height={12} /> ثبت تماشا در این روز
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSchedOpen(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-300 transition hover:bg-white/10"
              aria-label="بستن"
            >
              <CloseIcon width={13} height={13} />
            </button>
          )}
        </div>

        {schedOpen ? (
          <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pe-1">
            {unscheduled.length === 0 && <p className="py-6 text-center text-xs text-zinc-500">همه‌ی عناوین برنامه دارند 🎉</p>}
            {unscheduled.slice(0, 60).map((r) => (
              <li key={r.title.id}>
                <button
                  type="button"
                  onClick={() => setPlan(r.title.id, selected, r.title.title)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] p-2 text-start transition hover:border-brand/40 hover:bg-brand/10"
                >
                  <img src={r.title.poster} alt="" loading="lazy" decoding="async" className="h-12 w-8 shrink-0 rounded-md object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-white">{r.title.title}</span>
                    <span className="block text-[10px] text-zinc-500">
                      {r.title.type === "movie" ? "فیلم" : "سریال"} · <span className="num">{fa(r.title.year)}</span>
                    </span>
                  </span>
                  <PlusIcon width={14} height={14} className="shrink-0 text-brand" />
                </button>
              </li>
            ))}
          </ul>
        ) : mode === "day" ? null : dayItems.length > 0 ? (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {dayItems.map((t) => (
              <Link key={t.titleId} href={titleHref(t.slug)} className="group w-36 shrink-0">
                <span className="relative block overflow-hidden rounded-xl border border-white/5">
                  <img
                    src={t.backdrop ?? t.poster}
                    alt=""
                    loading="lazy"
                    className="h-20 w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <span className={`absolute end-1.5 top-1.5 h-2.5 w-2.5 rounded-full ${DOT_CLS[t.dot]} ring-2 ring-black/50`} />
                </span>
                <span className="mt-1.5 block truncate text-[11px] font-bold text-white transition group-hover:text-brand">{t.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLS[t.dot]}`} />
                  {t.time ? <span className="num">{t.time}</span> : DOT_LABEL[t.dot]}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <CalendarIcon width={14} height={14} /> با دکمه‌ی «ثبت تماشا» یک عنوان برای این روز برنامه‌ریزی کنید.
          </p>
        )}
        {pending && <p className="mt-2 text-center text-[10px] text-zinc-500">در حال به‌روزرسانی…</p>}
      </div>
    </div>
  );
}
