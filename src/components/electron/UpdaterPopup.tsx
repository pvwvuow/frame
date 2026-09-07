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

type UpdStatus = "idle" | "available" | "downloading" | "downloaded" | "error";

type UpdState = {
  status: UpdStatus;
  version?: string;
  percent?: number;
  message?: string;
  push: (s: { status: UpdStatus; version?: string; percent?: number; message?: string }) => void;
  dismiss: () => void;
};

const useUpdStore = create<UpdState>((set) => ({
  status: "idle",
  push: (s) => set({ ...s }),
  dismiss: () => set({ status: "idle", percent: undefined, message: undefined }),
}));

export default function UpdaterPopup() {
  const { t } = useI18n();
  const status = useUpdStore((s) => s.status);
  const version = useUpdStore((s) => s.version);
  const percent = useUpdStore((s) => s.percent);
  const message = useUpdStore((s) => s.message);
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
      const id = setTimeout(dismiss, 7000);
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

  const retry = () => {
    void bridge()?.checkForUpdates?.();
    dismiss();
  };
  const install = () => {
    void bridge()?.installUpdate?.();
    dismiss();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[300] flex justify-center px-4" dir="rtl">
      <div
        className={`pointer-events-auto w-[min(440px,94vw)] rounded-3xl border border-white/10 bg-ink-800/95 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        }`}
        role="status"
      >
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
                ? t("upd.downloadedBody")
                : error
                  ? message || t("upd.errorTitle")
                  : downloading
                    ? t("upd.downloading")
                    : version
                      ? t("upd.availableBody", { v: version })
                      : t("upd.downloading")}
            </p>

            {downloading && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] font-bold text-zinc-400 num" dir="ltr">
                  {pct}%
                </p>
              </div>
            )}

            {/* actions — the home-page pill language: white primary + glass secondary */}
            {(downloaded || error) && (
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {downloaded && (
                  <button
                    type="button"
                    onClick={install}
                    className="flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-black shadow-[0_10px_40px_rgba(255,255,255,0.15)] transition hover:scale-[1.03] hover:bg-zinc-200"
                  >
                    <DownloadIcon width={16} height={16} />
                    {t("upd.installNow")}
                  </button>
                )}
                {error && (
                  <button
                    type="button"
                    onClick={retry}
                    className="flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-black transition hover:scale-[1.03] hover:bg-zinc-200"
                  >
                    <RefreshIcon width={15} height={15} />
                    {t("upd.retry")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex h-11 items-center rounded-full border border-white/20 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
                >
                  {downloaded ? t("upd.later") : t("upd.dismiss")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Feed updater events from ElectronBridge into the popup store. */
export function pushUpdaterStatus(s: { status: string; version?: string; percent?: number; message?: string }) {
  if (s.status === "available" || s.status === "downloading" || s.status === "downloaded" || s.status === "error") {
    useUpdStore.getState().push({
      status: s.status,
      version: s.version,
      percent: s.status === "downloading" ? s.percent ?? useUpdStore.getState().percent : undefined,
      message: s.message,
    });
  }
}
