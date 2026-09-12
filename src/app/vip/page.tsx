"use client";

/* VIP subscription page (v0.10.11):
 *  - current entitlement status (plan + expiry, fa calendar)
 *  - plans: 1 / 3 / 6 months, 1 year, lifetime
 *  - activation by code (codes live in Supabase; the owner hands them to
 *    customers — activation goes through the activate_code RPC, so users
 *    can never read or reuse codes) */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { UserIcon, CrownIcon, CheckCircleIcon, SparkIcon } from "@/components/Icons";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useCloudSession } from "@/lib/cloud";
import { PLAN_LABELS, activationErrorText, useSubscription, type Plan } from "@/lib/subscription";
import { AmbientGhost, useFamousPosterPool, useGhostDelays, type GhostSlot } from "@/components/ambient";
import { fa } from "@/lib/format";

type PlanDef = { key: Plan; title: string; note: string; noteEn: string; hot?: boolean };

/* Gold Frame emblem — v0.10.27: the user's artwork, verbatim. No tile, no
   ring, no glow, no gloss sweep (all removed per feedback); the PNG renders
   at its natural 404×512 aspect with just a height hint for layout. */
function VipEmblem({ size = 68 }: { size?: number }) {
  return (
    <img
      src="/vip/logo-gold.png"
      alt=""
      draggable={false}
      className="mx-auto block w-auto select-none"
      style={{ height: size }}
    />
  );
}

const PLANS: PlanDef[] = [
  { key: "m1", title: "یک‌ماهه", note: "یک ماه تماشای کامل", noteEn: "1 month of full access" },
  { key: "m3", title: "سه‌ماهه", note: "سه ماه تماشای کامل", noteEn: "3 months of full access" },
  { key: "m6", title: "شش‌ماهه", note: "شش ماه تماشای کامل", noteEn: "6 months of full access", hot: true },
  { key: "y1", title: "یک‌ساله", note: "یک سال تماشای کامل", noteEn: "1 year of full access" },
  { key: "life", title: "مادام‌العمر", note: "برای همیشه، بدون انقضا", noteEn: "Forever, never expires" },
];

/* ── VIP ambient backdrop (v0.30.4 → v0.30.9) ──────────────────────────
 * OVAL COVERS (v0.30.10 — the user flipped back from posters to the wide
 * cover form, shaped as soft fade-out ellipses so no border ever shows)
 * of the all-time famous titles drift in and out of the blackness:
 * TEN staggered slots, fast cycles (9–15s). Shared machinery lives in
 * components/ambient.tsx; only the slot table is VIP-specific here. */
const AMBIENT_SLOTS: GhostSlot[] = [
  { left: "2%",  top: "7%",  w: 460, dur: 10, delay: -2,  o: 0.38, blur: 2, tilt: "-3deg" },
  { left: "66%", top: "12%", w: 420, dur: 12, delay: -7,  o: 0.34, blur: 3, tilt: "2deg" },
  { left: "10%", top: "32%", w: 380, dur: 13, delay: -11, o: 0.28, blur: 3, tilt: "3deg" },
  { left: "58%", top: "40%", w: 440, dur: 9,  delay: -4,  o: 0.35, blur: 2, tilt: "-2deg" },
  { left: "3%",  top: "58%", w: 400, dur: 14, delay: -9,  o: 0.32, blur: 3, tilt: "4deg" },
  { left: "70%", top: "66%", w: 460, dur: 11, delay: -6,  o: 0.38, blur: 2, tilt: "-3deg" },
  { left: "24%", top: "82%", w: 420, dur: 12, delay: -3,  o: 0.32, blur: 4, tilt: "2deg" },
  { left: "42%", top: "18%", w: 360, dur: 15, delay: -12, o: 0.24, blur: 4, tilt: "-4deg" },
  { left: "38%", top: "72%", w: 390, dur: 10, delay: -8,  o: 0.26, blur: 4, tilt: "3deg" },
  { left: "84%", top: "30%", w: 340, dur: 13, delay: -5,  o: 0.30, blur: 3, tilt: "-2deg" },
];

function AmbientSlot({
  slot,
  covers,
  startIndex,
  revealDelay,
}: {
  slot: GhostSlot;
  covers: string[];
  startIndex: number;
  revealDelay: number;
}) {
  return <AmbientGhost slot={slot} covers={covers} startIndex={startIndex} advance={AMBIENT_SLOTS.length} maxWidth="46vw" shape="oval" revealDelay={revealDelay} />;
}

function VipAmbient() {
  const covers = useFamousPosterPool(42, "backdrop");
  /* v0.30.12: a soft random entrance — the ten covers no longer surface
   * as one simultaneous block, they drift in one after another (0–2.4s) */
  const reveal = useGhostDelays(AMBIENT_SLOTS.length, 2.4);

  if (covers.length < AMBIENT_SLOTS.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {AMBIENT_SLOTS.map((slot, i) => (
        <AmbientSlot key={i} slot={slot} covers={covers} startIndex={i * 4} revealDelay={reveal[i] ?? 0} />
      ))}
      {/* sink everything into the blackness at the edges */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 95% at 50% 38%, transparent 42%, rgba(7, 7, 11, 0.9) 100%)" }}
      />
    </div>
  );
}

export default function VipPage() {
  const { locale, dir } = useI18n();
  const { ready, session } = useCloudSession();
  const sub = useSubscription();
  const en = locale === "en";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function activate() {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const r = await sub.activate(code);
      if (r.ok) {
        setCode("");
        toast.success(
          r.plan === "life" || r.expiresAt === null
            ? en
              ? "Lifetime subscription activated! Enjoy."
              : "اشتراک مادام‌العمر فعال شد! خوش بگذره 🎉"
            : en
              ? "Subscription activated successfully!"
              : "اشتراک با موفقیت فعال شد! 🎉"
        );
      } else {
        toast.error(activationErrorText(r.error, en));
      }
    } finally {
      setBusy(false);
    }
  }

  const daysLeft = sub.expiresAt
    ? Math.max(0, Math.ceil((new Date(sub.expiresAt).getTime() - Date.now()) / 86_400_000))
    : null;
  const expiryFa = sub.expiresAt
    ? new Date(sub.expiresAt).toLocaleDateString(en ? "en-US" : "fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  /* ---------------- signed out ---------------- */
  if (ready && !session) {
    return (
      <main dir={dir} className="flex min-h-[calc(100dvh-72px)] items-center justify-center px-4 py-10">
        <div className="glass-strong w-full max-w-md rounded-[28px] border border-white/10 p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <VipEmblem size={64} />
          <h1 className="mt-4 text-xl font-black text-white">
            {en ? "Sign in to manage your VIP" : "اول وارد حسابت شو"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {en
              ? "Sign in (or create a free account) to activate a VIP code."
              : "برای فعال‌سازی کد اشتراک ویژه، اول وارد حسابت شو یا حساب رایگان بساز."}
          </p>
          <Link
            href="/auth"
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-black text-white shadow-[0_0_24px_var(--color-brand-glow)] transition hover:bg-brand/85"
          >
            <UserIcon width={17} height={17} />
            {en ? "Sign in / Sign up" : "ورود / ثبت‌نام"}
          </Link>
        </div>
      </main>
    );
  }

  /* ---------------- main VIP page ---------------- */
  return (
    /* isolate: WITHOUT a stacking context on <main>, the ambient’s -z-10
     * resolves against the ROOT context and paints BELOW <body>’s opaque
     * bg-ink (html sets its own background, so body’s never propagates to
     * the canvas) → the whole effect stayed invisible behind the black.
     * Isolating <main> contains the negative-z layer inside it: above the
     * body background, below the page content — what v0.30.4 intended. */
    <main dir={dir} className="isolate mx-auto w-full max-w-3xl px-4 pb-16 pt-28 sm:px-8 lg:pt-32">
      {/* v0.30.4 — covers of top titles surfacing & dissolving in the dark */}
      <VipAmbient />

      {/* header */}
      <div className="text-center">
        <VipEmblem size={76} />
        <h1 className="mt-4 text-3xl font-black text-white sm:text-4xl">
          {en ? (
            <>
              Frame{" "}
              <span className="bg-gradient-to-l from-amber-300 to-amber-500 bg-clip-text text-transparent">VIP</span>
            </>
          ) : (
            <>
              اشتراک{" "}
              <span className="bg-gradient-to-l from-amber-300 to-amber-500 bg-clip-text text-transparent">
                ویژه فریم
              </span>
            </>
          )}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
          {en
            ? "Unlimited movies & series on all your devices. Buy a code from support, enter it here, done."
            : "تماشای نامحدود فیلم و سریال روی همه‌ی دستگاه‌هات. کد را از پشتیبانی بگیر، همین‌جا واردش کن، تمام."}
        </p>
      </div>

      {/* current status */}
      <div
        className={`mt-8 flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-5 ${
          sub.active ? "border-amber-400/30 bg-amber-400/10" : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`grid h-11 w-11 place-items-center rounded-2xl ${
              sub.active ? "bg-amber-400/20 text-amber-300" : "bg-white/5 text-zinc-500"
            }`}
          >
            {sub.active ? <CheckCircleIcon width={22} height={22} /> : <CrownIcon width={22} height={22} />}
          </span>
          <div>
            <p className="text-sm font-black text-white">
              {sub.ready && sub.active
                ? sub.lifetime
                  ? en
                    ? "Lifetime VIP"
                    : "اشتراک ویژه · مادام‌العمر"
                  : `${en ? "VIP ·" : "اشتراک ویژه ·"} ${PLAN_LABELS[sub.plan ?? "m1"][en ? "en" : "fa"]}`
                : en
                  ? "No active subscription"
                  : "اشتراک فعالی نداری"}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {sub.ready && sub.active && !sub.lifetime && expiryFa
                ? `${en ? "Valid until" : "معتبر تا"} ${expiryFa}${
                    daysLeft != null ? ` · ${en ? `${daysLeft} days left` : `${fa(daysLeft)} روز باقی‌مانده`}` : ""
                  }`
                : sub.ready && sub.active
                  ? en
                    ? "Never expires"
                    : "بدون انقضا — برای همیشه"
                  : en
                    ? "Activate a code below to unlock everything."
                    : "برای باز شدن همه‌چیز، کدت را در کادر پایین فعال کن."}
            </p>
          </div>
        </div>
        {!sub.ready && <span className="text-xs text-zinc-500">{en ? "checking…" : "در حال بررسی…"}</span>}
      </div>

      {/* code activation */}
      <div className="glass-strong mt-4 rounded-3xl border border-white/10 p-6">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-white">
          <SparkIcon width={18} height={18} className="text-amber-400" />
          {en ? "Activate your code" : "فعال‌سازی کد اشتراک"}
        </h2>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {en
            ? "Type the code you received (looks like FRAME-XXXXX-XXXXX)."
            : "کدی که دریافت کردی را وارد کن (شبیه FRAME-XXXXX-XXXXX)."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && activate()}
            placeholder="FRAME-XXXXX-XXXXX"
            spellCheck={false}
            autoComplete="off"
            className="h-12 flex-1 rounded-full border border-white/10 bg-black/30 px-5 text-center text-sm font-bold tracking-widest text-white placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={activate}
            disabled={busy || !code.trim()}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-l from-amber-400 to-amber-500 px-8 text-sm font-black text-black shadow-[0_0_24px_rgba(245,158,11,0.35)] transition hover:brightness-110 disabled:opacity-50"
          >
            <CrownIcon width={16} height={16} />
            {busy ? (en ? "Activating…" : "در حال فعال‌سازی…") : en ? "Activate" : "فعال‌سازی"}
          </button>
        </div>
      </div>

      {/* plans */}
      <h2 className="mt-10 text-center text-lg font-extrabold text-white">{en ? "Plans" : "پلن‌های اشتراک"}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLANS.map((pl) => {
          const current = sub.active && sub.plan === pl.key && !sub.lifetime;
          return (
            <div
              key={pl.key}
              className={`relative rounded-3xl border p-5 text-center transition ${
                pl.hot
                  ? "border-amber-400/40 bg-gradient-to-b from-amber-400/15 to-transparent"
                  : "border-white/10 bg-white/[0.03]"
              } ${current ? "ring-2 ring-amber-400/60" : ""}`}
            >
              {pl.hot && (
                <span className="absolute -top-2.5 start-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2.5 py-0.5 text-[9px] font-black text-black rtl:translate-x-1/2">
                  {en ? "MOST POPULAR" : "پرطرفدارترین"}
                </span>
              )}
              <CrownIcon width={22} height={22} className={`mx-auto ${pl.hot ? "text-amber-300" : "text-zinc-400"}`} />
              <p className="mt-2 text-base font-black text-white">{pl.title}</p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-400">{en ? pl.noteEn : pl.note}</p>
              {current && <p className="mt-2 text-[10px] font-black text-amber-300">{en ? "YOUR PLAN" : "پلن فعال تو"}</p>}
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs leading-6 text-zinc-500">
        {en
          ? "To buy a code, contact support. Each code works once and extends your remaining time."
          : "برای خرید کد با پشتیبانی در تماس باش. هر کد یک‌بار مصرف است و به زمان باقی‌مانده‌ی اشتراکت اضافه می‌شود."}
      </p>
      <div className="mt-4 text-center">
        <Link href="/" className="text-xs text-zinc-400 transition hover:text-brand">
          {en ? "← Back to home" : "← بازگشت به خانه"}
        </Link>
      </div>
    </main>
  );
}
