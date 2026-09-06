"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import { useLibrary } from "./library/LibraryProvider";
import { AVATARS } from "./library/SettingsForm";
import {
  BookmarkIcon,
  HeartIcon,
  HistoryIcon,
  SettingsIcon,
  UserIcon,
  ChevronDown,
  CloseIcon,
  BellIcon,
  UsersIcon,
  ShuffleIcon,
  LayersIcon,
  StarIcon,
  RefreshIcon,
} from "./Icons";
import { fa } from "@/lib/format";
import { THEMES } from "./theme/ThemeToggle";
import { bridge, useIsElectron } from "@/lib/platform";
import { toast } from "sonner";
import { useI18n } from "./i18n/LocaleProvider";
import { LOCALES, LOCALE_META, type TKey } from "@/lib/i18n";

type IconCmp = typeof UserIcon;
type Entry = { href: string; label: TKey; icon: IconCmp; key?: "list" | "fav" | "notif"; tint?: string };

const PERSONAL: Entry[] = [
  { href: "/profile", label: "user.profile", icon: UserIcon, tint: "text-zinc-300" },
  { href: "/my-list", label: "user.myList", icon: BookmarkIcon, key: "list", tint: "text-brand" },
  { href: "/favorites", label: "user.favorites", icon: HeartIcon, key: "fav", tint: "text-rose-400" },
  { href: "/history", label: "user.history", icon: HistoryIcon, tint: "text-sky-400" },
  { href: "/notifications", label: "user.notifications", icon: BellIcon, key: "notif", tint: "text-amber-400" },
];
const DISCOVER: Entry[] = [
  { href: "/rankings", label: "nav.rankings", icon: StarIcon, tint: "text-amber-400" },
  { href: "/collections", label: "user.collections", icon: LayersIcon, tint: "text-violet-400" },
  { href: "/people", label: "user.people", icon: UsersIcon, tint: "text-emerald-400" },
  { href: "/random", label: "user.random", icon: ShuffleIcon, tint: "text-pink-400" },
];
const SETTINGS_ENTRY: Entry = { href: "/settings", label: "user.settings", icon: SettingsIcon, tint: "text-zinc-200" };

/* Hoisted out of the component so React keeps DOM nodes between renders
   (defining it inline re-mounted every item on each render → focus loss / flicker). */
function Item({
  href,
  label,
  icon: Icon,
  count,
  tint,
  active,
}: {
  href: string;
  label: string;
  icon: IconCmp;
  count?: number | null;
  tint?: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        role="menuitem"
        className={`flex items-center gap-3 rounded-full border px-3.5 py-2.5 text-sm transition ${
          active
            ? "border-brand/50 bg-brand/15 text-white"
            : "border-transparent bg-white/[0.04] text-zinc-300 hover:border-white/15 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon width={17} height={17} className={tint ?? (active ? "text-white" : "text-zinc-400")} />
        <span className="flex-1">{label}</span>
        {count != null && count > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 num">{fa(count)}</span>
        )}
      </Link>
    </li>
  );
}

export default function UserMenu() {
  const { profile, list, favorites } = useLibrary();
  const { theme, setTheme } = useTheme();
  const { t: tr, locale, dir, setLocale } = useI18n();
  const electron = useIsElectron();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  // unread notifications badge (refreshes on route change + every 2 min)
  const loadUnread = useCallback(() => {
    const load = (k: string): Set<string> => {
      try {
        return new Set(JSON.parse(localStorage.getItem(k) ?? "[]"));
      } catch {
        return new Set();
      }
    };
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { id: string }[]) => {
        const read = load("nama-notif-read");
        const hidden = load("nama-notif-hidden");
        const n = Array.isArray(d) ? d.filter((x) => !read.has(x.id) && !hidden.has(x.id)).length : 0;
        setUnread(n);
        bridge()?.setBadge(n);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 120_000);
    return () => clearInterval(t);
  }, [loadUnread, pathname]);

  // keyboard + outside click + focus management
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    }, 60);
    const btn = btnRef.current;
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
      btn?.focus({ preventScroll: true });
    };
  }, [open]);

  const initial = (profile.displayName || (locale === "en" ? "N" : "ن")).slice(0, 1);
  const grad = AVATARS[profile.avatar] ?? AVATARS[0];
  const themeValue = mounted ? theme ?? "dark" : "dark";
  const isActive = (href: string) => (href.includes("#") ? false : pathname === href || (href !== "/" && !!pathname?.startsWith(href)));

  const checkUpdates = async () => {
    const b = bridge();
    if (!b) return;
    setChecking(true);
    try {
      const r = await b.checkForUpdates();
      if (r.status === "available") toast.info(locale === "en" ? `Version ${r.version ?? ""} found – downloading…` : `نسخه‌ی جدید ${r.version ?? ""} پیدا شد و در حال دانلود است.`);
      else if (r.status === "not-available") toast.success(locale === "en" ? "You're on the latest version." : "شما آخرین نسخه را دارید.");
      else if (r.status === "disabled") toast.message(locale === "en" ? "Auto-update is only available in the installed build." : "به‌روزرسانی خودکار فقط در نسخه‌ی نصب‌شده فعال است.");
      else toast.error(r.message ?? (locale === "en" ? "Update check failed." : "بررسی به‌روزرسانی ناموفق بود."));
    } finally {
      setChecking(false);
    }
  };

  const countOf = (e: Entry) => (e.key === "list" ? list.size : e.key === "fav" ? favorites.size : e.key === "notif" ? unread : null);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={tr("user.openMenu")}
        className={`relative flex items-center gap-2 rounded-full border p-0.5 pe-1 transition ${
          open ? "border-brand/50 bg-brand/15" : "border-white/15 bg-white/[0.06] hover:border-white/30 hover:bg-white/10"
        }`}
      >
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>{initial}</span>
        {unread > 0 && (
          <span
            className="absolute -top-1 start-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-black text-white ring-2 ring-ink num"
            aria-label={`${fa(unread)} ${tr("user.notifications")}`}
          >
            {unread > 9 ? `${fa(9)}+` : fa(unread)}
          </span>
        )}
        <ChevronDown width={14} height={14} className={`hidden text-zinc-400 transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="menu"
            aria-label={tr("user.openMenu")}
            dir={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            style={{ transformOrigin: dir === "rtl" ? "top left" : "top right", willChange: "transform, opacity" }}
            className="glass-strong glass-in absolute end-0 top-12 z-[95] max-h-[calc(100dvh-88px)] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          >
            {/* header */}
            <div className="relative shrink-0 border-b border-white/5 p-4">
              <div className={`pointer-events-none absolute inset-0 ${dir === "rtl" ? "bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.16),transparent_60%)]" : "bg-[radial-gradient(ellipse_at_top_left,rgba(229,9,20,0.16),transparent_60%)]"}`} />
              <div className="relative flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br text-base font-black text-white shadow-lg ${grad}`}>{initial}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-white">{profile.displayName}</p>
                  <Link href="/profile" data-autofocus className="text-[11px] text-zinc-400 transition hover:text-brand">
                    {locale === "en" ? "View profile →" : "مشاهده پروفایل ←"}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={tr("common.close")}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </div>
              {/* quick pills — heart/+ design language */}
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                <Link href="/my-list" className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand/20">
                  <BookmarkIcon width={12} height={12} className="text-brand" /> <span className="num">{fa(list.size)}</span> {tr("user.myList")}
                </Link>
                <Link href="/favorites" className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-rose-500/20">
                  <HeartIcon width={12} height={12} filled className="text-rose-400" /> <span className="num">{fa(favorites.size)}</span> {tr("user.favorites")}
                </Link>
                <Link href="/notifications" className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${unread ? "border-amber-400/40 bg-amber-500/15 text-white hover:bg-amber-500/25" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
                  <BellIcon width={12} height={12} className={unread ? "text-amber-400" : "text-zinc-400"} /> <span className="num">{fa(unread)}</span> {tr("user.notifications")}
                </Link>
              </div>
            </div>

            {/* body */}
            <div className="max-h-[calc(100dvh-300px)] min-h-0 overflow-y-auto overscroll-contain p-2.5" role="menu">
              <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold text-zinc-500">{tr("user.personal")}</p>
              <ul className="space-y-1">
                {PERSONAL.map((it) => (
                  <Item
                    key={it.href}
                    {...it}
                    label={tr(it.label)}
                    active={isActive(it.href)}
                    count={countOf(it)}
                  />
                ))}
              </ul>
              <p className="px-2 pb-1.5 pt-3 text-[10px] font-bold text-zinc-500">{tr("user.discover")}</p>
              <ul className="space-y-1">
                {DISCOVER.map((it) => (
                  <Item key={it.href} {...it} label={tr(it.label)} active={isActive(it.href)} />
                ))}
              </ul>
              <p className="px-2 pb-1.5 pt-3 text-[10px] font-bold text-zinc-500">{tr("user.support")}</p>
              <ul className="space-y-1">
                <Item {...SETTINGS_ENTRY} label={tr(SETTINGS_ENTRY.label)} active={isActive("/settings")} />
              </ul>

              {/* quick language */}
              <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2">
                <p className="mb-1.5 px-1 text-[10px] font-bold text-zinc-500">{tr("user.language")}</p>
                <div className="flex gap-1">
                  {LOCALES.map((l) => {
                    const on = l === locale;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLocale(l)}
                        aria-pressed={on}
                        dir={LOCALE_META[l].dir}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border py-1.5 text-[11px] font-bold transition ${
                          on ? "border-white bg-white text-black shadow" : "border-transparent bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span>{LOCALE_META[l].flag}</span> {LOCALE_META[l].nativeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* quick theme */}
              <div className="mt-2 rounded-2xl border border-white/5 bg-white/[0.03] p-2">
                <p className="mb-1.5 px-1 text-[10px] font-bold text-zinc-500">{tr("user.theme")}</p>
                <div className="flex gap-1">
                  {THEMES.map((t) => {
                    const active = themeValue === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTheme(t.value)}
                        aria-pressed={active}
                        className={`flex flex-1 items-center justify-center gap-1 rounded-full border py-1.5 text-[11px] font-bold transition ${
                          active ? "border-white bg-white text-black shadow" : "border-transparent bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <t.icon width={13} height={13} /> {tr(t.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="shrink-0 border-t border-white/5 px-4 py-3 text-[11px] text-zinc-500">
              {electron ? (
                <div className="flex items-center justify-between gap-2">
                  <span dir="ltr">{tr("app.name")} · v{bridge()?.version ?? "1.0.0"}</span>
                  <button
                    type="button"
                    onClick={checkUpdates}
                    disabled={checking}
                    className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <RefreshIcon width={12} height={12} className={checking ? "animate-spin" : ""} /> {tr("user.checkUpdate")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>{tr("app.name")} · {tr("app.tagline")}</span>
                  <Link href="/about" className="transition hover:text-white">
                    {tr("footer.aboutUs")}
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
