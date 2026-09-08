"use client";

import { useShownName } from "@/lib/shown-name";

/* Local display names that are placeholders (user never customized them).
 * While signed in, the ACCOUNT identity replaces these — the user must not
 * see «کاربر نما» after signing up. A customized local name always wins.
 * v0.14.2 — the logic moved to src/lib/shown-name.ts so the CINEMA member
 * list resolves names with the exact same rules. */

function useShownNameLocal(localName: string): string {
  return useShownName(localName);
}

/** The big /profile heading — swaps a placeholder local name for the cloud
 *  account name while signed in (renders the local name on the server and
 *  while signed out, so there is no hydration mismatch). */
export function ProfileName({ localName }: { localName: string }) {
  const name = useShownNameLocal(localName);
  return <h1 className="mt-1 truncate text-4xl font-black text-white sm:text-5xl">{name}</h1>;
}

/** Avatar letter for /profile — always matches the shown name. */
export function ProfileAvatarLetter({ localName }: { localName: string }) {
  const name = useShownNameLocal(localName);
  return <>{name.slice(0, 1)}</>;
}
