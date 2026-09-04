"use client";

import { Pause, Play, Check, X, Download, ArrowDown, HardDrive } from "lucide-react";
import { getById, faNum, type DownloadTask } from "@/lib/nova-data";
import type { NovaState } from "@/app/page";

/* ============ Floating mini bar ============ */
export function DownloadsBar({
  downloads,
  onOpen,
}: {
  downloads: DownloadTask[];
  onOpen: () => void;
}) {
  const active = downloads.filter((d) => d.status === "active");
  const main = active[0];
  if (!main) return null;

  return (
    <button
      onClick={onOpen}
      className="lg lg-strong fixed bottom-5 start-5 z-40 w-80 rounded-3xl p-4 text-start transition-transform duration-300 hover:-translate-y-1"
      aria-label="مشاهده دانلودها"
    >
      <div className="mb-2.5 flex items-center gap-2.5 text-[12px]">
        <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-amber-400/20 text-amber-300">
          <Download size={16} />
          <span className="pulse-dot absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <div className="flex-1">
          <div className="font-bold">{main.label}</div>
          <div className="text-[10.5px] text-muted-foreground tabular">
            {faNum(main.speed.toFixed(1))} مگابایت/ثانیه • {faNum(active.length)} دانلود فعال
          </div>
        </div>
        <span className="tabular text-[13px] font-black text-amber-300">{faNum(Math.round(main.percent))}٪</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="relative h-full rounded-full bg-gradient-to-l from-amber-300 to-orange-500 transition-all duration-700" style={{ width: `${main.percent}%` }}>
          <div className="shimmer absolute inset-0" />
        </div>
      </div>
    </button>
  );
}

/* ============ Full downloads view ============ */
export function DownloadsView({
  downloads,
  nova,
  setDownloads,
}: {
  downloads: DownloadTask[];
  nova: NovaState;
  setDownloads: React.Dispatch<React.SetStateAction<DownloadTask[]>>;
}) {
  const toggle = (id: string) =>
    setDownloads((ds) =>
      ds.map((d) =>
        d.id === id ? { ...d, status: d.status === "active" ? "paused" : "active", speed: d.status === "active" ? 0 : 8.4 } : d
      )
    );
  const remove = (id: string) => setDownloads((ds) => ds.filter((d) => d.id !== id));

  const activeCount = downloads.filter((d) => d.status === "active").length;
  const doneCount = downloads.filter((d) => d.status === "done").length;

  return (
    <div className="space-y-4">
      {/* summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "در حال دانلود", value: faNum(activeCount), color: "text-amber-300", icon: ArrowDown },
          { label: "کامل‌شده", value: faNum(doneCount), color: "text-emerald-400", icon: Check },
          { label: "حجم کل دانلودها", value: `${faNum("37.4")} GB`, color: "text-violet-300", icon: HardDrive },
        ].map((s) => (
          <div key={s.label} className="lg lg-pill rounded-2xl p-4">
            <div className={`mb-2 grid h-9 w-9 place-items-center rounded-xl bg-white/8 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <div className="tabular text-xl font-black">{s.value}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* tasks */}
      {downloads.length === 0 && (
        <div className="lg lg-pill mt-8 rounded-3xl p-12 text-center text-muted-foreground">
          دانلودی وجود ندارد
        </div>
      )}

      {downloads.map((d) => {
        const item = getById(d.itemId);
        return (
          <div key={d.id} className="lg lg-pill flex items-center gap-4 rounded-2xl p-4">
            { }
            <img
              src={item?.poster}
              alt=""
              className="h-16 w-11 shrink-0 rounded-lg border border-white/15 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="truncate text-[13px] font-bold">{d.label}</span>
                <span className="shrink-0 rounded-full border border-white/20 bg-white/8 px-2 py-0.5 text-[9.5px] font-black">
                  {d.quality}
                </span>
                {d.status === "done" && (
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-400">
                    کامل شد
                  </span>
                )}
                {d.status === "paused" && (
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-bold text-muted-foreground">
                    متوقف
                  </span>
                )}
              </div>
              <div className="mb-1.5 flex items-center gap-3 text-[10.5px] text-muted-foreground tabular">
                {d.status === "active" && <span className="flex items-center gap-1 text-amber-300"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber-300" />{faNum(d.speed.toFixed(1))} MB/s</span>}
                {d.status === "paused" && <span>در انتظار ادامه</span>}
                {d.status === "done" && <span>آماده پخش آفلاین</span>}
                <span>•</span>
                <span>{item?.sizeGb[d.quality] ? `${faNum(item.sizeGb[d.quality])} گیگابایت` : "—"}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`relative h-full rounded-full transition-all duration-700 ${
                    d.status === "done"
                      ? "bg-emerald-400"
                      : "bg-gradient-to-l from-amber-300 to-orange-500"
                  }`}
                  style={{ width: `${d.percent}%` }}
                >
                  {d.status === "active" && <div className="shimmer absolute inset-0" />}
                </div>
              </div>
            </div>
            <div className="tabular w-12 text-center text-[13px] font-black text-amber-300">
              {faNum(Math.round(d.percent))}٪
            </div>
            <div className="flex gap-2">
              {d.status !== "done" && (
                <button
                  onClick={() => toggle(d.id)}
                  className="lg-btn grid h-10 w-10 place-items-center rounded-xl"
                  aria-label={d.status === "active" ? "توقف دانلود" : "ادامه دانلود"}
                >
                  {d.status === "active" ? <Pause size={15} /> : <Play size={15} />}
                </button>
              )}
              {d.status === "done" && item && (
                <button
                  onClick={() => nova.playItem(item)}
                  className="lg-btn grid h-10 w-10 place-items-center rounded-xl"
                  aria-label="پخش"
                >
                  <Play size={15} />
                </button>
              )}
              <button
                onClick={() => remove(d.id)}
                className="lg-btn grid h-10 w-10 place-items-center rounded-xl hover:!bg-red-500/25"
                aria-label="حذف دانلود"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
