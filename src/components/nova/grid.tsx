"use client";

import { GENRES, type MediaItem } from "@/lib/nova-data";
import { PosterCard } from "@/components/nova/rows";
import type { NovaState } from "@/app/page";

export function MediaGrid({ items, nova }: { items: MediaItem[]; nova: NovaState }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((item) => (
        <div key={item.id} className="flex justify-center">
          <PosterCard item={item} nova={nova} width="w-full max-w-[190px]" />
        </div>
      ))}
    </div>
  );
}

export function GenreChips({
  active,
  onPick,
}: {
  active: string;
  onPick: (g: string) => void;
}) {
  return (
    <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
      {GENRES.map((g) => (
        <button
          key={g}
          onClick={() => onPick(g)}
          className={`lg-pill shrink-0 rounded-full px-4 py-2 text-[12.5px] font-medium transition-all duration-300 ${
            active === g ? "lg-active text-amber-100" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {g}
        </button>
      ))}
    </div>
  );
}
