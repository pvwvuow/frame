"use client";

/* Compact inline error card for failed page loads (B-2/B-3).
 * Rendered by every page that migrated to useAsyncData — replaces the old
 * infinite-skeleton failure mode with an honest localized message + retry
 * (v0.30.10: was hardcoded Persian — leaked into EN mode). */

import { RefreshIcon } from "./Icons";
import { useI18n } from "./i18n/LocaleProvider";

export default function LoadErrorCard({ onRetry }: { onRetry: () => void }) {
  const { t: tr, dir } = useI18n();
  return (
    <div
      role="alert"
      className="mx-auto my-10 flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border border-white/10 bg-ink-700/40 px-6 py-8 text-center"
      dir={dir}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-rose-500/15 text-rose-300" aria-hidden>
        <RefreshIcon width={20} height={20} />
      </span>
      <p className="text-sm font-black text-white">{tr("error.loadFailed")}</p>
      <p className="text-xs leading-6 text-zinc-500">{tr("error.loadFailedHint")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-white transition hover:bg-white/10"
      >
        <RefreshIcon width={15} height={15} /> {tr("nav.retry")}
      </button>
    </div>
  );
}
