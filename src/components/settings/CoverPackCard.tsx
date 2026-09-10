"use client";

/* v0.25.0 — Settings › تصاویر آفلاین (cover packs, OPT-IN).
 *
 * The default experience streams every poster/backdrop from metahub per-<img>
 * as the user scrolls — zero bulk downloads. Users who want the artwork to
 * also work OFFLINE can opt into the split cover packs here (~12MB chunks,
 * resumable, merged into the live web root by the native applyCoverPack).
 * Turning it on starts a sync right away and re-arms the silent boot sync
 * (scheduleCoverSync) until the newest rev is complete.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getInstallInfo, nativeBridge } from "@/lib/native-bridge";
import {
  checkForUpdate,
  runCoverSync,
  onUpdateProgress,
  installedCoversRev,
  appliedCoverCount,
  coversAutoEnabled,
  setCoversAuto,
  type UpdateCheck,
} from "@/lib/self-update";
import { fmtBytes } from "@/lib/mobile-downloads";
import { CameraIcon } from "../Icons";

export default function CoverPackCard() {
  const [show, setShow] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [packInfo, setPackInfo] = useState<{ parts: number; bytes: number; rev: number } | null>(null);

  useEffect(() => {
    if (!nativeBridge()) return;
    setShow(true);
    setOn(coversAutoEnabled());
    void (async () => {
      try {
        const c = await checkForUpdate();
        if (c?.packParts.length) setPackInfo({ parts: c.packParts.length, bytes: c.packParts.reduce((s, p) => s + p.size, 0), rev: c.packRev });
      } catch {
        /* ignore */
      }
    })();
  }, []);

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

  const localRev = installedCoversRev(undefined); // max(native baseline, merged parts)

  return (
    <div className="glass rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-zinc-200">
            <CameraIcon width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-white">تصاویر آفلاین (پک کاور)</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              پیش‌فرض: عکس‌ها همزمان با اسکرول از اینترنت لود می‌شوند — بدون دانلود یکجا.
              {packInfo ? ` · پک: ر${packInfo.rev} (${packInfo.parts} بسته ≈ ${fmtBytes(packInfo.bytes)})` : ""}
              {packInfo ? ` · نصب‌شده: ${appliedCoverCount(packInfo.rev)}/${packInfo.parts} (ر${localRev})` : ""}
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
