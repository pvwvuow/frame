"use client";

/* Offline-resilient auth & subscription cache (v0.10.13).
 *
 * WHY THIS EXISTS:
 *   Supabase requires a VPN in some regions, but video playback must work
 *   with the VPN OFF. When the network disappears mid-session, supabase-js
 *   may fail to refresh the token and (on some paths) wipe the stored
 *   session — the app then "forgets" the user was logged in and the paywall
 *   blocks playback with «اول وارد حسابت شو».
 *
 * HOW:
 *   We keep OUR OWN snapshots in localStorage, written on every confirmed
 *   session / subscription fetch:
 *     frame.auth.snapshot.v1 → { userId, email, displayName, raw tokens, savedAt }
 *     frame.sub.snapshot.v1  → { plan, expiresAt, lifetime, savedAt }
 *
 *   - Login state is OPTIMISTIC: if a snapshot exists, the UI treats the user
 *     as signed in even fully offline. Only an EXPLICIT sign-out clears it.
 *   - The subscription snapshot carries the expiry date, so "active" can be
 *     judged locally while offline.
 *   - The raw refresh token is kept so the session can be restored into the
 *     supabase client (and silently re-validated when the network returns).
 */

import type { Session } from "@supabase/supabase-js";

const AUTH_KEY = "frame.auth.snapshot.v1";
const SUB_KEY = "frame.sub.snapshot.v1";
const TOMBSTONE_KEY = "frame.auth.signedout";

export type AuthSnapshot = {
  userId: string;
  email: string;
  displayName: string;
  raw: { access_token: string; refresh_token: string; expires_at: number | null } | null;
  savedAt: number;
};

export type SubSnapshot = {
  plan: string | null;
  expiresAt: string | null; // ISO
  lifetime: boolean;
  savedAt: number;
};

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    if (!v) return null;
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked/full → non-fatal */
  }
}

/* ------------------------------------------------------------------ */
/* Auth snapshot                                                       */
/* ------------------------------------------------------------------ */

export function readAuthSnapshot(): AuthSnapshot | null {
  if (typeof window === "undefined") return null;
  const s = readJson<AuthSnapshot>(AUTH_KEY);
  if (!s || !s.userId) return null;
  return s;
}

export function saveAuthSnapshot(session: Session | null | undefined) {
  if (!session?.user?.id) return;
  const meta = (session.user.user_metadata ?? {}) as {
    display_name?: string;
    name?: string;
    full_name?: string;
  };
  const email = session.user.email ?? "";
  const snap: AuthSnapshot = {
    userId: session.user.id,
    email,
    displayName: meta.display_name || meta.name || meta.full_name || email.split("@")[0] || "کاربر",
    raw: session.refresh_token
      ? {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at ?? null,
        }
      : null,
    savedAt: Date.now(),
  };
  writeJson(AUTH_KEY, snap);
  // a fresh login/consume clears any previous sign-out tombstone
  try {
    localStorage.removeItem(TOMBSTONE_KEY);
  } catch {
    /* ignore */
  }
}

/** Mark that the user EXPLICITLY signed out. supabase-js can write the
 *  session back into storage seconds later (offline sign-out internals),
 *  which would resurrect the account on the next launch — the tombstone
 *  identifies and kills that zombie on the read path. */
export function writeSignOutTombstone() {
  try {
    localStorage.setItem(TOMBSTONE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function isSignOutTombstoned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TOMBSTONE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSignOutTombstone() {
  try {
    localStorage.removeItem(TOMBSTONE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuthSnapshot() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Subscription snapshot                                               */
/* ------------------------------------------------------------------ */

export function readSubSnapshot(): SubSnapshot | null {
  if (typeof window === "undefined") return null;
  const s = readJson<SubSnapshot>(SUB_KEY);
  if (!s) return null;
  return s;
}

export function saveSubSnapshot(sub: { plan: string | null; expiresAt: string | null; lifetime: boolean }) {
  if (!sub.plan) return;
  writeJson(SUB_KEY, { ...sub, savedAt: Date.now() } satisfies SubSnapshot);
}

export function clearSubSnapshot() {
  try {
    localStorage.removeItem(SUB_KEY);
  } catch {
    /* ignore */
  }
}

/** Judge "subscription active" purely from the cached snapshot (works offline). */
export function subSnapshotActive(s: SubSnapshot | null): boolean {
  if (!s || !s.plan) return false;
  if (s.lifetime || s.plan === "life") return true;
  if (!s.expiresAt) return true; // plan row without expiry behaves like lifetime
  const t = new Date(s.expiresAt).getTime();
  return Number.isFinite(t) ? t > Date.now() : false;
}

/* ------------------------------------------------------------------ */
/* Synthetic session (for UI hooks while the real one is unreachable)  */
/* ------------------------------------------------------------------ */

/** Minimal Session-shaped object carrying exactly what the UI consumes
 *  (user.id / user.email / user.user_metadata). Typed loosely on purpose. */
export function fakeSessionFromSnapshot(s: AuthSnapshot): Session {
  return {
    user: {
      id: s.userId,
      email: s.email || null,
      user_metadata: { display_name: s.displayName },
    },
    access_token: s.raw?.access_token ?? "",
    refresh_token: s.raw?.refresh_token ?? "",
    expires_at: s.raw?.expires_at ?? 0,
    token_type: "bearer",
  } as unknown as Session;
}
