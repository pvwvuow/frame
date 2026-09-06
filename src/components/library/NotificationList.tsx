"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Notification } from "@/lib/notifications";
import { BellIcon, CheckIcon, CloseIcon, TvIcon, PlayIcon, SparkIcon, FlameIcon, InfoIcon, SettingsIcon } from "../Icons";
import { fa } from "@/lib/format";
import { bridge } from "@/lib/platform";

const KINDS = {
  episode: { label: "قسمت جدید", icon: TvIcon, tint: "text-sky-400 bg-sky-500/10" },
  continue: { label: "ادامه تماشا", icon: PlayIcon, tint: "text-amber-400 bg-amber-500/10" },
  recommend: { label: "پیشنهاد", icon: SparkIcon, tint: "text-fuchsia-400 bg-fuchsia-500/10" },
  new: { label: "تازه‌ها", icon: FlameIcon, tint: "text-brand bg-brand/10" },
  system: { label: "فریم", icon: InfoIcon, tint: "text-zinc-300 bg-white/10" },
} as const;

const READ_KEY = "nama-notif-read";
const HIDE_KEY = "nama-notif-hidden";

function load(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

function since(iso: string) {
  const d = (Date.now() - +new Date(iso)) / 1000;
  if (d < 3600) return `${fa(Math.max(1, Math.round(d / 60)))} دقیقه پیش`;
  if (d < 86400) return `${fa(Math.round(d / 3600))} ساعت پیش`;
  if (d < 86400 * 30) return `${fa(Math.round(d / 86400))} روز پیش`;
  return new Date(iso).toLocaleDateString("fa-IR", { month: "long", day: "numeric" });
}

export default function NotificationList({ items }: { items: Notification[] }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | keyof typeof KINDS>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRead(load(READ_KEY));
    setHidden(load(HIDE_KEY));
    setMounted(true);
  }, []);

  const visible = useMemo(() => items.filter((n) => !hidden.has(n.id) && (filter === "all" || n.kind === filter)), [items, hidden, filter]);
  const unread = useMemo(() => items.filter((n) => !hidden.has(n.id) && !read.has(n.id)).length, [items, hidden, read]);

  useEffect(() => {
    if (mounted) bridge()?.setBadge(unread);
  }, [unread, mounted]);

  const persist = (key: string, s: Set<string>) => localStorage.setItem(key, JSON.stringify([...s]));
  const markRead = (id: string) =>
    setRead((s) => {
      const n = new Set(s).add(id);
      persist(READ_KEY, n);
      return n;
    });
  const markAll = () => {
    const n = new Set(items.map((i) => i.id));
    persist(READ_KEY, n);
    setRead(n);
  };
  const hide = (id: string) =>
    setHidden((s) => {
      const n = new Set(s).add(id);
      persist(HIDE_KEY, n);
      return n;
    });
  const restore = () => {
    localStorage.removeItem(HIDE_KEY);
    setHidden(new Set());
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-white/5 p-1">
          {(["all", "episode", "continue", "recommend", "new", "system"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === k ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"}`}>
              {k === "all" ? "همه" : KINDS[k].label}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          {unread > 0 && (
            <button type="button" onClick={markAll} className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10">
              <CheckIcon width={13} height={13} /> خواندن همه ({fa(unread)})
            </button>
          )}
          {hidden.size > 0 && (
            <button type="button" onClick={restore} className="rounded-full px-3 py-1.5 text-xs text-zinc-400 hover:text-white">
              بازگرداندن {fa(hidden.size)} اعلان
            </button>
          )}
          <Link href="/settings#notifications" aria-label="تنظیمات اعلان‌ها" className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-zinc-300 hover:bg-white/10">
            <SettingsIcon width={14} height={14} />
          </Link>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-white/10 p-12 text-center">
          <BellIcon width={36} height={36} className="mx-auto text-zinc-600" />
          <p className="mt-4 text-sm font-bold text-white">اعلانی نیست</p>
          <p className="mt-1 text-xs text-zinc-500">وقتی قسمت جدیدی بیاید یا چیزی نیمه‌کاره بماند، این‌جا خبردار می‌شوید.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {visible.map((n) => {
            const k = KINDS[n.kind];
            const isRead = read.has(n.id);
            return (
              <li key={n.id} className={`group relative flex items-start gap-3 rounded-2xl border p-3 transition ${isRead ? "border-white/5 bg-white/[0.02]" : "border-white/10 bg-white/[0.05]"}`}>
                {!isRead && <span className="absolute end-3 top-3 h-2 w-2 rounded-full bg-brand shadow-[0_0_10px_var(--color-brand-glow)]" aria-label="خوانده‌نشده" />}
                <Link href={n.href} onClick={() => markRead(n.id)} className="flex min-w-0 flex-1 items-start gap-3">
                  {n.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.image} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-ink-700 object-cover" />
                  ) : (
                    <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-xl ${k.tint}`}>
                      <k.icon width={24} height={24} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${k.tint}`}>
                        <k.icon width={11} height={11} /> {k.label}
                      </span>
                      <span className="text-[10px] text-zinc-500">{mounted ? since(n.at) : ""}</span>
                    </span>
                    <span className={`mt-1 block truncate text-sm font-bold ${isRead ? "text-zinc-300" : "text-white"}`}>{n.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-zinc-400">{n.body}</span>
                  </span>
                </Link>
                <div className="flex shrink-0 flex-col gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  {!isRead && (
                    <button type="button" onClick={() => markRead(n.id)} aria-label="خوانده شد" className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
                      <CheckIcon width={14} height={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => hide(n.id)} aria-label="حذف اعلان" className="grid h-7 w-7 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
                    <CloseIcon width={14} height={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
