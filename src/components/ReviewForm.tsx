"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StarIcon } from "./Icons";
import { fa } from "@/lib/format";

export default function ReviewForm({ titleId, slug }: { titleId: number; slug: string }) {
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(8);
  const [hover, setHover] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await fetch("/api/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titleId, slug, author, rating, body }),
          });
          if (r.ok) {
            setBody("");
            setMsg("نظر شما ثبت شد. ممنون!");
            router.refresh();
          } else {
            const d = (await r.json().catch(() => ({}))) as { error?: string };
            setMsg(d.error ?? "خطایی رخ داد");
          }
        });
      }}
      className="rounded-2xl border border-white/5 bg-ink-700/60 p-5"
    >
      <p className="mb-4 font-bold text-white">نظر خود را بنویسید</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="نام شما"
          required
          className="h-11 rounded-xl border border-white/10 bg-ink px-4 text-sm text-white placeholder:text-zinc-500 focus:border-brand focus:outline-none"
        />
        <div className="flex h-11 items-center gap-1 rounded-xl border border-white/10 bg-ink px-3" dir="ltr">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              className={`transition ${n <= (hover ?? rating) ? "text-amber-400" : "text-zinc-600"}`}
              aria-label={`امتیاز ${n}`}
            >
              <StarIcon width={18} height={18} />
            </button>
          ))}
          <span className="ml-auto text-sm font-bold text-amber-400">{fa(hover ?? rating)}/۱۰</span>
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="نظرتان درباره‌ی این اثر..."
        required
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-ink px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-brand focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-full bg-brand px-6 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? "در حال ارسال..." : "ثبت نظر"}
        </button>
        {msg && <span className="text-sm text-zinc-300">{msg}</span>}
      </div>
    </form>
  );
}
