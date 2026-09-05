"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * کارت «منبع و به‌روزرسانی کاتالوگ»:
 * ورود آدرس دایرکتوری، شروع/توقف همگام‌سازی و نمایش پیشرفت زنده.
 */
export default function SourceSyncCard() {
  const DEFAULT_SOURCE = "https://dls4.aparatchi-dlcenter.top/DonyayeSerial/";
  const [url, setUrl] = useState(DEFAULT_SOURCE);
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  interface SyncStatus {
    status: string;
    rootUrl: string;
    pages: number;
    errors: number;
    videos: number;
    titles: number;
    episodes: number;
    current: string;
    running: boolean;
    queueSize: number;
    log: Array<{ t: number; msg: string }>;
  }

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/source/sync", { cache: "no-store" });
      if (r.ok) {
        const j: SyncStatus = await r.json();
        setSt(j);
        if (j.rootUrl) setUrl((u) => (u === DEFAULT_SOURCE ? j.rootUrl : u));
        return j;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  useEffect(() => {
    void poll();
    timer.current = setInterval(() => void poll(), 1500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [poll]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/source/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.message || "خطا در اجرای درخواست.");
    } catch {
      setMsg("ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
      void poll();
    }
  }

  const running = st?.running ?? false;
  const statusFa: Record<string, string> = {
    idle: "آماده",
    running: "در حال همگام‌سازی…",
    paused: "متوقف/در انتظار ادامه",
    done: "تکمیل شد",
    error: "خطا",
  };
  const pct = running && st ? Math.min(96, 4 + (st.pages % 100)) : st?.status === "done" ? 100 : 0;

  return (
    <section className="mt-8 rounded-2xl border border-white/8 bg-white/[0.03] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">منبع و به‌روزرسانی کاتالوگ</h2>
          <p className="mt-1 text-xs leading-6 text-zinc-400">
            آدرس یک دایرکتوری اشتراک (Open Directory) را بدهید تا همه فیلم‌ها، سریال‌ها و قسمت‌ها با کاور
            به کتابخانه اضافه شوند. این عملیات روی همین دستگاه اجرا می‌شود و با بستن برنامه از سر گرفته می‌شود.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            running ? "bg-emerald-500/15 text-emerald-400" : st?.status === "done" ? "bg-brand/15 text-brand" : "bg-white/8 text-zinc-300"
          }`}
        >
          {statusFa[st?.status ?? "idle"] ?? "—"}
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          dir="ltr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/DonyayeSerial/"
          className="h-11 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60"
        />
        {running ? (
          <button
            onClick={() => void action({ action: "stop" })}
            disabled={busy}
            className="h-11 rounded-xl bg-white/10 px-6 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
          >
            توقف
          </button>
        ) : (
          <button
            onClick={() => void action({ action: "start", url })}
            disabled={busy || !url.trim()}
            className="h-11 rounded-xl bg-brand px-6 text-sm font-bold text-white transition hover:bg-brand/85 disabled:opacity-50"
          >
            شروع همگام‌سازی
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-rose-400">{msg}</p>}

      {st && (st.pages > 0 || running) && (
        <>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className={`h-full rounded-full transition-all duration-700 ${running ? "bg-emerald-500" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            <Stat label="پوشه بررسی‌شده" value={st.pages} />
            <Stat label="عنوان" value={st.titles} />
            <Stat label="قسمت" value={st.episodes} />
            <Stat label="فایل ویدیو" value={st.videos} />
            <Stat label="خطا" value={st.errors} warn={st.errors > 0} />
          </div>
          {st.log.length > 0 && (
            <div dir="rtl" className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-5 text-zinc-400">
              {st.log.map((l, i) => (
                <p key={`${l.t}-${i}`} className="truncate">
                  {l.msg}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2 py-3">
      <p className={`text-lg font-black ${warn ? "text-rose-400" : "text-white"}`}>{value.toLocaleString("fa-IR")}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{label}</p>
    </div>
  );
}
