"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { UserIcon, RefreshIcon, HeartIcon, BookmarkIcon } from "@/components/Icons";
import {
  fullSync,
  getSupabase,
  getSupabaseUrl,
  isSupabaseConfigured,
  setSupabaseUrl,
  useCloudSession,
} from "@/lib/cloud";

type Mode = "login" | "signup";

const ERRORS: Record<string, { fa: string; en: string }> = {
  email_not_confirmed: {
    fa: "ایمیل شما هنوز تأیید نشده است. لطفاً صندوق ورودی (و اسپم) را ببینید. برای راحتی کاربران می‌توانید در داشبورد Supabase ← Authentication ← Providers ← Email گزینهٔ Confirm email را خاموش کنید.",
    en: "Your email is not confirmed yet. Check your inbox (and spam). Tip: in the Supabase dashboard you can turn off 'Confirm email' for a smoother experience.",
  },
  invalid_credentials: { fa: "ایمیل یا رمز عبور اشتباه است.", en: "Wrong email or password." },
  user_already_exists: { fa: "این ایمیل قبلاً ثبت شده است؛ وارد شوید.", en: "This email is already registered; sign in instead." },
  weak_password: { fa: "رمز عبور باید حداقل ۶ کاراکتر باشد.", en: "Password must be at least 6 characters." },
  over_request_rate_limit: { fa: "تلاش‌های زیاد؛ چند دقیقه بعد دوباره امتحان کنید.", en: "Too many attempts; try again in a few minutes." },
  signups_not_allowed: { fa: "ثبت‌نام روی این سرور غیرفعال است.", en: "Sign-ups are disabled on this server." },
};

function friendlyError(msg: string, locale: string): string {
  const m = msg.toLowerCase();
  for (const key of Object.keys(ERRORS)) {
    if (m.includes(key.replace(/_/g, " ")) || m.includes(key)) return ERRORS[key][locale === "en" ? "en" : "fa"];
  }
  if (m.includes("fetch") || m.includes("network") || m.includes("failed"))
    return locale === "en"
      ? "Could not reach the server. Check the project URL and your connection."
      : "اتصال به سرور برقرار نشد. آدرس پروژه و اینترنت را بررسی کنید.";
  return msg || (locale === "en" ? "Something went wrong." : "خطایی رخ داد.");
}

export default function AuthPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const { ready, session } = useCloudSession();
  const en = locale === "en";

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  // url setup form
  const [urlDraft, setUrlDraft] = useState("");
  const [showUrlForm, setShowUrlForm] = useState(false);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
    setUrlDraft(getSupabaseUrl());
  }, []);

  const emailOk = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  async function saveUrl() {
    const v = urlDraft.trim();
    if (!/^https?:\/\/.+\..+/.test(v)) {
      toast.error(en ? "Enter a full URL like https://xxxx.supabase.co" : "آدرس کامل مثل https://xxxx.supabase.co را وارد کنید");
      return;
    }
    setSupabaseUrl(v);
    toast.success(en ? "Saved. Reloading…" : "ذخیره شد. در حال بارگذاری مجدد…");
    setTimeout(() => window.location.reload(), 600);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !emailOk || password.length < 6) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;
        toast.success(en ? "Account created! You are signed in." : "حساب ساخته شد! وارد شدید. 🎉");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success(en ? "Welcome back!" : "خوش برگشتی! 👋");
      }
      // bring the cloud data down, then push local rows up — in the background
      fullSync().then((r) => {
        if (r.ok) toast.message(en ? "Library synced with the cloud." : "کتابخانه‌ات با فضای ابری همگام شد.");
      });
      router.push("/");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(friendlyError(msg, locale));
    } finally {
      setBusy(false);
    }
  }

  async function doSync() {
    setSyncing(true);
    try {
      const r = await fullSync();
      if (r.ok) toast.success(en ? "Sync complete ✅" : "همگام‌سازی کامل شد ✅");
      else toast.error(en ? "Sync failed." : "همگام‌سازی ناموفق بود.");
      router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function doSignOut() {
    const sb = getSupabase();
    await sb?.auth.signOut();
    toast.success(en ? "Signed out." : "از حساب خارج شدی.");
  }

  /* ---------------- signed-in view ---------------- */
  if (ready && session) {
    const mail = session.user.email ?? "";
    const metaName = (session.user.user_metadata as { display_name?: string } | null)?.display_name ?? "";
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-14">
        <div className="glass-strong rounded-3xl border border-white/10 p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand/70 to-rose-600/70 text-white shadow-lg">
            <UserIcon width={30} height={30} />
          </div>
          <h1 className="mt-4 text-xl font-black text-white">{metaName || mail}</h1>
          <p dir="ltr" className="mt-1 truncate text-xs text-zinc-400">{mail}</p>

          <div className="mt-5 grid grid-cols-2 gap-2 text-[11px] font-bold">
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-white">
              <HeartIcon width={14} height={14} className="mx-auto mb-1 text-rose-400" filled />
              {en ? "Favorites" : "علاقه‌مندی‌ها"}
              <span className="block text-[9px] font-medium text-zinc-400">{en ? "synced to cloud" : "در فضای ابری"}</span>
            </div>
            <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-white">
              <BookmarkIcon width={14} height={14} className="mx-auto mb-1 text-sky-400" />
              {en ? "Watch progress" : "پیشرفت پخش"}
              <span className="block text-[9px] font-medium text-zinc-400">{en ? "local only" : "فقط روی همین دستگاه"}</span>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={doSync}
              disabled={syncing}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-black text-white transition hover:bg-brand/85 disabled:opacity-60"
            >
              <RefreshIcon width={15} height={15} className={syncing ? "animate-spin" : ""} />
              {syncing ? (en ? "Syncing…" : "در حال همگام‌سازی…") : en ? "Sync now" : "همگام‌سازی اکنون"}
            </button>
            <button
              type="button"
              onClick={doSignOut}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/10 hover:text-white"
            >
              {en ? "Sign out" : "خروج"}
            </button>
          </div>
          <Link href="/" className="mt-4 inline-block text-xs text-zinc-400 transition hover:text-brand">
            {en ? "← Back to home" : "← بازگشت به خانه"}
          </Link>
        </div>
      </main>
    );
  }

  /* ---------------- setup + auth forms ---------------- */
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-14">
      <div className="glass-strong rounded-3xl border border-white/10 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand/70 to-rose-600/70 text-white shadow-lg">
            <UserIcon width={26} height={26} />
          </div>
          <h1 className="mt-3 text-xl font-black text-white">{en ? "Sign in to Frame" : "ورود به فریم"}</h1>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            {en
              ? "Favorites, your list and ratings live in your cloud account. Watch progress always stays on this device."
              : "علاقه‌مندی‌ها، لیست شما و امتیازها داخل حساب ابری‌ات ذخیره می‌شوند؛ پیشرفت پخش فیلم همیشه فقط روی همین دستگاه می‌ماند."}
          </p>
        </div>

        {configured === false && (
          <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-xs leading-6 text-amber-100">
            <p className="font-bold">{en ? "Server connection needed" : "اتصال به سرور Supabase"}</p>
            <p className="mt-1 text-amber-200/90">
              {en
                ? "Paste your Supabase project URL once (Dashboard → Project Settings → API → Project URL)."
                : "یک‌بار آدرس پروژهٔ Supabase را وارد کنید (داشبورد ← Project Settings ← API ← Project URL)."}
            </p>
            {!showUrlForm ? (
              <button type="button" onClick={() => setShowUrlForm(true)} className="mt-2 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1.5 font-bold text-white transition hover:bg-amber-400/25">
                {en ? "Enter URL" : "وارد کردن آدرس"}
              </button>
            ) : (
              <div className="mt-3 flex gap-2" dir="ltr">
                <input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://xxxxxxxx.supabase.co"
                  className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60"
                />
                <button type="button" onClick={saveUrl} className="rounded-full bg-brand px-4 py-2 text-sm font-black text-white transition hover:bg-brand/85">
                  {en ? "Save" : "ذخیره"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* tabs */}
        {configured !== false && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
              {(["login", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                  aria-pressed={mode === m}
                  className={`rounded-full py-2.5 text-sm font-black transition ${
                    mode === m ? "bg-brand text-white shadow" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {m === "login" ? (en ? "Sign in" : "ورود") : en ? "Create account" : "ثبت‌نام"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "signup" && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-zinc-400">{en ? "Display name (optional)" : "نام نمایشی (اختیاری)"}</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={40}
                    className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/60"
                    placeholder={en ? "e.g. Ali" : "مثلاً علی"}
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-zinc-400">{en ? "Email" : "ایمیل"}</span>
                <input
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/60"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-zinc-400">{en ? "Password" : "رمز عبور"}</span>
                <input
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/60"
                  placeholder="••••••••"
                />
              </label>

              {error && (
                <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs leading-6 text-rose-200">{error}</p>
              )}

              <button
                type="submit"
                disabled={busy || !emailOk || password.length < 6}
                className="w-full rounded-full bg-brand px-4 py-3.5 text-sm font-black text-white transition hover:bg-brand/85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy
                  ? en
                    ? "Please wait…"
                    : "لطفاً صبر کنید…"
                  : mode === "login"
                    ? en
                      ? "Sign in"
                      : "ورود"
                    : en
                      ? "Create my account"
                      : "ساخت حساب"}
              </button>
            </form>

            <p className="mt-4 text-center text-[11px] leading-5 text-zinc-500">
              {en
                ? "By continuing you agree that your library data (favorites, list, ratings) is stored on our cloud server."
                : "با ورود، داده‌های کتابخانه‌ات (علاقه‌مندی‌ها، لیست و امتیازها) روی سرور ابری ذخیره می‌شود. پیشرفت تماشا فقط روی دستگاه خودت می‌ماند."}
            </p>

            {configured && (
              <button
                type="button"
                onClick={() => setShowUrlForm((s) => !s)}
                className="mx-auto mt-3 block text-[10px] text-zinc-600 transition hover:text-zinc-400"
              >
                {showUrlForm ? (en ? "hide connection settings" : "بستن تنظیمات اتصال") : en ? "connection settings" : "تنظیمات اتصال به سرور"}
              </button>
            )}
            {showUrlForm && configured && (
              <div className="mt-2 flex gap-2" dir="ltr">
                <input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder="https://xxxxxxxx.supabase.co"
                  className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60"
                />
                <button type="button" onClick={saveUrl} className="rounded-full bg-brand px-4 py-2 text-sm font-black text-white transition hover:bg-brand/85">
                  {en ? "Save" : "ذخیره"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
