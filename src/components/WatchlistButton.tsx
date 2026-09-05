"use client";

import { useLibrary } from "./library/LibraryProvider";
import { CheckIcon, PlusIcon } from "./Icons";

/**
 * Add / remove from "لیست من".
 * State is shared app-wide through LibraryProvider (optimistic, with toasts).
 * `initial` is used only until the provider snapshot arrives.
 */
export default function WatchlistButton({
  titleId,
  name,
  initial = false,
  variant = "full",
  className = "",
}: {
  titleId: number;
  name?: string;
  initial?: boolean;
  variant?: "full" | "icon" | "mini";
  className?: string;
}) {
  const { ready, inList: has, toggleList } = useLibrary();
  const inList = ready ? has(titleId) : initial;

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleList(titleId, name);
  };
  const label = inList ? "حذف از لیست" : "افزودن به لیست";

  if (variant === "mini") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={inList}
        title={label}
        className={`grid h-8 w-8 place-items-center rounded-full ring-1 backdrop-blur transition ${
          inList ? "bg-brand text-white ring-brand/60" : "bg-black/60 text-white ring-white/15 hover:bg-white hover:text-black"
        } ${className}`}
      >
        {inList ? <CheckIcon width={15} height={15} /> : <PlusIcon width={15} height={15} />}
      </button>
    );
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={inList}
        title={label}
        className={`grid h-12 w-12 place-items-center rounded-full border transition ${
          inList ? "border-brand bg-brand/20 text-brand" : "border-white/30 bg-white/10 text-white hover:bg-white/20"
        } ${className}`}
      >
        {inList ? <CheckIcon /> : <PlusIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inList}
      className={`flex h-12 items-center gap-2 rounded-full border px-6 text-sm font-bold transition ${
        inList ? "border-brand/60 bg-brand/15 text-white" : "border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20"
      } ${className}`}
    >
      {inList ? <CheckIcon className="text-brand" /> : <PlusIcon />}
      {inList ? "در لیست شما" : "افزودن به لیست"}
    </button>
  );
}
