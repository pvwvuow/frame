"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "./Icons";

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
  const [hover, setHover] = useState(false);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    // RTL: scrolling "forward" (visually left) means negative scrollLeft
    el.scrollBy({ left: -dir * el.clientWidth * 0.8, behavior: "smooth" });
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
            مشاهده همه
            <ChevronLeft width={14} height={14} className="transition-transform group-hover:-translate-x-0.5" />
          </Link>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label="بعدی"
          onClick={() => scroll(1)}
          className={`absolute start-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-l from-transparent to-ink/90 text-white transition-opacity md:flex ${hover ? "opacity-100" : "opacity-0"}`}
        >
          <ChevronLeft width={28} height={28} />
        </button>
        <button
          type="button"
          aria-label="قبلی"
          onClick={() => scroll(-1)}
          className={`absolute end-0 top-0 z-10 hidden h-full w-12 items-center justify-center bg-gradient-to-r from-transparent to-ink/90 text-white transition-opacity md:flex ${hover ? "opacity-100" : "opacity-0"}`}
        >
          <ChevronRight width={28} height={28} />
        </button>

        <div
          ref={ref}
          className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-4 pt-2 sm:gap-4 sm:px-8 lg:px-12"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
