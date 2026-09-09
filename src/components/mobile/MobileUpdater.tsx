"use client";

/* v0.12.0 — Android in-app update UI.
 *
 *  MobileUpdater — mounted once in the root layout; silently checks GitHub
 *    releases once per 24h and toasts when an update exists; v0.16.0 also
 *    bootstraps the split cover packs in the background (resumable chunks).
 *  MobileUpdateCard — the Settings card: current version, check button,
 *    download progress (code OTA / cover packs / APK), install/apply.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getInstallInfo, nativeBridge } from "@/lib/native-bridge";
import {
  checkForUpdate,
  performUpdate,
  runCoverSync,
  scheduleAutoUpdateCheck,
  scheduleCoverSync,
  onUpdateProgress,
  installedCoversRev,
  appliedCoverCount,
  type UpdateCheck,
} from "@/lib/self-update";
import { fmtBytes, resumeQueueOnBoot } from "@/lib/mobile-downloads";
import { DownloadIcon } from "../Icons";

export default function MobileUpdater() {
  useEffect(() => {
    if (!nativeBridge()) return;
    // interrupted offline downloads continue after boot
    void resumeQueueOnBoot();
    scheduleAutoUpdateCheck((c) => {
      if (c.coversOnly) return; // cover packs sync silently below
      toast("به‌روزرسانی جدید در دسترس است", {
        description: `نسخهٔ ${c.version.replace(/^v/, "")} آمادهٔ دانلود است${
          c.ota ? ` و فقط ${fmtBytes(c.bundleSize ?? 0)} دانلود می‌شود — بدون نصب مجدد.` : "."
        }`,
        action: {
          label: "به‌روزرسانی",
          onClick: () => {
            void performUpdate(c).then((mode) => {
              if (mode === "ota") toast.success("به‌روزرسانی انجام شد — فریم تازه‌سازی می‌شود");
            }).catch(() => toast.error("به‌روزرسانی ناموفق بود — بعداً تلاش کنید"));
          },
        },
        duration: 12000,
      });
    });
    // cover packs: silent background sync (runs every boot until complete)
    scheduleCoverSync();
  }, []);
  return null;
}

const PHASE_LABEL: Record<string, string> = {
  download: "در حال دانلود",
  apply: "نصب…",
  install: "آمادهٔ نصب",
  covers: "کاورها",
};

export function MobileUpdateCard() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getInstallInfo>>>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [progress, setProgress] = useState<{ pct: number; phase: string; msg?: string } | null>(null);
  const [coversDone, setCoversDone] = useState<{ done: number; total: number } | null>(null);
  const show = !!nativeBridge();

  useEffect(() => {
    if (!show) return;
    void getInstallInfo(true).then(setInfo);
  }, [show]);

  if (!show) return null;

  const doCheck = async () => {
    setChecking(true);
    try {
      const c = await checkForUpdate();
      setCheck(c);
      if (!c) toast.error("بررسی به‌روزرسانی ناموفق بود — اینترنت را چک کنید");
      else if (c.coversOnly) {
        const total = c.packParts.length;
        const done = appliedCoverCount(c.packRev);
        setCoversDone({ done, total });
        toast.message(
          `به‌روزرسانی کاورها (ر${c.packRev}) در دسترس است — ${done}/${total} بسته نصب شده`,
        );
      } else if (!c.available) toast.success(`فریم به‌روز است (v${c.current})`);
      else if (c.ota) toast.message(`نسخهٔ ${c.version.replace(/^v/, "")} در دسترس است — فقط ${fmtBytes(c.bundleSize ?? 0)}`);
      else toast.message(`نسخهٔ ${c.version.replace(/^v/, "")} در دسترس است`);
    } finally {
      setChecking(false);
    }
  };

  const doUpdate = async () => {
    if (!check?.available) return;
    setBusy(true);
    setProgress({ pct: 0, phase: "download" });
    const off = onUpdateProgress((p) => {
      if (p.phase === "covers") {
        setProgress({ pct: p.total ? Math.round(((p.received ?? 0) / p.total) * 100) : 0, phase: "covers", msg: p.message });
      } else if (p.phase === "download" && p.total) {
        setProgress({ pct: Math.round(((p.received ?? 0) / p.total) * 100), phase: "download" });
      } else if (p.phase === "apply") setProgress({ pct: 100, phase: "apply" });
      else if (p.phase === "install") setProgress({ pct: 100, phase: "install" });
      else if (p.phase === "error") {
        toast.error(p.message ?? "به‌روزرسانی ناموفق بود");
        setBusy(false);
        setProgress(null);
      } else if (p.phase === "done") {
        if (check.ota) toast.success("به‌روزرسانی انجام شد — فریم تازه‌سازی می‌شود");
        if (check.apk) toast.success("لینک دانلود در مرورگر باز شد — پس از نصب، برنامه را باز کنید");
        if (check.coversOnly) toast.success("کاورها کامل شد");
        setBusy(false);
        setProgress(null);
      }
    });
    try {
      if (check.coversOnly) {
        // covers path directly — resumable, may bootstrap the web root first
        await runCoverSync(check);
      } else {
        await performUpdate(check);
      }
    } catch {
      toast.error("به‌روزرسانی ناموفق بود — دوباره تلاش کنید");
      setProgress(null);
    } finally {
      setBusy(false);
      off();
    }
  };

  const coversTotal = check?.packParts.length ?? 0;
  const packBytes = check?.packParts.reduce((s, p) => s + p.size, 0) ?? 0;
  const phaseLabel = progress
    ? progress.phase === "covers"
      ? `${progress.msg ?? "کاورها"} ${progress.pct}٪`
      : progress.phase === "download"
        ? `${progress.pct}٪`
        : PHASE_LABEL[progress.phase] ?? ""
    : check?.coversOnly
      ? "کاورها"
      : check?.ota
        ? "به‌روزرسانی"
        : "نصب نسخهٔ جدید";

  return (
    <div className="glass rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-zinc-200">
            <DownloadIcon width={18} height={18} />
          </span>
          <div>
            <p className="text-sm font-bold text-white">به‌روزرسانی برنامه</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              نسخهٔ نصب‌شده: v{info?.versionName ?? "…"}
              {info?.otaVersion ? ` · به‌روزرسانی درجا: ${info.otaVersion.replace(/^v/, "")}` : ""}
              {info ? ` · کاورها: ر${installedCoversRev(info.coversRev)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void doCheck()}
            disabled={checking || busy}
            className="h-9 rounded-full border border-white/15 px-4 text-xs font-bold text-white/90 transition hover:bg-white/10 disabled:opacity-50"
          >
            {checking ? "بررسی…" : "بررسی"}
          </button>
          {check?.available && (
            <button
              type="button"
              onClick={() => void doUpdate()}
              disabled={busy}
              className="h-9 rounded-full bg-brand px-4 text-xs font-black text-white transition hover:bg-brand/85 disabled:opacity-50"
            >
              {phaseLabel}
            </button>
          )}
        </div>
      </div>
      {check?.available && (
        <p className="mt-3 text-[11px] leading-5 text-zinc-500">
          {check.apk
            ? "این نسخه شامل تغییرات سیستمی است — صفحهٔ دانلود در مرورگر باز می‌شود؛ مثل بار اول نصب کنید (تنظیمات و سابقهٔ شما حفظ می‌شود)."
            : check.ota
              ? `این به‌روزرسانی «درجا» نصب می‌شود (${fmtBytes(check.bundleSize ?? 0)}) — نیازی به دانلود کل برنامه نیست.`
              : `کاورهای ${coversTotal} بسته‌ای (${fmtBytes(packBytes)}) در پس‌زمینه نصب می‌شوند — بسته‌های نیمه‌کاره از سر گرفته می‌شوند.`}
        </p>
      )}
      {coversDone && !check?.available && (
        <p className="mt-3 text-[11px] leading-5 text-zinc-500">کاورها به‌روز هستند.</p>
      )}
    </div>
  );
}
