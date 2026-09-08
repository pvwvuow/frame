"use client";

/* v0.10.35 — client side of per-account data spaces.
 *
 * attachIdentity(accountId | null) tells the local server which cloud account
 * is active (or that the user signed out). The server rotates the `nama_uid`
 * cookie to that account's OWN data space, so profile / history / watchlist /
 * favorites / ratings / collections become per-account. Returns whether the
 * active space actually changed — the caller must reload personal data then.
 *
 * On Android (static export) the same call is served by the mobile shim
 * (src/lib/mobile/shim.ts → switchIdentity in userdata.ts), so all platforms
 * share the exact same client orchestration. */

export async function attachIdentity(accountId: string | null): Promise<{ switched: boolean }> {
  try {
    const r = await fetch("/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accountId ? { accountId } : { reset: true }),
    });
    if (!r.ok) return { switched: false };
    const d = (await r.json()) as { switched?: boolean };
    return { switched: Boolean(d.switched) };
  } catch {
    // offline → keep the current space; the next successful attach fixes it
    return { switched: false };
  }
}
