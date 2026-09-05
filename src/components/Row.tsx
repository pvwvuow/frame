"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "./Icons";
import { useI18n } from "./i18n/LocaleProvider";

export default function Row({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, dir } = useI18n();
  const rtl = dir === "rtl";
  const [hover, setHover] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  // track scroll edges (RTL: scrollLeft goes 0 → negative)
  const update = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setCanPrev(pos > 4);
    setCanNext(pos < max - 4);
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // RTL: scrolling "forward" (visually left) means negative scrollLeft; LTR is positive
    el.scrollBy({ left: (rtl ? -dir : dir) * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section
      className="relative mt-10 first:mt-0"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="mb-4 flex items-end justify-between px-4 sm:px-8 lg:px-12">
        <div>
          <h2 className="text-lg font-extrabold text-white sm:text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="group flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-brand">
            {t("common.viewAll")}
            <ChevronLeft width={14} height={14} className={`rtl-flip transition-transform ${rtl ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5"}`} />
          </Link>
        )}
      </div>

      <div className="relative">
        {/* RTL: the row starts at the RIGHT edge. Right button = back to start, left button = forward. */}
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => scroll(-1)}
          disabled={!canPrev}
          className={`absolute start-0 top-0 z-10 hidden h-full w-14 items-center justify-center ${rtl ? "bg-gradient-to-l" : "bg-gradient-to-r"} from-ink/90 to-transparent text-white transition-opacity md:flex ${hover && canPrev ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <span className="glass-btn grid h-10 w-10 place-items-center rounded-full"><ChevronRight width={22} height={22} className="rtl-flip" /></span>
        </button>
        <button
          type="button"
          aria-label={t("common.more")}
          onClick={() => scroll(1)}
          disabled={!canNext}
          className={`absolute end-0 top-0 z-10 hidden h-full w-14 items-center justify-center ${rtl ? "bg-gradient-to-r" : "bg-gradient-to-l"} from-ink/90 to-transparent text-white transition-opacity md:flex ${hover && canNext ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <span className="glass-btn grid h-10 w-10 place-items-center rounded-full"><ChevronLeft width={22} height={22} className="rtl-flip" /></span>
        </button>

        <div
          ref={ref}
          className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible scroll-smooth px-4 pb-6 pt-3 sm:gap-4 sm:px-8 lg:px-12"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
