"use client";

/* v0.30.15 — the residual OPEN LAG is killed structurally: even the
 * v0.30.14 tween remounted the whole panel inside the click frame (portal
 * + React mount + animation start + first raster of a 500px layer, all in
 * one go). The panel is now ALWAYS mounted (hidden via visibility) and
 * opening is a single class flip — one opacity-only CSS transition, zero
 * mount work, zero per-frame raster; framer-motion is gone from this
 * file. Measured bonus: the veil now literally FADES in — the exact
 * behaviour he asked for originally («یک حالت فیددار باشه»). Main-process
 * companion fix in the same release: differential updates self-heal via
 * seedUpdaterCacheFromPending (his 0.30.13→0.30.14 update was still a
 * full 147MB because the old installer was never in the cache when the
 * check fired).
 *
 * v0.30.14 — two refinements on the veil:
 *
 * 1. OPEN SPEED: the spring (stiffness 320, mass 0.9) starts from rest,
 *    so the first ~100ms barely moved and the opening read as LAGGY
 *    («یکم لگ و با تاخیر باز میشه»); the heavy backdrop-blur-2xl over a
 *    full-height masked strip re-blurred every frame of the slide. Now a
 *    220ms expo-out tween (max velocity at t=0 → instant response) and
 *    the veil is a plain gradient layer — no backdrop-filter, no mask,
 *    nothing to re-rasterize per frame.
 *
 * 2. TEXT SIDE: the rows used to pack toward the content-facing edge,
 *    leaving the text stranded away from the anchored screen edge
 *    («توی حالت انگلیسی نوشته‌ها باید به سمت راست بچسبن ولی برعکس اومدن
 *    به سمت چپ، و برعکس تو فارسی»). Every row is mirrored now
 *    (flex-row-reverse + text-end): the icon parks AT the anchored edge,
 *    the label hugs it, and the free space moves to the content side —
 *    in ENGLISH the text sticks RIGHT, in PERSIAN it sticks LEFT, both
 *    toward the solid hold of the veil where it never sits on the melt.
 *
 * v0.30.12 — the avatar menu is now a MERGED FEATHERED VEIL.
 *
 * v0.30.10 made it a centered slab that PUSHED the app shell aside
 * (html[data-udrawer] + .nama-shell). The user withdrew both: «طراحی‌ش
 * خوب نیس... هول دادن رو کلاً حذف کن» and asked for the drawer to MERGE
 * with the page instead: a full-height layer anchored at the avatar
 * edge (inline-end → LEFT in the RTL app, exactly «از سمت چپ باز میشه»)
 * whose background is OPAQUE app-ink at the screen edge and FADES into
 * the page toward the content — «سمت چپ تیره باشه و به فضای نرم‌افزار
 * که نزدیک میشه فید همرنگ پس‌زمینه بشه». No border, no rounded slab, no
 * shadow (any of them would re-draw the rectangle), no scrim, no push.
 * The veil's gradient is dir-aware and melts into whatever is behind it
 * (v0.30.14 dropped the backdrop-blur + mask — the melt reads cleaner
 * sharp and the open is frame-cheap). The content column lives pinned at
 * the anchored edge, OUTSIDE the fade
 * zone, so text never sits on the translucent part. Still minimal,
 * monochrome (ONLY the VIP entry keeps gold), still closes itself
 * smartly (outside pointerdown — the un-masked fade zone is
 * pointer-events: none, so taps there fall through and close — wheel,
 * navigation, Escape). Removed at the user's request in v0.30.10 and
 * kept removed: «لیست من», the quick theme switcher, the account email
 * (email lives in Settings, sync account). */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useLibrary } from "./library/LibraryProvider";
import { AVATARS } from "./library/SettingsForm";
import {
  HeartIcon,
  HistoryIcon,
  SettingsIcon,
  UserIcon,
  ChevronDown,
  CloseIcon,
  BellIcon,
  RefreshIcon,
  LogoutIcon,
  CrownIcon,
} from "./Icons";
import { fa } from "@/lib/format";
import { bridge, useIsElectron } from "@/lib/platform";
import { toast } from "sonner";
import { useI18n } from "./i18n/LocaleProvider";
import type { TKey } from "@/lib/i18n";
import { explicitSignOut, useCloudSession } from "@/lib/cloud";

type IconCmp = typeof UserIcon;
type Entry = { href: string; label: TKey; icon: IconCmp; key?: "fav" | "notif" };

/* v0.30.10: monochrome personal set — «لیست من» removed (it stays reachable
 * from the navbar / mobile nav), every tint neutralized to zinc. */
const PERSONAL: Entry[] = [
  { href: "/profile", label: "user.profile", icon: UserIcon },
  { href: "/favorites", label: "user.favorites", icon: HeartIcon, key: "fav" },
  { href: "/history", label: "user.history", icon: HistoryIcon },
  { href: "/notifications", label: "user.notifications", icon: BellIcon, key: "notif" },
];
const SETTINGS_ENTRY: Entry = { href: "/settings", label: "user.settings", icon: SettingsIcon };

/* Hoisted out of the component so React keeps DOM nodes between renders
   (defining it inline re-mounted every item on each render → focus loss / flicker). */
function Item({
  href,
  label,
  icon: Icon,
  count,
  active,
}: {
  href: string;
  label: string;
  icon: IconCmp;
  count?: number | null;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        role="menuitem"
        /* v0.30.14: mirrored row — icon parks at the anchored screen edge,
           the label hugs it (text-end); badge sits between icon and label. */
        className={`flex flex-row-reverse items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition ${
          active ? "bg-white/[0.1] text-white" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        <Icon width={17} height={17} className={`shrink-0 ${active ? "text-white" : "text-zinc-400"}`} />
        {count != null && count > 0 && (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200 num">{fa(count)}</span>
        )}
        <span className="flex-1 text-end">{label}</span>
      </Link>
    </li>
  );
}

export default function UserMenu() {
  const { profile, favorites } = useLibrary();
  const { session } = useCloudSession();
  const router = useRouter();
  const { t: tr, locale, dir } = useI18n();
  const electron = useIsElectron();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  // v0.29.0 (VERIFY-QOL-3) — armed when the pending sign-out would erase data
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  // unread notifications badge (refreshes on route change + every 2 min)
  const loadUnread = useCallback(() => {
    const load = (k: string): Set<string> => {
      try {
        return new Set(JSON.parse(localStorage.getItem(k) ?? "[]"));
      } catch {
        return new Set();
      }
    };
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: { id: string }[]) => {
        const read = load("nama-notif-read");
        const hidden = load("nama-notif-hidden");
        const n = Array.isArray(d) ? d.filter((x) => !read.has(x.id) && !hidden.has(x.id)).length : 0;
        setUnread(n);
        bridge()?.setBadge(n);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadUnread();
    const t = setInterval(loadUnread, 120_000);
    return () => clearInterval(t);
  }, [loadUnread, pathname]);

  /* smart close: outside pointerdown (touch included), any content scroll,
     Escape — plus the route-change effect above. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDoc = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onWheel = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("wheel", onWheel, { passive: true });
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    }, 60);
    const btn = btnRef.current;
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("wheel", onWheel);
      btn?.focus({ preventScroll: true });
    };
  }, [open]);

  /* Account identity (v0.10.10): the drawer greets the CLOUD account display
     name — the email itself moved to Settings (v0.30.10, sync account). */
  const email = session?.user?.email ?? "";
  const meta = (session?.user?.user_metadata ?? {}) as { display_name?: string; name?: string; full_name?: string };
  const accountName =
    meta.display_name?.trim() || meta.name?.trim() || meta.full_name?.trim() || (email ? email.split("@")[0] : "");
  const shownName = accountName || profile.displayName;
  const initial = (shownName || (locale === "en" ? "N" : "ن")).trim().slice(0, 1).toUpperCase();
  const grad = AVATARS[profile.avatar] ?? AVATARS[0];
  const isActive = (href: string) => (href.includes("#") ? false : pathname === href || (href !== "/" && !!pathname?.startsWith(href)));

  const checkUpdates = async () => {
    const b = bridge();
    if (!b) return;
    setChecking(true);
    try {
      const r = await b.checkForUpdates();
      /* v0.30.4 — «available» no longer toasts: the UpdaterPopup (the
         red-white glass card) already announces the new version and tracks
         the download — the toast was a duplicate announcement. */
      if (r.status === "available") {
        /* handled by the UpdaterPopup */
      }
      else if (r.status === "not-available") toast.success(locale === "en" ? "You're on the latest version." : "شما آخرین نسخه را دارید.");
      else if (r.status === "disabled") toast.message(locale === "en" ? "Auto-update is only available in the installed build." : "به‌روزرسانی خودکار فقط در نسخه‌ی نصب‌شده فعال است.");
      else toast.error(r.message ?? (locale === "en" ? "Update check failed." : "بررسی به‌روزرسانی ناموفق بود."));
    } finally {
      setChecking(false);
    }
  };

  const countOf = (e: Entry) => (e.key === "fav" ? favorites.size : e.key === "notif" ? unread : null);

  /* the feather: opaque app-ink at the anchored screen edge, dissolving
     into the page toward the content (dir-aware direction). The gradient
     alone owns the melt (v0.30.14 removed the backdrop-blur + mask — the
     blur re-rasterized every frame of the slide and read as opening lag;
     sharp it also reads cleaner). The content column (72%) sits ENTIRELY
     inside the opaque hold (74%): at the content's inner edge the veil is
     still fully solid — solid melts into solid, no seam — and the visible
     melt-tail is the last ~26%. */
  const veilBg = dir === "rtl"
    ? "linear-gradient(to right, var(--color-ink) 0%, var(--color-ink) 74%, transparent 100%)"
    : "linear-gradient(to left, var(--color-ink) 0%, var(--color-ink) 74%, transparent 100%)";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={tr("user.openMenu")}
        className={`relative flex items-center gap-2 rounded-full border p-0.5 pe-1 transition ${
          open ? "border-white/40 bg-white/15" : "border-white/15 bg-white/[0.06] hover:border-white/30 hover:bg-white/10"
        }`}
      >
        {profile.avatarImage ? (
          <img src={profile.avatarImage} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${grad}`}>{initial}</span>
        )}
        {unread > 0 && (
          <span
            className="absolute -top-1 start-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-black text-white ring-2 ring-ink num"
            aria-label={`${fa(unread)} ${tr("user.notifications")}`}
          >
            {unread > 9 ? `${fa(9)}+` : fa(unread)}
          </span>
        )}
        <ChevronDown width={14} height={14} className={`hidden text-zinc-400 transition sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={tr("user.openMenu")}
            aria-hidden={!open}
            dir={dir}
            data-open={open}
            style={{ insetInlineEnd: 0, pointerEvents: "none" }}
            className="u-veil fixed inset-y-0 z-[95] w-[min(500px,100vw)]"
          >
                {/* the FEATHERED VEIL — opaque app-ink hugging the anchored
                    screen edge, dissolving into the page toward the content
                    (dir-aware gradient only since v0.30.14: no
                    backdrop-filter, no mask).
                    pointer-events pass through it, so tapping the faded
                    zone closes the drawer like tapping outside. */}
                <div aria-hidden="true" className="absolute inset-0" style={{ background: veilBg }} />
                {/* content column — pinned to the anchored edge, OUTSIDE the
                    fade zone, so text never sits on the translucent part */}
                <div
                  className="pointer-events-auto absolute inset-y-0 flex w-[72%] flex-col"
                  style={{
                    insetInlineEnd: 0,
                    paddingTop: "env(safe-area-inset-top, 0px)",
                    paddingBottom: "env(safe-area-inset-bottom, 0px)",
                  }}
                >
                {/* header — identity only, NO email (moved to Settings).
                    v0.30.14: mirrored so the identity hugs the anchored
                    edge and the close lands on the content side. */}
                <div className="flex flex-row-reverse items-center gap-3 p-5 pb-3">
                  {profile.avatarImage ? (
                    <img src={profile.avatarImage} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br text-base font-black text-white shadow-lg ${grad}`}>{initial}</span>
                  )}
                  <div className="min-w-0 flex-1 text-end">
                    <p className="truncate text-sm font-extrabold text-white">{shownName}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{session ? tr("user.account") : tr("user.guest")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={tr("common.close")}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <CloseIcon width={14} height={14} />
                  </button>
                </div>

                {/* body — one monochrome list, VIP keeps its gold */}
                <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" role="menu">
                  <ul className="space-y-1">
                    {/* VIP — the ONLY colored element in the drawer */}
                    <li>
                      <Link
                        href="/vip"
                        role="menuitem"
                        data-autofocus
                        className={`flex flex-row-reverse items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition ${
                          isActive("/vip")
                            ? "bg-amber-400/20 text-amber-100"
                            : "text-amber-300/90 hover:bg-amber-400/10 hover:text-amber-200"
                        }`}
                      >
                        <CrownIcon width={17} height={17} className="shrink-0" />
                        <span className="flex-1 text-end">{locale === "en" ? "VIP subscription" : "اشتراک ویژه (VIP)"}</span>
                      </Link>
                    </li>
                    {!session && (
                      <Item href="/auth" icon={UserIcon} label={locale === "en" ? "Sign in / Sign up" : "ورود / ثبت‌نام"} active={isActive("/auth")} />
                    )}
                    {PERSONAL.map((it) => (
                      <Item
                        key={it.href}
                        {...it}
                        label={tr(it.label)}
                        active={isActive(it.href)}
                        count={countOf(it)}
                      />
                    ))}
                    <Item {...SETTINGS_ENTRY} icon={SettingsIcon} label={tr(SETTINGS_ENTRY.label)} active={isActive("/settings")} />
                  </ul>

                  {/* sign out — monochrome; the two-tap destructive confirm
                      (v0.29.0) survives restyle */}
                  {session && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirmArmed) {
                          try {
                            const { guestDataAtRisk } = await import("@/lib/mobile/userdata");
                            if (await guestDataAtRisk()) {
                              setConfirmArmed(true);
                              setTimeout(() => setConfirmArmed(false), 5000);
                              return;
                            }
                          } catch {
                            /* helper unavailable → sign out as before */
                          }
                        }
                        setConfirmArmed(false);
                        setOpen(false);
                        void explicitSignOut();
                        toast.success(locale === "en" ? "Signed out." : "از حساب خارج شدی.");
                        router.refresh();
                      }}
                      className={`mt-1 flex flex-row-reverse items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition ${
                        confirmArmed
                          ? "bg-white/15 font-bold text-white"
                          : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <LogoutIcon width={17} height={17} className="shrink-0" />
                      <span className="flex-1 text-end">
                        {confirmArmed
                          ? locale === "en"
                            ? "Tap again — guest data on this device will be erased"
                            : "دوباره بزنید — داده‌های مهمان این دستگاه پاک می‌شود"
                          : locale === "en"
                            ? "Sign out"
                            : "خروج از حساب"}
                      </span>
                    </button>
                  )}
                </div>

                {/* footer — version/update (desktop) or about (web) */}
                <div className="px-5 pb-4 pt-2 text-[11px] text-zinc-500">
                  {electron ? (
                    <div className="flex flex-row-reverse items-center justify-between gap-2">
                      <span dir="ltr">{tr("app.name")} · v{bridge()?.version ?? "1.0.0"}</span>
                      <button
                        type="button"
                        onClick={checkUpdates}
                        disabled={checking}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                      >
                        <RefreshIcon width={12} height={12} className={checking ? "animate-spin" : ""} /> {tr("user.checkUpdate")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-row-reverse items-center justify-between gap-2">
                      <span>{tr("app.name")} · {tr("app.tagline")}</span>
                      <Link href="/about" className="transition hover:text-white">
                        {tr("footer.aboutUs")}
                      </Link>
                    </div>
                  )}
                </div>
                </div>
          </div>,
          document.body
        )}
    </div>
  );
}
