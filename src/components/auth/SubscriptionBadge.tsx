"use client";

/* Subscription status pill on the /profile page (v0.10.11):
 *  - active  → gold pill: plan + expiry (fa calendar) / مادام‌العمر
 *  - none    → amber-tinted pill linking to /vip
 *  - signed out → renders nothing (the auth badge area handles that) */

import Link from "next/link";
import { CrownIcon } from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";
import { PLAN_LABELS, useSubscription } from "@/lib/subscription";

export default function SubscriptionBadge() {
  const { locale } = useI18n();
  const { ready, signedIn, active, lifetime, plan, expiresAt } = useSubscription();
  const en = locale === "en";

  if (!ready || !signedIn) return null;

  if (active) {
    const daysLeft = expiresAt
      ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
      : null;
    const expiry = expiresAt
      ? new Date(expiresAt).toLocaleDateString(en ? "en-US" : "fa-IR", { year: "numeric", month: "long", day: "numeric" })
      : null;
    return (
      <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold text-amber-300">
        <CrownIcon width={13} height={13} className="shrink-0" />
        <span className="truncate">
          {lifetime
            ? en
              ? "VIP · Lifetime"
              : "اشتراک ویژه · مادام‌العمر"
            : `${en ? "VIP ·" : "اشتراک ویژه ·"} ${PLAN_LABELS[plan ?? "m1"][en ? "en" : "fa"]}${
                expiry ? ` · ${en ? "until" : "تا"} ${expiry}` : ""
              }${daysLeft != null && !en ? ` (${daysLeft} روز)` : ""}`}
        </span>
      </p>
    );
  }

  return (
    <Link
      href="/vip"
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
    >
      <CrownIcon width={13} height={13} className="shrink-0 text-zinc-500" />
      <span className="truncate">{en ? "No subscription — get VIP" : "بدون اشتراک فعال — دریافت VIP"}</span>
    </Link>
  );
}
