"use client";

import { Download, Droplets, House, Bookmark, Settings, Search } from "lucide-react";

export type NavId = "home" | "search" | "downloads" | "list" | "settings";

const NAV: { id: NavId; fa: string; icon: React.ElementType }[] = [
  { id: "home", fa: "خانه", icon: House },
  { id: "search", fa: "جستجو", icon: Search },
  { id: "downloads", fa: "دانلودها", icon: Download },
  { id: "list", fa: "لیست من", icon: Bookmark },
  { id: "settings", fa: "تنظیمات", icon: Settings },
];

/* ---------- floating glass rail — the liquid dock ---------- */
export function Sidebar({ active, onPick }: { active: NavId; onPick: (id: NavId) => void }) {
  return (
    <nav
      dir="rtl"
      aria-label="ناوبری اصلی"
      className="glass lg-rim relative z-30 my-3 ms-3 flex w-[86px] shrink-0 flex-col items-center gap-1.5 rounded-[28px] py-4"
    >
      {/* brand droplet */}
      <button
        className="group relative mb-3 grid size-11 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-aqua via-[#6D9BFF] to-iris shadow-[0_8px_30px_-6px_rgba(109,180,255,0.75)] transition-transform duration-500 hover:rotate-[15deg] hover:scale-110"
        aria-label="قاب"
      >
        <Droplets size={20} className="text-[#04101A]" strokeWidth={2.2} />
        <span className="pulse-ring absolute inset-0 rounded-full" aria-hidden />
      </button>

      {NAV.map(({ id, fa, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onPick(id)}
          data-active={active === id}
          className="nav-g flex w-[62px] cursor-pointer flex-col items-center gap-1 rounded-2xl px-1 py-2.5"
          aria-label={fa}
        >
          <Icon size={19} strokeWidth={active === id ? 2.2 : 1.8} />
          <span className="text-[9.5px] leading-none">{fa}</span>
        </button>
      ))}

      <span className="flex-1" />

      {/* user droplet */}
      <button
        className="relative mt-2 grid size-11 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/[.06] font-black text-inkc backdrop-blur-md transition-all hover:border-aqua/50 hover:shadow-[0_0_24px_-4px_rgba(109,232,255,0.5)]"
        aria-label="حساب کاربری"
        title="سارا محمدی"
      >
        ص
        <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-abyss bg-aqua shadow-[0_0_8px_rgba(109,232,255,0.9)]" aria-hidden />
      </button>
    </nav>
  );
}
