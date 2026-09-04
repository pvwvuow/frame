"use client";

import { motion } from "framer-motion";
import { HardDrive } from "lucide-react";
import { faNum } from "@/lib/nova-data";
import type { ViewId } from "@/app/page";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number }>;
}

export function Sidebar({
  items,
  active,
  onSelect,
  myListCount,
  activeDownloads,
  onOpenDownloads,
}: {
  items: NavItem[];
  active: ViewId;
  onSelect: (v: ViewId) => void;
  myListCount: number;
  activeDownloads: number;
  onOpenDownloads: () => void;
}) {
  const used = 62; // %
  return (
    <aside
      className="lg m-3 ms-0 flex w-[232px] shrink-0 flex-col rounded-3xl p-3"
      aria-label="منوی اصلی"
    >
      {/* logo */}
      <div className="mb-6 flex items-center gap-3 px-2 pt-2">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-600 text-lg font-black text-black shadow-[inset_0_2px_0_rgba(255,255,255,0.55),0_10px_24px_-8px_rgba(245,158,11,0.55)]">
          ن
        </div>
        <div>
          <div className="text-[15px] font-black leading-tight">نواپلی</div>
          <div className="text-[10px] font-medium tracking-widest text-muted-foreground">NOVAPLAY</div>
        </div>
      </div>

      {/* nav */}
      <nav className="flex flex-col gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const badge =
            item.id === "mylist" && myListCount > 0
              ? faNum(myListCount)
              : item.id === "downloads" && activeDownloads > 0
                ? faNum(activeDownloads)
                : null;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelect(item.id);
                if (item.id === "downloads") onOpenDownloads();
              }}
              className={`lg-pill relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] font-medium transition-all duration-300 ${
                isActive ? "lg-active text-amber-100" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-dot"
                  className="absolute start-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-300 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <Icon size={18} strokeWidth={1.9} />
              <span className="flex-1 text-start">{item.label}</span>
              {badge && (
                <span className="tabular rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        {/* storage widget */}
        <div className="lg-pill rounded-2xl p-4">
          <div className="mb-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <HardDrive size={13} />
              فضای ذخیره‌سازی
            </span>
            <span className="tabular">{faNum(used)}٪</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="relative h-full rounded-full bg-gradient-to-l from-amber-300 via-amber-400 to-orange-500"
              style={{ width: `${used}%` }}
            >
              <div className="shimmer absolute inset-0 rounded-full" />
            </div>
          </div>
          <div className="mt-2 text-[10.5px] text-muted-foreground tabular">
            {faNum("195")} گیگ از {faNum("512")} گیگ آزاد است
          </div>
        </div>

        {/* profile */}
        <button className="lg-pill flex w-full items-center gap-3 rounded-2xl p-3 text-start transition-colors hover:border-white/25">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-400/80 to-fuchsia-600/80 text-[13px] font-bold text-white">
            ع.م
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-bold">علی محمدی</div>
            <div className="text-[10px] text-muted-foreground">حساب Premium</div>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </button>
      </div>
    </aside>
  );
}
