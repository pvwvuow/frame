"use client";

/* v0.10.35 — client side of per-account data spaces.
 *
 * attachIdentity(accountId | null) tells the local server which cloud account
 * is active (or that the user signed out). The server rotates the `nama_uid`
 * cookie to that account's OWN data space, so profile / history / watchlist /
 * favorites / ratings / collections become per-account. Returns whether the
 * active space actually changed — the caller must reload personal data then.
 *
 * v0.27.0 — `attached` (user-review DATA-15): true ONLY when the identity
 * round-trip actually reached the local server and succeeded. Offline it is
 * false, and fullSync() MUST then refuse to merge the cloud snapshot —
 * otherwise account B's cloud rows would land inside account A's still-active
 * data space (the «offline login shows the previous account's data» leak).
 *
 * On Android (static export) the same call is served by the mobile shim
 * (src/lib/mobile/shim.ts → switchIdentity in userdata.ts), so all platforms
 * share the exact same client orchestration. */

export type IdentityAttachResult = { switched: boolean; attached: boolean };

export async function attachIdentity(
  accountId: string | null,
  accessToken?: string | null,
): Promise<IdentityAttachResult> {
  try {
    /* C-2 — توکن دسترسی سابابیس همراه attach ارسال می‌شود؛ سرور قبل از
     * چرخاندن فضای داده، مالکیت حساب را با همان توکن تأیید می‌کند. */
    const r = await fetch("/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        accountId
          ? { accountId, ...(accessToken ? { accessToken } : {}) }
          : { reset: true },
      ),
    });
    if (!r.ok) return { switched: false, attached: false };
    const d = (await r.json()) as { switched?: boolean; attached?: boolean };
    return { switched: Boolean(d.switched), attached: d.attached !== false };
  } catch {
    // offline → keep the current space; the next successful attach fixes it.
    // `attached:false` tells the cloud layer NOT to merge in this state.
    return { switched: false, attached: false };
  }
}
