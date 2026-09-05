"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ListRow, ListStatus } from "@/lib/library";
import { LIST_STATUSES } from "@/lib/library-shared";
import { fa, formatDuration, typeLabel, formatClock } from "@/lib/format";
import TitleCard from "../TitleCard";
import FavoriteButton from "../FavoriteButton";
import StatusSelect from "../StatusSelect";
import RatingControl from "../RatingControl";
import { useLibrary } from "./LibraryProvider";
import { useQuickView } from "../quickview/QuickViewProvider";
import {
  BookmarkIcon, SearchIcon, CloseIcon, GridIcon, ListIcon, SortIcon, TrashIcon, PinIcon, PlayIcon, StarIcon,
  CheckCircleIcon, SquareIcon, NoteIcon, DownloadIcon, ShuffleIcon, InfoIcon, HeartIcon, ChevronDown,
} from "../Icons";
import TitleName from "@/components/TitleName";

type Tab = "all" | "movie" | "series" | "planned" | "watching" | "watched" | "favorite";
type Sort = "added" | "title" | "rating" | "year" | "duration" | "myScore" | "progress";
type View = "grid" | "list";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "همه" },
  { id: "movie", label: "فیلم‌ها" },
  { id: "series", label: "سریال‌ها" },
  { id: "planned", label: "در انتظار" },
  { id: "watching", label: "در حال تماشا" },
  { id: "watched", label: "تماشا شده" },
  { id: "favorite", label: "علاقه‌مندی" },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: "added", label: "تاریخ افزودن" },
  { id: "title", label: "نام (الفبا)" },
  { id: "rating", label: "امتیاز IMDb" },
  { id: "myScore", label: "امتیاز من" },
  { id: "year", label: "سال ساخت" },
  { id: "duration", label: "مدت زمان" },
  { id: "progress", label: "پیشرفت تماشا" },
];

const PREF_KEY = "nama.mylist.prefs";

export default function MyListManager({ rows }: { rows: ListRow[] }) {
  const router = useRouter();
  const lib = useLibrary();
  const { open } = useQuickView();
  const [pending, start] = useTransition();

  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [sort, setSort] = useState<Sort>("added");
  const [desc, setDesc] = useState(true);
  const [view, setView] = useState<View>("grid");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [noteFor, setNoteFor] = useState<ListRow | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  /* persist view preferences */
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      if (p.view) setView(p.view);
      if (p.sort) setSort(p.sort);
      if (typeof p.desc === "boolean") setDesc(p.desc);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify({ view, sort, desc }));
  }, [view, sort, desc]);

  /* merge server rows with live client state (status / favorite / score) */
  const live = useMemo<ListRow[]>(
    () =>
      rows
        .filter((r) => !lib.ready || lib.list.has(r.title.id))
        .map((r) => ({
          ...r,
          status: (lib.ready ? lib.list.get(r.title.id) : undefined) ?? r.status,
          isFavorite: lib.ready ? lib.isFavorite(r.title.id) : r.isFavorite,
          myScore: lib.ready ? lib.scoreOf(r.title.id) : r.myScore,
        })),
    [rows, lib]
  );

  const genres = useMemo(() => {
    const m = new Map<string, number>();
    live.forEach((r) => r.title.genres.forEach((g) => m.set(g, (m.get(g) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [live]);

  const counts = useMemo(
    () => ({
      all: live.length,
      movie: live.filter((r) => r.title.type === "movie").length,
      series: live.filter((r) => r.title.type === "series").length,
      planned: live.filter((r) => r.status === "planned").length,
      watching: live.filter((r) => r.status === "watching").length,
      watched: live.filter((r) => r.status === "watched").length,
      favorite: live.filter((r) => r.isFavorite).length,
    }),
    [live]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pct = (r: ListRow) => (r.progress && r.progress.duration > 0 ? r.progress.position / r.progress.duration : 0);
    let arr = live.filter((r) => {
      if (tab === "movie" || tab === "series") return r.title.type === tab;
      if (tab === "favorite") return r.isFavorite;
      if (tab === "planned" || tab === "watching" || tab === "watched") return r.status === tab;
      return true;
    });
    if (genre) arr = arr.filter((r) => r.title.genres.includes(genre));
    if (term)
      arr = arr.filter(
        (r) =>
          r.title.title.toLowerCase().includes(term) ||
          r.title.titleEn.toLowerCase().includes(term) ||
          r.title.director.toLowerCase().includes(term) ||
          r.title.cast.some((c) => c.toLowerCase().includes(term)) ||
          r.note.toLowerCase().includes(term)
      );
    const dir = desc ? -1 : 1;
    arr = [...arr].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      switch (sort) {
        case "title":
          return a.title.title.localeCompare(b.title.title, "fa") * -dir;
        case "rating":
          return (a.title.rating - b.title.rating) * dir;
        case "myScore":
          return ((a.myScore ?? 0) - (b.myScore ?? 0)) * dir;
        case "year":
          return (a.title.year - b.title.year) * dir;
        case "duration":
          return (a.title.duration - b.title.duration) * dir;
        case "progress":
          return (pct(a) - pct(b)) * dir;
        default:
          return (new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()) * dir;
      }
    });
    return arr;
  }, [live, tab, genre, q, sort, desc]);

  const totalMinutes = filtered.reduce((a, r) => a + r.title.duration, 0);

  /* ---------- actions ---------- */
  const api = (method: string, body: unknown, url = "/api/watchlist") =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    });

  const toggleSelect = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAll = () => setSelected(new Set(filtered.map((r) => r.title.id)));
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const removeMany = (ids: number[]) =>
    start(async () => {
      try {
        await api("DELETE", { titleIds: ids });
        toast.success(`${fa(ids.length)} عنوان از لیست حذف شد`, {
          action: {
            label: "بازگردانی",
            onClick: async () => {
              await api("PUT", { titleIds: ids, action: "add" });
              await lib.refresh();
              router.refresh();
            },
          },
        });
        await lib.refresh();
        router.refresh();
        exitSelect();
      } catch {
        toast.error("حذف ناموفق بود");
      }
    });

  const bulkStatus = (status: ListStatus) =>
    start(async () => {
      try {
        await api("PUT", { titleIds: [...selected], action: "status", status });
        toast.success(`وضعیت ${fa(selected.size)} عنوان تغییر کرد`);
        await lib.refresh();
        router.refresh();
        exitSelect();
      } catch {
        toast.error("عملیات ناموفق بود");
      }
    });

  const bulkFavorite = () =>
    start(async () => {
      try {
        await api("PUT", { titleIds: [...selected] }, "/api/favorites");
        toast.success(`${fa(selected.size)} عنوان به علاقه‌مندی‌ها اضافه شد`);
        await lib.refresh();
        router.refresh();
        exitSelect();
      } catch {
        toast.error("عملیات ناموفق بود");
      }
    });

  const togglePin = (r: ListRow) =>
    start(async () => {
      try {
        await api("PATCH", { titleId: r.title.id, pinned: !r.pinned });
        toast.success(r.pinned ? "سنجاق برداشته شد" : "به بالای لیست سنجاق شد");
        router.refresh();
      } catch {
        toast.error("عملیات ناموفق بود");
      }
    });

  const saveNote = (r: ListRow, note: string) =>
    start(async () => {
      try {
        await api("PATCH", { titleId: r.title.id, note });
        toast.success("یادداشت ذخیره شد");
        setNoteFor(null);
        router.refresh();
      } catch {
        toast.error("ذخیره یادداشت ناموفق بود");
      }
    });

  const clearAll = () =>
    start(async () => {
      try {
        await api("DELETE", {});
        toast.success("لیست شما پاک شد");
        setConfirmClear(false);
        await lib.refresh();
        router.refresh();
      } catch {
        toast.error("عملیات ناموفق بود");
      }
    });

  const exportList = (format: "json" | "csv") => {
    const data = filtered.map((r) => ({
      title: r.title.title,
      titleEn: r.title.titleEn,
      type: typeLabel(r.title.type),
      year: r.title.year,
      rating: r.title.rating,
      myScore: r.myScore ?? "",
      status: LIST_STATUSES.find((s) => s.value === r.status)?.label ?? r.status,
      favorite: r.isFavorite ? "بله" : "خیر",
      note: r.note,
      addedAt: new Date(r.addedAt).toLocaleDateString("fa-IR"),
      url: `${location.origin}/title/${r.title.slug}`,
    }));
    let blob: Blob;
    if (format === "json") blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    else {
      const head = Object.keys(data[0] ?? { title: "" });
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = "\uFEFF" + [head.join(","), ...data.map((d) => head.map((h) => esc((d as Record<string, unknown>)[h])).join(","))].join("\n");
      blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nama-my-list.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`خروجی ${format.toUpperCase()} دانلود شد`);
  };

  const shareList = async () => {
    const text = filtered.map((r, i) => `${i + 1}. ${r.title.title} (${r.title.year}) ★${r.title.rating}`).join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "لیست تماشای من در نما", text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("لیست در کلیپ‌بورد کپی شد");
      }
    } catch {
      /* cancelled */
    }
  };

  const surprise = () => {
    const pool = filtered.filter((r) => r.status !== "watched");
    if (!pool.length) return toast.info("چیزی برای پیشنهاد نمانده!");
    const pick = pool[Math.floor(Math.random() * pool.length)];
    toast(`امشب: «${pick.title.title}»`, { description: pick.title.description.slice(0, 80) + "…", action: { label: "پخش", onClick: () => router.push(`/watch/${pick.title.slug}`) } });
    open(pick.title);
  };

  /* ---------- render ---------- */
  return (
    <div>
      {/* toolbar */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-white/5 bg-ink/85 px-4 py-3 backdrop-blur-xl sm:top-[72px] sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <div className="flex flex-wrap items-center gap-2">
          {/* tabs */}
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  tab === t.id ? "bg-white text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {t.id === "favorite" && <HeartIcon width={12} height={12} filled={tab === t.id} className={tab === t.id ? "text-rose-600" : "text-rose-400"} />}
                {t.label}
                <span className={`rounded-full px-1.5 text-[10px] ${tab === t.id ? "bg-black/10" : "bg-white/10"}`}>{fa(counts[t.id])}</span>
              </button>
            ))}
          </div>

          <div className="ms-auto flex items-center gap-2">
            {/* search */}
            <label className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 focus-within:border-white/30">
              <SearchIcon width={15} height={15} className="text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجو در لیست…"
                className="w-28 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none sm:w-44"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="پاک کردن">
                  <CloseIcon width={13} height={13} className="text-zinc-400" />
                </button>
              )}
            </label>

            {/* genre */}
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="hidden h-9 rounded-full border border-white/10 bg-ink-700 px-3 text-xs text-zinc-200 focus:outline-none md:block"
              aria-label="فیلتر ژانر"
            >
              <option value="">همه ژانرها</option>
              {genres.map(([g, c]) => (
                <option key={g} value={g}>
                  {g} ({fa(c)})
                </option>
              ))}
            </select>

            {/* sort */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((s) => !s)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-bold text-zinc-200 hover:bg-white/10"
              >
                <SortIcon width={14} height={14} />
                <span className="hidden sm:inline">{SORTS.find((s) => s.id === sort)?.label}</span>
                <ChevronDown width={12} height={12} />
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="glass absolute end-0 top-11 z-20 w-48 overflow-hidden rounded-xl p-1 shadow-2xl">
                    {SORTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          if (sort === s.id) setDesc((d) => !d);
                          else {
                            setSort(s.id);
                            setDesc(true);
                          }
                          setSortOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition hover:bg-white/10 ${sort === s.id ? "text-white" : "text-zinc-300"}`}
                      >
                        {s.label}
                        {sort === s.id && <span className="text-[10px] text-brand">{desc ? "نزولی" : "صعودی"}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* view */}
            <div className="hidden h-9 items-center rounded-full border border-white/10 bg-white/5 p-0.5 sm:flex">
              <button type="button" onClick={() => setView("grid")} aria-label="نمای شبکه‌ای" className={`grid h-8 w-8 place-items-center rounded-full ${view === "grid" ? "bg-white text-black" : "text-zinc-400"}`}>
                <GridIcon width={14} height={14} />
              </button>
              <button type="button" onClick={() => setView("list")} aria-label="نمای فهرستی" className={`grid h-8 w-8 place-items-center rounded-full ${view === "list" ? "bg-white text-black" : "text-zinc-400"}`}>
                <ListIcon width={14} height={14} />
              </button>
            </div>

            {/* select mode */}
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition ${
                selectMode ? "border-brand bg-brand text-white" : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
            >
              <CheckCircleIcon width={14} height={14} />
              <span className="hidden sm:inline">{selectMode ? "پایان انتخاب" : "انتخاب"}</span>
            </button>
          </div>
        </div>

        {/* secondary row: summary + utilities */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span>
            {fa(filtered.length)} عنوان{totalMinutes ? ` · ${formatDuration(totalMinutes)} محتوا` : ""}
            {genre && (
              <button type="button" onClick={() => setGenre("")} className="ms-2 rounded-full bg-white/10 px-2 py-0.5 text-zinc-200">
                {genre} ✕
              </button>
            )}
          </span>
          <span className="ms-auto flex items-center gap-1">
            <button type="button" onClick={surprise} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5 hover:text-white">
              <ShuffleIcon width={12} height={12} /> امشب چی ببینم؟
            </button>
            <button type="button" onClick={shareList} className="rounded-full px-2 py-1 hover:bg-white/5 hover:text-white">اشتراک‌گذاری</button>
            <button type="button" onClick={() => exportList("csv")} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/5 hover:text-white">
              <DownloadIcon width={12} height={12} /> CSV
            </button>
            <button type="button" onClick={() => exportList("json")} className="rounded-full px-2 py-1 hover:bg-white/5 hover:text-white">JSON</button>
            {live.length > 0 && (
              <button type="button" onClick={() => setConfirmClear(true)} className="rounded-full px-2 py-1 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300">
                پاک کردن همه
              </button>
            )}
          </span>
        </div>
      </div>

      {/* content */}
      {filtered.length === 0 ? (
        <EmptyState hasAny={live.length > 0} onReset={() => { setQ(""); setGenre(""); setTab("all"); }} />
      ) : view === "grid" ? (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {filtered.map((r) => (
            <GridItem key={r.title.id} r={r} selectMode={selectMode} selected={selected.has(r.title.id)} onSelect={() => toggleSelect(r.title.id)} onRemove={() => removeMany([r.title.id])} onPin={() => togglePin(r)} onNote={() => setNoteFor(r)} />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map((r) => (
            <ListItem key={r.title.id} r={r} selectMode={selectMode} selected={selected.has(r.title.id)} onSelect={() => toggleSelect(r.title.id)} onRemove={() => removeMany([r.title.id])} onPin={() => togglePin(r)} onNote={() => setNoteFor(r)} onOpen={() => open(r.title)} />
          ))}
        </div>
      )}

      {/* bulk action bar */}
      {selectMode && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-3xl md:bottom-6">
          <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-3 shadow-2xl">
            <button type="button" onClick={selected.size === filtered.length ? () => setSelected(new Set()) : selectAll} className="flex items-center gap-1.5 text-xs font-bold text-white">
              <SquareIcon width={18} height={18} checked={selected.size === filtered.length && filtered.length > 0} className={selected.size === filtered.length ? "text-white" : "text-zinc-400"} />
              {selected.size === filtered.length ? "لغو انتخاب همه" : "انتخاب همه"}
            </button>
            <span className="text-xs text-zinc-400">{fa(selected.size)} انتخاب‌شده</span>
            <div className="ms-auto flex flex-wrap items-center gap-1.5">
              {LIST_STATUSES.map((s) => (
                <button key={s.value} type="button" disabled={!selected.size || pending} onClick={() => bulkStatus(s.value)} className={`rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold ${s.color} disabled:opacity-40 hover:bg-white/10`}>
                  {s.label}
                </button>
              ))}
              <button type="button" disabled={!selected.size || pending} onClick={bulkFavorite} className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-300 disabled:opacity-40 hover:bg-rose-500/20">
                <HeartIcon width={12} height={12} /> علاقه‌مندی
              </button>
              <button type="button" disabled={!selected.size || pending} onClick={() => removeMany([...selected])} className="flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40 hover:bg-brand-600">
                <TrashIcon width={12} height={12} /> حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* note dialog */}
      {noteFor && <NoteDialog row={noteFor} onClose={() => setNoteFor(null)} onSave={(n) => saveNote(noteFor, n)} pending={pending} />}

      {/* clear confirm */}
      {confirmClear && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setConfirmClear(false)}>
          <div className="glass w-full max-w-sm rounded-3xl p-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-400">
              <TrashIcon width={26} height={26} />
            </span>
            <h3 className="mt-4 text-lg font-black text-white">پاک کردن کل لیست؟</h3>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{fa(live.length)} عنوان به‌همراه وضعیت و یادداشت‌ها حذف می‌شوند. این عمل قابل بازگشت نیست.</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="h-11 flex-1 rounded-full border border-white/15 text-sm font-bold text-white hover:bg-white/10">انصراف</button>
              <button type="button" onClick={clearAll} disabled={pending} className="h-11 flex-1 rounded-full bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">بله، پاک کن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- sub components ---------------- */
type ItemProps = { r: ListRow; selectMode: boolean; selected: boolean; onSelect: () => void; onRemove: () => void; onPin: () => void; onNote: () => void };

function GridItem({ r, selectMode, selected, onSelect, onRemove, onPin, onNote }: ItemProps) {
  const st = LIST_STATUSES.find((s) => s.value === r.status)!;
  return (
    <div className={`group/list relative rounded-xl transition ${selected ? "ring-2 ring-brand ring-offset-2 ring-offset-ink" : ""}`}>
      <div className={`[&>div]:w-full ${selectMode ? "pointer-events-none" : ""}`}>
        <TitleCard t={r.title} progress={r.progress} />
      </div>
      {selectMode && (
        <button type="button" onClick={onSelect} aria-pressed={selected} className="absolute inset-0 z-10 rounded-xl bg-black/30">
          <span className={`absolute start-2 top-2 grid h-7 w-7 place-items-center rounded-full ${selected ? "bg-brand text-white" : "bg-black/60 text-white ring-1 ring-white/30"}`}>
            {selected ? <CheckCircleIcon width={16} height={16} /> : <span className="h-3 w-3 rounded-full border border-white/60" />}
          </span>
        </button>
      )}
      {!selectMode && (
        <div className="absolute start-2 top-2 z-10 flex flex-col gap-1 opacity-0 transition group-hover/list:opacity-100">
          <button type="button" onClick={onRemove} aria-label="حذف از لیست" title="حذف از لیست" className="grid h-8 w-8 place-items-center rounded-full bg-black/70 text-zinc-300 ring-1 ring-white/15 backdrop-blur hover:bg-brand hover:text-white">
            <TrashIcon width={14} height={14} />
          </button>
          <button type="button" onClick={onPin} aria-label="سنجاق" title={r.pinned ? "برداشتن سنجاق" : "سنجاق به بالا"} className={`grid h-8 w-8 place-items-center rounded-full ring-1 ring-white/15 backdrop-blur ${r.pinned ? "bg-amber-400 text-black" : "bg-black/70 text-zinc-300 hover:bg-white hover:text-black"}`}>
            <PinIcon width={14} height={14} filled={r.pinned} />
          </button>
          <button type="button" onClick={onNote} aria-label="یادداشت" title="یادداشت" className={`grid h-8 w-8 place-items-center rounded-full ring-1 ring-white/15 backdrop-blur ${r.note ? "bg-sky-500 text-white" : "bg-black/70 text-zinc-300 hover:bg-white hover:text-black"}`}>
            <NoteIcon width={14} height={14} />
          </button>
        </div>
      )}
      {r.pinned && !selectMode && <span className="absolute -top-1.5 start-1/2 z-10 -translate-x-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black text-black shadow">سنجاق‌شده</span>}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
        <span className={`font-bold ${st.color}`}>{st.label}</span>
        <span className="text-zinc-500">{new Date(r.addedAt).toLocaleDateString("fa-IR")}</span>
      </div>
      {r.note && <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-zinc-500">📝 {r.note}</p>}
    </div>
  );
}

function ListItem({ r, selectMode, selected, onSelect, onRemove, onPin, onNote, onOpen }: ItemProps & { onOpen: () => void }) {
  const pct = r.progress && r.progress.duration > 0 ? Math.round((r.progress.position / r.progress.duration) * 100) : 0;
  return (
    <div className={`group/list relative flex gap-4 rounded-2xl border p-3 transition ${selected ? "border-brand bg-brand/5" : "border-white/5 bg-ink-700/40 hover:border-white/15"}`}>
      {selectMode && (
        <button type="button" onClick={onSelect} aria-pressed={selected} className="grid w-8 shrink-0 place-items-center">
          <span className={`grid h-6 w-6 place-items-center rounded-full ${selected ? "bg-brand text-white" : "ring-1 ring-white/30"}`}>{selected && <CheckCircleIcon width={14} height={14} />}</span>
        </button>
      )}
      <button type="button" onClick={onOpen} className="relative h-[120px] w-[80px] shrink-0 overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.title.poster} alt={r.title.title} className="h-full w-full object-cover transition group-hover/list:scale-105" />
        {pct > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="block h-full bg-brand" style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-base font-extrabold text-white">
              {r.pinned && <PinIcon width={14} height={14} filled className="text-amber-400" />}
              <Link href={`/title/${r.title.slug}`} className="min-w-0 hover:text-brand"><TitleName t={r.title} layout="inline" secondaryClass="text-xs" /></Link>
              {r.isFavorite && <HeartIcon width={14} height={14} filled className="text-rose-500" />}
            </p>
            <p className="truncate text-xs text-zinc-400" dir="ltr">{r.title.titleEn}</p>
          </div>
          <div className="ms-auto flex items-center gap-2 text-xs text-zinc-400">
            <span className="flex items-center gap-1 text-amber-400"><StarIcon width={12} height={12} /> {fa(r.title.rating)}</span>
            <span>·</span>
            <span>{typeLabel(r.title.type)} · {fa(r.title.year)}</span>
            <span>·</span>
            <span>{formatDuration(r.title.duration)}</span>
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-6 text-zinc-400">{r.title.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusSelect titleId={r.title.id} size="sm" />
          <RatingControl titleId={r.title.id} compact />
          {pct > 0 && r.progress && <span className="text-[11px] text-zinc-500">{fa(pct)}٪ · {formatClock(r.progress.duration - r.progress.position)} مانده</span>}
        </div>
        {r.note && <p className="mt-2 rounded-lg bg-sky-500/10 px-2 py-1 text-[11px] leading-5 text-sky-200">📝 {r.note}</p>}
        <p className="mt-1 text-[10px] text-zinc-600">افزوده‌شده در {new Date(r.addedAt).toLocaleDateString("fa-IR")}</p>
      </div>
      {!selectMode && (
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Link href={r.progress?.episodeId ? `/watch/${r.title.slug}?ep=${r.progress.episodeId}` : `/watch/${r.title.slug}`} aria-label="پخش" className="grid h-9 w-9 place-items-center rounded-full bg-white text-black hover:bg-brand hover:text-white">
            <PlayIcon width={14} height={14} className="ms-0.5" />
          </Link>
          <FavoriteButton titleId={r.title.id} name={r.title.title} variant="mini" className="!h-9 !w-9" />
          <button type="button" onClick={onOpen} aria-label="جزئیات" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><InfoIcon width={15} height={15} /></button>
          <button type="button" onClick={onPin} aria-label="سنجاق" className={`grid h-9 w-9 place-items-center rounded-full ${r.pinned ? "bg-amber-400 text-black" : "bg-white/10 text-white hover:bg-white/20"}`}><PinIcon width={14} height={14} filled={r.pinned} /></button>
          <button type="button" onClick={onNote} aria-label="یادداشت" className={`grid h-9 w-9 place-items-center rounded-full ${r.note ? "bg-sky-500 text-white" : "bg-white/10 text-white hover:bg-white/20"}`}><NoteIcon width={14} height={14} /></button>
          <button type="button" onClick={onRemove} aria-label="حذف" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-zinc-300 hover:bg-brand hover:text-white"><TrashIcon width={14} height={14} /></button>
        </div>
      )}
    </div>
  );
}

function NoteDialog({ row, onClose, onSave, pending }: { row: ListRow; onClose: () => void; onSave: (n: string) => void; pending: boolean }) {
  const [v, setV] = useState(row.note);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass w-full max-w-md rounded-3xl p-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.title.poster} alt="" className="h-16 w-11 rounded-lg object-cover" />
          <div>
            <p className="text-xs text-zinc-400">یادداشت شخصی برای</p>
            <h3 className="text-lg font-black text-white">{row.title.title}</h3>
          </div>
          <button type="button" onClick={onClose} className="ms-auto text-zinc-400 hover:text-white" aria-label="بستن"><CloseIcon /></button>
        </div>
        <textarea
          value={v}
          onChange={(e) => setV(e.target.value.slice(0, 500))}
          rows={5}
          autoFocus
          placeholder="مثلاً: پیشنهاد سارا؛ حتماً با زیرنویس ببینم…"
          className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-3 text-sm leading-7 text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
        />
        <div className="mt-1 text-end text-[10px] text-zinc-500">{fa(v.length)}/۵۰۰</div>
        <div className="mt-4 flex gap-2">
          {row.note && <button type="button" onClick={() => onSave("")} className="h-11 rounded-full px-4 text-sm font-bold text-rose-400 hover:bg-rose-500/10">حذف یادداشت</button>}
          <button type="button" onClick={onClose} className="ms-auto h-11 rounded-full border border-white/15 px-5 text-sm font-bold text-white hover:bg-white/10">انصراف</button>
          <button type="button" disabled={pending} onClick={() => onSave(v.trim())} className="h-11 rounded-full bg-brand px-6 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">ذخیره</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasAny, onReset }: { hasAny: boolean; onReset: () => void }) {
  return (
    <div className="relative mt-8 overflow-hidden rounded-3xl border border-dashed border-white/10 p-12 text-center">
      <div className="absolute -top-20 start-1/2 h-40 w-80 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-zinc-500">
          <BookmarkIcon width={30} height={30} />
        </span>
        <p className="mt-5 text-xl font-black text-white">{hasAny ? "موردی با این فیلتر پیدا نشد" : "لیست شما خالی است"}</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-500">
          {hasAny ? "فیلترها یا عبارت جستجو را تغییر دهید." : "روی هر پوستر بروید و با دکمه «+» آن را ذخیره کنید؛ با «♥» هم به علاقه‌مندی‌ها اضافه می‌شود."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {hasAny ? (
            <button type="button" onClick={onReset} className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black hover:bg-zinc-200">پاک کردن فیلترها</button>
          ) : (
            <>
              <Link href="/movies" className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600">مرور فیلم‌ها</Link>
              <Link href="/series" className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-sm font-bold text-white hover:bg-white/10">مرور سریال‌ها</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
