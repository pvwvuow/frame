"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, CloseIcon, FilmIcon, TvIcon, BookmarkIcon, HomeIcon } from "./Icons";
import { fa } from "@/lib/format";

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
  { href: "/my-list", label: "لیست من", icon: BookmarkIcon },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setQ("");
  }, [pathname]);

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
        .then((d: Result[]) => setResults(d))
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
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (pathname?.startsWith("/watch/")) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href));

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-ink/85 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl" : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:h-[72px] sm:px-8 lg:px-12">
        <Link href="/" className="group flex shrink-0 items-center gap-2">
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

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive(l.href) ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <div ref={boxRef} className="relative">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) {
                  setOpen(false);
                  router.push(`/search?q=${encodeURIComponent(q.trim())}`);
                }
              }}
              className={`flex items-center gap-2 rounded-full border transition-all duration-300 ${
                open ? "w-[260px] border-white/20 bg-black/70 sm:w-[360px]" : "w-10 border-transparent bg-transparent sm:w-[220px] sm:border-white/10 sm:bg-white/5"
              } h-10 px-3`}
            >
              <button type="submit" aria-label="جستجو" className="shrink-0 text-zinc-300 hover:text-white">
                <SearchIcon />
              </button>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                placeholder="جستجوی فیلم، سریال، بازیگر..."
                className={`w-full bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none ${open ? "block" : "hidden sm:block"}`}
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="text-zinc-400 hover:text-white">
                  <CloseIcon width={16} height={16} />
                </button>
              )}
            </form>

            {open && q.trim() && (
              <div className="glass absolute end-0 top-12 w-[320px] overflow-hidden rounded-2xl shadow-2xl sm:w-[420px]">
                {loading && results.length === 0 ? (
                  <div className="p-4 text-sm text-zinc-400">در حال جستجو...</div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-sm text-zinc-400">نتیجه‌ای پیدا نشد.</div>
                ) : (
                  <ul className="max-h-[420px] overflow-y-auto py-2">
                    {results.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/title/${r.slug}`}
                          className="flex items-center gap-3 px-3 py-2 transition hover:bg-white/5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r.poster} alt={r.title} className="h-16 w-11 rounded-md object-cover" />
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

          <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-sm font-bold text-white sm:flex">
            ن
          </div>
        </div>
      </div>

      {/* mobile bottom nav */}
      <nav className="glass fixed inset-x-3 bottom-3 z-50 flex items-center justify-around rounded-2xl py-2 md:hidden">
        {links.map((l) => {
          const Icon = l.icon;
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] ${active ? "text-brand" : "text-zinc-400"}`}
            >
              <Icon width={20} height={20} />
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
