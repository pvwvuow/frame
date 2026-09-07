"use client";

/* Downloads manager UI (v0.10.19) — the dedicated «دانلودها» page:
 *   • live queue: progress, speed, pause/resume/cancel (up to 2 parallel)
 *   • completed files: open the folder / reveal the file in Explorer
 *   • failed transfers: one-click resume
 *   • the Frame storage folder: choose it, open it, see the auto-organization
 *     (Frame/Movies/<Name (Year)>/… · Frame/Series/<Name>/Season 01/…) */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircleIcon,
  CloseIcon,
  DownloadIcon,
  ExternalIcon,
  FolderIcon,
  FolderPlusIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";
import { useIsElectron } from "@/lib/platform";
import type { DownloadItem } from "@/lib/platform";
import {
  dlCancel,
  dlChooseDir,
  dlOpenFolder,
  dlPause,
  dlRemove,
  dlResume,
  fmtBytes,
  fmtSpeed,
  groupItems,
  useDownloadState,
} from "@/lib/downloads";

export default function DownloadsClient() {
  const { t } = useI18n();
  const electron = useIsElectron();
  const [state, setState] = useState<{ dir: string | null; items: DownloadItem[] }>({ dir: null, items: [] });

  useDownloadState((s) => setState({ dir: s.dir, items: s.items ?? [] }));

  // keep polling in case an event burst was missed
  useEffect(() => {
    if (!electron) return;
    const id = setInterval(() => {
      void window.nama?.downloads?.getState().then((s) => setState({ dir: s.dir, items: s.items ?? [] }));
    }, 3000);
    return () => clearInterval(id);
  }, [electron]);

  const g = groupItems(state.items || []);
  const total = state.items?.length ?? 0;
  const isEmpty = total === 0;

  const choose = async () => {
    const dir = await dlChooseDir();
    if (dir) toast.success(t("dl.folderTitle") + ": " + dir);
  };

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-20 pt-28 sm:px-8 lg:px-12 lg:pt-36" dir="rtl">
      {/* header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black text-white">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand ring-1 ring-brand/30">
              <DownloadIcon width={24} height={24} />
            </span>
            {t("dl.title")}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">{t("dl.subtitle")}</p>
        </div>
        {electron && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={choose}
              className="flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              <FolderPlusIcon width={16} height={16} />
              {state.dir ? t("dl.change") : t("dl.choose")}
            </button>
            <button
              type="button"
              onClick={() => dlOpenFolder(null)}
              disabled={!state.dir}
              className="flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 text-sm font-bold text-zinc-200 transition hover:bg-white/15 disabled:opacity-40"
            >
              <ExternalIcon width={15} height={15} />
              {t("dl.openFolder")}
            </button>
          </div>
        )}
      </header>

      {!electron && (
        <div className="mb-8 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-5 text-sm leading-7 text-amber-100">
          {t("dl.webOnlyNote")}
        </div>
      )}

      {/* folder card */}
      {electron && (
        <section className="mb-10 rounded-3xl border border-white/5 bg-ink-700/40 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-300">
                <FolderIcon width={20} height={20} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-white">{t("dl.folderTitle")}</p>
                <p className="truncate text-xs text-zinc-400" dir="ltr">
                  {state.dir ? state.dir + "\\Frame" : t("dl.folderEmpty")}
                </p>
              </div>
            </div>
            {!state.dir && (
              <button
                type="button"
                onClick={choose}
                className="flex h-10 items-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                <FolderPlusIcon width={16} height={16} />
                {t("dl.choose")}
              </button>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-white/5 bg-black/20 p-4">
            <p className="mb-2.5 text-[11px] font-bold text-zinc-400">{t("dl.structureTitle")}</p>
            <pre className="overflow-x-auto text-[11px] leading-6 text-zinc-500" dir="ltr">
{`Frame/
├─ Movies/
│  └─ Inception (2010)/
│     └─ Inception (2010) - 1080p.mkv
└─ Series/
   └─ Breaking Bad (2008)/
      └─ Season 01/
         └─ Breaking Bad S01E04 - 720p.mkv`}
            </pre>
            <p className="mt-2.5 text-[11px] leading-5 text-zinc-500">{t("dl.folderHint")}</p>
          </div>
        </section>
      )}

      {/* lists */}
      {electron && isEmpty && (
        <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-zinc-500">
            <DownloadIcon width={28} height={28} />
          </span>
          <p className="mt-5 text-lg font-black text-white">{t("dl.page")}</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-500">{t("dl.empty")}</p>
        </div>
      )}

      {electron && !isEmpty && (
        <div className="space-y-10">
          <Section title={t("dl.active")} items={g.active} accent />
          <Section title={t("dl.queued")} items={g.queued} />
          <Section title={t("dl.paused")} items={g.paused} />
          <Section title={t("dl.completed")} items={g.completed} />
          <Section title={t("dl.failed")} items={g.failed} />
        </div>
      )}
    </main>
  );
}

function Section({ title, items, accent = false }: { title: string; items: DownloadItem[]; accent?: boolean }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-white">
        {accent && <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />}
        {title}
        <span className="text-sm font-normal text-zinc-500">({items.length})</span>
      </h2>
      <ul className="space-y-3">
        {items.map((it) => (
          <ItemCard key={it.id} it={it} />
        ))}
      </ul>
    </section>
  );
}

function ItemCard({ it }: { it: DownloadItem }) {
  const { t } = useI18n();
  const pct = it.total > 0 ? Math.min(100, Math.round((it.received / it.total) * 100)) : 0;
  const eta = it.speed > 0 && it.total > it.received ? Math.round((it.total - it.received) / it.speed) : 0;

  return (
    <li className="rounded-2xl border border-white/5 bg-ink-700/40 p-4 transition hover:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${it.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : it.status === "failed" ? "bg-rose-500/15 text-rose-300" : "bg-white/5 text-zinc-300"}`}>
          {it.status === "completed" ? <CheckCircleIcon width={18} height={18} /> : it.status === "failed" ? <CloseIcon width={16} height={16} /> : <DownloadIcon width={17} height={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {it.name}
            {it.year > 1900 ? <span className="text-zinc-500"> ({it.year})</span> : null}
          </p>
          <p className="truncate text-[11px] text-zinc-500">
            {it.label || (it.kind === "series" ? `S${String(it.season || 1).padStart(2, "0")}E${String(it.episode || 1).padStart(2, "0")}` : "فیلم")}
            {it.quality ? ` · ${it.quality}` : ""}
            {it.variant ? ` · ${it.variant}` : ""}
            {it.status === "completed" && it.filePath ? <span className="block truncate text-zinc-600" dir="ltr">{it.filePath}</span> : null}
            {it.status === "failed" && it.error ? <span className="block text-rose-300/80">{it.error}</span> : null}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {(it.status === "downloading" || it.status === "queued") && (
            <button type="button" onClick={() => dlPause(it.id)} title={t("dl.pause")} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-200 transition hover:bg-white/15">
              <PauseIcon width={15} height={15} />
            </button>
          )}
          {(it.status === "paused" || it.status === "failed") && (
            <button type="button" onClick={() => dlResume(it.id)} title={t("dl.resume")} className="grid h-9 w-9 place-items-center rounded-full bg-brand/15 text-brand transition hover:bg-brand/30">
              <PlayIcon width={15} height={15} />
            </button>
          )}
          {(it.status === "downloading" || it.status === "queued" || it.status === "paused" || it.status === "failed") && (
            <button type="button" onClick={() => dlCancel(it.id)} title={t("dl.cancel")} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-300 transition hover:bg-rose-500/20 hover:text-rose-200">
              <CloseIcon width={14} height={14} />
            </button>
          )}
          {(it.status === "completed" || it.status === "paused") && (
            <button type="button" onClick={() => dlOpenFolder(it.id)} title={t("dl.showInFolder")} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-300 transition hover:bg-white/15">
              <FolderIcon width={15} height={15} />
            </button>
          )}
          {it.status !== "downloading" && it.status !== "queued" && (
            <button type="button" onClick={() => dlRemove(it.id)} title={t("dl.remove")} className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-zinc-500 transition hover:bg-rose-500/20 hover:text-rose-200">
              <TrashIcon width={14} height={14} />
            </button>
          )}
        </div>
      </div>

      {(it.status === "downloading" || it.status === "paused" || it.status === "queued") && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <span className="num font-bold text-zinc-300">{pct}٪</span>
            <span dir="ltr">
              {fmtBytes(it.received)} / {it.total > 0 ? fmtBytes(it.total) : "—"}
            </span>
            {it.status === "downloading" && <span dir="ltr" className="text-brand">{fmtSpeed(it.speed)}</span>}
            {eta > 0 && it.status === "downloading" && <span>~ {Math.floor(eta / 60)}:{String(eta % 60).padStart(2, "0")} {t("dl.remaining")}</span>}
          </div>
        </div>
      )}
    </li>
  );
}
