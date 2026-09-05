"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
} from "./Icons";
import { fa } from "@/lib/format";
import { THEMES } from "./theme/ThemeToggle";
import { bridge, useIsElectron } from "@/lib/platform";
import { toast } from "sonner";

const PERSONAL = [
  { href: "/profile", label: "پروفایل من", icon: UserIcon },
  { href: "/my-list", label: "لیست من", icon: BookmarkIcon, key: "list" as const },
  { href: "/favorites", label: "علاقه‌مندی‌ها", icon: HeartIcon, key: "fav" as const },
  { href: "/history", label: "تاریخچه تماشا", icon: HistoryIcon },
  { href: "/notifications", label: "اعلان‌ها", icon: BellIcon },
];
const DISCOVER = [
  { href: "/collections", label: "مجموعه‌ها", icon: LayersIcon },
  { href: "/people", label: "هنرمندان", icon: UsersIcon },
  { href: "/random", label: "امشب چی ببینم؟", icon: ShuffleIcon },
];
const SUPPORT = [
  { href: "/settings", label: "تنظیمات", icon: SettingsIcon },
  { href: "/settings#shortcuts", label: "میان‌برها", icon: KeyboardIcon },
  { href: "/faq", label: "راهنما", icon: HelpIcon },
];

export default function UserMenu() {
  const { profile, list, favorites } = useLibrary();
  const { theme, setTheme } = useTheme();
  const electron = useIsElectron();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  // keyboard + scroll lock + focus management
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      btnRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const initial = (profile.displayName || "ن").slice(0, 1);
  const grad = AVATARS[profile.avatar] ?? AVATARS[0];
  const themeValue = mounted ? theme ?? "dark" : "dark";

  const checkUpdates = async () => {
    const b = bridge();
    if (!b) return;
    setChecking(true);
    try {
      const r = await b.checkForUpdates();
      if (r.status === "available") toast.info(`نسخه‌ی جدید ${r.version ?? ""} پیدا شد و در حال دانلود است.`);
      else if (r.status === "not-available") toast.success("شما آخرین نسخه را دارید.");
      else if (r.status === "disabled") toast.message("به‌روزرسانی خودکار فقط در نسخه‌ی نصب‌شده فعال است.");
      else toast.error(r.message ?? "بررسی به‌روزرسانی ناموفق بود.");
    } finally {
      setChecking(false);
    }
  };

  const Item = ({ href, label, icon: Icon, count, tint }: { href: string; label: string; icon: typeof UserIcon; count?: number | null; tint?: string }) => {
    const active = pathname === href || (href !== "/" && !href.includes("#") && pathname?.startsWith(href));
    return (
      <li>
        <Link
          href={href}
          role="menuitem"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}
        >
          <Icon width={17} height={17} className={tint ?? (active ? "text-white" : "text-zinc-400")} />
          <span className="flex-1">{label}</span>
          {count != null && count > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200">{fa(count)}</span>}
          <ChevronLeft width={14} height={14} className="text-zinc-600" />
        </Link>
      </li>
    );
  };

  const drawer = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="user-drawer"
          className="fixed inset-0 z-[95]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{ background: "var(--overlay)", backdropFilter: "blur(4px)" }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="منوی کاربر"
            initial={{ x: "-104%" }}
            animate={{ x: 0 }}
            exit={{ x: "-104%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="glass-strong absolute inset-y-2 end-2 flex w-[min(340px,calc(100vw-16px))] flex-col overflow-hidden rounded-3xl"
            style={{ direction: "rtl" }}
          >
            {/* header */}
            <div className="relative shrink-0 border-b border-white/5 p-4">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(229,9,20,0.18),transparent_60%)]" />
              <div className="relative flex items-center gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-lg font-black text-white shadow-lg ${grad}`}>{initial}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold text-white">{profile.displayName}</p>
                  <Link href="/profile" className="text-[11px] text-zinc-400 hover:text-brand">
                    مشاهده پروفایل ←
                  </Link>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="بستن" className="glass-btn grid h-9 w-9 place-items-center rounded-full text-zinc-300 hover:text-white">
                  <CloseIcon width={16} height={16} />
                </button>
              </div>
              <div className="relative mt-4 grid grid-cols-2 gap-2">
                <Link href="/my-list" className="rounded-xl bg-white/5 px-3 py-2 transition hover:bg-white/10">
                  <span className="block text-lg font-black text-white num">{fa(list.size)}</span>
                  <span className="block text-[11px] text-zinc-400">در لیست من</span>
                </Link>
                <Link href="/favorites" className="rounded-xl bg-white/5 px-3 py-2 transition hover:bg-white/10">
                  <span className="block text-lg font-black text-rose-400 num">{fa(favorites.size)}</span>
                  <span className="block text-[11px] text-zinc-400">علاقه‌مندی</span>
                </Link>
              </div>
            </div>

            {/* body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2" role="menu">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold text-zinc-500">فضای شخصی</p>
              <ul className="space-y-0.5">
                {PERSONAL.map((it) => (
                  <Item
                    key={it.href}
                    {...it}
                    count={it.key === "list" ? list.size : it.key === "fav" ? favorites.size : null}
                    tint={it.key === "fav" ? "text-rose-400" : undefined}
                  />
                ))}
              </ul>
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold text-zinc-500">کشف کنید</p>
              <ul className="space-y-0.5">
                {DISCOVER.map((it) => (
                  <Item key={it.href} {...it} />
                ))}
              </ul>
              <p className="px-3 pb-1 pt-3 text-[10px] font-bold text-zinc-500">پشتیبانی</p>
              <ul className="space-y-0.5">
                {SUPPORT.map((it) => (
                  <Item key={it.href} {...it} />
                ))}
              </ul>

              <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.03] p-2">
                <p className="mb-1.5 px-1 text-[10px] font-bold text-zinc-500">ظاهر</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
                  {THEMES.map((t) => {
                    const active = themeValue === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTheme(t.value)}
                        aria-pressed={active}
                        className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition ${active ? "bg-white text-black shadow" : "text-zinc-300 hover:bg-white/10"}`}
                      >
                        <t.icon width={13} height={13} /> {t.label}
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
                  <span dir="ltr">نما · v{bridge()?.version ?? "1.0.0"}</span>
                  <button type="button" onClick={checkUpdates} disabled={checking} className="flex items-center gap-1 rounded-full px-2 py-1 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-50">
                    <RefreshIcon width={12} height={12} className={checking ? "animate-spin" : ""} /> بررسی به‌روزرسانی
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>نما · سینمای آنلاین</span>
                  <Link href="/about" className="hover:text-white">درباره</Link>
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
        aria-label="منوی کاربر"
        className="flex items-center gap-2 rounded-full p-0.5 pe-2 transition hover:bg-white/10"
      >
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>{initial}</span>
        <ChevronDown width={14} height={14} className={`hidden text-zinc-400 transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
