"use client";

/* Small pill shown on the /profile page header (v0.10.10): when the user is
 * signed into their cloud account, the account email appears under the local
 * profile name so it is obvious the account exists and is connected.
 * Renders nothing while signed out (the navbar CTA handles that case). */

import { useCloudSession } from "@/lib/cloud";

export default function CloudIdentityBadge() {
  const { ready, session } = useCloudSession();
  if (!ready || !session) return null;
  const email = session.user?.email ?? "";
  if (!email) return null;
  return (
    <p
      dir="ltr"
      title={email}
      className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      <span className="truncate">{email}</span>
    </p>
  );
}
