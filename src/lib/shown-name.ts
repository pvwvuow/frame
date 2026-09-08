"use client";

/* v0.14.2 — THE name & avatar a user is known by, shared everywhere.
 *
 * Bug this fixes: the cinema member list showed «کاربر نما» for everyone,
 * because the engine was fed the RAW local profile name. The local name is
 * just a device placeholder until the user customizes it — while signed in,
 * the ACCOUNT identity (user_metadata.display_name → name → full_name →
 * email handle) must replace it, exactly like /profile already did.
 *
 * Rules:
 *   - a customized local name ALWAYS wins (the user typed it on purpose)
 *   - placeholder local names («کاربر نما» / «کاربر فریم» / empty) yield to
 *     the account identity while signed in
 *   - avatar: the local uploaded image (data URL); it rides to the cloud via
 *     pushCinemaProfile() so OTHER users can render it in the member list
 */
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useCloudSession } from "./cloud";
import { setCinemaSelf } from "./cinema";
import { useLibrary } from "@/components/library/LibraryProvider";

export const PLACEHOLDER_NAMES = new Set(["کاربر نما", "کاربر فریم"]);

type SessionLike = Session | null | undefined;

/** The identity Supabase knows this user by (never the local placeholder). */
export function accountNameOf(session: SessionLike): string | null {
  if (!session) return null;
  const meta = (session.user?.user_metadata ?? {}) as { display_name?: string; name?: string; full_name?: string };
  const email = session.user?.email ?? "";
  return (
    meta.display_name?.trim() || meta.name?.trim() || meta.full_name?.trim() || (email ? email.split("@")[0] : "") || null
  );
}

/** The name to SHOW for this user: custom local name wins, placeholders yield
 *  to the account identity, and «کاربر» is the last resort. */
export function resolveShownName(localName: string, session: SessionLike): string {
  const local = (localName || "").trim();
  const acct = accountNameOf(session);
  if (local && !PLACEHOLDER_NAMES.has(local)) return local;
  return acct || local || "کاربر";
}

/** Hook form of resolveShownName for plain components (used by /profile). */
export function useShownName(localName: string): string {
  const { ready, session } = useCloudSession();
  const [name, setName] = useState(localName);
  useEffect(() => {
    setName(resolveShownName(localName, ready ? session : null));
  }, [ready, session, localName]);
  return name;
}

export type CinemaIdentity = { name: string; avatar: string };

/** React binding: the shown name + avatar of THIS device's user, kept in sync
 *  with the session/profile. Also seeds the cinema engine's self avatar
 *  (module scope) so the member list renders it instantly, before (and even
 *  without) the cloud round-trip. */
export function useCinemaIdentity(): CinemaIdentity {
  const { ready, session } = useCloudSession();
  const { profile } = useLibrary();
  const [id, setId] = useState<CinemaIdentity>({ name: "", avatar: "" });
  useEffect(() => {
    const name = resolveShownName(profile?.displayName || "", ready ? session : null);
    const avatar = (profile?.avatarImage as string) || "";
    setCinemaSelf({ uid: session?.user?.id, name, avatar });
    setId((prev) => (prev.name === name && prev.avatar === avatar ? prev : { name, avatar }));
  }, [ready, session, profile?.displayName, profile?.avatarImage]);
  return id;
}
