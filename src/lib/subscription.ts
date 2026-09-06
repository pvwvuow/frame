"use client";

/* Frame VIP subscription (client-side, Supabase-backed).
 *
 * Flow (per user request):
 *   - watching requires: signed in + active subscription
 *   - entitlement comes from the `subscriptions` table (user can read ONLY
 *     their own row via RLS)
 *   - activation is by CODE: the `activate_code` Postgres function (security
 *     definer) validates a code from `subscription_codes`, burns it and
 *     extends the user's expiry — stacking on the remaining time
 *
 * The user never gets read access to the codes table: they can only try a
 * code blindly through the RPC, so leaked lists are impossible.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabase, useCloudSession } from "./cloud";

export type Plan = "m1" | "m3" | "m6" | "y1" | "life";

export const PLAN_LABELS: Record<Plan, { fa: string; en: string }> = {
  m1: { fa: "یک‌ماهه", en: "1 Month" },
  m3: { fa: "سه‌ماهه", en: "3 Months" },
  m6: { fa: "شش‌ماهه", en: "6 Months" },
  y1: { fa: "یک‌ساله", en: "1 Year" },
  life: { fa: "مادام‌العمر", en: "Lifetime" },
};

export type SubState = {
  ready: boolean; // session known AND entitlement fetched (or not needed)
  signedIn: boolean;
  active: boolean;
  lifetime: boolean;
  plan: Plan | null;
  expiresAt: string | null; // ISO
};

export type ActivateResult =
  | { ok: true; plan: Plan; expiresAt: string | null }
  | { ok: false; error: string };

/** Master switch for the paywall — flip to false to open the app for free. */
export const SUBSCRIPTION_REQUIRED = true;

export function useSubscription(): SubState & {
  refresh: () => void;
  activate: (code: string) => Promise<ActivateResult>;
} {
  const { ready: sessionReady, session } = useCloudSession();
  const [state, setState] = useState<SubState>({
    ready: false,
    signedIn: false,
    active: false,
    lifetime: false,
    plan: null,
    expiresAt: null,
  });
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const sb = getSupabase();

    if (!sessionReady) return; // wait for the session to resolve
    if (!session || !sb) {
      if (alive)
        setState({ ready: true, signedIn: false, active: false, lifetime: false, plan: null, expiresAt: null });
      return;
    }

    (async () => {
      try {
        const uid = session.user.id;
        // .maybeSingle(): no row yet = valid "no subscription" state, not an error
        const { data, error } = await sb
          .from("subscriptions")
          .select("plan, expires_at")
          .eq("user_id", uid)
          .maybeSingle();
        if (!alive) return;
        if (error) throw error;
        const plan = (data?.plan as Plan | undefined) ?? null;
        const expiresAt = (data?.expires_at as string | undefined) ?? null;
        const lifetime = plan === "life" || (plan !== null && expiresAt === null);
        const active =
          plan !== null && (lifetime || (expiresAt ? new Date(expiresAt).getTime() > Date.now() : false));
        setState({ ready: true, signedIn: true, active, lifetime, plan, expiresAt });
      } catch {
        // table missing (SQL not run yet) / offline → safe default: not entitled
        if (alive)
          setState({ ready: true, signedIn: true, active: false, lifetime: false, plan: null, expiresAt: null });
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionReady, session, tick]);

  const activate = useCallback(
    async (code: string): Promise<ActivateResult> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, error: "not_signed_in" };
      const clean = code.trim().toUpperCase();
      if (!clean) return { ok: false, error: "code_not_found" };
      try {
        const { data, error } = await sb.rpc("activate_code", { p_code: clean });
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("code_not_found")) return { ok: false, error: "code_not_found" };
          if (msg.includes("code_already_used")) return { ok: false, error: "code_already_used" };
          if (msg.includes("not_signed_in")) return { ok: false, error: "not_signed_in" };
          return { ok: false, error: "rpc_failed" };
        }
        refresh();
        const d = (data ?? {}) as { plan?: Plan; expires_at?: string | null };
        return { ok: true, plan: d.plan ?? "m1", expiresAt: d.expires_at ?? null };
      } catch {
        return { ok: false, error: "rpc_failed" };
      }
    },
    [refresh]
  );

  return { ...state, refresh, activate };
}

/** Friendly fa/en message for an activation failure. */
export function activationErrorText(kind: string, en: boolean): string {
  switch (kind) {
    case "code_not_found":
      return en ? "Code not found — double-check it." : "کد پیدا نشد — دوباره بررسیش کن.";
    case "code_already_used":
      return en ? "This code has already been used." : "این کد قبلاً استفاده شده.";
    case "not_signed_in":
      return en ? "Sign in first, then activate the code." : "اول وارد حسابت شو، بعد کد را فعال کن.";
    default:
      return en
        ? "Activation failed. Try again or contact support."
        : "فعال‌سازی انجام نشد. دوباره تلاش کن یا با پشتیبانی تماس بگیر.";
  }
}
