"use client";

/* Paywall overlay for the watch page (v0.10.11).
 *  - signed out        → «برای تماشا اول وارد حسابت شو»  → /auth
 *  - signed in, no sub → «اشتراک فعالی نداری»             → /vip
 * Rendered full-screen above the theater player; the video never starts
 * while this is visible (WatchClient only calls play() when allowed). */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserIcon, CrownIcon } from "../Icons";
import { useI18n } from "../i18n/LocaleProvider";

export default function WatchGate({ signedIn }: { signedIn: boolean }) {
  const { locale, dir } = useI18n();
  const router = useRouter();
  const en = locale === "en";

  const headline = !signedIn
    ? en
      ? "Sign in to start watching"
      : "برای تماشا، اول وارد حسابت شو"
    : en
      ? "An active subscription is required"
      : "برای تماشا، اشتراک فعالی لازم داری";

  const body = !signedIn
    ? en
      ? "Create a free account or sign in — then watch everything Frame has."
      : "یک حساب رایگان بساز یا وارد شو تا همه‌ی فیلم و سریال‌های فریم را ببینی."
    : en
      ? "Activate a VIP code once and enjoy unlimited movies and series."
      : "یک‌بار کد اشتراک ویژه (VIP) را فعال کن و بدون محدودیت فیلم و سریال ببین.";

  const cta = !signedIn ? (en ? "Sign in / Sign up" : "ورود / ثبت‌نام") : en ? "Get VIP" : "خرید اشتراک VIP";
  const href = !signedIn ? "/auth" : "/vip";

  return (
    <div dir={dir} className="fixed inset-0 z-[200] grid place-items-center bg-black/90 p-4 backdrop-blur-sm">
      <div className="glass-strong w-full max-w-md rounded-[28px] border border-white/10 p-7 text-center shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
        <span
          className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl text-white shadow-lg ${
            !signedIn
              ? "bg-gradient-to-br from-brand to-rose-600 shadow-[0_0_30px_var(--color-brand-glow)]"
              : "bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_30px_rgba(245,158,11,0.35)]"
          }`}
        >
          {!signedIn ? <UserIcon width={30} height={30} /> : <CrownIcon width={30} height={30} />}
        </span>

        <h2 className="mt-4 text-xl font-black text-white">{headline}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{body}</p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={href}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-black text-white shadow-[0_0_24px_var(--color-brand-glow)] transition hover:bg-brand/85"
          >
            {!signedIn ? <UserIcon width={17} height={17} /> : <CrownIcon width={17} height={17} />}
            {cta}
          </Link>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            {en ? "Back to home" : "بازگشت به خانه"}
          </button>
        </div>
      </div>
    </div>
  );
}
