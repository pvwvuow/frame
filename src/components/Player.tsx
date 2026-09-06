"use client";

/* نما – global player (v0.10.4)
 *
 * Mounted ONCE from the root layout (GlobalPlayer) — outside the routed page
 * tree — so playback survives navigation. Two render modes:
 *   • theater  – fixed fullscreen overlay (the classic /watch experience)
 *   • mini     – floating, draggable, pinnable card; the user keeps browsing
 *                the app while the video keeps playing
 *
 * /watch/[slug] is a thin server page that pushes its data into the player
 * store (see src/lib/player-store.ts) — it renders no player of its own.
 *
 * v0.10.4 fixes baked in:
 *   • "no sound on the first play" — audio pipeline primed on first gesture
 *     (layout script) + volume/muted re-applied on every `playing` event +
 *     volume/muted persisted to localStorage
 *   • hardsub variants («زیرنویس چسبیده») are now picked as the DEFAULT
 *     source when present, so burned-in subtitles actually show
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatClock, fa } from "@/lib/format";
import { usePlayerStore } from "@/lib/player-store";
import {
  BackIcon,
  Forward10,
  FullscreenIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  Rewind10,
  VolumeIcon,
  ChevronLeft,
  CloseIcon,
  CheckIcon,
  SubtitleIcon,
  MinimizeIcon,
  MaximizeIcon,
  PinIcon,
  ExpandIcon,
} from "./Icons";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";

const SUB_SIZE_KEY = "nama-sub-size";
const SUB_ON_KEY = "nama-sub-on";
const VOL_KEY = "nama-volume";
const MUTED_KEY = "nama-muted";
const MINI_POS_KEY = "nama-mini-pos";
const VARIANT_PREF_KEY = "nama-variant-pref"; // remembered default variant choice

/** SRT → WebVTT (the <track> element only understands VTT). */
function srtToVtt(input: string): string {
  const body = input
    .replace(/\r+\n/g, "\n")
    .replace(/^\uFEFF/, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/<[^>]+>/g, "");
  return `WEBVTT\n\n${body}`;
}

function variantShort(v: string) {
  if (!v) return "";
  if (v.includes("دوبله")) return "دوبله";
  return v; // «زیرنویس چسبیده» / «بدون زیرنویس» — keep as-is
}

/** Which source should start by default? Burned-in subtitles first (the
    archive's hardsub rips ARE the subtitle experience), then Persian dub,
    then whatever order the catalog ships. */
function preferredSourceIdx(list: { q: string; v: string }[]): number {
  if (list.length <= 1) return 0;
  const score = (v: string) => (v.includes("چسبیده") ? 3 : v.includes("دوبله") ? 2 : v.includes("زیرنویس") ? 1 : 0);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < list.length; i++) {
    const s = score(list[i].v || "");
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

/** Remember the variant the user manually picked, so the NEXT video they open
    starts with the same taste (dubbed people get dubbed, etc.). */
function rememberedVariantIdx(list: { q: string; v: string }[]): number {
  try {
    const pref = localStorage.getItem(VARIANT_PREF_KEY);
    if (!pref) return -1;
    for (let i = 0; i < list.length; i++) {
      const v = list[i].v || "";
      if (v.includes("چسبیده") && pref === "hardsub") return i;
      if (v.includes("دوبله") && pref === "dub") return i;
    }
  } catch {
    /* ignore */
  }
  return -1;
}

function rememberVariantPref(v?: string) {
  try {
    if (!v) return;
    if (v.includes("چسبیده")) localStorage.setItem(VARIANT_PREF_KEY, "hardsub");
    else if (v.includes("دوبله")) localStorage.setItem(VARIANT_PREF_KEY, "dub");
  } catch {
    /* ignore */
  }
}

export default function Player() {
  const router = useRouter();
  const pathname = usePathname();
  const store = usePlayerStore();
  const {
    open,
    mini,
    pinned,
    titleId,
    slug,
    title,
    subtitle,
    src,
    poster,
    startAt,
    episode,
    nextEpisode,
    episodes,
    contentKey,
  } = store;

  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);

  // ---- quality / variant sources -----------------------------------------
  const sources = store.sources ?? [];
  const srcList = useMemo(
    () => (sources.length ? sources : src ? [{ q: "", v: "", url: src }] : []),
    [sources, src]
  );
  const [srcIdx, setSrcIdx] = useState(0);
  const activeSrc = srcList[Math.min(srcIdx, srcList.length - 1)]?.url || src;
  const [qMenu, setQMenu] = useState(false);

  // default variant: remembered taste → hardsub → dub → catalog order.
  // Re-applied when the source list changes (new title / episode), but a
  // manual pick always wins for the current video.
  useEffect(() => {
    if (!srcList.length) return;
    const remembered = rememberedVariantIdx(srcList);
    setSrcIdx(remembered >= 0 ? remembered : preferredSourceIdx(srcList));
    setQMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, srcList.length]);

  // ---- subtitles ----------------------------------------------------------
  const [subOn, setSubOn] = useState(false);
  const [subSize, setSubSize] = useState<"s" | "m" | "l">("m");
  const [subLoaded, setSubLoaded] = useState(false);
  const [subMenu, setSubMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showUi, setShowUi] = useState(true);
  const [showEps, setShowEps] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // when switching quality we need to resume at the same second
  const resumeAt = useRef<number | null>(null);

  // restore volume/muted preferences (a stale muted flag is the classic
  // "the movie has no sound" report)
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(VOL_KEY));
      if (Number.isFinite(v) && v > 0) setVolume(Math.min(1, v));
      setMuted(localStorage.getItem(MUTED_KEY) === "1");
      const s = localStorage.getItem(SUB_SIZE_KEY) as "s" | "m" | "l" | null;
      if (s) setSubSize(s);
    } catch {
      /* ignore */
    }
  }, []);

  // persist volume/muted
  useEffect(() => {
    try {
      localStorage.setItem(VOL_KEY, String(volume));
      localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [volume, muted]);

  // lock body scroll behind the theater overlay
  useEffect(() => {
    if (!open || mini) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, mini]);

  // browsing away from /watch → auto-float (never trap the user behind a
  // fullscreen overlay); returning to the same /watch route → re-expand
  useEffect(() => {
    if (!open) return;
    const onWatch = pathname?.startsWith("/watch/") ?? false;
    if (!onWatch && !mini) store.setMini(true);
    else if (onWatch && mini && pathname === `/watch/${slug}`) store.setMini(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, open]);

  const save = useCallback(
    (pos: number, dur: number) => {
      if (!dur) return;
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId, episodeId: episode?.id ?? null, position: pos, duration: dur }),
        keepalive: true,
      }).catch(() => {});
    },
    [titleId, episode?.id]
  );

  const bumpUi = useCallback(() => {
    setShowUi(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowUi(false);
    }, 2800);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const toggleFs = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  const closePlayer = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) save(v.currentTime, v.duration);
    store.close();
    // closed while still sitting on the bare /watch route → move to the title
    // page so the user never stares at an empty black screen
    if (/^\/watch\//.test(window.location.pathname)) router.push(`/title/${slug}`);
  }, [save, store, router, slug]);

  const goBackToTitle = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) save(v.currentTime, v.duration);
    store.close();
    router.push(`/title/${slug}`);
  }, [save, store, router, slug]);

  // restore subtitle prefs
  useEffect(() => {
    try {
      setSubOn(localStorage.getItem(SUB_ON_KEY) === "1" && !!subLoaded);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subLoaded]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      setDuration(v.duration);
      const resume = resumeAt.current ?? startAt;
      resumeAt.current = null;
      if (resume > 0 && resume < v.duration - 5) v.currentTime = resume;
      setLoading(false);
      // belt & braces for the first-play audio race: re-apply before playing
      v.volume = volume;
      v.muted = muted;
      void v.play().catch(() => {});
    };
    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      if (Date.now() - lastSaved.current > 8000) {
        lastSaved.current = Date.now();
        save(v.currentTime, v.duration);
      }
    };
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
      bumpUi();
    };
    // Chromium occasionally resets the output device / levels between the
    // first `play` and `playing` → re-assert the user's volume every time
    const onPlaying = () => {
      setLoading(false);
      if (Math.abs(v.volume - volume) > 0.01) v.volume = volume;
      if (v.muted !== muted) v.muted = muted;
    };
    const onPause = () => {
      setPlaying(false);
      setShowUi(true);
      save(v.currentTime, v.duration);
    };
    const onEnded = () => {
      setEnded(true);
      save(v.duration, v.duration);
      if (nextEpisode) setCountdown(8);
    };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("waiting", () => setLoading(true));
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [startAt, save, bumpUi, nextEpisode, activeSrc, volume, muted]);

  // switch quality → same second, keep playing
  const pickSource = (i: number) => {
    const v = videoRef.current;
    if (v) resumeAt.current = v.currentTime;
    rememberVariantPref(srcList[i]?.v);
    setSrcIdx(i);
    setQMenu(false);
    setLoading(true);
  };

  // subtitle track mode sync
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const track = v.textTracks[0];
    if (track) track.mode = subOn && subLoaded ? "showing" : "disabled";
  }, [subOn, subLoaded]);

  const onSubFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const vtt = /^\uFEFF?WEBVTT/.test(text.trim()) ? text : srtToVtt(text);
      const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
      const v = videoRef.current;
      if (!v) return;
      // remove previous blob track
      while (v.textTracks.length) {
        const el = v.querySelector("track");
        if (el) el.remove();
        else break;
      }
      const tr = document.createElement("track");
      tr.kind = "subtitles";
      tr.srclang = "fa";
      tr.label = "زیرنویس";
      tr.src = url;
      tr.className = "nama-sub-track";
      v.appendChild(tr);
      setSubLoaded(true);
      setSubOn(true);
      try {
        localStorage.setItem(SUB_ON_KEY, "1");
      } catch {}
      setSubMenu(false);
      setTimeout(() => {
        const t = v.textTracks[0];
        if (t) t.mode = "showing";
      }, 50);
    };
    reader.readAsText(f, "utf-8");
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0 && nextEpisode) {
      router.push(`/watch/${slug}?ep=${nextEpisode.id}`);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextEpisode, router, slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "Escape":
          if (mini) closePlayer();
          else goBackToTitle();
          break;
        case "i":
          store.setMini(!mini);
          break;
        case "ArrowRight":
          seek(10);
          break;
        case "ArrowLeft":
          seek(-10);
          break;
        case "f":
          toggleFs();
          break;
        case "m":
          setMuted((m) => !m);
          break;
        case "c":
          setSubOn((s) => {
            try {
              localStorage.setItem(SUB_ON_KEY, s ? "0" : "1");
            } catch {}
            return !s;
          });
          break;
        case "ArrowUp":
          setVolume((v) => Math.min(1, v + 0.1));
          break;
        case "ArrowDown":
          setVolume((v) => Math.max(0, v - 0.1));
          break;
      }
      bumpUi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mini, togglePlay, seek, toggleFs, bumpUi, closePlayer, goBackToTitle, store]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate]);

  // flush progress when the page unloads
  useEffect(() => {
    const onLeave = () => {
      const v = videoRef.current;
      if (v && v.duration) save(v.currentTime, v.duration);
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      onLeave();
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [save]);

  // ---- mini-player drag ---------------------------------------------------
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MINI_POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) setPos(p);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const clampPos = (x: number, y: number) => {
    const w = wrapRef.current?.offsetWidth || 384;
    const h = wrapRef.current?.offsetHeight || 216;
    return {
      x: Math.max(8, Math.min(window.innerWidth - w - 8, x)),
      y: Math.max(8, Math.min(window.innerHeight - h - 8, y)),
    };
  };

  const onDragStart = (e: React.PointerEvent) => {
    if (!mini) return;
    // buttons inside the handle bar still need their click — never drag from them
    if ((e.target as HTMLElement).closest("button")) return;
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    const p = clampPos(r.left, r.top);
    setPos(p);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = clampPos(e.clientX - drag.current.dx, e.clientY - drag.current.dy);
    setPos(p);
  };

  const onDragEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setPos((p) => {
      if (p) {
        try {
          localStorage.setItem(MINI_POS_KEY, JSON.stringify(p));
        } catch {
          /* ignore */
        }
      }
      return p;
    });
  };

  // default mini position: bottom-left (RTL app → away from the scrollbar)
  const miniStyle: React.CSSProperties =
    pos && mini
      ? { left: pos.x, top: pos.y }
      : { left: 16, bottom: 16 };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const active = srcList[Math.min(srcIdx, srcList.length - 1)];
  const qualityLabel = active?.q || "";
  const currentVariant = active?.v || "";

  if (!open) return null;

  return (
    <div
      ref={wrapRef}
      data-subsize={subSize}
      data-ctrl
      className={
        mini
          ? `force-dark fixed z-[95] w-[400px] max-w-[calc(100vw-32px)] select-none overflow-hidden rounded-2xl bg-black shadow-[0_18px_60px_rgba(0,0,0,0.65)] ring-1 ring-white/15 ${
              showUi ? "cursor-default" : "cursor-none"
            }`
          : `force-dark fixed inset-0 z-[100] select-none overflow-hidden bg-black ${showUi ? "cursor-default" : "cursor-none"}`
      }
      style={mini ? miniStyle : undefined}
      onMouseMove={bumpUi}
      onClick={(e) => {
        if (e.target !== e.currentTarget) {
          const t = e.target as HTMLElement;
          if (t.tagName !== "VIDEO") return;
        }
        togglePlay();
      }}
      onDoubleClick={toggleFs}
      dir="rtl"
    >
      <video
        ref={videoRef}
        key={activeSrc}
        src={activeSrc}
        poster={poster}
        className={mini ? "aspect-video w-full object-contain" : "h-full w-full object-contain"}
        playsInline
        preload="metadata"
      />

      {/* loading */}
      {loading && !ended && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
        </div>
      )}

      {/* unavailable — no playable source for this title/episode */}
      {!activeSrc && (
        <div className="absolute inset-0 grid place-items-center bg-black/80" data-ctrl>
          <div className="max-w-sm p-6 text-center">
            <p className="text-xl font-black text-white">این نسخه در دسترس نیست</p>
            <p className="mt-2 text-sm leading-7 text-zinc-400">لینک معتبری برای این {episode ? "قسمت" : "عنوان"} پیدا نشد. قسمت یا نسخه‌ی دیگری را امتحان کنید.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href={`/title/${slug}`} className="flex h-11 items-center rounded-full bg-white px-6 text-sm font-bold text-black">بازگشت به جزئیات</Link>
              {episodes.length > 0 && episode && episodes[episodes.findIndex((e) => e.id === episode.id) + 1] && (
                <Link href={`/watch/${slug}?ep=${episodes[episodes.findIndex((e) => e.id === episode.id) + 1].id}`} className="flex h-11 items-center rounded-full border border-white/20 px-6 text-sm font-bold text-white hover:bg-white/10">قسمت بعد</Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* center play */}
      {!playing && !loading && !ended && activeSrc && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md ring-1 ring-white/30">
            <PlayIcon width={44} height={44} className="ms-2" />
          </span>
        </div>
      )}

      {/* ended overlay */}
      {ended && activeSrc && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm" data-ctrl>
          <div className="text-center">
            {nextEpisode ? (
              mini ? (
                <button
                  type="button"
                  onClick={() => router.push(`/watch/${slug}?ep=${nextEpisode.id}`)}
                  className="flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black"
                >
                  <PlayIcon width={16} height={16} /> قسمت بعد
                </button>
              ) : (
                <>
                  <p className="text-sm text-zinc-400">قسمت بعدی تا {fa(countdown ?? 0)} ثانیه دیگر</p>
                  <p className="mt-2 text-2xl font-black text-white">
                    قسمت {fa(nextEpisode.number)}: {nextEpisode.name}
                  </p>
                  <div className="mt-6 flex justify-center gap-3">
                    <Link
                      href={`/watch/${slug}?ep=${nextEpisode.id}`}
                      className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-black"
                    >
                      <PlayIcon /> پخش قسمت بعد
                    </Link>
                    <button
                      type="button"
                      onClick={() => setCountdown(null)}
                      className="h-12 rounded-full border border-white/20 px-6 font-bold text-white hover:bg-white/10"
                    >
                      لغو
                    </button>
                  </div>
                </>
              )
            ) : (
              <>
                <p className={mini ? "text-sm font-black text-white" : "text-2xl font-black text-white"}>تماشا به پایان رسید</p>
                {!mini && (
                  <div className="mt-6 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) {
                          v.currentTime = 0;
                          void v.play();
                        }
                      }}
                      className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-black"
                    >
                      <PlayIcon /> تماشای دوباره
                    </button>
                    <Link href={`/title/${slug}`} className="h-12 rounded-full border border-white/20 px-6 leading-[48px] font-bold text-white hover:bg-white/10">
                      بازگشت
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {mini ? (
        /* ── floating mini-player chrome ─────────────────────────────── */
        <>
          <div
            className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/80 to-transparent px-2 py-1.5"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            data-drag
          >
            <span className="min-w-0 flex-1 cursor-grab truncate px-1 text-[11px] font-bold text-white/90 active:cursor-grabbing" title={title}>
              {title}
            </span>
            <button
              type="button"
              onClick={() => store.togglePin()}
              title={pinned ? "سنجاق شده — همیشه روی صفحه" : "جمع‌شده"}
              className={`grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/20 ${pinned ? "text-brand" : "text-zinc-300 opacity-60"}`}
            >
              <PinIcon width={13} height={13} />
            </button>
            <button
              type="button"
              onClick={() => store.setMini(false)}
              title="گسترش (بازگشت به پخش‌کننده کامل)"
              className="grid h-7 w-7 place-items-center rounded-full text-white transition hover:bg-white/20"
            >
              <MaximizeIcon width={13} height={13} />
            </button>
            <button
              type="button"
              onClick={closePlayer}
              title="بستن"
              className="grid h-7 w-7 place-items-center rounded-full text-white transition hover:bg-white/20"
            >
              <CloseIcon width={13} height={13} />
            </button>
          </div>

          {/* thin progress + basic controls */}
          <div
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6"
            data-ctrl
          >
            <div className="group relative h-4 cursor-pointer" dir="ltr">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (v) v.currentTime = Number(e.target.value);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="پیشرفت"
              />
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <button type="button" onClick={togglePlay} className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10" aria-label="پخش/توقف">
                {playing ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
              </button>
              <button type="button" onClick={() => setMuted((m) => !m)} className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10" aria-label="صدا">
                {muted || volume === 0 ? <MuteIcon width={16} height={16} /> : <VolumeIcon width={16} height={16} />}
              </button>
              <span className="text-[10px] tabular-nums text-zinc-300" dir="ltr">
                {formatClock(current)} / {formatClock(duration)}
              </span>
              <div className="ms-auto flex items-center gap-1">
                {srcList.length > 1 && (
                  <select
                    value={srcIdx}
                    onChange={(e) => pickSource(Number(e.target.value))}
                    className="h-7 max-w-[120px] appearance-none rounded-full border border-white/20 bg-white/10 px-2 text-[10px] font-bold text-white focus:outline-none"
                    aria-label="کیفیت"
                  >
                    {srcList.map((s, i) => (
                      <option key={`${s.url}-${i}`} value={i} className="bg-ink text-white">
                        {s.q || "عادی"} {variantShort(s.v) ? `· ${variantShort(s.v)}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => store.setMini(false)}
                  title="بازگشت به صفحه پخش"
                  className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10"
                >
                  <ExpandIcon width={15} height={15} />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ── theater chrome ──────────────────────────────────────────── */
        <>
          {/* top bar */}
          <div
            className={`absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300 sm:p-6 ${showUi ? "opacity-100" : "opacity-0"}`}
            data-ctrl
          >
            <button type="button" onClick={goBackToTitle} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:bg-white/20" aria-label="بازگشت">
              <BackIcon />
            </button>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-white">{title}</p>
              {subtitle && <p className="truncate text-xs text-zinc-300">{subtitle}</p>}
            </div>
            <div className="ms-auto flex items-center gap-2">
              {/* float: keep watching while browsing the app */}
              <button
                type="button"
                onClick={() => store.setMini(true)}
                title="پخش شناور — بگرد و فیلم ادامه پیدا کند"
                className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <MinimizeIcon width={15} height={15} />
                <span className="hidden sm:inline">شناور</span>
              </button>
              <span className="hidden items-center gap-1.5 sm:flex" data-ctrl>
                <FavoriteButton titleId={titleId} name={title} variant="mini" className="!h-10 !w-10 !bg-white/10 !ring-0 hover:!bg-rose-600" />
                <WatchlistButton titleId={titleId} name={title} variant="mini" className="!h-10 !w-10 !bg-white/10 !ring-0" />
              </span>
              {episodes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowEps((s) => !s)}
                  className="flex h-10 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  قسمت‌ها
                  <ChevronLeft width={16} height={16} />
                </button>
              )}
            </div>
          </div>

          {/* episodes drawer */}
          {showEps && (
            <div
              className="absolute inset-y-0 start-0 z-20 w-[340px] overflow-y-auto border-e border-white/10 bg-ink/95 p-4 backdrop-blur-xl"
              data-ctrl
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold text-white">قسمت‌ها</p>
                <button type="button" onClick={() => setShowEps(false)} className="text-zinc-400 hover:text-white">
                  بستن
                </button>
              </div>
              <ul className="space-y-2">
                {episodes.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/watch/${slug}?ep=${e.id}`}
                      className={`flex gap-3 rounded-xl p-2 transition ${e.id === episode?.id ? "bg-brand/20 ring-1 ring-brand/60" : "hover:bg-white/5"}`}
                    >
                      <img src={e.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover" loading="lazy" />
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-400">
                          فصل {fa(e.season)} · قسمت {fa(e.number)}
                        </p>
                        <p className="truncate text-sm font-semibold text-white">{e.name}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* bottom controls */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-4 pt-16 transition-opacity duration-300 sm:px-6 ${showUi ? "opacity-100" : "opacity-0"}`}
            data-ctrl
          >
            {/* progress */}
            <div className="group relative h-6 cursor-pointer" dir="ltr">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20 transition-all group-hover:h-1.5">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${pct}%` }}>
                  <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 scale-0 rounded-full bg-brand shadow-[0_0_0_5px_rgba(229,9,20,0.3)] transition group-hover:scale-100" />
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (v) v.currentTime = Number(e.target.value);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="پیشرفت"
              />
            </div>

            <div className="mt-2 flex items-center gap-2 sm:gap-4">
              <button type="button" onClick={togglePlay} className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10" aria-label="پخش/توقف">
                {playing ? <PauseIcon width={26} height={26} /> : <PlayIcon width={26} height={26} />}
              </button>
              <button type="button" onClick={() => seek(-10)} className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10" aria-label="۱۰ ثانیه عقب">
                <Rewind10 width={24} height={24} />
              </button>
              <button type="button" onClick={() => seek(10)} className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10" aria-label="۱۰ ثانیه جلو">
                <Forward10 width={24} height={24} />
              </button>

              <div className="group/vol flex items-center gap-2">
                <button type="button" onClick={() => setMuted((m) => !m)} className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10" aria-label="صدا">
                  {muted || volume === 0 ? <MuteIcon width={22} height={22} /> : <VolumeIcon width={22} height={22} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(Number(e.target.value));
                    setMuted(false);
                  }}
                  className="range-input w-0 opacity-0 transition-all group-hover/vol:w-24 group-hover/vol:opacity-100"
                  dir="ltr"
                  aria-label="میزان صدا"
                />
              </div>

              <span className="text-xs tabular-nums text-zinc-200 sm:text-sm" dir="ltr">
                {formatClock(current)} / {formatClock(duration)}
              </span>

              {currentVariant && (
                <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-zinc-200 sm:inline">
                  {variantShort(currentVariant)}
                </span>
              )}

              <div className="ms-auto flex items-center gap-1 sm:gap-2">
                <div className="relative">
                  <select
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="h-9 appearance-none rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 focus:outline-none"
                    aria-label="سرعت پخش"
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                      <option key={r} value={r} className="bg-ink text-white">
                        {r}x
                      </option>
                    ))}
                  </select>
                </div>

                {/* quality / variant picker */}
                {srcList.length > 1 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setQMenu((o) => !o);
                        setSubMenu(false);
                      }}
                      className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition ${
                        qMenu ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                      }`}
                      aria-label="انتخاب کیفیت"
                    >
                      {qualityLabel || "کیفیت"}
                    </button>
                    {qMenu && (
                      <ul className="absolute bottom-11 end-0 z-30 w-56 overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 p-1.5 shadow-2xl backdrop-blur-xl">
                        {srcList.map((s, i) => {
                          const on = i === srcIdx;
                          return (
                            <li key={`${s.url}-${i}`}>
                              <button
                                type="button"
                                onClick={() => pickSource(i)}
                                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${
                                  on ? "bg-brand/20 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                <span className="w-12 shrink-0 font-black">{s.q || "عادی"}</span>
                                <span className={`flex-1 text-start text-[11px] ${s.v?.includes("دوبله") ? "text-emerald-300" : s.v?.includes("زیرنویس") ? "text-sky-300" : "text-zinc-500"}`}>
                                  {variantShort(s.v) || "اصلی"}
                                </span>
                                {s.mb ? <span className="text-[10px] text-zinc-500 num">{fa(s.mb)}MB</span> : null}
                                {on && <CheckIcon width={13} height={13} className="text-brand" />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* subtitles */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSubMenu((o) => !o);
                      setQMenu(false);
                    }}
                    aria-label="زیرنویس"
                    className={`grid h-9 w-9 place-items-center rounded-full border transition ${
                      subOn && subLoaded ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    <SubtitleIcon width={17} height={17} />
                  </button>
                  {subLoaded && subOn && !subMenu && <span className="pointer-events-none absolute -top-0.5 end-0 h-2 w-2 rounded-full bg-brand ring-2 ring-black" />}
                  {subMenu && (
                    <div className="absolute bottom-11 end-0 z-30 w-64 overflow-hidden rounded-2xl border border-white/10 bg-ink-800/95 p-3 shadow-2xl backdrop-blur-xl">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-extrabold text-white">زیرنویس</p>
                        <button type="button" onClick={() => setSubMenu(false)} aria-label="بستن" className="text-zinc-500 hover:text-white">
                          <CloseIcon width={13} height={13} />
                        </button>
                      </div>
                      {subLoaded ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSubOn((s) => {
                              try {
                                localStorage.setItem(SUB_ON_KEY, s ? "0" : "1");
                              } catch {}
                              return !s;
                            });
                          }}
                          className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold transition ${
                            subOn ? "border-brand/50 bg-brand/15 text-white" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <SubtitleIcon width={14} height={14} /> نمایش زیرنویس
                          </span>
                          <span>{subOn ? "روشن" : "خاموش"}</span>
                        </button>
                      ) : (
                        <p className="mb-2 rounded-xl bg-white/5 p-2.5 text-[11px] leading-5 text-zinc-400">
                          نسخه‌های «زیرنویس چسبیده» زیرنویس داخل تصویر دارند و به‌صورت پیش‌فرض انتخاب می‌شوند. می‌توانید فایل SRT خودتان را هم لود کنید.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/10"
                      >
                        <PlusIconSmall /> بارگذاری فایل زیرنویس (SRT / VTT)
                      </button>
                      <input ref={fileRef} type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={(e) => onSubFile(e.target.files?.[0])} />
                      <div className="mt-2 flex items-center gap-1 rounded-xl bg-white/5 p-1">
                        {(
                          [
                            ["s", "کوچک"],
                            ["m", "متوسط"],
                            ["l", "بزرگ"],
                          ] as const
                        ).map(([v, l]) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setSubSize(v);
                              try {
                                localStorage.setItem(SUB_SIZE_KEY, v);
                              } catch {}
                            }}
                            className={`flex-1 rounded-lg py-1.5 text-[11px] font-bold transition ${subSize === v ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {nextEpisode && (
                  <Link
                    href={`/watch/${slug}?ep=${nextEpisode.id}`}
                    className="hidden h-9 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 sm:flex"
                  >
                    قسمت بعد
                    <ChevronLeft width={14} height={14} />
                  </Link>
                )}
                <button type="button" onClick={toggleFs} className="grid h-11 w-11 place-items-center rounded-full text-white hover:bg-white/10" aria-label="تمام صفحه">
                  <FullscreenIcon width={22} height={22} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PlusIconSmall() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
