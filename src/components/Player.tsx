"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatClock, fa } from "@/lib/format";
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
} from "./Icons";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";

export type PlayerEpisode = { id: number; season: number; number: number; name: string; videoUrl: string; thumbnail: string };
export type PlayerSource = { q: string; v: string; url: string; mb?: number };

const SUB_SIZE_KEY = "nama-sub-size";
const SUB_ON_KEY = "nama-sub-on";

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

export default function Player({
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
  sources = [],
}: {
  titleId: number;
  slug: string;
  title: string;
  subtitle?: string;
  src: string;
  poster: string;
  startAt: number;
  episode: PlayerEpisode | null;
  nextEpisode: PlayerEpisode | null;
  episodes: PlayerEpisode[];
  sources?: PlayerSource[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);
  const router = useRouter();

  // ---- quality / variant sources -----------------------------------------
  const srcList: PlayerSource[] = useMemo(
    () => (sources.length ? sources : src ? [{ q: "", v: "", url: src }] : []),
    [sources, src]
  );
  const [srcIdx, setSrcIdx] = useState(0);
  const activeSrc = srcList[Math.min(srcIdx, srcList.length - 1)]?.url || src;
  const [qMenu, setQMenu] = useState(false);

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

  // restore subtitle prefs
  useEffect(() => {
    try {
      const s = localStorage.getItem(SUB_SIZE_KEY) as "s" | "m" | "l" | null;
      if (s) setSubSize(s);
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
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("waiting", () => setLoading(true));
    v.addEventListener("playing", () => setLoading(false));
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [startAt, save, bumpUi, nextEpisode, activeSrc]);

  // switch quality → same second, keep playing
  const pickSource = (i: number) => {
    const v = videoRef.current;
    if (v) resumeAt.current = v.currentTime;
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
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
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
  }, [togglePlay, seek, toggleFs, bumpUi]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate]);

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

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const active = srcList[Math.min(srcIdx, srcList.length - 1)];
  const qualityLabel = active?.q || "";

  return (
    <div
      ref={wrapRef}
      data-subsize={subSize}
      className={`force-dark relative h-screen w-screen select-none overflow-hidden bg-black ${showUi ? "cursor-default" : "cursor-none"}`}
      onMouseMove={bumpUi}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-ctrl]")) return;
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
        className="h-full w-full object-contain"
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
      {!playing && !loading && !ended && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-24 w-24 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md ring-1 ring-white/30">
            <PlayIcon width={44} height={44} className="ms-2" />
          </span>
        </div>
      )}

      {/* ended overlay */}
      {ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm" data-ctrl>
          <div className="text-center">
            {nextEpisode ? (
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
            ) : (
              <>
                <p className="text-2xl font-black text-white">تماشا به پایان رسید</p>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* top bar */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent p-4 transition-opacity duration-300 sm:p-6 ${showUi ? "opacity-100" : "opacity-0"}`}
        data-ctrl
      >
        <Link href={`/title/${slug}`} className="grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition hover:bg-white/20" aria-label="بازگشت">
          <BackIcon />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-white">{title}</p>
          {subtitle && <p className="truncate text-xs text-zinc-300">{subtitle}</p>}
        </div>
        <div className="ms-auto flex items-center gap-2">
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
                  <img src={e.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover" />
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
                  subOn && subLoaded ? "border-brand/60 bg-brand/20 text-white" : subLoaded ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
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
                      فایل‌های این آرشیو زیرنویس جدا ندارند؛ نسخه‌های «زیرنویس چسبیده» زیرنویس داخل تصویر دارند. می‌توانید فایل SRT خودتان را لود کنید.
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
