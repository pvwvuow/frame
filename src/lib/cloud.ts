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
import {
  bumpSyncOpAttempts,
  clearAllTombstones,
  clearTombstone,
  countSyncOps,
  dropOpsForOtherUids,
  enqueueSyncOp,
  getSyncOps,
  getTombstones,
  OP_RETRY_BACKOFF_MS,
  peekTombstone,
  quarantinePoisonOps,
  readEvCursor,
  recordTombstone,
  removeSyncOps,
  tombstoneNewerThan,
  writeEvCursor,
  type SyncOp,
} from "./sync-queue";
import { applyPlayerPrefs, collectPlayerPrefs } from "./player-prefs";

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
/* v0.27.0 — per-SCOPE profile merge (DATA-9): the profile no longer    */
/*   syncs as one blob whose newest write clobbers everything. Identity */
/*   fields (name/avatar) and playback fields (quality/subtitle/…) each */
/*   carry their own touched timestamp (__tsIdentity / __tsPlayback),   */
/*   so changing the avatar on the phone no longer reverts the default  */
/*   quality changed on the desktop a second earlier.                   */
/* ------------------------------------------------------------------ */

const PROFILE_TOUCH_KEY = "frame.profile.touched";
const PROFILE_PLAYBACK_TOUCH_KEY = "frame.profile.touched.playback";

const IDENTITY_FIELDS = ["displayName", "avatar", "avatarImage", "language", "kidsMode"] as const;
const PLAYBACK_FIELDS = [
  "autoplay", "autoNext", "quality", "subtitle", "matureContent", "reduceMotion",
  "skipIntro", "playbackSpeed", "volume", "dataSaver",
  "notifyNewEpisodes", "notifyRecommendations", "notifyContinue", "playerPrefs",
] as const;

export function markProfileTouched(ts?: string) {
  try {
    localStorage.setItem(PROFILE_TOUCH_KEY, ts || new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/** v0.27.0 — playback-scope touch (quality/subtitle/player prefs…). */
export function markProfilePlaybackTouched(ts?: string) {
  try {
    localStorage.setItem(PROFILE_PLAYBACK_TOUCH_KEY, ts || new Date().toISOString());
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

function readProfilePlaybackTouched(): string {
  try {
    return localStorage.getItem(PROFILE_PLAYBACK_TOUCH_KEY) || "1970-01-01T00:00:00.000Z";
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

/** Push the local profile to Supabase (row as JSON + per-scope timestamps,
 *  LWW per scope). Pass the snapshot's profileFull when available to skip the
 *  extra fetch. The live localStorage player prefs ride along as
 *  `playerPrefs` (DATA-10) — they are the freshest local truth. */
export async function pushProfile(profileData?: Record<string, unknown>): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    const raw = profileData ?? (await fetchLocalProfile());
    if (!raw) return;
    const data: Record<string, unknown> = { ...raw };
    delete data.__tsIdentity;
    delete data.__tsPlayback;
    data.playerPrefs = collectPlayerPrefs();
    // v0.29.0 (VERIFY-DATA-6) — `listDetails` (watchlist note/pin/plannedDate)
    // is a CLOUD-MANAGED key written by collectAndPushListDetails(). This
    // upsert used to REPLACE the whole row, so whenever pushProfile landed
    // after it (they ran concurrently in Promise.all!) every list note was
    // wiped. Re-attach the cloud's current listDetails before writing.
    try {
      const { data: cur } = await sb.from("profiles").select("data").eq("user_id", uid).maybeSingle();
      const cloudListDetails = ((cur as { data?: Record<string, unknown> } | null)?.data)?.listDetails;
      if (cloudListDetails && typeof cloudListDetails === "object") data.listDetails = cloudListDetails;
    } catch {
      /* best-effort — the row may not exist yet */
    }
    // v0.13.0 FIX — when the touch mark was missing we used to write
    // 1970-01-01, so every OTHER device considered the profile forever
    // out-of-date (the two 1970 rows in Supabase). Default to now instead.
    const nowIso = new Date().toISOString();
    const ident = readProfileTouched();
    const play = readProfilePlaybackTouched();
    data.__tsIdentity = ident.startsWith("1970") ? nowIso : ident;
    data.__tsPlayback = play.startsWith("1970") ? nowIso : play;
    await sb
      .from("profiles")
      .upsert({ user_id: uid, data, updated_at: [data.__tsIdentity, data.__tsPlayback].sort().pop() });
  } catch {
    /* offline / table not created yet → next sync retries */
  }
}

/** If a scope of the cloud profile is NEWER than the local one, merge JUST
 *  that scope into the local profile (field-level merge, DATA-9). */
export async function pullProfileIfNewer(): Promise<boolean> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return false;
    const { data } = await sb.from("profiles").select("data,updated_at").eq("user_id", uid).maybeSingle();
    const row = data as { data: Record<string, unknown>; updated_at: string } | null;
    if (!row?.data) return false;
    const cloud = row.data;
    const cloudIdent = toTs(cloud.__tsIdentity) || toTs(row.updated_at);
    const cloudPlay = toTs(cloud.__tsPlayback) || toTs(row.updated_at);
    const localIdent = toTs(readProfileTouched());
    const localPlay = toTs(readProfilePlaybackTouched());
    const adoptIdent = cloudIdent > localIdent;
    const adoptPlay = cloudPlay > localPlay;
    if (!adoptIdent && !adoptPlay) return false;
    const local = await fetchLocalProfile();
    if (!local) return false;
    const patch: Record<string, unknown> = { ...local };
    if (adoptIdent) for (const k of IDENTITY_FIELDS) if (k in cloud) patch[k] = cloud[k];
    if (adoptPlay) for (const k of PLAYBACK_FIELDS) if (k in cloud) patch[k] = cloud[k];
    delete patch.__tsIdentity;
    delete patch.__tsPlayback;
    const r = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) return false;
    if (adoptIdent) markProfileTouched(new Date(cloudIdent).toISOString());
    if (adoptPlay) {
      markProfilePlaybackTouched(new Date(cloudPlay).toISOString());
      // live player prefs (zoom / sub-delay maps / engine) follow the cloud
      if (cloud.playerPrefs && typeof cloud.playerPrefs === "object") {
        applyPlayerPrefs(cloud.playerPrefs as Record<string, unknown>);
      }
    }
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
 *  v0.13.0 — rows carry {slug, season, episode}, not drifting local ids.
 *  v0.27.0 — failures are ENQUEUED (DATA-12: offline playback still syncs
 *  once the network returns, and progress deletions propagate — DATA-3). */
export async function pushProgressRows(rows: ProgressPush[]): Promise<void> {
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
  if (!out.length) return;
  for (let i = 0; i < out.length; i += 100) {
    const { error } = await sb.from("watch_progress").upsert(out.slice(i, i + 100));
    if (error) {
      enqueueSyncOp("progress", uid, { rows: out.slice(i) });
      return;
    }
  }
}

/** v0.27.0 (DATA-3) — a progress row was REMOVED locally (رد از ادامه تماشا /
 *  تاریخچه). Mirror the delete in the cloud + broadcast to other devices.
 *  `titleIds` empty → the whole history was cleared (kind key "*"). */
export async function pushProgressDelete(titleId?: number | number[]): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  if (!uid || !sb) return;
  const ids = Array.isArray(titleId) ? titleId : titleId ? [titleId] : [];
  const at = new Date().toISOString();
  if (!ids.length) {
    recordTombstone("progress", "*");
    const { error } = await sb.from("watch_progress").delete().eq("user_id", uid);
    if (error) enqueueSyncOp("progress-del", uid, { slug: "*" });
    else void recordDelEvent(sb, uid, { kind: "progress", key: "*", at });
    return;
  }
  const keys = await cloudKeysFor(ids);
  for (const id of ids) {
    const k = keys.get(Number(id));
    if (!k) {
      enqueueSyncOp("progress-del", uid, { titleId: Number(id) });
      continue;
    }
    recordTombstone("progress", k.slug);
    const { error } = await sb.from("watch_progress").delete().eq("user_id", uid).eq("slug", k.slug);
    if (error) enqueueSyncOp("progress-del", uid, { slug: k.slug });
    else void recordDelEvent(sb, uid, { kind: "progress", key: k.slug, at });
  }
}

/** Throttled single-title push (called from the player's save()).
 *  v0.29.0 (NEW-DATA-4) — the drop used to be SILENT: the row inside the
 *  20s window never reached the cloud, and nothing flushed it on pause /
 *  app-hide, so the last minutes of watching were lost on other devices.
 *  Now the latest row is remembered per title and `flushProgressOne()`
 *  bypasses the throttle — the players call it on pause / pagehide. */
const lastProgressPush = new Map<number, number>();
const pendingProgress = new Map<number, Omit<ProgressPush, "updatedAt">>();
export async function pushProgressOne(row: Omit<ProgressPush, "updatedAt">): Promise<void> {
  pendingProgress.set(row.titleId, row);
  const now = Date.now();
  const last = lastProgressPush.get(row.titleId) ?? 0;
  if (now - last < 20_000) return;
  await flushProgressOne(row.titleId);
}

/** NEW-DATA-4 — force-push the pending row of one title (or all titles when
 *  omitted). Called on pause / visibility-hidden / pagehide. */
export async function flushProgressOne(titleId?: number): Promise<void> {
  const rows: Omit<ProgressPush, "updatedAt">[] = [];
  if (titleId != null) {
    const r = pendingProgress.get(titleId);
    if (r) {
      rows.push(r);
      pendingProgress.delete(titleId);
    }
  } else {
    for (const [id, r] of pendingProgress) {
      rows.push(r);
      pendingProgress.delete(id);
    }
  }
  if (!rows.length) return;
  const now = Date.now();
  for (const r of rows) lastProgressPush.set(r.titleId, now);
  try {
    await pushProgressRows(rows.map((r) => ({ ...r, updatedAt: new Date().toISOString() })));
  } catch {
    /* pushProgressRows already queues on failure */
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
/* Push helpers — cloud mirrors the local library                       */
/* v0.27.0 (DATA-1/2/4): NO push is fire-and-forget anymore.            */
/*   • every push returns success; on failure the op is ENQUEUED         */
/*     (flushed on `online` / interval / next fullSync)                  */
/*   • every removal writes a LOCAL TOMBSTONE (blocks pull-resurrection) */
/*   • every successful removal broadcasts a `sync_del` user_event so    */
/*     OTHER devices delete too (DATA-2, rides user_events — no DDL)     */
/* ------------------------------------------------------------------ */

/* slug-level primitives — low level, return success, NO queue side effects */

async function sbFavoriteUpsert(sb: SupabaseClient, uid: string, r: CloudItemRef): Promise<boolean> {
  const { error } = await sb.from("favorites").upsert({ user_id: uid, slug: r.slug, title: r.title ?? "" });
  return !error;
}
async function sbFavoriteDelete(sb: SupabaseClient, uid: string, slug: string): Promise<boolean> {
  const { error } = await sb.from("favorites").delete().eq("user_id", uid).eq("slug", slug);
  return !error;
}
async function sbWatchlistUpsert(sb: SupabaseClient, uid: string, r: CloudItemRef, status: string): Promise<boolean> {
  const { error } = await sb.from("watchlist").upsert({ user_id: uid, slug: r.slug, title: r.title ?? "", status, updated_at: new Date().toISOString() });
  return !error;
}
async function sbWatchlistDelete(sb: SupabaseClient, uid: string, slug: string): Promise<boolean> {
  const { error } = await sb.from("watchlist").delete().eq("user_id", uid).eq("slug", slug);
  return !error;
}
async function sbRatingUpsert(sb: SupabaseClient, uid: string, r: CloudItemRef, score: number): Promise<boolean> {
  const { error } = await sb.from("ratings").upsert({ user_id: uid, slug: r.slug, title: r.title ?? "", score, updated_at: new Date().toISOString() });
  return !error;
}
async function sbRatingDelete(sb: SupabaseClient, uid: string, slug: string): Promise<boolean> {
  const { error } = await sb.from("ratings").delete().eq("user_id", uid).eq("slug", slug);
  return !error;
}

/** Broadcast a deletion (or collection rename) to every OTHER device via the
 *  existing user_events table (type `sync_del`). Best-effort — the local
 *  tombstone + queued op already protect THIS device. */
async function recordDelEvent(sb: SupabaseClient, uid: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await sb.from("user_events").insert({ user_id: uid, type: "sync_del", payload });
  } catch {
    /* analytics-grade best-effort */
  }
}

async function pushFavoriteRef(r: CloudItemRef, value: boolean): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  if (!uid || !sb || !r.slug) return;
  if (value) {
    clearTombstone("favorite", r.slug);
    if (!(await sbFavoriteUpsert(sb, uid, r))) {
      enqueueSyncOp("favorite", uid, { slug: r.slug, title: r.title ?? "", value: true });
    }
  } else {
    recordTombstone("favorite", r.slug);
    if (await sbFavoriteDelete(sb, uid, r.slug)) {
      void recordDelEvent(sb, uid, { kind: "favorite", key: r.slug, at: new Date().toISOString() });
    } else {
      enqueueSyncOp("favorite", uid, { slug: r.slug, title: r.title ?? "", value: false });
    }
  }
}

async function pushWatchlistRef(r: CloudItemRef, status: string | null): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  if (!uid || !sb || !r.slug) return;
  if (status) {
    clearTombstone("watchlist", r.slug);
    if (!(await sbWatchlistUpsert(sb, uid, r, status))) {
      enqueueSyncOp("watchlist", uid, { slug: r.slug, title: r.title ?? "", status });
    }
  } else {
    recordTombstone("watchlist", r.slug);
    if (await sbWatchlistDelete(sb, uid, r.slug)) {
      void recordDelEvent(sb, uid, { kind: "watchlist", key: r.slug, at: new Date().toISOString() });
    } else {
      enqueueSyncOp("watchlist", uid, { slug: r.slug, title: r.title ?? "", status: null });
    }
  }
}

async function pushRatingRef(r: CloudItemRef, score: number | null): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  if (!uid || !sb || !r.slug) return;
  if (score && score > 0) {
    clearTombstone("rating", r.slug);
    if (!(await sbRatingUpsert(sb, uid, r, score))) {
      enqueueSyncOp("rating", uid, { slug: r.slug, title: r.title ?? "", score });
    }
  } else {
    recordTombstone("rating", r.slug);
    if (await sbRatingDelete(sb, uid, r.slug)) {
      void recordDelEvent(sb, uid, { kind: "rating", key: r.slug, at: new Date().toISOString() });
    } else {
      enqueueSyncOp("rating", uid, { slug: r.slug, title: r.title ?? "", score: null });
    }
  }
}

/** Public wrappers: resolve the local id → slug, then push. Titles that the
 *  local catalog does not know are queued RAW (titleId) so the flush can
 *  retry resolution once the catalog is available — never silently dropped. */
export async function pushFavorite(titleId: number, value: boolean) {
  const k = await cloudKeyFor(titleId);
  if (k) return pushFavoriteRef({ slug: k.slug, title: k.title }, value);
  const uid = await currentUserId();
  if (uid) enqueueSyncOp("favorite", uid, { titleId, value });
}

export async function pushWatchlist(titleId: number, status: string | null) {
  const k = await cloudKeyFor(titleId);
  if (k) return pushWatchlistRef({ slug: k.slug, title: k.title }, status);
  const uid = await currentUserId();
  if (uid) enqueueSyncOp("watchlist", uid, { titleId, status });
}

export async function pushRating(titleId: number, score: number | null) {
  const k = await cloudKeyFor(titleId);
  if (k) return pushRatingRef({ slug: k.slug, title: k.title }, score);
  const uid = await currentUserId();
  if (uid) enqueueSyncOp("rating", uid, { titleId, score });
}

/* ------------------------------------------------------------------ */
/* Pull cloud snapshot → merge into the local database                 */
/* ------------------------------------------------------------------ */

export type CloudSnapshot = {
  favorites: CloudItemRef[];
  watchlist: (CloudItemRef & { status: string; updatedAt?: string })[];
  ratings: (CloudItemRef & { score: number; updatedAt?: string })[];
  collections: { name: string; cid?: string; items: CloudItemRef[] }[];
  progress: { slug: string; season: number; episode: number; position: number; duration: number; updatedAt: string }[];
};

export async function pullCloudSnapshot(): Promise<CloudSnapshot | null> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return null;
  const [fav, wl, rt, cols, prog] = await Promise.all([
    sb.from("favorites").select("slug,title").eq("user_id", uid),
    // updated_at drives the LWW merge (DATA-5) — older columns tolerate
    // projects where the column is missing (the whole select fails then,
    // which the per-table catch below contains)
    sb.from("watchlist").select("slug,title,status,updated_at").eq("user_id", uid),
    sb.from("ratings").select("slug,title,score,updated_at").eq("user_id", uid),
    sb.from("user_collections").select("id,name,user_collection_items(slug,title)").eq("user_id", uid),
    // watch history follows the account (table may not exist yet on
    // the user's project → the error is contained and the rest still syncs)
    sb.from("watch_progress").select("slug,season,episode,position,duration,updated_at").eq("user_id", uid).limit(500),
  ]);
  const favRows = (fav.data ?? []) as Array<{ slug: string; title: string | null }>;
  const wlRows = (wl.data ?? []) as unknown as Array<{ slug: string; title: string | null; status: string; updated_at?: string }>;
  const rtRows = (rt.data ?? []) as unknown as Array<{ slug: string; title: string | null; score: number; updated_at?: string }>;
  type CloudCol = { id: string; name: string; user_collection_items: { slug: string; title: string | null }[] | null };
  const colRows = (cols.data ?? []) as unknown as CloudCol[];
  const progRows = (prog.data ?? []) as unknown as Array<{ slug: string; season: number; episode: number; position: number; duration: number; updated_at: string }>;
  return {
    favorites: favRows.filter((r) => r.slug).map((r) => ({ slug: r.slug, title: r.title ?? "" })),
    watchlist: wlRows
      .filter((r) => r.slug)
      .map((r) => ({ slug: r.slug, title: r.title ?? "", status: String(r.status), updatedAt: r.updated_at ? String(r.updated_at) : undefined })),
    ratings: rtRows.filter((r) => r.slug).map((r) => ({ slug: r.slug, title: r.title ?? "", score: Number(r.score), updatedAt: r.updated_at ? String(r.updated_at) : undefined })),
    collections: colRows.map((c) => ({
      name: String(c.name),
      // v0.29.0 (VERIFY-DATA-16) — the cloud row's STABLE uuid rides along so
      // the merge can match collections by id (names are user-editable; two
      // devices renaming concurrently used to fork duplicates forever).
      cid: String(c.id),
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

export type MergeResult = { ok: boolean; favoritesAdded?: number; listAdded?: number; listUpdated?: number; ratingsAdded?: number; progressApplied?: number; deletionsApplied?: number; skipped?: number; reason?: string };

/** Pull the cloud snapshot + other devices' deletion events, and merge both
 *  into the local database. v0.27.0: deletions finally propagate (DATA-2). */
export async function syncCloudToLocal(): Promise<MergeResult> {
  try {
    const snap = await pullCloudSnapshot();
    if (!snap) return { ok: false, reason: "no-session" };
    const deletions = await pullDeletionEvents();
    // v0.29.0 (VERIFY-DATA-1/1b) — the desktop merge route runs SERVER-side
    // (Electron main process) and can never see this renderer's localStorage
    // tombstones. Ship them in the body so the merge can (a) skip re-adding
    // rows deleted offline on THIS device and (b) delete local rows older
    // than the tombstone — the resurrection class is finally dead on
    // desktop too (mobile's mergeCloudSnapshot already consulted them).
    const tombstones = getTombstones().slice(0, 2_000);
    const r = await fetch("/api/cloud/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...snap, deletions, tombstones }),
    });
    if (!r.ok) return { ok: false, reason: `merge-${r.status}` };
    const d = (await r.json()) as { ok?: boolean; favoritesAdded: number; listAdded: number; listUpdated?: number; ratingsAdded: number; progressApplied?: number; deletionsApplied?: number; skipped?: number };
    if (d && d.ok === false) return { ok: false, reason: "merge-unsupported" };
    return { ok: true, favoritesAdded: d.favoritesAdded, listAdded: d.listAdded, ratingsAdded: d.ratingsAdded, progressApplied: d.progressApplied ?? 0, deletionsApplied: d.deletionsApplied ?? 0, skipped: d.skipped ?? 0 };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network" };
  }
}

/* ------------------------------------------------------------------ */
/* v0.27.0 — cross-device deletion events (sync_del in user_events)     */
/* ------------------------------------------------------------------ */

export type DeletionEvent = {
  kind: "favorite" | "watchlist" | "rating" | "progress" | "collection" | "collection-item";
  key: string; // slug · collection NAME · "*" (whole history)
  at: string;
  action?: "delete" | "rename";
  to?: string; // rename target
  slug?: string; // collection-item
};

async function pullDeletionEvents(): Promise<DeletionEvent[]> {
  try {
    const sb = getSupabase();
    const uid = await currentUserId();
    if (!sb || !uid) return [];
    let cur = readEvCursor();
    if (cur && cur.uid !== uid) {
      cur = { uid, at: "1970-01-01T00:00:00.000Z" };
      writeEvCursor(cur);
    }
    const from = cur?.uid === uid ? cur.at : "1970-01-01T00:00:00.000Z";
    const { data, error } = await sb
      .from("user_events")
      .select("payload,created_at")
      .eq("user_id", uid)
      .eq("type", "sync_del")
      .gt("created_at", from)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error || !data) return [];
    const rows = data as unknown as { payload: Partial<DeletionEvent> | null; created_at: string }[];
    const last = rows[rows.length - 1];
    if (last?.created_at) writeEvCursor({ uid, at: last.created_at });
    return rows
      .map((r) => ({ ...(r.payload ?? {}), at: r.payload?.at || r.created_at } as DeletionEvent))
      .filter((d) => d.kind && d.key);
  } catch {
    return [];
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
  wireFlushListeners();
  const uid = await currentUserId();
  if (!uid) return { ok: false, reason: "no-session" };
  // v0.27.0 (DATA-15) — the space rotation must be CONFIRMED before any cloud
  // row is merged: offline (or unverified) attaches must never pour account
  // B's snapshot into account A's still-active local space.
  const att = await attachIdentity(uid, await currentAccessToken());
  if (!att.attached) return { ok: false, reason: "identity-unverified" };
  // account switched since the last sync? → hygiene: drop the other
  // account's queued ops, forget tombstones, restart the event cursor
  let lastUid = "";
  try {
    lastUid = localStorage.getItem("frame.sync.lastUid") ?? "";
  } catch {
    /* ignore */
  }
  if (lastUid !== uid) {
    dropOpsForOtherUids(uid);
    clearAllTombstones();
    writeEvCursor({ uid, at: "1970-01-01T00:00:00.000Z" });
    try {
      localStorage.setItem("frame.sync.lastUid", uid);
    } catch {
      /* ignore */
    }
  }
  // flush FIRST: a pending offline deletion must remove the cloud row BEFORE
  // the pull — otherwise the pull would resurrect it for one cycle (DATA-1)
  if (countSyncOps()) await flushSyncOps();
  const merged = await syncCloudToLocal();
  if (merged.ok) {
    // profile: cloud → local (if newer), then local → cloud
    try {
      await pullProfileIfNewer();
    } catch {
      /* never blocks the rest */
    }
    // v0.27.0 (DATA-6) — note/pin/plannedDate from other devices (rides the
    // profile blob); runs AFTER the pull so pulled watchlist rows exist locally
    try {
      await applyCloudListDetails();
    } catch {
      /* best-effort */
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
          collections?: { name: string; cid?: string; items: number[] }[];
          progress?: ProgressPush[];
          /** v0.29.0 (VERIFY-DATA-7b) — per-episode rows ride along (desktop) */
          episodeProgress?: ProgressPush[];
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
        // v0.29.0 (VERIFY-DATA-6) — collectAndPushListDetails() and
        // pushProfile() BOTH read-modify-write the SAME profiles.data row.
        // They used to run inside one Promise.all, so whichever landed later
        // wiped the other's write: list notes vanished, or name/avatar/
        // quality rolled back for no reason. Everything that touches OTHER
        // tables stays parallel; the two profile-row writers are now strictly
        // ordered (listDetails first, full profile second — pushProfile also
        // re-attaches the cloud's listDetails as belt-and-braces).
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
          // v0.29.0 (VERIFY-DATA-7b) — per-episode positions finally leave the
          // device: desktop's WatchEpisodeProgress rows are pushed as their own
          // cloud rows (the cloud PK is (user,slug,season,episode)); the
          // title-level rows stay as they were. Mobile already pushed these.
          pushProgressRows([...(lib.progress ?? []), ...(lib.episodeProgress ?? [])]),
          pushCinemaProfile((lib as { profileFull?: Record<string, unknown> }).profileFull),
        ]);
        await collectAndPushListDetails();
        await pushProfile((lib as { profileFull?: Record<string, unknown> }).profileFull);
      }
    } catch {
      /* offline push is fine — pulls still worked */
    }
    // v0.27.0 — anything that failed during the push phase is already queued;
    // try one immediate replay while the connection is obviously alive
    if (countSyncOps()) {
      try {
        await flushSyncOps();
      } catch {
        /* retried by the listeners */
      }
    }
    // v0.29.0 (NEW-DATA-13) — offline contact messages leave the outbox once
    // the account + cloud are reachable
    try {
      await flushContactOutbox();
    } catch {
      /* best-effort */
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
 *  cloud + broadcast (otherwise the next pull re-adds it / other devices
 *  keep it forever — union-merge only adds). */
export async function pushCollectionItemRemove(name: string, titleId: number): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  const clean = String(name ?? "").trim();
  if (!uid || !sb || !clean || !titleId) return;
  const k = await cloudKeyFor(titleId);
  if (!k) return;
  const { data: existing } = await sb
    .from("user_collections")
    .select("id")
    .eq("user_id", uid)
    .eq("name", clean)
    .maybeSingle();
  const colId = (existing as { id: string } | null)?.id;
  if (!colId) return;
  const { error } = await sb.from("user_collection_items").delete().eq("collection_id", colId).eq("slug", k.slug);
  if (error) enqueueSyncOp("collection-item-del", uid, { name: clean, slug: k.slug });
  else void recordDelEvent(sb, uid, { kind: "collection-item", key: clean, slug: k.slug, at: new Date().toISOString() });
}

/** Immediate: a collection was DELETED locally → mirror + broadcast. */
export async function pushCollectionDelete(name: string): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  const clean = String(name ?? "").trim();
  if (!uid || !sb || !clean) return;
  recordTombstone("collection", clean);
  const { error } = await sb.from("user_collections").delete().eq("user_id", uid).eq("name", clean);
  if (error) enqueueSyncOp("collection-del", uid, { name: clean });
  else void recordDelEvent(sb, uid, { kind: "collection", key: clean, action: "delete", at: new Date().toISOString() });
}

/** Immediate: a collection was RENAMED locally → mirror + broadcast. Other
 *  devices apply the rename via the sync_del event (DATA-16 — previously the
 *  old name survived there and the new name arrived as a DUPLICATE). */
export async function pushCollectionRename(oldName: string, newName: string): Promise<void> {
  const uid = await currentUserId();
  const sb = getSupabase();
  const from = String(oldName ?? "").trim();
  const to = String(newName ?? "").trim().slice(0, 60);
  if (!uid || !sb || !from || !to) return;
  const { error } = await sb.from("user_collections").update({ name: to }).eq("user_id", uid).eq("name", from);
  if (error) enqueueSyncOp("collection-rename", uid, { from, to });
  else void recordDelEvent(sb, uid, { kind: "collection", key: from, action: "rename", to, at: new Date().toISOString() });
}

/** Push the LOCAL collections up to the cloud (matched by name, idempotent).
 *  v0.10.32 — collections sync like favorites: local-first, cloud mirror.
 *  v0.13.0 — items accept either numeric ids (resolved to slugs here) or
 *  ready {slug,title} refs; the cloud stores slugs only.
 *  v0.29.0 (VERIFY-DATA-16) — when the snapshot carries the cloud row's
 *  stable uuid (`cid`, stamped by the merge on the way in), the upsert
 *  matches by ID first and only falls back to the name. Two devices renaming
 *  the same collection no longer fork two cloud rows. */
export async function pushCollectionsUp(
  collections: { name: string; cid?: string; items: (number | CloudItemRef)[] }[]
): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb || !collections.length) return;
    for (const col of collections) {
      const name = String(col.name ?? "").trim().slice(0, 60);
      if (!name) continue;
      const cid = typeof col.cid === "string" && /^[0-9a-f-]{36}$/i.test(col.cid) ? col.cid : "";
      let colId: string | undefined;
      if (cid) {
        const byId = await sb.from("user_collections").select("id").eq("user_id", uid).eq("id", cid).maybeSingle();
        colId = ((byId.data as { id: string } | null) ?? undefined)?.id;
      }
      if (!colId) {
        const { data: existing } = await sb
          .from("user_collections")
          .select("id")
          .eq("user_id", uid)
          .eq("name", name)
          .maybeSingle();
        colId = (existing as { id: string } | null)?.id as string | undefined;
      }
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

/* ------------------------------------------------------------------ */
/* v0.27.0 — the offline op queue: flush + replay                      */
/* ------------------------------------------------------------------ */

let flushWired = false;

/** `online` / interval / re-visibility → replay queued cloud ops (DATA-4). */
export function wireFlushListeners(): void {
  if (flushWired || typeof window === "undefined") return;
  flushWired = true;
  window.addEventListener("online", () => {
    if (countSyncOps()) void flushSyncOps();
  });
  window.setInterval(() => {
    if (countSyncOps()) void flushSyncOps();
  }, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && countSyncOps()) void flushSyncOps();
  });
}

export async function flushSyncOps(): Promise<{ flushed: number; left: number }> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return { flushed: 0, left: countSyncOps() };
  dropOpsForOtherUids(uid); // never replay account A's ops under account B
  // v0.29.0 (NEW-DATA-2) — a permanently-failing op used to BLOCK the whole
  // queue forever (break on first failure + no attempts field): one bad rename
  // and no change ever synced again, with zero UI indication. Now every op
  // counts its attempts, the queue keeps flowing past a failing op, and a
  // poison op is quarantined after MAX_OP_ATTEMPTS separate flush rounds.
  quarantinePoisonOps();
  const done: string[] = [];
  for (const op of getSyncOps()) {
    let ok = false;
    try {
      ok = await replaySyncOp(sb, uid, op);
    } catch {
      ok = false;
    }
    if (ok) {
      done.push(op.id);
      continue;
    }
    bumpSyncOpAttempts(op.id);
    // keep going — a failing op no longer starves the ops behind it
    await new Promise((r) => setTimeout(r, OP_RETRY_BACKOFF_MS));
  }
  removeSyncOps(done);
  return { flushed: done.length, left: countSyncOps() };
}

async function replaySyncOp(sb: SupabaseClient, uid: string, op: SyncOp): Promise<boolean> {
  const p = op.payload as Record<string, unknown>;
  const nowAt = new Date().toISOString();
  switch (op.kind) {
    case "favorite": {
      let slug = String(p.slug ?? "");
      let title = String(p.title ?? "");
      const value = Boolean(p.value);
      if (!slug) {
        const k = await cloudKeyFor(Number(p.titleId ?? 0));
        if (!k) return true; // still unresolvable → nothing stable, drop
        slug = k.slug;
        title = k.title;
      }
      if (value) {
        clearTombstone("favorite", slug);
        return sbFavoriteUpsert(sb, uid, { slug, title });
      }
      recordTombstone("favorite", slug);
      const ok = await sbFavoriteDelete(sb, uid, slug);
      if (ok) void recordDelEvent(sb, uid, { kind: "favorite", key: slug, at: nowAt });
      return ok;
    }
    case "watchlist": {
      let slug = String(p.slug ?? "");
      let title = String(p.title ?? "");
      const status = p.status ? String(p.status) : null;
      if (!slug) {
        const k = await cloudKeyFor(Number(p.titleId ?? 0));
        if (!k) return true;
        slug = k.slug;
        title = k.title;
      }
      if (status) {
        clearTombstone("watchlist", slug);
        return sbWatchlistUpsert(sb, uid, { slug, title }, status);
      }
      recordTombstone("watchlist", slug);
      const ok = await sbWatchlistDelete(sb, uid, slug);
      if (ok) void recordDelEvent(sb, uid, { kind: "watchlist", key: slug, at: nowAt });
      return ok;
    }
    case "rating": {
      let slug = String(p.slug ?? "");
      let title = String(p.title ?? "");
      const rawScore = Number(p.score ?? 0);
      const score = rawScore > 0 ? rawScore : null;
      if (!slug) {
        const k = await cloudKeyFor(Number(p.titleId ?? 0));
        if (!k) return true;
        slug = k.slug;
        title = k.title;
      }
      if (score) {
        clearTombstone("rating", slug);
        return sbRatingUpsert(sb, uid, { slug, title }, score);
      }
      recordTombstone("rating", slug);
      const ok = await sbRatingDelete(sb, uid, slug);
      if (ok) void recordDelEvent(sb, uid, { kind: "rating", key: slug, at: nowAt });
      return ok;
    }
    case "progress": {
      const rows = (Array.isArray(p.rows) ? p.rows : []) as {
        slug: string;
        title: string;
        season: number;
        episode: number;
        position: number;
        duration: number;
        updated_at: string;
      }[];
      if (!rows.length) return true;
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await sb.from("watch_progress").upsert(rows.slice(i, i + 100));
        if (error) return false;
      }
      return true;
    }
    case "progress-del": {
      let slug = String(p.slug ?? "");
      if (!slug) {
        const k = await cloudKeyFor(Number(p.titleId ?? 0));
        if (!k) return true;
        slug = k.slug;
      }
      recordTombstone("progress", slug);
      if (slug === "*") {
        const { error } = await sb.from("watch_progress").delete().eq("user_id", uid);
        if (!error) void recordDelEvent(sb, uid, { kind: "progress", key: "*", at: nowAt });
        return !error;
      }
      const { error } = await sb.from("watch_progress").delete().eq("user_id", uid).eq("slug", slug);
      if (!error) void recordDelEvent(sb, uid, { kind: "progress", key: slug, at: nowAt });
      return !error;
    }
    case "collection-del": {
      const name = String(p.name ?? "").trim();
      if (!name) return true;
      recordTombstone("collection", name);
      const { error } = await sb.from("user_collections").delete().eq("user_id", uid).eq("name", name);
      if (!error) void recordDelEvent(sb, uid, { kind: "collection", key: name, action: "delete", at: nowAt });
      return !error;
    }
    case "collection-rename": {
      const from = String(p.from ?? "").trim();
      const to = String(p.to ?? "").trim().slice(0, 60);
      if (!from || !to) return true;
      const { error } = await sb.from("user_collections").update({ name: to }).eq("user_id", uid).eq("name", from);
      if (!error) void recordDelEvent(sb, uid, { kind: "collection", key: from, action: "rename", to, at: nowAt });
      return !error;
    }
    case "collection-item-del": {
      const name = String(p.name ?? "").trim();
      const slug = String(p.slug ?? "");
      if (!name || !slug) return true;
      const { data: existing } = await sb.from("user_collections").select("id").eq("user_id", uid).eq("name", name).maybeSingle();
      const colId = (existing as { id: string } | null)?.id;
      if (!colId) return true; // collection already gone on the cloud side
      const { error } = await sb.from("user_collection_items").delete().eq("collection_id", colId).eq("slug", slug);
      if (!error) void recordDelEvent(sb, uid, { kind: "collection-item", key: name, slug, at: nowAt });
      return !error;
    }
    default:
      return true; // unknown op kind → drop instead of looping forever
  }
}

/* ------------------------------------------------------------------ */
/* v0.27.0 (DATA-6) — watchlist DETAILS ride the profile blob          */
/*   note / pinned / plannedDate never had cloud columns; they now      */
/*   live under profiles.data.listDetails keyed by slug, per-entry      */
/*   updatedAt, capped at 400 entries. Zero Supabase DDL.               */
/* ------------------------------------------------------------------ */

export type ListDetail = { slug: string; note?: string; pinned?: boolean; plannedDate?: string | null; updatedAt?: string };

/** Push local watchlist details (note/pin/plannedDate) into the profile blob. */
export async function collectAndPushListDetails(): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    const { getMyListRows } = await import("./mobile/userdata");
    const rows = await getMyListRows().catch(() => []);
    if (!rows.length) return;
    const keys = await cloudKeysFor(rows.map((r) => r.title.id));
    const local: Record<string, ListDetail> = {};
    for (const r of rows) {
      const k = keys.get(r.title.id);
      if (!k) continue;
      if (r.note || r.pinned || r.plannedDate) {
        local[k.slug] = { slug: k.slug, note: r.note, pinned: r.pinned, plannedDate: r.plannedDate, updatedAt: r.updatedAt };
      }
    }
    const { data } = await sb.from("profiles").select("data,updated_at").eq("user_id", uid).maybeSingle();
    const blob = (((data as { data?: Record<string, unknown> } | null)?.data) ?? {}) as Record<string, unknown>;
    const merged = { ...((blob.listDetails ?? {}) as Record<string, ListDetail>) };
    for (const [slug, d] of Object.entries(local)) {
      const old = merged[slug];
      if (!old || toTs(d.updatedAt) >= toTs(old.updatedAt)) merged[slug] = d;
    }
    // size cap: keep the 400 most recently touched entries
    const kept = Object.entries(merged)
      .sort((a, b) => toTs(b[1].updatedAt) - toTs(a[1].updatedAt))
      .slice(0, 400);
    blob.listDetails = Object.fromEntries(kept);
    await sb.from("profiles").upsert({ user_id: uid, data: blob, updated_at: new Date().toISOString() });
  } catch {
    /* offline / table missing → retried on the next sync */
  }
}

/** Apply cloud watchlist details to local rows that are OLDER than them. */
export async function applyCloudListDetails(): Promise<void> {
  try {
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    const { data } = await sb.from("profiles").select("data").eq("user_id", uid).maybeSingle();
    const blob = (data as { data?: Record<string, unknown> } | null)?.data;
    const details = blob?.listDetails as Record<string, ListDetail> | undefined;
    if (!details || !Object.keys(details).length) return;
    const { getMyListRows, patchWatchlist } = await import("./mobile/userdata");
    const rows = await getMyListRows().catch(() => []);
    if (!rows.length) return;
    const keys = await cloudKeysFor(rows.map((r) => r.title.id));
    for (const r of rows) {
      const k = keys.get(r.title.id);
      const d = k ? details[k.slug] : undefined;
      if (!d) continue;
      if (toTs(d.updatedAt) <= toTs(r.updatedAt)) continue;
      // only apply fields the detail actually carries — a note-only sync
      // must not clear the pin the user set on this device
      await patchWatchlist({
        titleId: r.title.id,
        ...(d.note !== undefined ? { note: d.note } : {}),
        ...(d.pinned !== undefined ? { pinned: d.pinned } : {}),
        ...(d.plannedDate !== undefined ? { plannedDate: d.plannedDate } : {}),
      });
    }
  } catch {
    /* best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* v0.29.0 (NEW-DATA-13) — contact messages are REALLY delivered        */
/* ------------------------------------------------------------------ */

/** The contact form used to fake success: the message landed in a
 *  localStorage outbox that NOTHING ever read or sent. Real delivery rides
 *  the existing `user_events` cloud table (type "contact_message") — support
 *  reads them from the same dashboard as every other event, zero Supabase
 *  DDL. Signed-out / offline messages queue in the SAME outbox key as before
 *  and are flushed automatically on the next sync/login. */

const CONTACT_OUTBOX_KEY = "nama.contact.outbox";
const CONTACT_FLUSHED_KEY = "nama.contact.flushedAt";

function readContactOutbox(): { id: string; name: string; email: string; topic: string; message: string; at: string }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CONTACT_OUTBOX_KEY) ?? "[]") as {
      id?: string; name?: string; email?: string; topic?: string; message?: string; at?: string;
    }[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((m) => m && typeof m.message === "string" && m.message.trim())
      .map((m) => ({
        id: String(m.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`),
        name: String(m.name ?? ""),
        email: String(m.email ?? ""),
        topic: String(m.topic ?? ""),
        message: String(m.message ?? "").slice(0, 2000),
        at: String(m.at ?? new Date().toISOString()),
      }));
  } catch {
    return [];
  }
}

function writeContactOutbox(rows: { id: string; name: string; email: string; topic: string; message: string; at: string }[]): void {
  try {
    localStorage.setItem(CONTACT_OUTBOX_KEY, JSON.stringify(rows.slice(-50)));
  } catch {
    /* private mode */
  }
}

export type ContactOutcome = "sent" | "queued";

/** Send one contact message. Returns "sent" when it reached the cloud,
 *  "queued" when it is stored offline (it WILL be flushed on the next
 *  successful sync — see flushContactOutbox). */
export async function sendContactMessage(msg: { name: string; email: string; topic: string; message: string }): Promise<ContactOutcome> {
  const clean = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: String(msg.name ?? "").slice(0, 80),
    email: String(msg.email ?? "").slice(0, 120),
    topic: String(msg.topic ?? "").slice(0, 40),
    message: String(msg.message ?? "").slice(0, 2000),
    at: new Date().toISOString(),
  };
  const uid = await currentUserId();
  const sb = getSupabase();
  if (uid && sb) {
    const { error } = await sb.from("user_events").insert({
      user_id: uid,
      type: "contact_message",
      payload: clean as unknown as Record<string, unknown>,
    });
    if (!error) {
      try { localStorage.setItem(CONTACT_FLUSHED_KEY, new Date().toISOString()); } catch { /* ignore */ }
      return "sent";
    }
  }
  const box = readContactOutbox();
  box.push(clean);
  writeContactOutbox(box);
  return "queued";
}

/** Flush offline contact messages after a successful sync (uid available +
 *  cloud reachable). Called from runFullSync. */
export async function flushContactOutbox(): Promise<void> {
  try {
    const box = readContactOutbox();
    if (!box.length) return;
    const uid = await currentUserId();
    const sb = getSupabase();
    if (!uid || !sb) return;
    const left: typeof box = [];
    for (const m of box) {
      const { error } = await sb.from("user_events").insert({
        user_id: uid,
        type: "contact_message",
        payload: m as unknown as Record<string, unknown>,
      });
      if (error) left.push(m);
    }
    writeContactOutbox(left);
    if (!left.length) {
      try { localStorage.setItem(CONTACT_FLUSHED_KEY, new Date().toISOString()); } catch { /* ignore */ }
    }
  } catch {
    /* best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* v0.29.0 (NEW-DATA-7) — backup IMPORT (the export existed alone)      */
/* ------------------------------------------------------------------ */

export type BackupImportCounts = { favorites: number; list: number; ratings: number; collections: number; progress: number };

/** Import a backup JSON (the same shape SettingsForm exports). Numeric ids
 *  are resolved to STABLE slugs locally and the rows are applied through the
 *  existing /api/cloud/merge machinery (union/LWW + caps) — an import can
 *  never overwrite newer data, only add/refresh. */
export async function importBackupSnapshot(snap: {
  favorites?: unknown;
  watchlist?: unknown;
  ratings?: unknown;
  collections?: unknown;
  progress?: unknown;
  episodeProgress?: unknown;
}): Promise<BackupImportCounts> {
  const favs = Array.isArray(snap.favorites) ? snap.favorites.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const wl = Array.isArray(snap.watchlist) ? (snap.watchlist as { titleId?: unknown; status?: unknown }[]) : [];
  const rt = Array.isArray(snap.ratings) ? (snap.ratings as { titleId?: unknown; score?: unknown }[]) : [];
  const cols = Array.isArray(snap.collections) ? (snap.collections as { name?: unknown; items?: unknown }[]) : [];
  const prog = Array.isArray(snap.progress) ? (snap.progress as { titleId?: unknown; position?: unknown; duration?: unknown; updatedAt?: unknown }[]) : [];
  const epProg = Array.isArray(snap.episodeProgress) ? (snap.episodeProgress as { titleId?: unknown; position?: unknown; duration?: unknown; updatedAt?: unknown }[]) : [];

  const ids = [
    ...favs,
    ...wl.map((w) => Number(w?.titleId)),
    ...rt.map((r) => Number(r?.titleId)),
    ...cols.flatMap((c) => (Array.isArray(c?.items) ? c.items.map(Number) : [])),
    ...prog.map((p) => Number(p?.titleId)),
    ...epProg.map((p) => Number(p?.titleId)),
  ].filter((n) => Number.isFinite(n) && n > 0);
  const keys = await cloudKeysFor([...new Set(ids)]);
  const ref = (id: unknown): { slug: string; title: string } | null => {
    const k = keys.get(Math.round(Number(id)));
    return k ? { slug: k.slug, title: k.title } : null;
  };
  const progRows = [...prog, ...epProg]
    .map((p) => {
      const r = ref(p?.titleId);
      if (!r) return null;
      const position = Number(p?.position ?? 0);
      if (!Number.isFinite(position)) return null;
      return {
        slug: r.slug,
        title: r.title,
        season: 0,
        episode: 0,
        position,
        duration: Number(p?.duration ?? 0) || 0,
        updated_at: typeof p?.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .slice(0, 500);

  const body = {
    favorites: favs.map(ref).filter((r): r is { slug: string; title: string } => !!r),
    watchlist: wl
      .map((w) => {
        const r = ref(w?.titleId);
        const status = String(w?.status ?? "");
        return r && status ? { ...r, status } : null;
      })
      .filter((r): r is { slug: string; title: string; status: string } => !!r),
    ratings: rt
      .map((row) => {
        const r = ref(row?.titleId);
        const score = Number(row?.score ?? 0);
        return r && score >= 1 && score <= 10 ? { ...r, score } : null;
      })
      .filter((r): r is { slug: string; title: string; score: number } => !!r),
    collections: cols
      .map((c) => ({
        name: String(c?.name ?? "").trim().slice(0, 60),
        items: (Array.isArray(c?.items) ? c.items : []).map(ref).filter((r): r is { slug: string; title: string } => !!r),
      }))
      .filter((c) => c.name),
    progress: progRows,
  };

  const r = await fetch("/api/cloud/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`merge-${r.status}`);
  const d = (await r.json()) as { favoritesAdded?: number; listAdded?: number; ratingsAdded?: number; collectionsAdded?: number; progressApplied?: number };
  return {
    favorites: d.favoritesAdded ?? 0,
    list: d.listAdded ?? 0,
    ratings: d.ratingsAdded ?? 0,
    collections: d.collectionsAdded ?? 0,
    progress: d.progressApplied ?? 0,
  };
}
