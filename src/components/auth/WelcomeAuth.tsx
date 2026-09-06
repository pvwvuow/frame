"use client";

/* First-launch onboarding prompt (v0.10.10).
 *
 * The user asked: if a user installs or uses the app for the first time,
 * show a popup telling them to sign in or sign up.
 *
 * Behaviour:
 *   - Shows ONCE, ~1.6s after the app first paints (so the home hero is
 *     already visible), ONLY while signed out of the cloud account.
 *   - A localStorage flag (frame.welcome.v1) guarantees it never nags again —
 *     dismissed, visited /auth, or already signed in → gone forever.
 *   - The permanent entry point remains the navbar sign-in button.
 *   - Mounted inside <HideOnPip> so it never pops over the floating player.
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCloudSession } from "@/lib/cloud";
import { useI18n } from "../i18n/LocaleProvider";
import { CloseIcon, UserIcon } from "../Icons";

const SEEN_KEY = "frame.welcome.v1";

const T = {
  title: { en: "Welcome to Frame", fa: "به فریم خوش آمدی!" },
  body: {
    en: "Create a free account — or sign in — to keep your favorites, watchlist and ratings in sync across all of your devices.",
    fa: "یک حساب رایگان بساز یا وارد شو تا علاقه‌مندی‌ها، لیست تماشا و امتیازهایت بین همه‌ی دستگاه‌هایت همگام بماند.",
  },
  cta: { en: "Sign in / Sign up", fa: "ورود / ثبت‌نام" },
  later: { en: "Maybe later", fa: "بعداً" },
  note: {
    en: "Your watch progress always stays private on this device.",
    fa: "پیشرفت تماشای تو همیشه خصوصی و فقط روی همین دستگاه ذخیره می‌شود.",
  },
  dialogLabel: { en: "Sign in or sign up", fa: "ورود یا ثبت‌نام" },
  close: { en: "Close", fa: "بستن" },
} as const;

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — worst case the prompt reappears next launch */
  }
}

export default function WelcomeAuth() {
  const { ready, session } = useCloudSession();
  const { locale, dir } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false);
  const en = locale === "en";
  const tx = (k: keyof typeof T) => T[k][en ? "en" : "fa"];

  useEffect(() => {
    if (!ready || session) return; // signed in → nothing to offer
    let seen = false;
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
    } catch {
      seen = true; // storage unavailable → stay quiet
    }
    if (seen) return;
    if (pathname === "/auth") {
      markSeen(); // already heading to the auth page
      return;
    }
    const t = window.setTimeout(() => {
      markSeen(); // set immediately so it shows exactly once per install
      setShow(true);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [ready, session, pathname]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show]);

  const go = useCallback(() => {
    markSeen();
    setShow(false);
    router.push("/auth");
  }, [router]);
  const dismiss = useCallback(() => setShow(false), []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="welcome-auth"
          className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={tx("dialogLabel")}
            dir={dir}
            onMouseDown={(e) => e.stopPropagation()}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
            className="glass-strong relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.7)] sm:p-7"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,rgba(229,9,20,0.22),transparent_65%)]" />

            <button
              type="button"
              onClick={dismiss}
              aria-label={tx("close")}
              className="absolute end-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon width={14} height={14} />
            </button>

            <div className="relative">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand to-rose-500 text-white shadow-[0_0_30px_var(--color-brand-glow)]">
                <UserIcon width={26} height={26} />
              </span>

              <h2 className="mt-4 text-2xl font-black text-white">{tx("title")}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{tx("body")}</p>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={go}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-black text-white shadow-[0_0_24px_var(--color-brand-glow)] transition hover:bg-brand/85"
                >
                  <UserIcon width={17} height={17} />
                  {tx("cta")}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                >
                  {tx("later")}
                </button>
              </div>

              <p className="mt-4 text-center text-[11px] leading-5 text-zinc-500">{tx("note")}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
