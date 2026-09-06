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
import { fa } from "@/lib/format";

type PlanDef = { key: Plan; title: string; note: string; noteEn: string; hot?: boolean };

const PLANS: PlanDef[] = [
  { key: "m1", title: "یک‌ماهه", note: "یک ماه تماشای کامل", noteEn: "1 month of full access" },
  { key: "m3", title: "سه‌ماهه", note: "سه ماه تماشای کامل", noteEn: "3 months of full access" },
  { key: "m6", title: "شش‌ماهه", note: "شش ماه تماشای کامل", noteEn: "6 months of full access", hot: true },
  { key: "y1", title: "یک‌ساله", note: "یک سال تماشای کامل", noteEn: "1 year of full access" },
  { key: "life", title: "مادام‌العمر", note: "برای همیشه، بدون انقضا", noteEn: "Forever, never expires" },
];

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
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-[0_0_30px_rgba(245,158,11,0.35)]">
            <CrownIcon width={30} height={30} />
          </span>
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
    <main dir={dir} className="mx-auto w-full max-w-3xl px-4 pb-16 pt-28 sm:px-8 lg:pt-32">
      {/* header */}
      <div className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-[0_0_34px_rgba(245,158,11,0.4)]">
          <CrownIcon width={32} height={32} />
        </span>
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
