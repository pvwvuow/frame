"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLibrary } from "./library/LibraryProvider";
import { AVATARS } from "./library/SettingsForm";
import { BookmarkIcon, HeartIcon, HistoryIcon, SettingsIcon, UserIcon, ChevronDown, HelpIcon } from "./Icons";
import { fa } from "@/lib/format";
import { useTheme } from "next-themes";
import { THEMES } from "./theme/ThemeToggle";

const ITEMS = [
  { href: "/profile", label: "پروفایل من", icon: UserIcon },
  { href: "/my-list", label: "لیست من", icon: BookmarkIcon, key: "list" as const },
  { href: "/favorites", label: "علاقه‌مندی‌ها", icon: HeartIcon, key: "fav" as const },
  { href: "/history", label: "تاریخچه تماشا", icon: HistoryIcon },
  { href: "/settings", label: "تنظیمات", icon: SettingsIcon },
  { href: "/faq", label: "راهنما", icon: HelpIcon },
];

export default function UserMenu() {
  const { profile, list, favorites } = useLibrary();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initial = (profile.displayName || "ن").slice(0, 1);
  const grad = AVATARS[profile.avatar] ?? AVATARS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-0.5 pe-2 transition hover:bg-white/10"
      >
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>{initial}</span>
        <ChevronDown width={14} height={14} className={`hidden text-zinc-400 transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="menu" className="glass-strong glass-in absolute end-0 top-12 w-64 overflow-hidden rounded-2xl">
          <Link href="/profile" className="flex items-center gap-3 border-b border-white/5 px-4 py-3 transition hover:bg-white/5">
            <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-base font-black text-white ${grad}`}>{initial}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{profile.displayName}</span>
              <span className="block text-[11px] text-zinc-400">مشاهده پروفایل</span>
            </span>
          </Link>
          <ul className="p-1.5">
            {ITEMS.map((it) => {
              const count = it.key === "list" ? list.size : it.key === "fav" ? favorites.size : null;
              const active = pathname?.startsWith(it.href);
              return (
                <li key={it.href}>
                  <Link href={it.href} role="menuitem" className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"}`}>
                    <it.icon width={16} height={16} className={it.key === "fav" ? "text-rose-400" : "text-zinc-400"} />
                    {it.label}
                    {count != null && count > 0 && <span className="ms-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">{fa(count)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-white/5 p-2">
            <p className="mb-1.5 px-2 text-[10px] font-bold text-zinc-500">ظاهر</p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
              {THEMES.map((t) => {
                const active = mounted && (theme ?? "dark") === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTheme(t.value)}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-bold transition ${active ? "bg-white text-black shadow" : "text-zinc-300 hover:bg-white/10"}`}
                  >
                    <t.icon width={13} height={13} /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
