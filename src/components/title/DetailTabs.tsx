"use client";

import { useEffect, useState } from "react";

export type TabDef = { id: string; label: string; count?: number };

export default function DetailTabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  useEffect(() => {
    const els = tabs.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: [0, 0.2] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [tabs]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 130;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-white/5 bg-ink/85 px-4 backdrop-blur-xl sm:top-[72px] sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
      <div className="no-scrollbar mx-auto flex max-w-[1600px] gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            className={`relative shrink-0 px-4 py-4 text-sm font-bold transition ${active === t.id ? "text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {t.label}
            {t.count != null && <span className="ms-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">{t.count}</span>}
            {active === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand shadow-[0_0_12px_var(--color-brand-glow)]" />}
          </button>
        ))}
      </div>
    </div>
  );
}
