"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { SearchIcon, CloseIcon, FilmIcon, TvIcon, BookmarkIcon, HomeIcon, SparkIcon, UserIcon, LayersIcon, UsersIcon, ShuffleIcon, ChevronDown, BellIcon, StarIcon, DownloadIcon, CameraIcon } from "./Icons";
import UserMenu from "./UserMenu";
import ThemeToggle from "./theme/ThemeToggle";
import LanguageToggle from "./i18n/LanguageToggle";
import TitleName from "./TitleName";
import { fa, typeLabel } from "@/lib/format";
import { useIsElectron } from "@/lib/platform";
import { useCloudSession } from "@/lib/cloud";
import { CrownIcon } from "./Icons";
import { useI18n } from "./i18n/LocaleProvider";
import type { TKey } from "@/lib/i18n";
import { titleHref } from "@/lib/mobile-links";
import CinemaButton from "./cinema/CinemaButton";
import { getRecentSearches, rememberSearch, forgetSearch, clearRecentSearches as clearRecent } from "@/lib/search-history";
import { GlassBar } from "./ui/glass";

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
  { href: "/darkroom", key: "nav.darkroom", icon: CameraIcon, hint: "nav.darkroomHint" },
  { href: "/rankings", key: "nav.rankings", icon: StarIcon, hint: "nav.rankingsHint" },
  { href: "/downloads", key: "nav.downloads", icon: DownloadIcon, hint: "nav.downloadsHint" },
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
  const { t, locale } = useI18n();
  const { ready: authReady, session: authSession } = useCloudSession();
  const [scrolled, setScrolled] = useState(false);
  /* v0.12.0 — the mobile bottom nav hides on scroll DOWN and returns on
     scroll UP (user request). Hysteresis: >6px down hides, >4px up (or near
     the top) shows — jitter never flip-flops it. */
  const [navHidden, setNavHidden] = useState(false);
  const navYRef = useRef(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
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

  /* v0.12.0 — bottom nav auto-hide: down → away, up → back */
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const prev = navYRef.current;
      const dy = y - prev;
      navYRef.current = y;
      if (y < 140 || dy < -4) {
        if (navHidden) setNavHidden(false);
      } else if (dy > 6) {
        if (!navHidden) setNavHidden(true);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [navHidden]);

  // v0.10.22: the results fetch + panel render are driven by a DEFERRED copy
  // of the query — every keystroke updates the input at full priority (no
  // typing lag) while the heavier panel work yields to the browser.
  const dq = useDeferredValue(q);
  useEffect(() => {
    setActive(-1);
    if (!dq.trim()) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      fetch(`/api/search?q=${encodeURIComponent(dq)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Result[]) => setResults(Array.isArray(d) ? d : []))
        .catch((e: unknown) => {
          // v0.27.0 (UI-2) — a network error used to be swallowed and the
          // panel said «چیزی پیدا نشد» — the user blamed the catalog, not
          // the connection. Show a retryable error instead.
          if ((e as { name?: string })?.name !== "AbortError") setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [dq, searchNonce]);

  useEffect(() => {
    if (open && !q.trim()) setRecent(getRecentSearches());
  }, [open, q]);

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
  // v0.10.19: an expanded search bar must never sit ON TOP of the language /
  // theme toggles or the user menu — while it is open they fade out and the
  // search takes over the whole header row cleanly.
  const hideWhileSearch = open ? "opacity-0 pointer-events-none" : "transition-opacity duration-200";
  const solid = scrolled || open || showPanel || moreOpen;

  const submit = () => {
    if (!q.trim()) return;
    rememberSearch(q);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <header
        data-solid={solid ? "1" : "0"}
        className={`site-header fixed inset-x-0 top-0 z-50 ${electron ? "app-drag" : ""}`}
      >
        <div className="nav-inner mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:h-[72px] sm:px-8 lg:px-9">
          <Link href="/" className="group app-no-drag flex shrink-0 items-center gap-2" aria-label={t("app.name")}>
            <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-brand text-white shadow-[0_0_24px_var(--color-brand-glow)]">
              <span className="absolute inset-0 rounded-lg bg-white/10 opacity-0 transition group-hover:opacity-100" />
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M8 5h9.5v3h-6.3v3.2h5.6v3h-5.6V19H8z" />
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
                className={`whitespace-nowrap rounded-full px-2 py-2 text-sm font-medium transition-colors xl:px-3 ${
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

          <div className="app-no-drag ms-auto flex items-center gap-1.5">
            <LanguageToggle className={`hidden sm:flex ${hideWhileSearch}`} />
            <ThemeToggle className={`hidden sm:grid ${hideWhileSearch}`} />
            {/* v0.14.1 — cinema moved to the top bar (user request) — join by
                code / live room status, darkroom-styled popover */}
            <CinemaButton />
            {/* Fixed-width slot: the expanded search renders as an absolute
                overlay anchored to the magnifier's edge, so opening it never
                reflows the other navbar controls (language/theme used to jump
                and UserMenu was pushed off-screen on narrow windows). */}
            <div ref={boxRef} className="relative h-10 w-10 shrink-0 sm:w-[160px] lg:w-[150px] 2xl:w-[220px]">
              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className={`flex h-10 items-center gap-2 rounded-full border transition-[background-color,border-color] duration-300 ${
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
                      router.push(titleHref(results[active].slug));
                    }
                  }}
                  placeholder={t("nav.searchPlaceholder")}
                  aria-label={t("nav.search")}
                  /* v0.27.0 (A11Y-4) — full combobox pattern: the input
                     announces the open result listbox and the highlighted item */
                  role="combobox"
                  aria-expanded={showPanel && (loading || failed || results.length > 0)}
                  aria-controls="nav-search-listbox"
                  aria-activedescendant={active >= 0 && results[active] ? `nav-search-opt-${results[active].id}` : undefined}
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

              {/* v0.27.0 (UI-4) — recent searches in the empty panel */}
              {open && !q.trim() && recent.length > 0 && (
                <div className="glass-strong glass-in fixed inset-x-2 top-16 z-40 overflow-hidden rounded-2xl p-3 sm:absolute sm:inset-x-auto sm:top-12 sm:end-0 sm:w-[min(420px,calc(100vw-24px))]">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-[11px] font-bold text-zinc-500">{t("nav.recentSearches")}</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearRecent();
                        setRecent([]);
                      }}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300"
                    >
                      {t("nav.clear")}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((s) => (
                      <span key={s} className="flex items-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                        <Link href={`/search?q=${encodeURIComponent(s)}`} className="px-3 py-1.5 text-xs text-zinc-200 hover:text-white" onClick={() => setOpen(false)}>
                          {s}
                        </Link>
                        <button
                          type="button"
                          aria-label={t("nav.removeSearch", { q: s })}
                          onClick={() => {
                            forgetSearch(s);
                            setRecent(getRecentSearches());
                          }}
                          className="grid h-7 w-7 place-items-center text-zinc-500 hover:text-rose-300"
                        >
                          <CloseIcon width={11} height={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {showPanel && (
                <div className="glass-strong glass-in fixed inset-x-2 top-16 z-40 overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:top-12 sm:end-0 sm:w-[min(420px,calc(100vw-24px))]">
                  {loading && results.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-zinc-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" /> {t("common.searching")}
                    </div>
                  ) : failed && results.length === 0 ? (
                    /* v0.27.0 (UI-2) — network failure is a distinct state */
                    <div className="p-4 text-sm">
                      <p className="font-bold text-rose-300">{t("nav.searchError")}</p>
                      <p className="mt-1 text-zinc-400">{t("nav.searchErrorHint")}</p>
                      <button
                        type="button"
                        onClick={() => setSearchNonce((n) => n + 1)}
                        className="mt-2 rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white hover:bg-white/10"
                      >
                        {t("nav.retry")}
                      </button>
                    </div>
                  ) : results.length === 0 ? (
                    <div className="p-4 text-sm text-zinc-400">{t("nav.noResultsFor", { q: q.trim() })}</div>
                  ) : (
                    <ul id="nav-search-listbox" className="max-h-[min(420px,60vh)] overflow-y-auto py-2" role="listbox">
                      {results.map((r, i) => (
                        <li key={r.id} id={`nav-search-opt-${r.id}`} role="option" aria-selected={i === active}>
                          <Link
                            href={titleHref(r.slug)}
                            onMouseEnter={() => setActive(i)}
                            className={`flex items-center gap-3 px-3 py-2 transition-colors ${i === active ? "bg-white/10" : "hover:bg-white/5"}`}
                          >
                            <img src={r.poster} alt="" data-ph-title={r.title} loading="lazy" decoding="async" className="h-16 w-11 shrink-0 rounded-md bg-ink-700 object-cover" />
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

            {/* VIP — gold pill, always visible (v0.10.11) */}
            <div className={`flex items-center gap-1.5 ${hideWhileSearch}`}>
              <Link
                href="/vip"
                aria-label={locale === "en" ? "VIP subscription" : "اشتراک ویژه"}
                title={locale === "en" ? "VIP subscription" : "اشتراک ویژه"}
                className="app-no-drag flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-gradient-to-l from-amber-400/15 to-amber-500/10 px-3 py-2 text-sm font-black text-amber-300 transition hover:border-amber-300/60 hover:from-amber-400/25"
              >
                <CrownIcon width={15} height={15} />
                <span className="hidden sm:inline">VIP</span>
              </Link>

              {/* Prominent entry point: while signed out the avatar menu is replaced
                  with a visible Sign in button (users could not discover the
                  entry hidden inside the menu). While signed in the UserMenu
                  (avatar → email + sign out) renders as before. */}
              {authReady && !authSession ? (
                <Link
                  href="/auth"
                  className="app-no-drag flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-black text-white shadow-[0_0_20px_var(--color-brand-glow)] transition hover:bg-brand/85"
                >
                  <UserIcon width={15} height={15} />
                  {locale === "en" ? "Sign in" : "ورود / ثبت‌نام"}
                </Link>
              ) : (
                <UserMenu />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* mobile bottom nav – rendered outside the header so the header's
          backdrop-filter never becomes its containing block.
          v0.30.0 — the surface is now a real liquid-glass bar
          (rdev/liquid-glass-react) with a dark veil for text readability. */}
      <nav
        aria-label={t("nav.mobileNav")}
        className={`fixed inset-x-3 bottom-3 z-50 transition-all duration-300 lg:hidden ${
          navHidden ? "pointer-events-none translate-y-[140%] opacity-0" : "translate-y-0 opacity-100"
        }`}
        data-nav-hidden={navHidden ? "1" : "0"}
        style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
      >
        <GlassBar radius={26}>
          <div className="relative flex items-center justify-around px-1 py-2">
            <div className="absolute inset-0 rounded-[26px] bg-black/20" />
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
                  className={`relative flex flex-col items-center gap-1 px-3 py-1 text-[11px] transition-colors ${on ? "text-brand" : "text-zinc-400 hover:text-white"}`}
                >
                  <Icon width={20} height={20} />
                  {t(l.key)}
                </Link>
              );
            })}
          </div>
        </GlassBar>
      </nav>
    </>
  );
}
