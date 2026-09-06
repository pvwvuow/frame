"use client";

/* Frame × Supabase cloud sync (client-side only).
 *
 * What syncs to the cloud (per user request):
 *   - favorites / watchlist / ratings  → cloud tables (RLS: each user sees only their own rows)
 *   - activity log (user_events)       → every meaningful action is recorded
 *
 * What stays LOCAL on purpose (per user request):
 *   - watch progress ("کجای فیلم تا دقیقه چند دیده") → local SQLite only, never uploaded.
 *
 * SECURITY:
 *   - Only the PUBLISHABLE key lives here — it is designed to be public and is
 *     protected by Row Level Security on the server.
 *   - NEVER put the sb_secret_* key anywhere in this app; it bypasses RLS.
 *
 * The project URL is baked in via SUPABASE_URL_DEFAULT when known; until then
 * it can be set once in /auth (stored in localStorage) without an app update.
 */

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

/** e.g. "https://xxxxxxxxxxxx.supabase.co" — fill to hard-code the project. */
export const SUPABASE_URL_DEFAULT = "";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_m23eUV8cC-xqhqD-3P6Wsg_U5WsiM3E";

const URL_KEY = "frame.supabase.url";

let client: SupabaseClient | null = null;
let clientUrl = "";

export function getSupabaseUrl(): string {
  if (typeof window === "undefined") return SUPABASE_URL_DEFAULT;
  try {
    return localStorage.getItem(URL_KEY) || SUPABASE_URL_DEFAULT;
  } catch {
    return SUPABASE_URL_DEFAULT;
  }
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  return /^https?:\/\/.+\..+/.test(url);
}

/** Save the project URL (one-time setup) and drop the cached client. */
export function setSupabaseUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, "");
  try {
    if (clean) localStorage.setItem(URL_KEY, clean);
    else localStorage.removeItem(URL_KEY);
  } catch {
    /* ignore */
  }
  client = null;
  clientUrl = "";
}

export function getSupabase(): SupabaseClient | null {
  const url = getSupabaseUrl();
  if (!/^https?:\/\/.+\..+/.test(url)) return null;
  if (!client || clientUrl !== url) {
    try {
      client = createClient(url, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      clientUrl = url;
    } catch {
      return null;
    }
  }
  return client;
}

/* ------------------------------------------------------------------ */
/* Session hook                                                        */
/* ------------------------------------------------------------------ */

export type CloudSessionState = { ready: boolean; session: Session | null };

/** Subscribes to the Supabase auth session (persists across app restarts). */
export function useCloudSession(): CloudSessionState {
  const [state, setState] = useState<CloudSessionState>({ ready: false, session: null });
  useEffect(() => {
    let alive = true;
    const sb = getSupabase();
    if (!sb) {
      setState({ ready: true, session: null });
      return;
    }
    sb.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setState({ ready: true, session: data.session });
      })
      .catch(() => {
        if (alive) setState({ ready: true, session: null });
      });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ ready: true, session });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
}

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Activity log (fire & forget)                                        */
/* ------------------------------------------------------------------ */

export async function logEvent(type: string, payload?: Record<string, unknown>) {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    await sb.from("user_events").insert({ user_id: uid, type, payload: payload ?? {} });
  } catch {
    /* never let analytics break the UI */
  }
}

/* ------------------------------------------------------------------ */
/* Push helpers (fire & forget) — cloud mirrors the local library      */
/* ------------------------------------------------------------------ */

export async function pushFavorite(titleId: number, value: boolean) {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    if (value) await sb.from("favorites").upsert({ user_id: uid, title_id: titleId });
    else await sb.from("favorites").delete().eq("user_id", uid).eq("title_id", titleId);
  } catch {
    /* offline → local remains the source of truth */
  }
}

export async function pushWatchlist(titleId: number, status: string | null) {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    if (status) await sb.from("watchlist").upsert({ user_id: uid, title_id: titleId, status, updated_at: new Date().toISOString() });
    else await sb.from("watchlist").delete().eq("user_id", uid).eq("title_id", titleId);
  } catch {
    /* offline */
  }
}

export async function pushRating(titleId: number, score: number | null) {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    if (score && score > 0) await sb.from("ratings").upsert({ user_id: uid, title_id: titleId, score, updated_at: new Date().toISOString() });
    else await sb.from("ratings").delete().eq("user_id", uid).eq("title_id", titleId);
  } catch {
    /* offline */
  }
}

/* ------------------------------------------------------------------ */
/* Pull cloud snapshot → merge into the local database                 */
/* ------------------------------------------------------------------ */

export type CloudSnapshot = {
  favorites: number[];
  watchlist: { titleId: number; status: string }[];
  ratings: { titleId: number; score: number }[];
};

export async function pullCloudSnapshot(): Promise<CloudSnapshot | null> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return null;
  const [fav, wl, rt] = await Promise.all([
    sb.from("favorites").select("title_id").eq("user_id", uid),
    sb.from("watchlist").select("title_id,status").eq("user_id", uid),
    sb.from("ratings").select("title_id,score").eq("user_id", uid),
  ]);
  const favRows = (fav.data ?? []) as Array<{ title_id: number }>;
  const wlRows = (wl.data ?? []) as Array<{ title_id: number; status: string }>;
  const rtRows = (rt.data ?? []) as Array<{ title_id: number; score: number }>;
  return {
    favorites: favRows.map((r) => Number(r.title_id)).filter((n) => Number.isFinite(n) && n > 0),
    watchlist: wlRows.map((r) => ({ titleId: Number(r.title_id), status: String(r.status) })),
    ratings: rtRows.map((r) => ({ titleId: Number(r.title_id), score: Number(r.score) })),
  };
}

export type MergeResult = { ok: boolean; favoritesAdded?: number; listAdded?: number; listUpdated?: number; ratingsAdded?: number; reason?: string };

/** Pull the cloud snapshot and merge it into the local SQLite (cloud fills gaps, local wins on conflicts). */
export async function syncCloudToLocal(): Promise<MergeResult> {
  try {
    const snap = await pullCloudSnapshot();
    if (!snap) return { ok: false, reason: "no-session" };
    const r = await fetch("/api/cloud/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snap),
    });
    if (!r.ok) return { ok: false, reason: `merge-${r.status}` };
    const d = (await r.json()) as { favoritesAdded: number; listAdded: number; listUpdated: number; ratingsAdded: number };
    return { ok: true, ...d };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network" };
  }
}

/** On login / app start: pull cloud → local, then push local → cloud so both sides converge. */
export async function fullSync(): Promise<MergeResult> {
  const merged = await syncCloudToLocal();
  if (merged.ok) {
    // push local-only rows up as well (cheap, idempotent upserts)
    try {
      const d = await fetch("/api/library", { cache: "no-store" });
      if (d.ok) {
        const lib = (await d.json()) as {
          watchlist: { titleId: number; status: string }[];
          favorites: number[];
          ratings: { titleId: number; score: number }[];
        };
        await Promise.all([
          ...lib.favorites.map((id) => pushFavorite(id, true)),
          ...lib.watchlist.map((w) => pushWatchlist(w.titleId, w.status)),
          ...lib.ratings.map((r) => pushRating(r.titleId, r.score)),
        ]);
      }
    } catch {
      /* offline push is fine — pulls still worked */
    }
  }
  return merged;
}
