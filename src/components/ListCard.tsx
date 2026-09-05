"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TitleView } from "@/lib/queries";
import TitleCard from "./TitleCard";
import { TrashIcon } from "./Icons";

/** TitleCard with a hover "remove from list" action (used in /my-list) */
export default function ListCard({ t, progress, addedAt }: { t: TitleView; progress?: { position: number; duration: number } | null; addedAt: string }) {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const remove = () => {
    setGone(true);
    start(async () => {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: t.id }),
      }).catch(() => setGone(false));
      router.refresh();
    });
  };

  if (gone) return null;

  return (
    <div className="group/list relative [&>div]:w-full">
      <TitleCard t={t} progress={progress} />
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label="حذف از لیست"
        className="absolute start-2 top-10 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-zinc-300 opacity-0 ring-1 ring-white/15 backdrop-blur transition hover:bg-brand hover:text-white group-hover/list:opacity-100"
      >
        <TrashIcon width={14} height={14} />
      </button>
      <p className="mt-2 text-[10px] text-zinc-500">افزوده‌شده در {addedAt}</p>
    </div>
  );
}
