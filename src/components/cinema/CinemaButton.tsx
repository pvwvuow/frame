"use client";

/* v0.14.1 — CINEMA navbar entry (redesign of the v0.14.0 home card).
 * The user rejected the big home-page card («بزارش بالا») → the whole entry
 * now lives in the top bar as one compact button in the DARKROOM editorial
 * language: hairlines, hard grid, Frame Mono codes, one red accent.
 *
 * States:
 *   live room  → pulsing red dot + mono member count on the pill; popover
 *                shows the code, members and the way back in.
 *   idle       → popover = mono 6-char code input to JOIN + a hint that a
 *                cinema is HOSTED from inside the player.
 *   signed out → sign-in prompt.
 * Engine: src/lib/cinema.ts (Supabase realtime — no extra server). */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCinema, cinemaWatchHref, normalizeCode } from "@/lib/cinema";
import { useLibrary } from "@/components/library/LibraryProvider";
import { useCloudSession } from "@/lib/cloud";
import { useCinemaIdentity } from "@/lib/shown-name";
import { useI18n } from "../i18n/LocaleProvider";
import { CheckIcon, CrownIcon } from "../Icons";

const AVATAR_COLORS = ["#e5484d", "#f5a623", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

function avatarColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const REASONS: Record<string, { fa: string; en: string }> = {
  auth: { fa: "برای جوین دادن اول وارد حسابت شو", en: "Sign in first" },
  code: { fa: "اتاقی با این کد پیدا نشد", en: "No room with this code" },
  closed: { fa: "این سینما بسته شده", en: "This cinema is closed" },
  network: { fa: "اتصال برقرار نشد — اینترنت را چک کن", en: "Connection failed" },
};

/* film-strip glyph of the whole feature (matches the player panel) */
function FilmStrip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M7 5v14M17 5v14M2 10h5M2 14h5M17 10h5M17 14h5" />
    </svg>
  );
}

function CopyGlyph({ ok }: { ok: boolean }) {
  if (ok) return <CheckIcon width={13} height={13} />;
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export default function CinemaButton() {
  const cin = useCinema();
  const router = useRouter();
  const { profile } = useLibrary();
  // v0.14.2 — real account name replaces the «کاربر نما» placeholder; avatar
  // is seeded into the engine so the member list can render it
  const selfId = useCinemaIdentity();
  const { ready: authReady, session } = useCloudSession();
  const { locale } = useI18n();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const live = (cin.status === "hosting" || cin.status === "joined") && !!cin.room;

  /* Reload / relaunch recovery: the room used to be re-adopted only when the
   * user opened a video (Player resume effect) — on every other page the pill
   * stayed dead even though the room was alive. Resume right here, once, so
   * the top-bar entry is the single source of truth for «am I in a cinema?». */
  useEffect(() => {
    const st = useCinema.getState();
    if (st.status === "idle") void st.resume(selfId.name || profile.displayName || "کاربر");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const join = async () => {
    const c = normalizeCode(code);
    if (c.length < 4) {
      setErr(en ? "Enter the 6-char room code" : "کد ۶ حرفی اتاق را وارد کن");
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await cin.guestJoin(c, selfId.name || profile.displayName || "مهمان");
    setBusy(false);
    if (!r.ok) {
      const m = REASONS[r.reason ?? "network"];
      setErr(en ? m.en : m.fa);
      return;
    }
    const room = useCinema.getState().room;
    if (room) {
      setOpen(false);
      setCode("");
      router.push(cinemaWatchHref(room.slug, room.season, room.epnum));
    }
  };

  const copyCode = async () => {
    if (!cin.room) return;
    try {
      await navigator.clipboard.writeText(cin.room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={boxRef} className="app-no-drag relative">
      {/* ---- pill in the top bar ---- */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setErr(null);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={en ? "Cinema — watch together" : "سینما — تماشای گروهی با دوست‌ها"}
        className={`relative flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition ${
          live
            ? "border-brand/60 bg-brand/15 text-white shadow-[0_0_18px_var(--color-brand-glow)]"
            : open
              ? "border-white/30 bg-white/10 text-white"
              : "border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
        }`}
      >
        <FilmStrip className={`h-[17px] w-[17px] ${live ? "text-brand" : "text-zinc-300"}`} />
        <span className="hidden md:inline">{en ? "Cinema" : "سینما"}</span>
        {live && (
          <>
            <span className="relative ms-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            {cin.members.length > 1 && (
              <span className="font-mono text-[11px] font-semibold tracking-wider text-zinc-200" dir="ltr">
                {cin.members.length.toLocaleString("en-US")}
              </span>
            )}
          </>
        )}
      </button>

      {/* ---- popover (darkroom editorial) ---- */}
      {open && (
        <div
          role="menu"
          dir="rtl"
          className="absolute end-0 top-12 z-50 w-[300px] overflow-hidden rounded-2xl border border-white/15 bg-ink/95 shadow-[0_24px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          {/* masthead */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-black text-white">
              <FilmStrip className="h-4 w-4 text-brand" />
              {en ? "Cinema" : "سینما"}
            </p>
            <span className="font-mono text-[9px] font-medium tracking-[0.28em] text-zinc-500" dir="ltr">
              FRAME CINEMA
            </span>
          </div>

          {/* error */}
          {err && (
            <p className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2.5 font-mono text-[11px] leading-5 text-rose-200">{err}</p>
          )}
          {cin.error && !err && (
            <p className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2.5 font-mono text-[11px] leading-5 text-rose-200">{cin.error}</p>
          )}

          {/* ---------- inside a live room ---------- */}
          {live && cin.room ? (
            <div className="p-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <p className="text-[10px] font-semibold text-zinc-400">
                  {cin.status === "hosting" ? (en ? "Your room code" : "کد سینمای تو") : en ? "Cinema of" : "سینمای"}
                  {cin.status !== "hosting" && <span className="text-zinc-200"> {cin.room.hostName}</span>}
                </p>
                {cin.status === "hosting" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void copyCode()}
                      className="mx-auto mt-1.5 flex items-center gap-2 font-mono text-2xl font-bold tracking-[0.3em] text-white transition hover:text-brand"
                      dir="ltr"
                      title={en ? "Copy code" : "کپی کد"}
                    >
                      {cin.room.code}
                      <CopyGlyph ok={copied} />
                    </button>
                    <p className="mt-1 text-[10px] text-zinc-500">{copied ? (en ? "Copied!" : "کپی شد") : en ? "tap to copy" : "برای کپی بزن"}</p>
                  </>
                ) : (
                  <p className="mt-1 truncate text-sm font-bold text-zinc-100">{cin.room.title || cin.room.slug}</p>
                )}
              </div>

              {/* members */}
              <div className="mt-3">
                <p className="mb-2 font-mono text-[10px] tracking-wider text-zinc-500">
                  {en ? "IN THE ROOM" : "داخل سینما"} — {cin.members.length.toLocaleString(en ? "en-US" : "fa-IR")}
                </p>
                {cin.members.length ? (
                  <ul className="space-y-1">
                    {cin.members.map((m) => (
                      <li key={m.uid} className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                        {m.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
                        ) : (
                          <span
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
                            style={{ background: avatarColor(m.uid) }}
                          >
                            {(m.name || "ن").trim().charAt(0)}
                          </span>
                        )}
                        <span className="truncate text-xs font-semibold text-zinc-200">{m.name}</span>
                        {m.uid === cin.room!.hostId && <CrownIcon width={12} height={12} className="ms-auto shrink-0 text-amber-400" />}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] leading-5 text-zinc-500">{en ? "Waiting for friends…" : "هنوز کسی جوین نداده…"}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(cinemaWatchHref(cin.room!.slug, cin.room!.season, cin.room!.epnum));
                }}
                className="mt-4 h-10 w-full rounded-full bg-brand text-xs font-black text-white transition hover:bg-brand/85"
              >
                {en ? "Back to cinema" : "بازگشت به سینما"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (cin.status === "hosting") void cin.hostClose();
                  else cin.leave();
                }}
                className="mt-2 h-9 w-full rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-zinc-300 transition hover:bg-white/10"
              >
                {cin.status === "hosting" ? (en ? "End cinema" : "پایان سینما") : en ? "Leave" : "خروج از سینما"}
              </button>
            </div>
          ) : /* ---------- signed out ---------- */
          authReady && !session ? (
            <div className="p-4">
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-center">
                <p className="text-xs font-bold leading-6 text-white">{en ? "Sign in to join a cinema" : "برای سینما اول وارد حسابت شو"}</p>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  {en ? "Members are shown by account name." : "اسم اعضا با حساب کاربری نمایش داده می‌شود."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push("/auth");
                  }}
                  className="mt-3 h-9 rounded-full bg-brand px-5 text-[11px] font-black text-white transition hover:bg-brand/85"
                >
                  {en ? "Sign in" : "ورود / ثبت‌نام"}
                </button>
              </div>
            </div>
          ) : /* ---------- idle: join by code ---------- */
          (
            <div className="p-4">
              <p className="font-mono text-[10px] tracking-wider text-zinc-500">{en ? "ROOM CODE" : "کد سینما"}</p>
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void join();
                }}
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="XXXXXX"
                  dir="ltr"
                  inputMode="text"
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 text-center font-mono text-base font-bold tracking-[0.3em] text-white placeholder:text-zinc-600 focus:border-brand/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 shrink-0 rounded-xl bg-brand px-4 text-xs font-black text-white transition hover:bg-brand/85 disabled:opacity-60"
                >
                  {busy ? "…" : en ? "Join" : "جوین"}
                </button>
              </form>

              {/* how to host */}
              <div className="mt-4 border-t border-dashed border-white/10 pt-3">
                <p className="flex items-start gap-2 text-[11px] leading-5 text-zinc-400">
                  <span className="mt-1 h-2 w-2 shrink-0 bg-brand" />
                  {en
                    ? "To host: play any title, then hit the Cinema button inside the player — you keep full control."
                    : "برای میزبانی: هر فیلمی را پخش کن و داخل پخش، دکمه‌ی «سینما» را بزن — کنترل کامل با میزبان است."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
