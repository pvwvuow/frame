"use client";

import { LIST_STATUSES, type ListStatus } from "@/lib/library";
import { useLibrary } from "./library/LibraryProvider";

/** Watch-status pills (planned / watching / watched) for a title in the user's list. */
export default function StatusSelect({ titleId, size = "md" }: { titleId: number; size?: "sm" | "md" }) {
  const { list, setStatus } = useLibrary();
  const current = list.get(titleId);
  if (!current) return null;
  const pad = size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs";

  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="وضعیت تماشا">
      {LIST_STATUSES.map((s) => {
        const active = current === s.value;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={(e) => {
              e.stopPropagation();
              setStatus(titleId, s.value as ListStatus);
            }}
            className={`rounded-full border font-bold transition ${pad} ${
              active ? `border-white/20 bg-white/10 ${s.color}` : "border-white/5 bg-transparent text-zinc-500 hover:border-white/15 hover:text-zinc-300"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
