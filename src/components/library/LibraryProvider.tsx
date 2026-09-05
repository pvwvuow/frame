"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ListStatus } from "@/lib/library";

type Profile = { displayName: string; avatar: number; reduceMotion: boolean };

type Ctx = {
  ready: boolean;
  profile: Profile;
  /** watchlist: titleId -> status */
  list: Map<number, ListStatus>;
  favorites: Set<number>;
  ratings: Map<number, number>;
  inList: (id: number) => boolean;
  isFavorite: (id: number) => boolean;
  scoreOf: (id: number) => number | null;
  toggleList: (id: number, name?: string) => Promise<void>;
  toggleFavorite: (id: number, name?: string) => Promise<void>;
  setStatus: (id: number, status: ListStatus) => Promise<void>;
  rate: (id: number, score: number) => Promise<void>;
  refresh: () => Promise<void>;
  setProfile: (p: Partial<Profile>) => void;
};

const LibraryCtx = createContext<Ctx | null>(null);

export function useLibrary() {
  const ctx = useContext(LibraryCtx);
  if (!ctx) throw new Error("useLibrary must be used inside LibraryProvider");
  return ctx;
}


async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}`);
  return (await r.json()) as T;
}

export default function LibraryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Map<number, ListStatus>>(new Map());
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Map<number, number>>(new Map());
  const [profile, setProfileState] = useState<Profile>({ displayName: "کاربر نما", avatar: 0, reduceMotion: false });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await call<{
        watchlist: { titleId: number; status: ListStatus }[];
        favorites: number[];
        ratings: { titleId: number; score: number }[];
        profile: Profile;
      }>("/api/library", "GET");
      setList(new Map(d.watchlist.map((w) => [w.titleId, w.status])));
      setFavorites(new Set(d.favorites));
      setRatings(new Map(d.ratings.map((r) => [r.titleId, r.score])));
      setProfileState(d.profile);
    } catch {
      /* offline – keep optimistic state */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = profile.reduceMotion ? "1" : "0";
  }, [profile.reduceMotion]);

  /** debounce server component refresh so pages like /my-list stay in sync */
  const softRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 350);
  }, [router]);

  const toggleList = useCallback(
    async (id: number, name?: string) => {
      const was = list.has(id);
      setList((m) => {
        const n = new Map(m);
        if (was) n.delete(id);
        else n.set(id, "planned");
        return n;
      });
      try {
        const d = await call<{ inList: boolean }>("/api/watchlist", "POST", { titleId: id, value: !was });
        toast.success(d.inList ? `«${name ?? "عنوان"}» به لیست شما اضافه شد` : `«${name ?? "عنوان"}» از لیست حذف شد`, {
          action: d.inList ? { label: "مشاهده لیست", onClick: () => router.push("/my-list") } : undefined,
        });
        softRefresh();
      } catch {
        setList((m) => {
          const n = new Map(m);
          if (was) n.set(id, "planned");
          else n.delete(id);
          return n;
        });
        toast.error("ارتباط با سرور برقرار نشد");
      }
    },
    [list, router, softRefresh]
  );

  const toggleFavorite = useCallback(
    async (id: number, name?: string) => {
      const was = favorites.has(id);
      setFavorites((s) => {
        const n = new Set(s);
        if (was) n.delete(id);
        else n.add(id);
        return n;
      });
      try {
        const d = await call<{ isFavorite: boolean }>("/api/favorites", "POST", { titleId: id, value: !was });
        toast.success(d.isFavorite ? `«${name ?? "عنوان"}» به علاقه‌مندی‌ها اضافه شد ❤️` : `«${name ?? "عنوان"}» از علاقه‌مندی‌ها حذف شد`, {
          action: d.isFavorite ? { label: "علاقه‌مندی‌ها", onClick: () => router.push("/favorites") } : undefined,
        });
        softRefresh();
      } catch {
        setFavorites((s) => {
          const n = new Set(s);
          if (was) n.add(id);
          else n.delete(id);
          return n;
        });
        toast.error("ارتباط با سرور برقرار نشد");
      }
    },
    [favorites, router, softRefresh]
  );

  const setStatus = useCallback(
    async (id: number, status: ListStatus) => {
      const prev = list.get(id);
      setList((m) => new Map(m).set(id, status));
      try {
        await call("/api/watchlist", "PATCH", { titleId: id, status });
        softRefresh();
      } catch {
        setList((m) => {
          const n = new Map(m);
          if (prev) n.set(id, prev);
          else n.delete(id);
          return n;
        });
        toast.error("ذخیره وضعیت ناموفق بود");
      }
    },
    [list, softRefresh]
  );

  const rate = useCallback(
    async (id: number, score: number) => {
      const prev = ratings.get(id);
      setRatings((m) => {
        const n = new Map(m);
        if (score > 0) n.set(id, score);
        else n.delete(id);
        return n;
      });
      try {
        await call("/api/rating", "POST", { titleId: id, score });
        toast.success(score > 0 ? `امتیاز شما ثبت شد: ${score}/10` : "امتیاز شما حذف شد");
        softRefresh();
      } catch {
        setRatings((m) => {
          const n = new Map(m);
          if (prev) n.set(id, prev);
          else n.delete(id);
          return n;
        });
        toast.error("ثبت امتیاز ناموفق بود");
      }
    },
    [ratings, softRefresh]
  );

  const setProfile = useCallback((p: Partial<Profile>) => setProfileState((s) => ({ ...s, ...p })), []);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      profile,
      list,
      favorites,
      ratings,
      inList: (id) => list.has(id),
      isFavorite: (id) => favorites.has(id),
      scoreOf: (id) => ratings.get(id) ?? null,
      toggleList,
      toggleFavorite,
      setStatus,
      rate,
      refresh,
      setProfile,
    }),
    [ready, profile, list, favorites, ratings, toggleList, toggleFavorite, setStatus, rate, refresh, setProfile]
  );

  return <LibraryCtx.Provider value={value}>{children}</LibraryCtx.Provider>;
}
