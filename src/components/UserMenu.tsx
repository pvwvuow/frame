"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  HelpIcon,
  CloseIcon,
  BellIcon,
  UsersIcon,
  ShuffleIcon,
  LayersIcon,
  KeyboardIcon,
  ChevronLeft,
  RefreshIcon,
  ShieldIcon,
} from "./Icons";
import { fa } from "@/lib/format";
import { THEMES } from "./theme/ThemeToggle";
import { bridge, useIsElectron } from "@/lib/platform";
import { toast } from "sonner";
import { useI18n } from "./i18n/LocaleProvider";
import { LOCALES, LOCALE_META, type TKey } from "@/lib/i18n";

type IconCmp = typeof UserIcon;
type Entry = { href: string; label: TKey; icon: IconCmp; key?: "list" | "fav" | "notif"; webOnly?: boolean };

const PERSONAL: Entry[] = [
  { href: "/profile", label: "user.profile", icon: UserIcon },
  { href: "/my-list", label: "user.myList", icon: BookmarkIcon, key: "list" },
  { href: "/favorites", label: "user.favorites", icon: HeartIcon, key: "fav" },
  { href: "/history", label: "user.history", icon: HistoryIcon },
  { href: "/notifications", label: "user.notifications", icon: BellIcon, key: "notif" },
];
const DISCOVER: Entry[] = [
  { href: "/collections", label: "user.collections", icon: LayersIcon },
  { href: "/people", label: "user.people", icon: UsersIcon },
  { href: "/random", label: "user.random", icon: ShuffleIcon },
];
const SUPPORT: Entry[] = [
  { href: "/settings", label: "user.settings", icon: SettingsIcon },
  { href: "/settings#parental", label: "user.parental", icon: ShieldIcon },
  { href: "/settings#shortcuts", label: "user.shortcuts", icon: KeyboardIcon },
  { href: "/faq", label: "user.help", icon: HelpIcon },
];

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
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
          active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
        }`}
      >
        <Icon width={17} height={17} className={tint ?? (active ? "text-white" : "text-zinc-400")} />
        <span className="flex-1">{label}</span>
        {count != null && count > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 num">{fa(count)}</span>
        )}
        <ChevronLeft width={14} height={14} className="rtl-flip text-zinc-600" />
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
  const panelRef = useRef<HTMLElement>(null);

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

  // keyboard + scroll lock + focus management
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    }, 60);
    const btn = btnRef.current;
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      btn?.focus({ preventScroll: true });
    };
  }, [open]);

  const initial = (profile.displayName || (locale === "en" ? "N" : "ن")).slice(0, 1);
  // the avatar sits at the inline-end → the drawer slides in from that edge
  const offX = dir === "rtl" ? "-105%" : "105%";
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

  const drawer = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="user-drawer"
          className="fixed inset-0 z-[95]"
          dir={dir}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          style={{ background: "var(--overlay)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={tr("user.openMenu")}
            initial={reduce ? { opacity: 0 } : { x: offX, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: offX, opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
            className="glass-strong fixed flex flex-col overflow-hidden rounded-3xl"
            style={{
              // the avatar sits at the inline-end (visual LEFT in RTL) → drawer opens from the left edge
              insetInlineEnd: dir === "rtl" ? "max(8px, env(safe-area-inset-left))" : "max(8px, env(safe-area-inset-right))",
              top: "max(8px, env(safe-area-inset-top))",
              bottom: "max(8px, env(safe-area-inset-bottom))",
              width: "min(340px, calc(100vw - 16px))",
              maxHeight: "calc(100dvh - 16px)",
              willChange: "transform",
            }}
          >
            {/* header */}
            <div className="relative shrink-0 border-b border-white/5 p-4">
              <div className={`pointer-events-none absolute inset-0 ${dir === "rtl" ? "bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.18),transparent_60%)]" : "bg-[radial-gradient(ellipse_at_top_left,rgba(229,9,20,0.18),transparent_60%)]"}`} />
              <div className="relative flex items-center gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-lg font-black text-white shadow-lg ${grad}`}>{initial}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold text-white">{profile.displayName}</p>
                  <Link href="/profile" data-autofocus className="text-[11px] text-zinc-400 hover:text-brand">
                    {locale === "en" ? "View profile →" : "مشاهده پروفایل ←"}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={tr("common.close")}
                  className="glass-btn grid h-9 w-9 place-items-center rounded-full text-zinc-300 hover:text-white"
                >
                  <CloseIcon width={16} height={16} />
                </button>
              </div>
              <div className="relative mt-4 grid grid-cols-3 gap-2">
                <Link href="/my-list" className="rounded-xl bg-white/5 px-3 py-2 transition hover:bg-white/10">
                  <span className="block text-lg font-black text-white num">{fa(list.size)}</span>
                  <span className="block text-[11px] text-zinc-400">{tr("user.myList")}</span>
                </Link>
                <Link href="/favorites" className="rounded-xl bg-white/5 px-3 py-2 transition hover:bg-white/10">
                  <span className="block text-lg font-black text-rose-400 num">{fa(favorites.size)}</span>
                  <span className="block text-[11px] text-zinc-400">{tr("user.favorites")}</span>
                </Link>
                <Link href="/notifications" className="rounded-xl bg-white/5 px-3 py-2 transition hover:bg-white/10">
                  <span className={`block text-lg font-black num ${unread ? "text-brand" : "text-white"}`}>{fa(unread)}</span>
                  <span className="block text-[11px] text-zinc-400">{tr("user.notifications")}</span>
                </Link>
              </div>
            </div>

            {/* body */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" role="menu">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold text-zinc-500">{tr("user.personal")}</p>
              <ul className="space-y-0.5">
                {PERSONAL.map((it) => (
                  <Item
                    key={it.href}
                    {...it}
                    label={tr(it.label)}
                    active={isActive(it.href)}
                    count={countOf(it)}
                    tint={it.key === "fav" ? "text-rose-400" : it.key === "notif" && unread ? "text-brand" : undefined}
                  />
                ))}
              </ul>
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold text-zinc-500">{tr("user.discover")}</p>
              <ul className="space-y-0.5">
                {DISCOVER.map((it) => (
                  <Item key={it.href} {...it} label={tr(it.label)} active={isActive(it.href)} />
                ))}
              </ul>
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold text-zinc-500">{tr("user.support")}</p>
              <ul className="space-y-0.5">
                {SUPPORT.filter((s) => !(electron && s.webOnly)).map((it) => (
                  <Item key={it.href} {...it} label={tr(it.label)} active={isActive(it.href)} />
                ))}
              </ul>

              <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2">
                <p className="mb-1.5 px-1 text-[10px] font-bold text-zinc-500">{tr("user.language")}</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
                  {LOCALES.map((l) => {
                    const on = l === locale;
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLocale(l)}
                        aria-pressed={on}
                        dir={LOCALE_META[l].dir}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold transition ${on ? "bg-white text-black shadow" : "text-zinc-300 hover:bg-white/10"}`}
                      >
                        <span>{LOCALE_META[l].flag}</span> {LOCALE_META[l].nativeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 rounded-2xl border border-white/5 bg-white/[0.03] p-2">
                <p className="mb-1.5 px-1 text-[10px] font-bold text-zinc-500">{tr("user.theme")}</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
                  {THEMES.map((t) => {
                    const active = themeValue === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTheme(t.value)}
                        aria-pressed={active}
                        className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition ${
                          active ? "bg-white text-black shadow" : "text-zinc-300 hover:bg-white/10"
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
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <RefreshIcon width={12} height={12} className={checking ? "animate-spin" : ""} /> {tr("user.checkUpdate")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>{tr("app.name")} · {tr("app.tagline")}</span>
                  <Link href="/about" className="hover:text-white">
                    {tr("footer.aboutUs")}
                  </Link>
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tr("user.openMenu")}
        className="relative flex items-center gap-2 rounded-full p-0.5 pe-2 transition hover:bg-white/10"
      >
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>{initial}</span>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 start-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-black text-white ring-2 ring-ink num"
            aria-label={`${fa(unread)} ${tr("user.notifications")}`}
          >
            {unread > 9 ? `${fa(9)}+` : fa(unread)}
          </span>
        )}
        <ChevronDown width={14} height={14} className={`hidden text-zinc-400 transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
