"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon } from "./Icons";

export default function WatchlistButton({
  titleId,
  initial,
  variant = "full",
}: {
  titleId: number;
  initial: boolean;
  variant?: "full" | "icon";
}) {
  const [inList, setInList] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = () => {
    const next = !inList;
    setInList(next);
    start(async () => {
      try {
        const r = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titleId }),
        });
        const d = (await r.json()) as { inList?: boolean };
        if (typeof d.inList === "boolean") setInList(d.inList);
        router.refresh();
      } catch {
        setInList(!next);
      }
    });
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={inList ? "حذف از لیست" : "افزودن به لیست"}
        className={`grid h-12 w-12 place-items-center rounded-full border transition ${
          inList ? "border-brand bg-brand/20 text-brand" : "border-white/30 bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        {inList ? <CheckIcon /> : <PlusIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex h-12 items-center gap-2 rounded-full border px-6 text-sm font-bold transition ${
        inList
          ? "border-brand/60 bg-brand/15 text-white"
          : "border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20"
      }`}
    >
      {inList ? <CheckIcon className="text-brand" /> : <PlusIcon />}
      {inList ? "در لیست شما" : "افزودن به لیست"}
    </button>
  );
}
