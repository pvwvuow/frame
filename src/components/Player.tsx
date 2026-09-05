"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "./Icons";
import FavoriteButton from "./FavoriteButton";
import WatchlistButton from "./WatchlistButton";

export type PlayerEpisode = { id: number; season: number; number: number; name: string; videoUrl: string; thumbnail: string };

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
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);
  const router = useRouter();

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

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      setDuration(v.duration);
      if (startAt > 0 && startAt < v.duration - 5) v.currentTime = startAt;
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
  }, [startAt, save, bumpUi, nextEpisode]);

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

  return (
    <div
      ref={wrapRef}
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
        src={src}
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
        <Link href={`/title/${slug}`} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20" aria-label="بازگشت">
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
              className="hidden h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 sm:flex"
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
                  { }
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
                className="h-9 appearance-none rounded-full bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 focus:outline-none"
                aria-label="سرعت پخش"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <option key={r} value={r} className="bg-ink text-white">
                    {r}x
                  </option>
                ))}
              </select>
            </div>
            <span className="hidden rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white sm:block">۴K</span>
            {nextEpisode && (
              <Link
                href={`/watch/${slug}?ep=${nextEpisode.id}`}
                className="hidden h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-xs font-bold text-white hover:bg-white/20 sm:flex"
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
