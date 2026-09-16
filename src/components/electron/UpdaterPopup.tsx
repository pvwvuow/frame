"use client";

/* Updater popup (v0.10.19) — replaces the old raw sonner toasts for
 * update/error events. A designed glass card, bottom-center, with the same
 * visual language as the home hero: the white pill (پخش) and the glass pill
 * (جزئیات بیشتر) as its action buttons, brand-red progress while the
 * installer downloads. */

import { useEffect, useState } from "react";
import { create } from "zustand";
import { CloseIcon, DownloadIcon, RefreshIcon } from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";
import { bridge } from "@/lib/platform";
import { GlassButton, GlassCard } from "../ui/glass";

type UpdStatus = "idle" | "available" | "downloading" | "downloaded" | "error";

type UpdState = {
  status: UpdStatus;
  version?: string;
  percent?: number;
  message?: string;
  /* v0.34.2 — differential honesty: deltaArmed says whether the old installer
   * was splicable when the download started (win32 cache seed), mode says
   * what the finished download actually was. "full" when the differential
   * failed and the whole installer came over the wire. */
  mode?: "delta" | "full";
  deltaArmed?: boolean;
  /* v0.38.1 — consent-based download: the installer size on "available",
   * live transferred/total bytes while downloading. */
  size?: number;
  transferred?: number;
  total?: number;
  push: (s: {
    status: UpdStatus; version?: string; percent?: number; message?: string;
    mode?: "delta" | "full"; deltaArmed?: boolean;
    size?: number; transferred?: number; total?: number;
  }) => void;
  dismiss: () => void;
};

const useUpdStore = create<UpdState>((set) => ({
  status: "idle",
  push: (s) => set({ ...s }),
  dismiss: () => set({ status: "idle", percent: undefined, message: undefined, mode: undefined, deltaArmed: undefined, size: undefined, transferred: undefined, total: undefined }),
}));

const fmtMB = (n?: number) =>
  typeof n === "number" && n > 0 ? (n / 1048576).toFixed(n < 104857600 ? 1 : 0) : null;

export default function UpdaterPopup() {
  const { t } = useI18n();
  const status = useUpdStore((s) => s.status);
  const version = useUpdStore((s) => s.version);
  const percent = useUpdStore((s) => s.percent);
  const message = useUpdStore((s) => s.message);
  const mode = useUpdStore((s) => s.mode);
  const deltaArmed = useUpdStore((s) => s.deltaArmed);
  const size = useUpdStore((s) => s.size);
  const transferred = useUpdStore((s) => s.transferred);
  const total = useUpdStore((s) => s.total);
  const dismiss = useUpdStore((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);

  // entrance animation
  useEffect(() => {
    if (status === "idle") {
      setMounted(false);
      return;
    }
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // auto-dismiss the transient states
  useEffect(() => {
    if (status === "available") {
      // v0.38.1 — consent flow: keep the «دانلود» button reachable a bit longer
      const id = setTimeout(dismiss, 30000);
      return () => clearTimeout(id);
    }
    if (status === "error") {
      const id = setTimeout(dismiss, 12000);
      return () => clearTimeout(id);
    }
  }, [status, dismiss]);

  if (status === "idle") return null;

  const downloading = status === "downloading";
  const downloaded = status === "downloaded";
  const error = status === "error";
  const pct = typeof percent === "number" ? Math.min(100, Math.max(0, Math.round(percent))) : 0;
  /* v0.34.2 — a real delta (multi-range) emits NO progress events: the bar
   * would sit at 0% and look broken. Show the smart line instead, but keep
   * the bar whenever percent events DO arrive (a full download, or a delta
   * that failed mid-splice and fell back). */
  const showBar = downloading && (deltaArmed !== true || pct > 0);

  const retry = () => {
    void bridge()?.checkForUpdates?.();
    dismiss();
  };
  /* v0.38.1 — consent-based download: bytes only move after this click */
  const download = () => {
    void bridge()?.startUpdateDownload?.();
  };
  const install = () => {
    void bridge()?.installUpdate?.();
    dismiss();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[300] flex justify-center px-4" dir="rtl">
      {/* v0.30.0 — the popup is now a real liquid-glass card (Card Example of
       * rdev/liquid-glass-react) with liquid-glass pill actions (Button
       * Example). A dark veil keeps the text readable over bright artwork. */}
      <div
        className={`pointer-events-auto w-[min(440px,94vw)] transition-all duration-300 ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        role="status"
      >
        <GlassCard radius={30} blurAmount={0.15} displacementScale={56}>
          <div className="relative">
            <div className="absolute inset-0 rounded-[30px] bg-black/30" />
            <div className="relative p-5">
              <div className="flex items-start gap-3.5">
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${
                    error ? "bg-rose-500/15 text-rose-300 ring-rose-400/30" : "bg-brand/15 text-brand ring-brand/30"
                  }`}
                >
                  {error ? <CloseIcon width={20} height={20} /> : <DownloadIcon width={20} height={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold text-white">
                    {downloaded ? t("upd.downloadedTitle") : error ? t("upd.errorTitle") : t("upd.availableTitle")}
                    {version && !error && <span className="text-brand"> · v{version}</span>}
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-zinc-400">
                    {downloaded
                      ? mode === "delta"
                        ? t("upd.downloadedDelta")
                        : mode === "full"
                          ? t("upd.downloadedFull")
                          : t("upd.downloadedBody")
                      : error
                        ? message || t("upd.errorTitle")
                        : downloading
                          ? deltaArmed === true
                            ? t("upd.smart")
                            : t("upd.downloading")
                          : version
                            ? t("upd.availableBody", { v: version })
                            : t("upd.downloading")}
                  </p>

                  {/* v0.38.1 — honest expectation when the updater cache was
                      cold and this update necessarily comes in full. */}
                  {(downloading || status === "available") && deltaArmed === false && (
                    <p className="mt-1.5 text-[12px] leading-6 text-amber-300/90">{t("upd.fullThisTime")}</p>
                  )}

                  {/* v0.38.1 — the real megabytes, so a slow download never
                      looks stuck: transferred / total while downloading, and
                      the size up-front on the consent card. */}
                  {downloading && fmtMB(total ?? size) && (
                    <p className="mt-1 text-[11px] font-bold text-zinc-400 num" dir="ltr">
                      {fmtMB(transferred) ? `${fmtMB(transferred)} / ` : ""}{fmtMB(total ?? size)} MB
                    </p>
                  )}
                  {status === "available" && !downloading && fmtMB(size) && (
                    <p className="mt-1 text-[11px] font-bold text-zinc-400 num" dir="ltr">
                      {fmtMB(size)} MB
                    </p>
                  )}

                  {downloading && showBar && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 text-[11px] font-bold text-zinc-400 num" dir="ltr">
                        {pct}%
                      </p>
                    </div>
                  )}
                  {downloading && !showBar && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-1/3 animate-pulse rounded-full bg-brand/70" />
                    </div>
                  )}

                  {/* actions — liquid-glass pills (Button Example) */}
                  {(downloaded || error || status === "available") && (
                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      {downloaded && (
                        <GlassButton onClick={install}>
                          <span className="flex h-11 items-center gap-2 px-6 text-sm font-extrabold text-white">
                            <DownloadIcon width={16} height={16} />
                            {t("upd.installNow")}
                          </span>
                        </GlassButton>
                      )}
                      {status === "available" && (
                        <GlassButton onClick={download}>
                          <span className="flex h-11 items-center gap-2 px-6 text-sm font-extrabold text-white">
                            <DownloadIcon width={16} height={16} />
                            {t("upd.downloadNow")}
                          </span>
                        </GlassButton>
                      )}
                      {error && (
                        <GlassButton onClick={retry}>
                          <span className="flex h-11 items-center gap-2 px-6 text-sm font-extrabold text-white">
                            <RefreshIcon width={15} height={15} />
                            {t("upd.retry")}
                          </span>
                        </GlassButton>
                      )}
                      <GlassButton onClick={dismiss}>
                        <span className="flex h-11 items-center px-5 text-sm font-bold text-white/70">
                          {downloaded || status === "available" ? t("upd.later") : t("upd.dismiss")}
                        </span>
                      </GlassButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/** Feed updater events from ElectronBridge into the popup store. */
export function pushUpdaterStatus(s: {
  status: string;
  version?: string;
  percent?: number;
  message?: string;
  mode?: "delta" | "full";
  deltaArmed?: boolean;
  size?: number;
  transferred?: number;
  total?: number;
}) {
  if (s.status === "available" || s.status === "downloading" || s.status === "downloaded" || s.status === "error") {
    useUpdStore.getState().push({
      status: s.status,
      version: s.version,
      percent: s.status === "downloading" ? s.percent ?? useUpdStore.getState().percent : undefined,
      message: s.message,
      mode: s.mode,
      deltaArmed: s.deltaArmed,
      size: s.size,
      transferred: s.transferred,
      total: s.total,
    });
  }
}
