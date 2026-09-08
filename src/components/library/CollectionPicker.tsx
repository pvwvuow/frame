"use client";

/* مجموعه‌های من — انتخابگر/مدیریت از صفحه‌ی هر عنوان (v0.10.32).
 * هر عنوان را می‌توان در چند کالکشن شخصی گذاشت؛ کالکشن‌ها با اکانت سینک می‌شوند. */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CloseIcon, FolderPlusIcon, LayersIcon, CheckIcon, PlusIcon } from "../Icons";
import {
  collectionsContainingTitle,
  createCollection,
  fetchUserCollections,
  setCollectionItem,
  type UCollection,
} from "@/lib/collections";

export default function CollectionPicker({
  titleId,
  titleName,
  onClose,
  onChanged,
}: {
  titleId: number;
  titleName?: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [cols, setCols] = useState<UCollection[] | null>(null);
  const [inside, setInside] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [list, ids] = await Promise.all([fetchUserCollections(), collectionsContainingTitle(titleId)]);
      if (!alive) return;
      setCols(list);
      setInside(new Set(ids));
    })();
    return () => {
      alive = false;
    };
  }, [titleId]);

  async function toggle(c: UCollection) {
    const was = inside.has(c.id);
    setInside((s) => {
      const n = new Set(s);
      if (was) n.delete(c.id);
      else n.add(c.id);
      return n;
    });
    try {
      await setCollectionItem(c.id, c.name, titleId, !was);
      toast.success(was ? `از «${c.name}» حذف شد` : `به «${c.name}» اضافه شد`);
      onChanged?.();
    } catch {
      setInside((s) => {
        const n = new Set(s);
        if (was) n.add(c.id);
        else n.delete(c.id);
        return n;
      });
      toast.error("ذخیره نشد — دوباره تلاش کن");
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r = await createCollection(name);
      setCols((l) => [
        ...(l ?? []),
        { id: r.id, name: r.name, count: 0, posters: [], movies: 0, series: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);
      setNewName("");
      if (titleId) {
        await setCollectionItem(r.id, r.name, titleId, true);
        setInside((s) => new Set(s).add(r.id));
      }
      toast.success(`مجموعه «${r.name}» ساخته شد`);
      onChanged?.();
    } catch {
      toast.error("ساخت مجموعه ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-black text-white">
            <LayersIcon width={16} height={16} className="text-brand" />
            افزودن به مجموعه
            {titleName ? <span className="max-w-[120px] truncate text-[11px] font-bold text-zinc-500">· {titleName}</span> : null}
          </p>
          <button type="button" onClick={onClose} aria-label="بستن" className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white">
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-3">
          {cols === null ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : cols.length === 0 ? (
            <p className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs leading-6 text-zinc-500">
              هنوز مجموعه‌ای نداری — اولین مجموعه‌ات را بساز و این عنوان را داخلش بگذار.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {cols.map((c) => {
                const on = inside.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => void toggle(c)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right transition ${
                        on ? "border-brand/50 bg-brand/10" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.07]"
                      }`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${on ? "border-brand bg-brand text-white" : "border-white/20 text-transparent"}`}>
                        <CheckIcon width={13} height={13} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white">{c.name}</span>
                      <span className="num shrink-0 text-[11px] font-bold text-zinc-500">{c.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createAndAdd()}
              placeholder="نام مجموعه جدید…"
              maxLength={60}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-[13px] font-bold text-white outline-none placeholder:text-zinc-600 focus:border-brand/60"
            />
            <button
              type="button"
              onClick={() => void createAndAdd()}
              disabled={busy || !newName.trim()}
              aria-label="ساخت مجموعه"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand-600 disabled:opacity-40"
            >
              <PlusIcon width={16} height={16} />
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 px-1 text-[10px] font-bold text-zinc-600">
            <FolderPlusIcon width={11} height={11} />
            مجموعه‌ها با حسابت همگام می‌شوند
          </p>
        </div>
      </div>
    </div>
  );
}
