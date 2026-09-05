"use client";

import { useState } from "react";
import { useLibrary } from "./library/LibraryProvider";
import { HeartIcon } from "./Icons";

/**
 * Heart / favorite toggle.
 * variants: "full" (pill with label) · "icon" (48px round) · "mini" (32px, for cards)
 */
export default function FavoriteButton({
  titleId,
  name,
  variant = "icon",
  className = "",
}: {
  titleId: number;
  name?: string;
  variant?: "full" | "icon" | "mini";
  className?: string;
}) {
  const { isFavorite, toggleFavorite } = useLibrary();
  const fav = isFavorite(titleId);
  const [pop, setPop] = useState(false);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPop(true);
    setTimeout(() => setPop(false), 400);
    toggleFavorite(titleId, name);
  };

  const label = fav ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها";

  if (variant === "mini") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={fav}
        title={label}
        className={`grid h-8 w-8 place-items-center rounded-full ring-1 backdrop-blur transition ${
          fav ? "bg-rose-600 text-white ring-rose-400/60" : "bg-black/60 text-white ring-white/15 hover:bg-rose-600/90"
        } ${className}`}
      >
        <HeartIcon width={15} height={15} filled={fav} className={pop ? "heart-pop" : ""} />
      </button>
    );
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={fav}
        title={label}
        className={`grid h-12 w-12 place-items-center rounded-full border transition ${
          fav ? "border-rose-500 bg-rose-500/20 text-rose-400" : "border-white/30 bg-white/10 text-white hover:bg-white/20"
        } ${className}`}
      >
        <HeartIcon filled={fav} className={pop ? "heart-pop" : ""} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={fav}
      className={`flex h-12 items-center gap-2 rounded-full border px-6 text-sm font-bold transition ${
        fav ? "border-rose-500/60 bg-rose-500/15 text-white" : "border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20"
      } ${className}`}
    >
      <HeartIcon filled={fav} className={`${fav ? "text-rose-400" : ""} ${pop ? "heart-pop" : ""}`} />
      {fav ? "در علاقه‌مندی‌ها" : "علاقه‌مندی"}
    </button>
  );
}
