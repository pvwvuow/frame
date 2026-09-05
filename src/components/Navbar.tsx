"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, CloseIcon, FilmIcon, TvIcon, BookmarkIcon, HomeIcon, SparkIcon, UserIcon, LayersIcon, UsersIcon, ShuffleIcon, ChevronDown, BellIcon } from "./Icons";
import UserMenu from "./UserMenu";
import ThemeToggle from "./theme/ThemeToggle";
import { fa } from "@/lib/format";
import { useIsElectron } from "@/lib/platform";

type Result = {
  id: number;
  slug: string;
  title: string;
  titleEn: string;
  poster: string;
  year: number;
  type: string;
  rating: number;
};

const links = [
  { href: "/", label: "خانه", icon: HomeIcon },
  { href: "/movies", label: "فیلم‌ها", icon: FilmIcon },
  { href: "/series", label: "سریال‌ها", icon: TvIcon },
  { href: "/genres", label: "ژانرها", icon: SparkIcon },
  { href: "/collections", label: "مجموعه‌ها", icon: LayersIcon },
  { href: "/my-list", label: "لیست من", icon: BookmarkIcon },
];
const more = [
  { href: "/people", label: "هنرمندان", icon: UsersIcon, hint: "کارگردان‌ها و بازیگران" },
  { href: "/random", label: "امشب چی ببینم؟", icon: ShuffleIcon, hint: "انتخاب شانسی" },
  { href: "/notifications", label: "اعلان‌ها", icon: BellIcon, hint: "تازه‌ها و یادآوری‌ها" },
];
const mobileLinks = [links[0], links[1], links[2], links[3], { href: "/profile", label: "پروفایل", icon: UserIcon }];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const electron = useIsElectron();
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
    setQ("");
  }, [pathname]);

  useEffect(() => {
    setActive(-1);
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Result[]) => setResults(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (pathname?.startsWith("/watch/")) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href));
  const moreActive = more.some((m) => pathname?.startsWith(m.href));
  const showPanel = open && q.trim().length > 0;

  const submit = () => {
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled || showPanel ? "glass-strong rounded-none border-x-0 border-t-0" : "bg-gradient-to-b from-ink/80 to-transparent"
        } ${electron ? "app-drag" : ""}`}
      >
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:h-[72px] sm:px-8 lg:px-12">
          <Link href="/" className="group app-no-drag flex shrink-0 items-center gap-2">
            <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-brand text-white shadow-[0_0_24px_var(--color-brand-glow)]">
              <span className="absolute inset-0 rounded-lg bg-white/10 opacity-0 transition group-hover:opacity-100" />
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M6 4h3l6 9V4h3v16h-3l-6-9v9H6z" />
              </svg>
            </span>
            <span className="text-2xl font-black tracking-tight text-white">
              نما<span className="text-brand">.</span>
            </span>
          </Link>

          <nav className="app-no-drag hidden items-center gap-1 lg:flex" aria-label="ناوبری اصلی">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition xl:px-4 ${
                  isActive(l.href) ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  moreActive || moreOpen ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                بیشتر <ChevronDown width={14} height={14} className={`transition ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
                <div role="menu" className="glass-strong glass-in absolute start-0 top-12 w-60 overflow-hidden rounded-2xl p-1.5">
                  {more.map((m) => (
                    <Link
                      key={m.href}
                      role="menuitem"
                      href={m.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${pathname?.startsWith(m.href) ? "bg-white/10" : "hover:bg-white/5"}`}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-zinc-300"><m.icon width={16} height={16} /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white">{m.label}</span>
                        <span className="block text-[11px] text-zinc-500">{m.hint}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="app-no-drag ms-auto flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle className="hidden sm:grid" />
            <div ref={boxRef} className="relative">
              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className={`flex h-10 items-center gap-2 rounded-full border transition-all duration-300 ${
                  open
                    ? "w-[calc(100vw-140px)] max-w-[360px] border-white/20 bg-black/70 px-3 sm:w-[360px]"
                    : "w-10 justify-center border-transparent bg-transparent px-0 sm:w-[220px] sm:justify-start sm:border-white/10 sm:bg-white/5 sm:px-3"
                }`}
              >
                <button
                  type="button"
                  aria-label="جستجو"
                  onClick={() => {
                    if (open && q.trim()) submit();
                    else {
                      setOpen(true);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }
                  }}
                  className="grid h-10 w-10 shrink-0 place-items-center text-zinc-300 hover:text-white sm:h-auto sm:w-auto"
                >
                  <SearchIcon />
                </button>
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={(e) => {
                    if (!results.length) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActive((a) => Math.min(results.length - 1, a + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActive((a) => Math.max(-1, a - 1));
                    } else if (e.key === "Enter" && active >= 0) {
                      e.preventDefault();
                      router.push(`/title/${results[active].slug}`);
                    }
                  }}
                  placeholder="جستجوی فیلم، سریال، بازیگر..."
                  aria-label="جستجو"
                  autoComplete="off"
                  className={`min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none ${open ? "block" : "hidden sm:block"}`}
                />
                {q ? (
                  <button
                    type="button"
                    aria-label="پاک کردن"
                    onClick={() => {
                      setQ("");
                      inputRef.current?.focus();
                    }}
                    className={`shrink-0 text-zinc-400 hover:text-white ${open ? "block" : "hidden sm:block"}`}
                  >
                    <CloseIcon width={16} height={16} />
                  </button>
                ) : (
                  <kbd className={`hidden shrink-0 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-500 ${open ? "" : "sm:block"}`} dir="ltr">
                    Ctrl K
                  </kbd>
                )}
              </form>

              {showPanel && (
                <div className="glass-strong glass-in absolute end-0 top-12 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl">
                  {loading && results.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-zinc-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" /> در حال جستجو...
                    </div>
                  ) : results.length === 0 ? (
                    <div className="p-4 text-sm text-zinc-400">نتیجه‌ای برای «{q.trim()}» پیدا نشد.</div>
                  ) : (
                    <ul className="max-h-[min(420px,60vh)] overflow-y-auto py-2" role="listbox">
                      {results.map((r, i) => (
                        <li key={r.id} role="option" aria-selected={i === active}>
                          <Link
                            href={`/title/${r.slug}`}
                            onMouseEnter={() => setActive(i)}
                            className={`flex items-center gap-3 px-3 py-2 transition ${i === active ? "bg-white/10" : "hover:bg-white/5"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.poster} alt="" className="h-16 w-11 shrink-0 rounded-md bg-ink-700 object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{r.title}</p>
                              <p className="truncate text-xs text-zinc-400" dir="ltr">
                                {r.titleEn}
                              </p>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                {r.type === "series" ? "سریال" : "فیلم"} · {fa(r.year)} · ★ {fa(r.rating)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                      <li className="border-t border-white/5 px-3 pt-2">
                        <Link href={`/search?q=${encodeURIComponent(q.trim())}`} className="block py-2 text-center text-xs text-brand hover:underline">
                          مشاهده همه نتایج
                        </Link>
                      </li>
                    </ul>
                  )}
                </div>
              )}
            </div>

            <UserMenu />
          </div>
        </div>
      </header>

      {/* mobile bottom nav – rendered outside the header so the header's
          backdrop-filter never becomes its containing block */}
      <nav
        aria-label="ناوبری موبایل"
        className="glass-strong fixed inset-x-3 bottom-3 z-50 flex items-center justify-around rounded-2xl py-2 lg:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {mobileLinks.map((l) => {
          const Icon = l.icon;
          const on =
            l.href === "/profile"
              ? ["/profile", "/my-list", "/favorites", "/history", "/settings", "/notifications"].some((p) => pathname?.startsWith(p))
              : isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] transition ${on ? "text-brand" : "text-zinc-400 hover:text-white"}`}
            >
              <Icon width={20} height={20} />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
