"use client";

/* v0.25.0 — Settings › تصاویر آفلاین (cover packs, OPT-IN on Android).
 * v0.36.0 (ART-3.0) — DESKTOP branch: the cover-light installers used to
 * stream every poster from metahub/raw.github (both flaky on Iranian
 * networks → dark cards). The desktop now syncs the SAME split release
 * coverpacks the Android app has always had — auto-run by the Electron
 * shell (proxy-aware downloader → local server merge → userData
 * covers-store). This card shows the live progress and offers a manual
 * «دانلود/به‌روزرسانی» trigger; the store is always kept fresh on boot, so
 * there is no toggle on this platform (artwork stops depending on the
 * network entirely once merged).
 *
 * The Android branch below is unchanged: opt-in toggle, native
 * applyCoverPack, resumable parts.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { nativeBridge } from "@/lib/native-bridge";
import { useIsElectron } from "@/lib/platform";
import {
  checkForUpdate,
  runCoverSync,
  onUpdateProgress,
  appliedCoverCount,
  coversAutoEnabled,
  setCoversAuto,
  type UpdateCheck,
} from "@/lib/self-update";
import { coversSyncState, startCoversSyncNow, watchCoversSync, fetchCoversManifest } from "@/lib/desktop-covers";
import { CameraIcon } from "../Icons";

const fa = (n: number) => Math.round(n).toLocaleString("fa-IR");
const mb = (n: number) => `${(n / 1048576).toFixed(0)} مگابایت`;

function DesktopCoverPackCard() {
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ files: number; bytes: number; parts: number; totalParts: number; rev: number } | null>(null);

  const loadManifest = useCallback(async () => {
    const m = await fetchCoversManifest();
    if (m) {
      setStats({
        files: m.files ?? 0,
        bytes: m.bytes ?? 0,
        parts: (m.parts ?? []).length,
        totalParts: m.totalParts ?? 0,
        rev: m.rev ?? 0,
      });
    }
  }, []);

  useEffect(() => {
    void loadManifest();
    const off = watchCoversSync((s) => {
      if (s.phase === "download" && s.total > 0) {
        setBusy(true);
        const partPct = Math.round(((s.received ?? 0) / s.total) * 100);
        const base = s.totalParts ? ((s.part - 1) / s.totalParts) * 100 : 0;
        const step = s.totalParts ? 100 / s.totalParts : 0;
        setPct(Math.min(99, Math.round(base + (partPct / 100) * step)));
        setMsg(s.message || `دانلود بستهٔ ${s.part}`);
      } else if (s.phase === "merge") {
        setBusy(true);
        setPct(null);
        setMsg(s.message || "نصب بسته…");
      } else if (s.phase === "done") {
        setBusy(false);
        setPct(null);
        toast.success("تصاویر آفلاین آماده شد — عکس‌ها حالا از دیسک لود می‌شوند");
        void loadManifest();
      } else if (s.phase === "up-to-date") {
        setBusy(false);
        setPct(null);
        void loadManifest();
      } else if (s.phase === "error") {
        setBusy(false);
        setPct(null);
      }
    });
    void coversSyncState().then((st) => {
      if (st && (st.phase === "download" || st.phase === "merge" || st.phase === "check")) {
        setBusy(true);
        setMsg(st.message || "در حال دانلود");
      }
    });
    return off;
  }, [loadManifest]);

  const syncNow = async () => {
    setBusy(true);
    setPct(0);
    setMsg("شروع دانلود…");
    const started = await startCoversSyncNow();
    if (!started) {
      // already running or up-to-date — refresh state
      const st = await coversSyncState();
      if (st?.phase === "up-to-date" || st?.phase === "done") {
        setBusy(false);
        setPct(null);
        toast.message("بستهٔ تصاویر به‌روز است");
      }
    }
  };

  const complete = stats && stats.totalParts > 0 && stats.parts >= stats.totalParts;

  return (
    <div className="glass rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-zinc-200">
            <CameraIcon width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-white">تصاویر آفلاین</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {complete
                ? "همهٔ تصاویر روی دیسک ذخیره شده‌اند — بدون اینترنت هم لود می‌شوند."
                : stats && stats.files > 0
                  ? `دانلود خودکار در پس‌زمینه ادامه دارد — ${fa(stats.files)} تصویر (${mb(stats.bytes)}) آماده است.`
                  : "بستهٔ تصاویر خودکار دانلود می‌شود تا عکس‌ها بدون وابستگی به اینترنت، آنی لود شوند."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={busy}
          className="shrink-0 rounded-xl bg-brand px-3 py-2 text-[11px] font-bold text-white transition hover:bg-brand/85 disabled:opacity-50"
        >
          {busy ? "در حال دانلود…" : stats && stats.files > 0 ? "ادامه/به‌روزرسانی" : "دانلود تصاویر"}
        </button>
      </div>
      {stats && stats.totalParts > 0 && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${Math.min(100, Math.round((stats.parts / Math.max(1, stats.totalParts)) * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            {busy && pct != null ? `${msg} — ${pct}٪` : `${fa(stats.parts)} از ${fa(stats.totalParts)} بسته نصب شد`}
          </p>
        </div>
      )}
      {busy && pct != null && !stats?.totalParts && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">{msg} — {pct}٪</p>
        </div>
      )}
    </div>
  );
}

export default function CoverPackCard() {
  const isElectron = useIsElectron();
  const [show, setShow] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (nativeBridge()) {
      setShow(true);
      setOn(coversAutoEnabled());
    }
  }, []);

  if (isElectron) return <DesktopCoverPackCard />;
  if (!show) return null;

  const startSync = async (check: UpdateCheck) => {
    setBusy(true);
    setPct(0);
    const off = onUpdateProgress((p) => {
      if (p.phase === "covers") {
        setPct(p.total ? Math.round(((p.received ?? 0) / p.total) * 100) : 0);
        setMsg(p.message ?? "");
      } else if (p.phase === "error") {
        toast.error(p.message ?? "دانلود ناموفق بود");
        setBusy(false);
        setPct(null);
      } else if (p.phase === "done") {
        toast.success("تصاویر آفلاین کامل شد");
        setBusy(false);
        setPct(null);
      }
    });
    try {
      await runCoverSync(check);
    } catch {
      toast.error("دانلود ناموفق بود — بعداً تلاش کنید");
    } finally {
      off();
      setBusy(false);
      setPct(null);
    }
  };

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setCoversAuto(next);
    if (!next) {
      toast.message("تصاویر آفلاین خاموش شد — عکس‌ها از اینترنت لود می‌شوند");
      return;
    }
    toast.message("تصاویر آفلاین روشن شد — دانلود در پس‌زمینه ادامه می‌یابد");
    try {
      const c = await checkForUpdate();
      if (c?.packParts.length) {
        const remaining = c.packParts.length - appliedCoverCount(c.packRev);
        if (remaining > 0) await startSync(c);
      }
    } catch {
      /* next boot retries via scheduleCoverSync */
    }
  };

  return (
    <div className="glass rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-zinc-200">
            <CameraIcon width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-white">تصاویر آفلاین</p>
            {/* v0.33.0 — the «پک: ر۱۲ · نصب‌شده: ۵/۸» telemetry left the subtitle:
                revisions and chunk counts are build internals. The toggle and the
                progress bar say everything a user needs. */}
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {on
                ? "عکس‌ها آفلاین هم لود می‌شوند — دانلود در پس‌زمینه انجام می‌شود."
                : "پیش‌فرض: عکس‌ها همزمان با اسکرول از اینترنت لود می‌شوند."}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => void toggle()}
          disabled={busy}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-white/15"} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "start-[22px]" : "start-0.5"}`} />
        </button>
      </div>
      {busy && pct != null && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">{msg || "در حال دانلود"} — {pct}٪</p>
        </div>
      )}
    </div>
  );
}
