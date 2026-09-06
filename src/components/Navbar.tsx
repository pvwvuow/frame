"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, CloseIcon, FilmIcon, TvIcon, BookmarkIcon, HomeIcon, SparkIcon, UserIcon, LayersIcon, UsersIcon, ShuffleIcon, ChevronDown, BellIcon, StarIcon } from "./Icons";
import UserMenu from "./UserMenu";
import ThemeToggle from "./theme/ThemeToggle";
import LanguageToggle from "./i18n/LanguageToggle";
import TitleName from "./TitleName";
import { fa, typeLabel } from "@/lib/format";
import { useIsElectron } from "@/lib/platform";
import { useI18n } from "./i18n/LocaleProvider";
import type { TKey } from "@/lib/i18n";

type Result = {
  id: number;
  slug: string;
  title: string;
  titleEn: string;
  country?: string;
  poster: string;
  year: number;
  type: string;
  rating: number;
};

type NavLink = { href: string; key: TKey; icon: typeof HomeIcon; hint?: TKey };

const links: NavLink[] = [
  { href: "/", key: "nav.home", icon: HomeIcon },
  { href: "/movies", key: "nav.movies", icon: FilmIcon },
  { href: "/series", key: "nav.series", icon: TvIcon },
  { href: "/genres", key: "nav.genres", icon: SparkIcon },
  { href: "/collections", key: "nav.collections", icon: LayersIcon },
  { href: "/my-list", key: "nav.myList", icon: BookmarkIcon },
];
const more: NavLink[] = [
  { href: "/rankings", key: "nav.rankings", icon: StarIcon, hint: "nav.rankingsHint" },
  { href: "/people", key: "nav.people", icon: UsersIcon, hint: "nav.peopleHint" },
  { href: "/random", key: "nav.random", icon: ShuffleIcon, hint: "nav.randomHint" },
  { href: "/notifications", key: "nav.notifications", icon: BellIcon, hint: "nav.notificationsHint" },
];
const mobileLinks: NavLink[] = [links[0], links[1], links[2], links[3], { href: "/profile", key: "nav.profile", icon: UserIcon }];

/* Scroll thresholds with hysteresis: the header turns solid after 32px and only
   returns to transparent below 6px, so it never flips back and forth (that
   flip – combined with `transition-all` on the border – caused the "phantom
   border" flash when scrolling back to the top). */
const SOLID_AT = 32;
const CLEAR_AT = 6;

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const electron = useIsElectron();
  const { t } = useI18n();
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
  const scrolledRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const next = scrolledRef.current ? y > CLEAR_AT : y > SOLID_AT;
      if (next !== scrolledRef.current) {
        scrolledRef.current = next;
        setScrolled(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

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
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Result[]) => setResults(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      clearTimeout(timer);
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
  const solid = scrolled || showPanel || moreOpen;

  const submit = () => {
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <header
        data-solid={solid ? "1" : "0"}
        className={`site-header fixed inset-x-0 top-0 z-50 ${electron ? "app-drag" : ""}`}
      >
        <div className="nav-inner mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:h-[72px] sm:px-8 lg:px-12">
          <Link href="/" className="group app-no-drag flex shrink-0 items-center gap-2" aria-label={t("app.name")}>
            <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-brand text-white shadow-[0_0_24px_var(--color-brand-glow)]">
              <span className="absolute inset-0 rounded-lg bg-white/10 opacity-0 transition group-hover:opacity-100" />
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M6 4h3l6 9V4h3v16h-3l-6-9v9H6z" />
              </svg>
            </span>
            <span className="text-2xl font-black tracking-tight text-white">
              {t("app.name")}
              <span className="text-brand">.</span>
            </span>
          </Link>

          <nav className="app-no-drag hidden items-center gap-1 lg:flex" aria-label={t("nav.mainNav")}>
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors xl:px-4 ${
                  isActive(l.href) ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t(l.key)}
              </Link>
            ))}
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  moreActive || moreOpen ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t("nav.more")} <ChevronDown width={14} height={14} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
                <div role="menu" className="glass-strong glass-in absolute start-0 top-12 w-60 overflow-hidden rounded-2xl p-1.5">
                  {more.map((m) => (
                    <Link
                      key={m.href}
                      role="menuitem"
                      href={m.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${pathname?.startsWith(m.href) ? "bg-white/10" : "hover:bg-white/5"}`}
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-zinc-300">
                        <m.icon width={16} height={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white">{t(m.key)}</span>
                        {m.hint && <span className="block text-[11px] text-zinc-500">{t(m.hint)}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="app-no-drag ms-auto flex items-center gap-1.5 sm:gap-2">
            <LanguageToggle className="hidden sm:flex" />
            <ThemeToggle className="hidden sm:grid" />
            {/* Fixed-width slot: the expanded search renders as an absolute
                overlay anchored to the magnifier's edge, so opening it never
                reflows the other navbar controls (language/theme used to jump
                and UserMenu was pushed off-screen on narrow windows). */}
            <div ref={boxRef} className="relative h-10 w-10 shrink-0 sm:w-[220px]">
              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className={`flex h-10 items-center gap-2 rounded-full border transition-[width,background-color,border-color] duration-300 ${
                  open
                    ? "fixed inset-x-2 top-4 z-40 w-auto max-w-[360px] border-white/20 bg-black/80 px-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] sm:absolute sm:inset-y-0 sm:inset-x-auto sm:top-auto sm:end-0 sm:w-[min(360px,calc(100vw-2rem))] sm:shadow-none"
                    : "absolute inset-y-0 end-0 w-full justify-center border-transparent bg-transparent px-0 sm:justify-start sm:border-white/15 sm:bg-white/[0.06] sm:px-3"
                }`}
              >
                <button
                  type="button"
                  aria-label={t("nav.search")}
                  onClick={() => {
                    if (open && q.trim()) submit();
                    else {
                      setOpen(true);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }
                  }}
                  className="shrink-0 text-zinc-400 hover:text-white"
                >
                  <SearchIcon width={18} height={18} />
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
                  placeholder={t("nav.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  autoComplete="off"
                  className={`min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none ${open ? "block" : "hidden sm:block"}`}
                />
                {q ? (
                  <button
                    type="button"
                    aria-label={t("nav.clear")}
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
                <div className="glass-strong glass-in fixed inset-x-2 top-16 z-40 overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:top-12 sm:end-0 sm:w-[min(420px,calc(100vw-24px))]">
                  {loading && results.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-zinc-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" /> {t("common.searching")}
                    </div>
                  ) : results.length === 0 ? (
                    <div className="p-4 text-sm text-zinc-400">{t("nav.noResultsFor", { q: q.trim() })}</div>
                  ) : (
                    <ul className="max-h-[min(420px,60vh)] overflow-y-auto py-2" role="listbox">
                      {results.map((r, i) => (
                        <li key={r.id} role="option" aria-selected={i === active}>
                          <Link
                            href={`/title/${r.slug}`}
                            onMouseEnter={() => setActive(i)}
                            className={`flex items-center gap-3 px-3 py-2 transition-colors ${i === active ? "bg-white/10" : "hover:bg-white/5"}`}
                          >
                            <img src={r.poster} alt="" className="h-16 w-11 shrink-0 rounded-md bg-ink-700 object-cover" />
                            <div className="min-w-0 flex-1">
                              <TitleName t={r} primaryClass="text-sm font-semibold text-white" secondaryClass="text-xs text-zinc-400" />
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                {typeLabel(r.type)} · {fa(r.year)} · ★ {fa(r.rating)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                      <li className="border-t border-white/5 px-3 pt-2">
                        <Link href={`/search?q=${encodeURIComponent(q.trim())}`} className="block py-2 text-center text-xs text-brand hover:underline">
                          {t("nav.allResults")}
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
        aria-label={t("nav.mobileNav")}
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
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] transition-colors ${on ? "text-brand" : "text-zinc-400 hover:text-white"}`}
            >
              <Icon width={20} height={20} />
              {t(l.key)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
