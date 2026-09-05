"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TitleView } from "@/lib/queries";
import { fa, formatClock } from "@/lib/format";
import { PlayIcon, CloseIcon } from "../Icons";
import TitleName from "@/components/TitleName";

export type ContinueLike = {
  title: TitleView;
  position: number;
  duration: number;
  episodeId: number | null;
  episodeName: string | null;
  episodeNumber: number | null;
  season: number | null;
};

/** Card for "ادامه تماشا" rows with a remove (✕) affordance. */
export default function ContinueCard({ c, removable = true }: { c: ContinueLike; removable?: boolean }) {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const p = c.duration > 0 ? Math.min(100, (c.position / c.duration) * 100) : 0;
  const href = `/watch/${c.title.slug}${c.episodeId ? `?ep=${c.episodeId}` : ""}`;

  const remove = () =>
    start(async () => {
      setGone(true);
      try {
        await fetch("/api/progress", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titleId: c.title.id }) });
        toast.success("از ادامه تماشا حذف شد");
        router.refresh();
      } catch {
        setGone(false);
        toast.error("حذف ناموفق بود");
      }
    });

  if (gone) return null;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-ink-700/40 transition hover:border-white/15">
      <div className="flex gap-4 p-3">
        <Link href={href} className="relative h-[96px] w-[170px] shrink-0 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.title.backdrop} alt={c.title.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition group-hover:opacity-100">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
              <PlayIcon width={18} height={18} className="ms-0.5" />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div className="h-full bg-brand" style={{ width: `${p}%` }} />
          </div>
        </Link>
        <div className="min-w-0 flex-1 py-1">
          <Link href={`/title/${c.title.slug}`} className="block text-base font-extrabold text-white hover:text-brand">
            <TitleName t={c.title} layout="inline" secondaryClass="text-xs" />
          </Link>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {c.episodeId ? `فصل ${fa(c.season ?? 1)} · قسمت ${fa(c.episodeNumber ?? 1)} · ${c.episodeName}` : `فیلم · ${fa(c.title.year)}`}
          </p>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-zinc-300">{fa(Math.round(p))}٪</span>
            <span>{formatClock(c.duration - c.position)} باقی‌مانده</span>
          </div>
          <Link href={href} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-brand">
            <PlayIcon width={12} height={12} /> ادامه
          </Link>
        </div>
      </div>
      {removable && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="حذف از ادامه تماشا"
          className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-zinc-300 opacity-0 ring-1 ring-white/10 transition hover:bg-brand hover:text-white group-hover:opacity-100"
        >
          <CloseIcon width={13} height={13} />
        </button>
      )}
    </div>
  );
}
