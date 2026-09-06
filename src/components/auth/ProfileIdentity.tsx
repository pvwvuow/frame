"use client";

import { useEffect, useState } from "react";
import { useCloudSession } from "@/lib/cloud";

/* Local display names that are placeholders (user never customized them).
 * While signed in, the ACCOUNT identity replaces these — the user must not
 * see «کاربر نما» after signing up. A customized local name always wins. */
const DEFAULT_NAMES = new Set(["کاربر نما", "کاربر فریم"]);

type SessionLike = ReturnType<typeof useCloudSession>["session"];

function accountNameOf(session: SessionLike): string | null {
  if (!session) return null;
  const meta = (session.user?.user_metadata ?? {}) as { display_name?: string; name?: string; full_name?: string };
  const email = session.user?.email ?? "";
  return (
    meta.display_name?.trim() || meta.name?.trim() || meta.full_name?.trim() || (email ? email.split("@")[0] : "") || null
  );
}

function useShownName(localName: string): string {
  const { ready, session } = useCloudSession();
  const [name, setName] = useState(localName);
  useEffect(() => {
    const acct = accountNameOf(session);
    setName(ready && acct && DEFAULT_NAMES.has(localName.trim()) ? acct : localName);
  }, [ready, session, localName]);
  return name;
}

/** The big /profile heading — swaps a placeholder local name for the cloud
 *  account name while signed in (renders the local name on the server and
 *  while signed out, so there is no hydration mismatch). */
export function ProfileName({ localName }: { localName: string }) {
  const name = useShownName(localName);
  return <h1 className="mt-1 truncate text-4xl font-black text-white sm:text-5xl">{name}</h1>;
}

/** Avatar letter for /profile — always matches the shown name. */
export function ProfileAvatarLetter({ localName }: { localName: string }) {
  const name = useShownName(localName);
  return <>{name.slice(0, 1)}</>;
}
