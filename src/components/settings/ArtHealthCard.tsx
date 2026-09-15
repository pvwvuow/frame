"use client";

/* v0.35.3 (IMG-CACHE-4) — Settings › سلامت تصاویر (artwork health probe).
 *
 * The queued escalation from v0.35.1/v0.35.2: when the user reports
 * «تصاویر لود نمی‌شن» again, this panel answers WHERE the chain breaks
 * without any devtools:
 *   • service worker state (the artwork cache needs an active worker),
 *   • frame-img bucket name + entry count (poisoned buckets get wiped by
 *     «پاک‌کردن کش تصاویر», the v3 bump also rebuilds them once),
 *   • RAM warmer size (the IMG-CACHE-3 layer),
 *   • a live end-to-end test of the three art sources through REAL <img>
 *     decode (not fetch): same-origin generated SVG, metahub poster,
 *     metahub backdrop. If same-origin is OK but metahub fails, the panel
 *     says so plainly and points at the two working mitigations (the
 *     offline cover-packs toggle right above, or a different network).
 * This turns the next «هنوز درست لود نمی‌شن» screenshot into actionable
 * data for support. Persian strings are hardcoded like CoverPackCard.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CameraIcon } from "../Icons";

const IMG_BUCKETS = "frame-img-";
const PROBE_SAME_ORIGIN = "/api/cover/steins-448447.svg"; // seed title (Steins;Gate) → generated SVG
const PROBE_METAHUB_POSTER = "https://images.metahub.space/poster/small/tt0898266/img";
const PROBE_METAHUB_BACKDROP = "https://images.metahub.space/background/medium/tt1910272/img";
/* v0.35.5: the paced server relay (the path the heal swaps failed metahub
 * art to) — success here proves the artwork rescue works even when the
 * direct metahub burst is throttled on this network. */
const PROBE_RELAY = `/api/art?u=${encodeURIComponent("https://images.metahub.space/poster/small/tt0898266/img")}`;

type RowState = "idle" | "run" | "ok" | "fail";
type Row = { label: string; state: RowState; detail: string };

function imgProbe(url: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const img = new Image();
    const timer = window.setTimeout(() => {
      img.src = "";
      resolve({ ok: false, detail: "مهلت تمام شد (بیش از ۱۰ ثانیه)" });
    }, 10000);
    img.onload = () => {
      window.clearTimeout(timer);
      const ms = Math.round(performance.now() - t0);
      resolve({ ok: true, detail: `${ms} میلی‌ثانیه · ${img.naturalWidth}×${img.naturalHeight}` });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve({ ok: false, detail: "ناموفق" });
    };
    img.src = url;
  });
}

export default function ArtHealthCard() {
  const [open, setOpen] = useState(false);
  const [sw, setSw] = useState("…");
  const [bucket, setBucket] = useState("…");
  const [warmer, setWarmer] = useState("…");
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [rows, setRows] = useState<Row[]>([
    { label: "تصویر داخلی (سرور خود فریم)", state: "idle", detail: "" },
    { label: "پوستر از سرور متاهاب (مستقیم)", state: "idle", detail: "" },
    { label: "بک‌دراپ از سرور متاهاب (مستقیم)", state: "idle", detail: "" },
    { label: "مسیر جایگزین (سرور واسط فریم)", state: "idle", detail: "" },
  ]);

  const refresh = useCallback(async () => {
    try {
      if (!("serviceWorker" in navigator)) {
        setSw("این دستگاه سرویس‌ورکر ندارد");
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        const ctrl = Boolean(navigator.serviceWorker.controller);
        setSw(reg?.active ? (ctrl ? "فعال است" : "فعال (در حال به‌دست‌گرفتن کنترل)") : "ثبت نشده");
      }
    } catch {
      setSw("نامشخص");
    }
    try {
      if ("caches" in window) {
        const names = (await caches.keys()).filter((n) => n.startsWith(IMG_BUCKETS));
        if (!names.length) {
          setBucket("خالی (هنوز چیزی کش نشده)");
        } else {
          let best = { name: "", count: -1 };
          for (const n of names) {
            const k = await (await caches.open(n)).keys();
            if (k.length > best.count) best = { name: n, count: k.length };
          }
          const fa = best.count.toLocaleString("fa-IR");
          setBucket(`${best.name} · ${fa} تصویر`);
        }
      } else {
        setBucket("بدون پشتیبانی Cache");
      }
    } catch {
      setBucket("نامشخص");
    }
    try {
      const stat = (window as unknown as { __warmArtStat?: () => { size: number; max: number } }).__warmArtStat;
      if (stat) {
        const s = stat();
        setWarmer(`${s.size.toLocaleString("fa-IR")} از ${s.max.toLocaleString("fa-IR")} تصویر`);
      } else {
        setWarmer("غیرفعال");
      }
    } catch {
      setWarmer("نامشخص");
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const runTest = async () => {
    setBusy(true);
    setTested(false);
    setRows((rs) => rs.map((r) => ({ ...r, state: "run", detail: "" })));
    const targets = [
      { label: "تصویر داخلی (سرور خود فریم)", url: PROBE_SAME_ORIGIN },
      { label: "پوستر از سرور متاهاب (مستقیم)", url: PROBE_METAHUB_POSTER },
      { label: "بک‌دراپ از سرور متاهاب (مستقیم)", url: PROBE_METAHUB_BACKDROP },
      { label: "مسیر جایگزین (سرور واسط فریم)", url: PROBE_RELAY },
    ];
    for (let i = 0; i < targets.length; i++) {
      const r = await imgProbe(targets[i].url);
      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: r.ok ? "ok" : "fail", detail: r.detail } : x)));
    }
    setBusy(false);
    setTested(true);
    void refresh();
  };

  const clearCache = async () => {
    try {
      const names = (await caches.keys()).filter((n) => n.startsWith(IMG_BUCKETS));
      await Promise.all(names.map((n) => caches.delete(n)));
      toast.success("کش تصاویر پاک شد — یک‌بار صفحه را رفرش کنید");
      void refresh();
    } catch {
      toast.error("پاک‌کردن کش ممکن نشد");
    }
  };

  const metaOk = rows[1]?.state === "ok" || rows[2]?.state === "ok";
  const metaFail = rows[1]?.state === "fail" || rows[2]?.state === "fail";
  const localOk = rows[0]?.state === "ok";
  const relayOk = rows[3]?.state === "ok";
  const relayFail = rows[3]?.state === "fail";

  return (
    <div className="glass mt-4 rounded-2xl p-4" dir="rtl">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-start" aria-expanded={open}>
        <span className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-zinc-200">
            <CameraIcon width={18} height={18} />
          </span>
          <span>
            <span className="block text-sm font-bold text-white">سلامت تصاویر</span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">
              اگر پوسترها لود نمی‌شوند، از این‌جا علت را ببینید
            </span>
          </span>
        </span>
        <span className="text-xs text-zinc-400">{open ? "بستن ▲" : "بررسی ▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-[12px] sm:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-zinc-500">کش سرویس‌ورکر</p>
              <p className="mt-1 font-bold text-zinc-200">{sw}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-zinc-500">حجم کش تصاویر</p>
              <p className="mt-1 font-bold text-zinc-200">{bucket}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <p className="text-zinc-500">حافظه‌ی موقت نشست</p>
              <p className="mt-1 font-bold text-zinc-200">{warmer}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runTest()}
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:bg-brand/85 disabled:opacity-50"
            >
              {busy ? "در حال تست…" : "اجرای تست تصاویر"}
            </button>
            <button
              type="button"
              onClick={() => void clearCache()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/10"
            >
              پاک‌کردن کش تصاویر
            </button>
          </div>

          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.02] px-3 py-2 text-[12px]">
                <span className="text-zinc-300">{r.label}</span>
                <span
                  className={
                    r.state === "ok"
                      ? "font-bold text-emerald-400"
                      : r.state === "fail"
                        ? "font-bold text-rose-400"
                        : r.state === "run"
                          ? "animate-pulse font-bold text-amber-300"
                          : "text-zinc-500"
                  }
                >
                  {r.state === "ok" ? `✔ ${r.detail}` : r.state === "fail" ? `✘ ${r.detail}` : r.state === "run" ? "…" : "تست نشده"}
                </span>
              </div>
            ))}
          </div>

          {tested && metaFail && localOk && relayOk && (
            <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-[12px] leading-6 text-emerald-200">
              مسیر مستقیم متاهاب از این شبکه محدود شده، ولی مسیر جایگزین فریم کار می‌کند — عکس‌هایی که
              لود نمی‌شدند خودکار از همین مسیر گرفته می‌شوند و در کش می‌مانند. چند ثانیه بمانید یا صفحه
              را رفرش کنید تا پوسترها یکی‌یکی پر شوند.
            </p>
          )}
          {tested && relayFail && localOk && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-[12px] leading-6 text-amber-200">
              سرور خودِ فریم سالم است ولی سرور تصاویر (متاهاب) از شبکه‌ی فعلی به هیچ شکلی در دسترس
              نیست — نه مستقیم و نه از مسیر واسط. راه‌حل: اتصال اینترنت را عوض کنید یا فیلترشکن را
              روشن/خاموش کنید و بعد دوباره تست بگیرید.
            </p>
          )}
          {tested && metaOk && localOk && (
            <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-[12px] leading-6 text-emerald-200">
              همه‌ی مسیرهای تصویر سالم‌اند. اگر جایی هنوز عکس نمی‌بینید، صفحه را یک‌بار رفرش کنید —
              نسخه‌های جدید فریم عکس‌های خراب‌شده را خودکار دوباره می‌گیرند.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
