"use client";

import { useState } from "react";
import { useLibrary } from "./library/LibraryProvider";
import { StarIcon } from "./Icons";
import { fa } from "@/lib/format";

/** Personal 1–10 star rating (click again on the same star to clear). */
export default function RatingControl({ titleId, compact = false }: { titleId: number; compact?: boolean }) {
  const { scoreOf, rate } = useLibrary();
  const score = scoreOf(titleId) ?? 0;
  const [hover, setHover] = useState(0);
  const shown = hover || score;
  const size = compact ? 16 : 22;

  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-2"}`}>
      {!compact && (
        <p className="text-xs font-bold text-zinc-400">
          امتیاز شما{score ? <span className="ms-2 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-amber-400">{fa(score)}/۱۰</span> : null}
        </p>
      )}
      <div className="flex items-center gap-0.5" dir="ltr" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="امتیاز شما">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} از 10`}
            onMouseEnter={() => setHover(n)}
            onClick={(e) => {
              e.stopPropagation();
              rate(titleId, score === n ? 0 : n);
            }}
            className={`transition-transform hover:scale-125 ${n <= shown ? "text-amber-400" : "text-zinc-600"}`}
          >
            <StarIcon width={size} height={size} fill={n <= shown ? "currentColor" : "none"} />
          </button>
        ))}
        {compact && score > 0 && <span className="ms-2 text-xs font-bold text-amber-400">{fa(score)}</span>}
      </div>
    </div>
  );
}
