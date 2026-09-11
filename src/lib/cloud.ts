"use client";

/* Frame × Supabase cloud sync (client-side only).
 *
 * v0.13.0 — SLUG-BASED SYNC (cloud schema v2):
 *   Cloud rows are keyed by the catalog SLUG (e.g. `breaking-bad-2008-s7upg5`),
 *   NEVER by the numeric local id. Numeric ids drift between devices and catalog
 *   rebuilds — the same film was id 663 on one device and id 1665 on another,
 *   so favoriting «Breaking Bad» on the phone showed «I Am Nobody» on the
 *   desktop. Every push resolves id → slug via /api/title/cloud-key; every pull
 *   resolves slug → id against THIS device's catalog before merging.
 *
 * What syncs to the cloud:
 *   - favorites / watchlist / ratings / collections / watch progress
 *     (RLS: each user sees only their own rows)
 *   - activity log (user_events)       → every meaningful action is recorded
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
import { useEffect, useLayoutEffect, useState } from "react";
import {
  clearAuthSnapshot,
  clearSignOutTombstone,
  clearSubSnapshot,
  fakeSessionFromSnapshot,
  hydrateAuthCacheFromDisk,
  isSignOutTombstoned,
  readAuthSnapshot,
  saveAuthSnapshot,
  writeSignOutTombstone,
} from "./auth-offline";
import { attachIdentity } from "./identity";

/** e.g. "https://xxxxxxxxxxxx.supabase.co" — fill to hard-code the project. */
export const SUPABASE_URL_DEFAULT = "https://emqsegjeiyimoyncbhfn.supabase.co";
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

/** True while an explicit user-initiated sign-out is in flight. Spurious
 *  SIGNED_OUT events (offline token-refresh wipe) must NOT log the user out. */
let expectingSignOut = false;

/** Immediate local sign-out listeners (one per mounted useCloudSession). */
const signOutListeners = new Set<(s: Session | null) => void>();

/** Restore our cached tokens into the supabase client so it can refresh on
 *  its own once the network is back. Fails silently when offline. */
async function reattachSession(sb: SupabaseClient): Promise<Session | null> {
  const snap = readAuthSnapshot();
  if (!snap?.raw?.refresh_token) return null;
  try {
    const { data } = await sb.auth.setSession({
      access_token: snap.raw.access_token,
      refresh_token: snap.raw.refresh_token,
    });
    if (data.session) {
      saveAuthSnapshot(data.session);
      return data.session;
    }
  } catch {
    /* offline / expired refresh token → the snapshot UI state stays */
  }
  return null;
}

/** Subscribes to the Supabase auth session (persists across app restarts).
 *
 *  v0.10.13 OFFLINE RESILIENCE:
 *   - a localStorage snapshot (auth-offline.ts) is applied BEFORE first paint,
 *     so a returning user never sees the signed-out UI flash;
 *   - network failures NEVER log the user out — only an explicit sign-out
 *     clears the snapshot (fixes «after turning the VPN off the app forgets
 *     the login»);
 *   - when supabase's own storage lost the session, the cached refresh token
 *     re-attaches it; when the network returns the session revalidates. */
export function useCloudSession(): CloudSessionState {
  const [state, setState] = useState<CloudSessionState>({ ready: false, session: null });

  // Apply the cached snapshot BEFORE first paint. useLayoutEffect would warn
  // during SSR, so pick the right hook per environment (same render order).
  const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
  useIsoLayoutEffect(() => {
    const snap = readAuthSnapshot();
    if (snap) {
      clearSignOutTombstone(); // a live snapshot = an active login
      setState({ ready: true, session: fakeSessionFromSnapshot(snap) });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let cleanup: (() => void) | undefined;

    // v0.10.14 – restore the disk-mirrored snapshots (if any) BEFORE the
    // first session check, so even a fresh-origin launch can see the saved
    // login. No-op / instant when localStorage already has the session.
    void hydrateAuthCacheFromDisk().then(() => {
      if (!alive) return;
      const sb = getSupabase();

      if (!sb) {
        // No supabase endpoint configured → still respect a cached login.
        const snap = readAuthSnapshot();
        setState({ ready: true, session: snap ? fakeSessionFromSnapshot(snap) : null });
        return;
      }

      sb.auth
        .getSession()
        .then(async ({ data }) => {
          if (!alive) return;
          if (data.session) {
            // a sign-out that started while this promise was in flight WINS —
            // never resurrect a session the user just killed
            if (expectingSignOut) return;
            // ZOMBIE GUARD: supabase's offline sign-out internals can write the
            // session back into storage AFTER we wiped it. session-in-storage
            // + explicit sign-out tombstone = the user logged this out.
            if (!readAuthSnapshot() && isSignOutTombstoned()) {
              forceClearSupabaseStorage();
              setState({ ready: true, session: null });
              return;
            }
            saveAuthSnapshot(data.session);
            setState({ ready: true, session: data.session });
            return;
          }
          // Supabase storage is empty but WE remember a login → restore it
          // (a previous offline run may have wiped the stored session).
          if (!expectingSignOut && readAuthSnapshot()) {
            const restored = await reattachSession(sb);
            if (restored && alive) {
              setState({ ready: true, session: restored });
              return;
            }
            // offline → keep showing the cached identity
          }
          if (alive) {
            const snap = readAuthSnapshot();
            setState({ ready: true, session: snap ? fakeSessionFromSnapshot(snap) : null });
          }
        })
        .catch(() => {
          if (!alive) return;
          const snap = readAuthSnapshot();
          setState({ ready: true, session: snap ? fakeSessionFromSnapshot(snap) : null });
        });

      const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
        if (!alive) return;
        if (event === "SIGNED_OUT") {
          if (expectingSignOut || !readAuthSnapshot()) {
            clearAuthSnapshot();
            setState({ ready: true, session: null });
          }
          // else: spurious sign-out (offline refresh wipe) → ignore, stay logged in
          return;
        }
        if (session && !expectingSignOut) {
          // zombie guard (same as in getSession) — but NEVER for SIGNED_IN:
          // that event is a deliberate login (or a restore we initiated), it
          // must always win over an old tombstone
          if (event !== "SIGNED_IN" && !readAuthSnapshot() && isSignOutTombstoned()) {
            forceClearSupabaseStorage();
            return;
          }
          saveAuthSnapshot(session);
          setState({ ready: true, session });
        }
      });

      // VPN back on → silently revalidate and refresh the token.
      const onOnline = () => {
        if (expectingSignOut) return;
        void reattachSession(sb).then((s) => {
          if (s && alive && !expectingSignOut) setState({ ready: true, session: s });
        });
      };
      window.addEventListener("online", onOnline);

      // instant local sign-out (never wait for the server revoke — with the
      // network down supabase's signOut can grind for many seconds)
      const onForcedSignOut = () => setState({ ready: true, session: null });
      signOutListeners.add(onForcedSignOut);
      cleanup = () => {
        sub.subscription.unsubscribe();
        window.removeEventListener("online", onOnline);
        signOutListeners.delete(onForcedSignOut);
      };
    });

    return () => {
      alive = false;
      cleanup?.();
    };
  }, []);
  return state;
}

/** User-initiated sign out — ALWAYS works (even offline) and clears every
 *  cached snapshot so the app truly forgets the account this time.
 *
 *  v0.10.13: the LOCAL cleanup runs FIRST (snapshots + live hooks), so the UI
 *  flips to signed-out instantly; the server-side token revoke continues in
 *  the background (with the VPN off it can take seconds — never block on it).
 *  supabase's _signOut can early-return WITHOUT local cleanup when the stored
 *  session is unreadable offline — so we force-wipe its storage keys too and
 *  drop the client (kills any auto-refresh timer that could resurrect the
 *  account when the VPN comes back). */
export function explicitSignOut(): Promise<void> {
  expectingSignOut = true;
  clearAuthSnapshot();
  clearSubSnapshot();
  writeSignOutTombstone();
  forceClearSupabaseStorage();
  for (const l of signOutListeners) {
    try {
      l(null);
    } catch {
      /* listener errors must never break sign-out */
    }
  }
  const sb = getSupabase();
  // drop the client immediately: fresh instances get a session-less client and
  // no stale auto-refresh timer can silently log the user back in later
  client = null;
  clientUrl = "";
  // best-effort server revoke in the background; supabase's slow internals may
  // write the session back into storage afterwards — re-wipe when it returns
  return (async () => {
    try {
      await sb?.auth.signOut();
    } catch {
      /* offline revoke fails → forced cleanup below still runs */
    }
    forceClearSupabaseStorage();
    clearAuthSnapshot();
    clearSubSnapshot();
    writeSignOutTombstone();
    expectingSignOut = false;
  })();
}

/** Directly remove supabase's own localStorage session keys (its signOut may
 *  skip cleanup when the network is down). */
function forceClearSupabaseStorage() {
  try {
    const ref = new URL(getSupabaseUrl()).hostname.split(".")[0];
    localStorage.removeItem(`sb-${ref}-auth-token`);
    localStorage.removeItem(`sb-${ref}-auth-token-user`);
    localStorage.removeItem(`sb-${ref}-auth-code-verifier`);
  } catch {
    /* ignore */
  }
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

/** C-2 — access token فعلی سشن برای اثبات مالکیت در /api/identity. */
async function currentAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* v0.12.0 — FULL user sync: profile (name/avatar/settings) + history   */
/* ------------------------------------------------------------------ */

const PROFILE_TOUCH_KEY = "frame.profile.touched";

export function markProfileTouched(ts?: string) {
  try {
    localStorage.setItem(PROFILE_TOUCH_KEY, ts || new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function readProfileTouched(): string {
  try {
    return localStorage.getItem(PROFILE_TOUCH_KEY) || "1970-01-01T00:00:00.000Z";
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

const toTs = (v: unknown): number => (typeof v === "number" ? v : Date.parse(String(v)) || 0);

/** The whole local profile (both platforms serve GET /api/profile). */
async function fetchLocalProfile(): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch("/api/profile", { cache: "no-store" });
    if (!r.ok) return null;
    const p = (await r.json()) as Record<string, unknown>;
    delete p.userKey;
    delete p.id;
    return p;
  } catch {
    return null;
  }
}

/** Push the local profile to Supabase (whole row as JSON, LWW by touched).
 *  Pass the snapshot's profileFull when available to skip the extra fetch. */
export async function pushProfile(profileData?: Record<string, unknown>): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    const data = profileData ?? (await fetchLocalProfile());
    if (!data) return;
    // v0.13.0 FIX — when the touch mark was missing we used to write
    // 1970-01-01, so every OTHER device considered the profile forever
    // out-of-date (the two 1970 rows in Supabase). Default to now instead.
    const touched = readProfileTouched();
    await sb
      .from("profiles")
      .upsert({ user_id: uid, data, updated_at: touched.startsWith("1970") ? new Date().toISOString() : touched });
  } catch {
    /* offline / table not created yet → next sync retries */
  }
}

/** If the cloud profile is NEWER than the local one, apply it locally. */
export async function pullProfileIfNewer(): Promise<boolean> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return false;
    const { data } = await sb.from("profiles").select("data,updated_at").eq("user_id", uid).maybeSingle();
    const row = data as { data: Record<string, unknown>; updated_at: string } | null;
    if (!row?.data) return false;
    if (toTs(row.updated_at) <= toTs(readProfileTouched())) return false;
    const r = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row.data),
    });
    if (!r.ok) return false;
    markProfileTouched(row.updated_at);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* v0.14.2 — CINEMA identity (name + avatar, visible to other users)    */
/* ------------------------------------------------------------------ */

/** The private profile JSON (profiles.data: settings, PIN, …) stays locked
 *  behind RLS — nobody else can read it. The member list of a cinema needs
 *  exactly TWO public fields, so they live in their own table:
 *  cinema_profiles (user_id, display_name, avatar_image). Pushed on every
 *  profile save + sync; read by every member of a room. */
export async function pushCinemaProfile(profileData?: Record<string, unknown>): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    const p = profileData ?? (await fetchLocalProfile());
    if (!p) return;
    const name = typeof p.displayName === "string" ? p.displayName.trim().slice(0, 40) : "";
    const avatar = typeof p.avatarImage === "string" && p.avatarImage ? p.avatarImage : "";
    if (!name && !avatar) return;
    await sb.from("cinema_profiles").upsert({
      user_id: uid,
      display_name: name,
      avatar_image: avatar.slice(0, 400_000),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* table not migrated yet / offline → retried on the next save or sync */
  }
}

export type CinemaProfileRow = { uid: string; name: string; avatar: string };

/** Name + avatar of OTHER users (for the cinema member list). RLS exposes
 *  ONLY these two fields — everything else in a profile stays private. */
export async function fetchCinemaProfiles(uids: string[]): Promise<CinemaProfileRow[]> {
  const sb = getSupabase();
  const clean = [...new Set(uids.filter(Boolean))];
  if (!sb || !clean.length) return [];
  try {
    const { data, error } = await sb
      .from("cinema_profiles")
      .select("user_id,display_name,avatar_image")
      .in("user_id", clean);
    if (error || !data) return [];
    return (data as { user_id: string; display_name: string | null; avatar_image: string | null }[]).map((r) => ({
      uid: r.user_id,
      name: (r.display_name || "").trim(),
      avatar: r.avatar_image || "",
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* v0.13.0 — the STABLE identity: slug                                 */
/* ------------------------------------------------------------------ */

/** A title's cloud identity: the catalog slug + a display title. */
export type CloudItemRef = { slug: string; title?: string };

type CloudKey = { id: number; slug: string; title: string };
type EpisodeKey = { id: number; season: number; number: number };

const keyById = new Map<number, CloudKey | null>();
const keyBySlug = new Map<string, CloudKey | null>();
const episodeKeyById = new Map<number, EpisodeKey | null>();

/** Ask the local catalog for slug/title of titles (+ season/number of
 *  episodes) in ONE batch. Results are cached for the session. */
async function fetchCloudKeys(ids: number[], episodeIds: number[], slugs: string[]): Promise<void> {
  const body = {
    ids: [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0),
    episodeIds: [...new Set(episodeIds)].filter((n) => Number.isFinite(n) && n > 0),
    slugs: [...new Set(slugs)].filter(Boolean),
  };
  if (!body.ids.length && !body.episodeIds.length && !body.slugs.length) return;
  try {
    const r = await fetch("/api/title/cloud-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!r.ok) return;
    const d = (await r.json()) as { titles?: CloudKey[]; episodes?: EpisodeKey[] };
    for (const t of d.titles ?? []) {
      keyById.set(t.id, t);
      keyBySlug.set(t.slug, t);
    }
    for (const e of d.episodes ?? []) episodeKeyById.set(e.id, e);
  } catch {
    /* offline → resolution fails for this round, pushes are skipped */
  }
}

/** The stable cloud key of ONE local title (cached). */
async function cloudKeyFor(titleId: number): Promise<CloudKey | null> {
  const id = Math.round(titleId);
  if (keyById.has(id)) return keyById.get(id) ?? null;
  await fetchCloudKeys([id], [], []);
  return keyById.get(id) ?? null;
}

/** Resolve many local ids at once (one request). Unknown ids stay absent. */
export async function cloudKeysFor(titleIds: number[]): Promise<Map<number, CloudKey>> {
  const missing = titleIds.map(Number).filter((id) => Number.isFinite(id) && id > 0 && !keyById.has(id));
  if (missing.length) await fetchCloudKeys(missing, [], []);
  const out = new Map<number, CloudKey>();
  for (const id of titleIds) {
    const k = keyById.get(Number(id));
    if (k) out.set(Number(id), k);
  }
  return out;
}

/** slug → local title (used when applying cloud rows / shared items). */
export async function localIdsForSlugs(slugs: string[]): Promise<Map<string, CloudKey>> {
  const missing = slugs.filter((s) => s && !keyBySlug.has(s));
  if (missing.length) await fetchCloudKeys([], [], missing);
  const out = new Map<string, CloudKey>();
  for (const s of slugs) {
    const k = keyBySlug.get(s);
    if (k) out.set(s, k);
  }
  return out;
}

/** episodeId → {season, number} (the stable episode identity). */
async function episodeKeysFor(ids: number[]): Promise<Map<number, EpisodeKey>> {
  const clean = ids.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  const missing = clean.filter((id) => !episodeKeyById.has(id));
  if (missing.length) await fetchCloudKeys([], missing, []);
  const out = new Map<number, EpisodeKey>();
  for (const id of clean) {
    const k = episodeKeyById.get(id);
    if (k) out.set(id, k);
  }
  return out;
}

export type ProgressPush = { titleId: number; episodeId: number | null; position: number; duration: number; updatedAt: string };

/** Upsert watch-progress rows into Supabase (history/continue sync).
 *  v0.13.0 — rows carry {slug, season, episode}, not drifting local ids. */
export async function pushProgressRows(rows: ProgressPush[]): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb || !rows.length) return;
    const clean = rows
      .filter((r) => Number.isFinite(r.titleId) && r.titleId > 0 && Number.isFinite(r.position))
      .slice(0, 500);
    if (!clean.length) return;
    const keys = await cloudKeysFor(clean.map((r) => r.titleId));
    const epKeys = await episodeKeysFor(clean.map((r) => r.episodeId ?? 0));
    const out: {
      user_id: string;
      slug: string;
      title: string;
      season: number;
      episode: number;
      position: number;
      duration: number;
      updated_at: string;
    }[] = [];
    for (const r of clean) {
      const k = keys.get(Math.round(r.titleId));
      if (!k) continue; // not in the local catalog → nothing stable to sync
      const ep = r.episodeId ? epKeys.get(Math.round(r.episodeId)) : undefined;
      out.push({
        user_id: uid,
        slug: k.slug,
        title: k.title,
        season: ep?.season ?? 0,
        episode: ep?.number ?? 0,
        position: r.position,
        duration: r.duration,
        updated_at: new Date(toTs(r.updatedAt) || Date.now()).toISOString(),
      });
    }
    for (let i = 0; i < out.length; i += 100) {
      await sb.from("watch_progress").upsert(out.slice(i, i + 100));
    }
  } catch {
    /* offline / table not created yet */
  }
}

/** Throttled single-title push (called from the player's save()). */
const lastProgressPush = new Map<number, number>();
export async function pushProgressOne(row: Omit<ProgressPush, "updatedAt">): Promise<void> {
  const now = Date.now();
  const last = lastProgressPush.get(row.titleId) ?? 0;
  if (now - last < 20_000) return;
  lastProgressPush.set(row.titleId, now);
  await pushProgressRows([{ ...row, updatedAt: new Date().toISOString() }]);
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

/* slug-level primitives (used by the id wrappers AND by the batch push) */

async function pushFavoriteRef(r: CloudItemRef, value: boolean): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb || !r.slug) return;
    if (value) await sb.from("favorites").upsert({ user_id: uid, slug: r.slug, title: r.title ?? "" });
    else await sb.from("favorites").delete().eq("user_id", uid).eq("slug", r.slug);
  } catch {
    /* offline → local remains the source of truth */
  }
}

async function pushWatchlistRef(r: CloudItemRef, status: string | null): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb || !r.slug) return;
    if (status)
      await sb.from("watchlist").upsert({ user_id: uid, slug: r.slug, title: r.title ?? "", status, updated_at: new Date().toISOString() });
    else await sb.from("watchlist").delete().eq("user_id", uid).eq("slug", r.slug);
  } catch {
    /* offline */
  }
}

async function pushRatingRef(r: CloudItemRef, score: number | null): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb || !r.slug) return;
    if (score && score > 0)
      await sb.from("ratings").upsert({ user_id: uid, slug: r.slug, title: r.title ?? "", score, updated_at: new Date().toISOString() });
    else await sb.from("ratings").delete().eq("user_id", uid).eq("slug", r.slug);
  } catch {
    /* offline */
  }
}

/** Public wrappers: resolve the local id → slug, then push. Titles that the
 *  local catalog does not know are skipped (nothing stable to sync). */
export async function pushFavorite(titleId: number, value: boolean) {
  const k = await cloudKeyFor(titleId);
  if (k) await pushFavoriteRef({ slug: k.slug, title: k.title }, value);
}

export async function pushWatchlist(titleId: number, status: string | null) {
  const k = await cloudKeyFor(titleId);
  if (k) await pushWatchlistRef({ slug: k.slug, title: k.title }, status);
}

export async function pushRating(titleId: number, score: number | null) {
  const k = await cloudKeyFor(titleId);
  if (k) await pushRatingRef({ slug: k.slug, title: k.title }, score);
}

/* ------------------------------------------------------------------ */
/* Pull cloud snapshot → merge into the local database                 */
/* ------------------------------------------------------------------ */

export type CloudSnapshot = {
  favorites: CloudItemRef[];
  watchlist: (CloudItemRef & { status: string })[];
  ratings: (CloudItemRef & { score: number })[];
  collections: { name: string; items: CloudItemRef[] }[];
  progress: { slug: string; season: number; episode: number; position: number; duration: number; updatedAt: string }[];
};

export async function pullCloudSnapshot(): Promise<CloudSnapshot | null> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return null;
  const [fav, wl, rt, cols, prog] = await Promise.all([
    sb.from("favorites").select("slug,title").eq("user_id", uid),
    sb.from("watchlist").select("slug,title,status").eq("user_id", uid),
    sb.from("ratings").select("slug,title,score").eq("user_id", uid),
    sb.from("user_collections").select("id,name,user_collection_items(slug,title)").eq("user_id", uid),
    // watch history follows the account (table may not exist yet on
    // the user's project → the error is contained and the rest still syncs)
    sb.from("watch_progress").select("slug,season,episode,position,duration,updated_at").eq("user_id", uid).limit(500),
  ]);
  const favRows = (fav.data ?? []) as Array<{ slug: string; title: string | null }>;
  const wlRows = (wl.data ?? []) as Array<{ slug: string; title: string | null; status: string }>;
  const rtRows = (rt.data ?? []) as Array<{ slug: string; title: string | null; score: number }>;
  type CloudCol = { id: string; name: string; user_collection_items: { slug: string; title: string | null }[] | null };
  const colRows = (cols.data ?? []) as unknown as CloudCol[];
  const progRows = (prog.data ?? []) as unknown as Array<{ slug: string; season: number; episode: number; position: number; duration: number; updated_at: string }>;
  return {
    favorites: favRows.filter((r) => r.slug).map((r) => ({ slug: r.slug, title: r.title ?? "" })),
    watchlist: wlRows
      .filter((r) => r.slug)
      .map((r) => ({ slug: r.slug, title: r.title ?? "", status: String(r.status) })),
    ratings: rtRows.filter((r) => r.slug).map((r) => ({ slug: r.slug, title: r.title ?? "", score: Number(r.score) })),
    collections: colRows.map((c) => ({
      name: String(c.name),
      items: (c.user_collection_items ?? []).filter((i) => i.slug).map((i) => ({ slug: i.slug, title: i.title ?? "" })),
    })),
    progress: progRows
      .filter((r) => r.slug)
      .map((r) => ({
        slug: r.slug,
        season: Number(r.season) || 0,
        episode: Number(r.episode) || 0,
        position: Number(r.position) || 0,
        duration: Number(r.duration) || 0,
        updatedAt: String(r.updated_at ?? ""),
      })),
  };
}

export type MergeResult = { ok: boolean; favoritesAdded?: number; listAdded?: number; listUpdated?: number; ratingsAdded?: number; progressApplied?: number; skipped?: number; reason?: string };

/** Pull the cloud snapshot and merge it into the local database (cloud fills gaps, local wins on conflicts). */
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
    const d = (await r.json()) as { ok?: boolean; favoritesAdded: number; listAdded: number; listUpdated?: number; ratingsAdded: number; progressApplied?: number; skipped?: number };
    if (d && d.ok === false) return { ok: false, reason: "merge-unsupported" };
    return { ok: true, favoritesAdded: d.favoritesAdded, listAdded: d.listAdded, ratingsAdded: d.ratingsAdded, progressApplied: d.progressApplied ?? 0, skipped: d.skipped ?? 0 };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network" };
  }
}

/** On login / app start: pull cloud → local, then push local → cloud so both sides converge.
 *  v0.10.35: BEFORE touching any data, make sure the active local data space
 *  belongs to THIS account (per-account spaces). Without this, the cloud
 *  snapshot of account B would be merged into the space of the previously
 *  signed-in account — the «new account sees the old account's profile /
 *  history / collections» leak.
 *  v0.12.0: the snapshot now also carries watch history + the full profile —
 *  avatar, display name and settings follow the account across devices. */
let syncInFlight: Promise<MergeResult> | null = null;

export function fullSync(): Promise<MergeResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    try {
      return await runFullSync();
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

async function runFullSync(): Promise<MergeResult> {
  const uid = await currentUserId();
  if (uid) await attachIdentity(uid, await currentAccessToken());
  const merged = await syncCloudToLocal();
  if (merged.ok) {
    // profile: cloud → local (if newer), then local → cloud
    try {
      await pullProfileIfNewer();
    } catch {
      /* never blocks the rest */
    }
    // push local-only rows up as well (cheap, idempotent upserts)
    // v0.13.0 — every numeric id is resolved to its STABLE slug first (one
    // batch), because ids drift between devices but slugs do not.
    try {
      const d = await fetch("/api/library", { cache: "no-store" });
      if (d.ok) {
        const lib = (await d.json()) as {
          watchlist: { titleId: number; status: string }[];
          favorites: number[];
          ratings: { titleId: number; score: number }[];
          collections?: { name: string; items: number[] }[];
          progress?: ProgressPush[];
        };
        const allIds = [
          ...lib.favorites,
          ...lib.watchlist.map((w) => w.titleId),
          ...lib.ratings.map((r) => r.titleId),
          ...(lib.collections ?? []).flatMap((c) => c.items),
        ].map(Number).filter((n) => Number.isFinite(n) && n > 0);
        const keys = await cloudKeysFor(allIds);
        const ref = (id: number): CloudItemRef | null => {
          const k = keys.get(Number(id));
          return k ? { slug: k.slug, title: k.title } : null;
        };
        await Promise.all([
          ...lib.favorites
            .map(Number)
            .map(ref)
            .filter((r): r is CloudItemRef => !!r)
            .map((r) => pushFavoriteRef(r, true)),
          ...lib.watchlist
            .map((w) => ({ w, r: ref(w.titleId) }))
            .filter((x): x is { w: { titleId: number; status: string }; r: CloudItemRef } => !!x.r)
            .map(({ w, r }) => pushWatchlistRef(r, w.status)),
          ...lib.ratings
            .map((x) => ({ score: x.score, r: ref(x.titleId) }))
            .filter((x): x is { score: number; r: CloudItemRef } => !!x.r)
            .map(({ score, r }) => pushRatingRef(r, score)),
          pushCollectionsUp(lib.collections ?? []),
          pushProgressRows(lib.progress ?? []),
          pushProfile((lib as { profileFull?: Record<string, unknown> }).profileFull),
          pushCinemaProfile((lib as { profileFull?: Record<string, unknown> }).profileFull),
        ]);
      }
    } catch {
      /* offline push is fine — pulls still worked */
    }
    try {
      localStorage.setItem("frame.lastSync", new Date().toISOString());
    } catch {
      /* ignore */
    }
  }
  return merged;
}

/** Immediate: one item was REMOVED from a local collection → mirror in the
 *  cloud. Without this the next pull would re-add the removed title
 *  ("cloud fills gaps" only ever adds). */
export async function pushCollectionItemRemove(name: string, titleId: number): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    const clean = String(name ?? "").trim();
    if (!uid || !sb || !clean || !titleId) return;
    const { data: existing } = await sb
      .from("user_collections")
      .select("id")
      .eq("user_id", uid)
      .eq("name", clean)
      .maybeSingle();
    const colId = (existing as { id: string } | null)?.id;
    if (!colId) return;
    const k = await cloudKeyFor(titleId);
    if (!k) return;
    await sb.from("user_collection_items").delete().eq("collection_id", colId).eq("slug", k.slug);
  } catch {
    /* offline → next fullSync push will restore the remaining set */
  }
}

/** Immediate: a collection was DELETED locally → mirror the delete in the cloud. */
export async function pushCollectionDelete(name: string): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    const clean = String(name ?? "").trim();
    if (!uid || !sb || !clean) return;
    await sb.from("user_collections").delete().eq("user_id", uid).eq("name", clean);
  } catch {
    /* offline → will converge on the next fullSync */
  }
}

/** Immediate: a collection was RENAMED locally → mirror the rename in the cloud. */
export async function pushCollectionRename(oldName: string, newName: string): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    const from = String(oldName ?? "").trim();
    const to = String(newName ?? "").trim().slice(0, 60);
    if (!uid || !sb || !from || !to) return;
    await sb.from("user_collections").update({ name: to }).eq("user_id", uid).eq("name", from);
  } catch {
    /* offline → will converge on the next fullSync */
  }
}

/** Push the LOCAL collections up to the cloud (matched by name, idempotent).
 *  v0.10.32 — collections sync like favorites: local-first, cloud mirror.
 *  v0.13.0 — items accept either numeric ids (resolved to slugs here) or
 *  ready {slug,title} refs; the cloud stores slugs only. */
export async function pushCollectionsUp(
  collections: { name: string; items: (number | CloudItemRef)[] }[]
): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb || !collections.length) return;
    for (const col of collections) {
      const name = String(col.name ?? "").trim().slice(0, 60);
      if (!name) continue;
      const { data: existing } = await sb
        .from("user_collections")
        .select("id")
        .eq("user_id", uid)
        .eq("name", name)
        .maybeSingle();
      let colId = (existing as { id: string } | null)?.id as string | undefined;
      if (!colId) {
        const ins = await sb.from("user_collections").insert({ user_id: uid, name }).select("id").single();
        colId = (ins.data as { id: string } | null)?.id;
      }
      if (!colId) continue;
      const numeric = (col.items ?? []).filter((i): i is number => typeof i === "number").map(Number).filter((n) => Number.isFinite(n) && n > 0);
      const refs = (col.items ?? []).filter((i): i is CloudItemRef => typeof i === "object" && !!i?.slug);
      if (numeric.length) {
        const keys = await cloudKeysFor(numeric);
        for (const n of numeric) {
          const k = keys.get(n);
          if (k) refs.push({ slug: k.slug, title: k.title });
        }
      }
      const seen = new Set<string>();
      const rows = refs
        .filter((r) => r.slug && !seen.has(r.slug) && seen.add(r.slug))
        .map((r) => ({ collection_id: colId, user_id: uid, slug: r.slug, title: r.title ?? "" }));
      if (rows.length) {
        await sb.from("user_collection_items").upsert(rows, { onConflict: "collection_id,slug" });
      }
    }
  } catch {
    /* offline → local remains the source of truth */
  }
}

/* ------------------------------------------------------------------ */
/* v0.13.1 — full account reset (cloud side)                           */
/* ------------------------------------------------------------------ */

/** Delete EVERY cloud row of the signed-in account: favorites, watchlist,
 *  ratings, watch progress, activity events, collections (items cascade)
 *  and shared Dark-Room walls.
 *
 *  The username (profiles) and the VIP subscription are NOT touched.
 *  Used by Settings → «منطقه خطر» → «حذف تمام داده‌های من»: without it the
 *  old (numeric-id era) rows on OTHER devices would be pushed straight back
 *  and resurrect the wrong favorites. */
export async function wipeCloudAccountData(): Promise<boolean> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return false;
    const results = await Promise.all([
      sb.from("favorites").delete().eq("user_id", uid),
      sb.from("watchlist").delete().eq("user_id", uid),
      sb.from("ratings").delete().eq("user_id", uid),
      sb.from("watch_progress").delete().eq("user_id", uid),
      sb.from("user_events").delete().eq("user_id", uid),
      sb.from("user_collections").delete().eq("user_id", uid),
      sb.from("shared_collections").delete().eq("owner_id", uid),
    ]);
    return results.every((r) => !r.error);
  } catch {
    return false;
  }
}
