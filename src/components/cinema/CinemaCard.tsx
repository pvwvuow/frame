"use client";

/* v0.14.0 — CINEMA card on the home page: join a friend's cinema by code,
 * or get back into the room you are already in. Room data lives in
 * src/lib/cinema.ts (Supabase realtime — no extra server). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCinema, cinemaWatchHref, normalizeCode } from "@/lib/cinema";
import { useLibrary } from "@/components/library/LibraryProvider";
import { useI18n } from "@/components/i18n/LocaleProvider";

const REASONS: Record<string, string> = {
  auth: "برای جوین دادن اول وارد حسابت شو",
  code: "اتاقی با این کد پیدا نشد",
  closed: "این سینما بسته شده",
  network: "اتصال برقرار نشد — اینترنت را چک کن",
};

export default function CinemaCard() {
  const cin = useCinema();
  const router = useRouter();
  const { profile } = useLibrary();
  const { locale } = useI18n();
  const en = locale === "en";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const join = async () => {
    const c = normalizeCode(code);
    if (c.length < 4) {
      setErr(en ? "Enter the 6-char room code" : "کد ۶ حرفی اتاق را وارد کن");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await cin.guestJoin(c, profile.displayName || "مهمان");
    setBusy(false);
    if (!r.ok) {
      setErr(REASONS[r.reason ?? "network"]);
      return;
    }
    // navigate to whatever the host is watching; the player finishes the join
    const room = useCinema.getState().room;
    if (room) router.push(cinemaWatchHref(room.slug, room.season, room.epnum));
  };

  const active = cin.status !== "idle" && cin.room;

  return (
    <section dir="rtl" className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-l from-brand/[0.14] via-white/[0.03] to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-lg font-black text-white">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
                <rect x="2" y="5" width="20" height="14" rx="3" />
                <path d="M7 5v14M17 5v14M2 10h5M2 14h5M17 10h5M17 14h5" />
              </svg>
              سینما
            </p>
            {active ? (
              <p className="mt-1 truncate text-sm text-zinc-400">
                {cin.status === "hosting" ? "تو میزبان این سینمایی" : "تو مهمان سینمای"}{" "}
                <span className="font-bold text-zinc-200">{cin.room!.title || cin.room!.slug}</span>
                {cin.members.length > 1 && <span className="text-zinc-500"> · {cin.members.length.toLocaleString("fa-IR")} نفر داخل</span>}
              </p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                فیلمی که دوست‌ات پخش می‌کند را هم‌زمان با او ببین — کد ۶ حرفی سینما را وارد کن.
              </p>
            )}
          </div>

          {active ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(cinemaWatchHref(cin.room!.slug, cin.room!.season, cin.room!.epnum))}
                className="flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-black text-white shadow-[0_0_24px_var(--color-brand-glow)] transition hover:bg-brand/85"
              >
                بازگشت به سینما
              </button>
              <button
                type="button"
                onClick={() => (cin.status === "hosting" ? void cin.hostClose() : cin.leave())}
                className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-zinc-300 transition hover:bg-white/10"
              >
                {cin.status === "hosting" ? "پایان" : "خروج"}
              </button>
            </div>
          ) : (
            <form
              className="flex shrink-0 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 7))}
                placeholder="کد سینما"
                dir="ltr"
                inputMode="text"
                autoComplete="off"
                className="h-11 w-40 rounded-full border border-white/15 bg-black/30 px-4 text-center text-sm font-black tracking-[0.25em] text-white placeholder:font-medium placeholder:tracking-normal placeholder:text-zinc-500 focus:border-brand/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="flex h-11 items-center rounded-full bg-brand px-6 text-sm font-black text-white shadow-[0_0_24px_var(--color-brand-glow)] transition hover:bg-brand/85 disabled:opacity-60"
              >
                {busy ? "…" : en ? "Join" : "جوین"}
              </button>
            </form>
          )}
        </div>
        {err && <p className="mt-3 text-xs font-semibold text-rose-300">{err}</p>}
      </div>
    </section>
  );
}
