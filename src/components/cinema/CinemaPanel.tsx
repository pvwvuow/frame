"use client";

/* v0.14.0 — CINEMA drawer inside the player.
 *  idle      → «شروع سینما» (this device becomes the host of what is playing)
 *  hosting   → room code + copy, live member list, feed, close button
 *  joined    → host name, live member list, feed, leave button
 * Members & feed ride Supabase Realtime presence (src/lib/cinema.ts). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCinema, cinemaWatchHref, type CinemaBeat } from "@/lib/cinema";
import { useCloudSession } from "@/lib/cloud";
import { useI18n } from "../i18n/LocaleProvider";
import { CheckIcon, CloseIcon, CrownIcon, UsersIcon } from "../Icons";

const AVATAR_COLORS = ["#e5484d", "#f5a623", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

function avatarColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function CopyGlyph({ ok }: { ok: boolean }) {
  if (ok) return <CheckIcon width={14} height={14} />;
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

export default function CinemaPanel({ getBeat, hostName, onClose }: { getBeat: () => CinemaBeat | null; hostName: string; onClose: () => void }) {
  const cin = useCinema();
  const session = useCloudSession();
  const router = useRouter();
  const { locale } = useI18n();
  const en = locale === "en";
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const signedIn = !!session.session;
  const beat = getBeat();

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

  const startHosting = async () => {
    const b = getBeat();
    if (!b) return;
    setBusy(true);
    const r = await cin.hostCreate(b, hostName || "میزبان");
    setBusy(false);
    if (!r.ok) {
      useCinema.setState({
        error: r.reason === "auth"
          ? en ? "Sign in first" : "اول وارد حسابت شو"
          : en ? "Connection failed — try again" : "اتصال برقرار نشد — دوباره تلاش کن",
      });
    }
  };

  const mismatch = !!cin.room && cin.status !== "idle" && !!beat && beat.slug !== cin.room.slug;

  return (
    <div className="absolute inset-y-0 end-0 z-30 w-[340px] max-w-[92vw] overflow-y-auto border-s border-white/10 bg-ink/95 p-4 backdrop-blur-xl" data-ctrl>
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold text-white">
          <UsersIcon width={17} height={17} />
          سینما
        </p>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="بستن">
          <CloseIcon width={14} height={14} />
        </button>
      </div>

      {/* error */}
      {cin.error && (
        <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">{cin.error}</p>
      )}

      {/* ---------------- hosting ---------------- */}
      {cin.status === "hosting" && cin.room && (
        <>
          <div className="rounded-2xl border border-brand/40 bg-brand/10 p-4 text-center">
            <p className="text-[11px] font-semibold text-zinc-300">کد سینما — به دوست‌هایت بده تا جوین بدن</p>
            <p className="mt-1 text-3xl font-black tracking-[0.3em] text-white" dir="ltr">
              {cin.room.code}
            </p>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="mx-auto mt-3 flex h-9 items-center gap-2 rounded-full bg-white px-5 text-xs font-black text-black transition hover:bg-zinc-200"
            >
              <CopyGlyph ok={copied} />
              {copied ? "کپی شد" : "کپی کد"}
            </button>
          </div>
          <MemberList hostUid={cin.room.hostId} />
          <Feed />
          <button
            type="button"
            onClick={() => void cin.hostClose()}
            className="mt-4 h-11 w-full rounded-full border border-rose-500/40 bg-rose-500/10 text-sm font-bold text-rose-200 transition hover:bg-rose-500/20"
          >
            پایان سینما
          </button>
        </>
      )}

      {/* ---------------- joined (guest) ---------------- */}
      {cin.status === "joined" && cin.room && (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
            <p className="text-[11px] font-semibold text-zinc-400">تو مهمان سینمای</p>
            <p className="mt-0.5 truncate text-lg font-black text-white">{cin.room.hostName || "میزبان"}</p>
            <p className="mt-1 truncate text-xs text-zinc-400">{cin.room.title || cin.room.slug}</p>
          </div>
          {mismatch && (
            <button
              type="button"
              onClick={() => router.push(cinemaWatchHref(cin.room!.slug, cin.room!.season, cin.room!.epnum))}
              className="mt-3 h-10 w-full rounded-full bg-brand text-xs font-black text-white transition hover:bg-brand/85"
            >
              بازگشت به پخش سینما
            </button>
          )}
          <MemberList hostUid={cin.room.hostId} />
          <Feed />
          <button
            type="button"
            onClick={() => cin.leave()}
            className="mt-4 h-11 w-full rounded-full border border-white/15 bg-white/[0.04] text-sm font-bold text-zinc-300 transition hover:bg-white/10"
          >
            خروج از سینما
          </button>
        </>
      )}

      {/* ---------------- connecting ---------------- */}
      {cin.status === "connecting" && (
        <div className="grid place-items-center py-10">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-brand" />
          <p className="mt-3 text-xs text-zinc-400">در حال وصل شدن به سینما…</p>
        </div>
      )}

      {/* ---------------- idle ---------------- */}
      {cin.status === "idle" && (
        <>
          {!signedIn ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
              <p className="text-sm font-bold text-white">برای سینما اول وارد حسابت شو</p>
              <p className="mt-1.5 text-xs leading-6 text-zinc-400">تماشای گروهی با حساب کاربری کار می‌کند تا اسم اعضا نمایش داده شود.</p>
              <button
                type="button"
                onClick={() => router.push("/auth")}
                className="mx-auto mt-4 flex h-10 items-center rounded-full bg-brand px-6 text-xs font-black text-white transition hover:bg-brand/85"
              >
                ورود / ثبت‌نام
              </button>
            </div>
          ) : !beat ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
              <p className="text-sm font-bold text-white">چیزی در حال پخش نیست</p>
              <p className="mt-1.5 text-xs leading-6 text-zinc-400">اول فیلم یا قسمتی را پخش کن، بعد «شروع سینما» را بزن.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
                <p className="text-[11px] text-zinc-400">این عنوان را با دوست‌هایت هم‌زمان ببین</p>
                <p className="mt-1 truncate text-sm font-black text-white">{beat.title}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {en ? "You control play / pause / seek" : "کنترل پخش — پلی، پاز، جلو و عقب — دست توست"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void startHosting()}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-sm font-black text-white shadow-[0_0_24px_var(--color-brand-glow)] transition hover:bg-brand/85 disabled:opacity-60"
              >
                <UsersIcon width={16} height={16} />
                {busy ? "…" : en ? "Start cinema" : "شروع سینما"}
              </button>
              <p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">
                کد اتاق را برای دوست‌هایت بفرست؛ آن‌ها از صفحه‌ی اصلی با همان کد جوین می‌دهند. هر کس با اینترنت خودش می‌بیند و تصویر برای همه هم‌زمان پخش می‌شود.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function MemberList({ hostUid }: { hostUid: string }) {
  const members = useCinema((s) => s.members);
  if (!members.length) {
    return <p className="mt-4 text-center text-[11px] leading-5 text-zinc-500">هنوز کسی جوین نداده… کد را برای دوست‌هایت بفرست!</p>;
  }
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-bold text-zinc-400">داخل سینما ({members.length.toLocaleString("fa-IR")})</p>
      <ul className="space-y-1.5">
        {members.map((m) => (
          <li key={m.uid} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black text-white"
              style={{ background: avatarColor(m.uid) }}
            >
              {(m.name || "ن").trim().charAt(0)}
            </span>
            <span className="truncate text-xs font-semibold text-zinc-200">{m.name}</span>
            {m.uid === hostUid && <CrownIcon width={13} height={13} className="ms-auto shrink-0 text-amber-400" />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Feed() {
  const feed = useCinema((s) => s.feed);
  if (!feed.length) return null;
  return (
    <div className="mt-3 space-y-1">
      {feed.slice(-5).map((f) => (
        <p key={f.id} className="text-[10px] leading-5 text-zinc-500">
          <span className="font-semibold text-zinc-400">{f.name}</span>{" "}
          {f.kind === "join" ? "جوین داد" : f.kind === "leave" ? "سینما را ترک کرد" : "سینما بسته شد"}
        </p>
      ))}
    </div>
  );
}
