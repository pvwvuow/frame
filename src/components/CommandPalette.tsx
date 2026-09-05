"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { fa } from "@/lib/format";
import {
  SearchIcon,
  HomeIcon,
  FilmIcon,
  TvIcon,
  SparkIcon,
  BookmarkIcon,
  HeartIcon,
  HistoryIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  LayersIcon,
  ShuffleIcon,
  KeyboardIcon,
  UsersIcon,
  BellIcon,
  UserIcon,
} from "./Icons";
import TitleName from "@/components/TitleName";

type Result = { id: number; slug: string; title: string; titleEn: string; poster: string; year: number; type: string; rating: number };

type Cmd = { id: string; label: string; hint?: string; icon: (p: { width?: number; height?: number; className?: string }) => React.ReactNode; run: () => void; keywords?: string };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { setTheme } = useTheme();

  // ⌘K / Ctrl+K toggles, "/" opens when not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
      document.body.style.overflow = "hidden";
    } else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // search titles
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Result[]) => setResults(d.slice(0, 6)))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const commands = useMemo<Cmd[]>(
    () => [
      { id: "home", label: "خانه", icon: HomeIcon, run: () => go("/"), keywords: "home" },
      { id: "movies", label: "فیلم‌ها", icon: FilmIcon, run: () => go("/movies"), keywords: "movies film" },
      { id: "series", label: "سریال‌ها", icon: TvIcon, run: () => go("/series"), keywords: "series tv" },
      { id: "genres", label: "ژانرها", icon: SparkIcon, run: () => go("/genres"), keywords: "genre" },
      { id: "collections", label: "مجموعه‌ها", hint: "کالکشن‌های دست‌چین", icon: LayersIcon, run: () => go("/collections"), keywords: "collections" },
      { id: "random", label: "یک پیشنهاد شانسی", hint: "امشب چی ببینم؟", icon: ShuffleIcon, run: () => go("/random"), keywords: "random shuffle" },
      { id: "list", label: "لیست من", icon: BookmarkIcon, run: () => go("/my-list"), keywords: "list watchlist" },
      { id: "fav", label: "علاقه‌مندی‌ها", icon: HeartIcon, run: () => go("/favorites"), keywords: "favorites" },
      { id: "history", label: "تاریخچه تماشا", icon: HistoryIcon, run: () => go("/history"), keywords: "history" },
      { id: "people", label: "هنرمندان", hint: "کارگردان‌ها و بازیگران", icon: UsersIcon, run: () => go("/people"), keywords: "people cast director" },
      { id: "notifications", label: "اعلان‌ها", icon: BellIcon, run: () => go("/notifications"), keywords: "notifications bell" },
      { id: "profile", label: "پروفایل من", icon: UserIcon, run: () => go("/profile"), keywords: "profile" },
      { id: "settings", label: "تنظیمات", icon: SettingsIcon, run: () => go("/settings"), keywords: "settings" },
      { id: "t-dark", label: "تم تیره", icon: MoonIcon, run: () => { setTheme("dark"); setOpen(false); }, keywords: "dark theme" },
      { id: "t-light", label: "تم روشن", icon: SunIcon, run: () => { setTheme("light"); setOpen(false); }, keywords: "light theme" },
      { id: "t-system", label: "تم خودکار (سیستم)", icon: MonitorIcon, run: () => { setTheme("system"); setOpen(false); }, keywords: "system theme auto" },
      { id: "shortcuts", label: "کلیدهای میانبر", icon: KeyboardIcon, run: () => go("/settings#shortcuts"), keywords: "shortcuts keyboard" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router]
  );

  const filteredCmds = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => c.label.includes(s) || c.keywords?.includes(s) || c.hint?.includes(s));
  }, [q, commands]);

  type Item = { key: string; run: () => void; node: React.ReactNode };
  const items: Item[] = [
    ...results.map((r) => ({
      key: `t-${r.id}`,
      run: () => go(`/title/${r.slug}`),
      node: (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.poster} alt="" className="h-12 w-8 shrink-0 rounded-md object-cover" />
          <span className="min-w-0 flex-1">
            <TitleName t={r} layout="inline" primaryClass="text-sm font-bold text-white" secondaryClass="text-[11px] text-zinc-500" />
            <span className="block truncate text-[11px] text-zinc-500" dir="ltr">
              {r.year}
            </span>
          </span>
          <span className="text-[11px] text-zinc-500">{r.type === "series" ? "سریال" : "فیلم"} · ★ {fa(r.rating)}</span>
        </>
      ),
    })),
    ...filteredCmds.map((c) => {
      const Icon = c.icon;
      return {
        key: c.id,
        run: c.run,
        node: (
          <>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-300">
              <Icon width={16} height={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{c.label}</span>
              {c.hint && <span className="block text-[11px] text-zinc-500">{c.hint}</span>}
            </span>
          </>
        ),
      };
    }),
  ];
  if (q.trim()) items.push({ key: "search-all", run: () => go(`/search?q=${encodeURIComponent(q.trim())}`), node: <span className="text-sm text-brand">جستجوی کامل «{q.trim()}» →</span> });

  useEffect(() => setIdx(0), [q, results.length]);

  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[idx]?.run();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-3 pt-[12vh]" style={{ background: "var(--overlay)" }} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="جستجوی سریع" className="glass-strong glass-in w-full max-w-xl overflow-hidden rounded-3xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <SearchIcon className="shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyNav}
            placeholder="جستجوی فیلم، سریال یا دستور…"
            className="h-14 w-full bg-transparent text-base text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:block">ESC</kbd>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-2">
          {loading && results.length === 0 && q.trim() && <li className="px-3 py-2 text-xs text-zinc-500">در حال جستجو…</li>}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">چیزی پیدا نشد.</li>}
          {items.map((it, i) => (
            <li key={it.key}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={it.run}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition ${i === idx ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                {it.node}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-zinc-500">
          <span>↑↓ حرکت · Enter انتخاب</span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-white/15 px-1">Ctrl</kbd>+<kbd className="rounded border border-white/15 px-1">K</kbd> باز/بسته
          </span>
        </div>
      </div>
    </div>
  );
}
