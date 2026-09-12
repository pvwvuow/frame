"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ListStatus } from "@/lib/library-shared";
import { logEvent, pushFavorite, pushRating, pushWatchlist, useCloudSession } from "@/lib/cloud";
import { attachIdentity } from "@/lib/identity";

/** v0.27.0 (DATA-4) — the local save DID succeed (the local DB is the UI's
 *  source of truth), but the CLOUD push may be queued while offline. The
 *  toast must never claim a cloud sync that has not happened yet. */
function syncAwareToast(success: () => void) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast.info("ذخیره شد — با وصل‌شدن اینترنت سینک می‌شود");
  } else {
    success();
  }
}

type Profile = { displayName: string; avatar: number; avatarImage?: string | null; reduceMotion: boolean; kidsMode?: boolean; hasPin?: boolean };

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
  /** v0.29.0 (NEW-UI-1) — the last /api/library load failed: badges/lists on
   *  screen may be STALE, not genuinely empty. UI surfaces show a banner. */
  libraryError?: boolean;
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
  const { ready: sessReady, session } = useCloudSession();
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<Map<number, ListStatus>>(new Map());
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [ratings, setRatings] = useState<Map<number, number>>(new Map());
  const [profile, setProfileState] = useState<Profile>({ displayName: "کاربر فریم", avatar: 0, avatarImage: null, reduceMotion: false });
  // v0.29.0 (NEW-UI-1) — a failed /api/library used to be swallowed and the
  // EMPTY local state was presented as reality («لیست خالی» after a server
  // hiccup). The failure is now tracked + retried once, and the UI can show it.
  const [libraryError, setLibraryError] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const attempt = async (retry: boolean): Promise<void> => {
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
        setLibraryError(false);
      } catch {
        setLibraryError(true);
        // one silent retry — transient hiccups (server restarting) should not
        // flip the whole UI into «error» mode
        if (retry) {
          await new Promise((r) => setTimeout(r, 2500));
          await attempt(false);
        }
      } finally {
        setReady(true);
      }
    };
    await attempt(true);
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

  /* v0.10.35 — per-account data spaces (جداسازی داده‌ی حساب‌ها).
   * Personal data is keyed by the `nama_uid` cookie; previously that cookie
   * never changed, so a new cloud account inherited the previous account's
   * profile, watch history and collections. Now every session transition
   * (login / account switch / sign-out) moves the local data space to that
   * account's own userKey FIRST and reloads personal data after.
   *  - known account           → its recorded space (data returns on re-login)
   *  - first account on device → adopts the current space (upgrade is seamless)
   *  - any further account     → a fresh empty space (the leak is gone)
   *  - sign-out                → fresh guest space (account data stays stored) */
  const acctId = session?.user?.id ?? null;
  const appliedAcct = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!sessReady) return;
    const target = acctId ?? null;
    const prev = appliedAcct.current;
    if (prev === target) return;
    appliedAcct.current = target;
    // Booting WITHOUT a session must never touch the cookie: an offline boot
    // that fails to restore the session would otherwise rotate away and hide
    // the user's data. Only an explicit in-run sign-out (prev was an account)
    // rotates to a fresh guest space.
    if (prev === undefined && target === null) return;
    void attachIdentity(target, session?.access_token ?? null).then((r) => {
      if (r.switched || prev !== undefined) {
        void refresh();
        softRefresh();
      }
    });
  }, [sessReady, acctId, refresh, softRefresh]);

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
        pushWatchlist(id, d.inList ? "planned" : null);
        logEvent(d.inList ? "watchlist_add" : "watchlist_remove", { titleId: id, name });
        syncAwareToast(() =>
          toast.success(d.inList ? `«${name ?? "عنوان"}» به لیست شما اضافه شد` : `«${name ?? "عنوان"}» از لیست حذف شد`, {
            action: d.inList ? { label: "مشاهده لیست", onClick: () => router.push("/my-list") } : undefined,
          })
        );
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
        pushFavorite(id, d.isFavorite);
        logEvent(d.isFavorite ? "favorite_add" : "favorite_remove", { titleId: id, name });
        syncAwareToast(() =>
          toast.success(d.isFavorite ? `«${name ?? "عنوان"}» به علاقه‌مندی‌ها اضافه شد ❤️` : `«${name ?? "عنوان"}» از علاقه‌مندی‌ها حذف شد`, {
            action: d.isFavorite ? { label: "علاقه‌مندی‌ها", onClick: () => router.push("/favorites") } : undefined,
          })
        );
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
        pushWatchlist(id, status);
        logEvent("watchlist_status", { titleId: id, status });
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
        pushRating(id, score > 0 ? score : null);
        logEvent(score > 0 ? "rate_set" : "rate_remove", { titleId: id, score });
        syncAwareToast(() => toast.success(score > 0 ? `امتیاز شما ثبت شد: ${score}/10` : "امتیاز شما حذف شد"));
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
      libraryError,
    }),
    [ready, profile, list, favorites, ratings, toggleList, toggleFavorite, setStatus, rate, refresh, setProfile, libraryError]
  );

  return <LibraryCtx.Provider value={value}>{children}</LibraryCtx.Provider>;
}
