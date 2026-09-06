"use client";

/* فریم – desktop floating player (v0.10.5)
 *
 * Rendered inside a frameless, freely-resizable, always-on-top Electron
 * window (electron/pip.cjs). It floats over the WHOLE desktop — the user can
 * keep watching while browsing the app or working in any other program.
 *
 *   • drag        → grab the top bar (native window drag, -webkit-app-region)
 *   • resize      → native edge/corner handles, any size the user wants
 *   • pin         → always-on-top toggle (screen-saver level)
 *   • expand      → hand playback back to the in-app theater at this position
 *   • next        → advance to the next episode inside the floating window
 *   • subtitles   → the muxed Persian SRT is extracted live by the local
 *                   stream proxy and attached as a WebVTT track
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatClock, fa } from "@/lib/format";
import { loadProxyBase, mediaSrc } from "@/lib/video-url";
import { applyVttToTrack, stopMediaEl } from "@/lib/media";
import { useMkvSubs } from "@/lib/use-mkv-subs";
import { ensurePlayableAudio } from "@/lib/audio-guard";
import { preferredSourceIdx, rememberedVariantIdx, rememberVariantPref, variantShort } from "@/lib/variant";
import type { PipPayload } from "@/lib/platform";
import {
  BackIcon,
  CloseIcon,
  ExpandIcon,
  Forward10,
  MuteIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  Rewind10,
  SubtitleIcon,
  VolumeIcon,
  CheckIcon,
} from "./Icons";

const VOL_KEY = "nama-volume";
const MUTED_KEY = "nama-muted";
const SUB_ON_KEY = "nama-sub-on";

export default function PipClient() {
  const [state, setState] = useState<PipPayload | null>(null);
  const [pin, setPin] = useState(true);
  // tri-state: undefined = still resolving → the <video> stays unmounted so
  // the src never flips direct→proxy after playback started (that re-keyed
  // the element and restarted the film seconds into the float window).
  const [proxyBase, setProxyBase] = useState<string | null | undefined>(undefined);
  const [srcIdx, setSrcIdx] = useState(0);
  const [qMenu, setQMenu] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showUi, setShowUi] = useState(true);
  const [subOn, setSubOn] = useState(true);
  const [subLoaded, setSubLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 9000);
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  // element identity as state (see Player.tsx) — listener effects must
  // re-run when the element appears or re-keys
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);
  const lastTick = useRef(0);
  const resumeAt = useRef<number | null>(null);
  const [fatal, setFatal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const errCountRef = useRef(0);

  const sources = useMemo(() => state?.sources ?? [], [state]);
  const rawActive = sources[Math.min(srcIdx, Math.max(0, sources.length - 1))]?.url || state?.src || "";
  const activeSrc = mediaSrc(rawActive, proxyBase);
  const { vtt: mkvVtt, kick: kickSubs } = useMkvSubs(rawActive || null, proxyBase, !!state);

  /* ---------------- boot: proxy + initial payload ---------------- */
  useEffect(() => {
    void loadProxyBase().then((b) => setProxyBase(b || null));
    const pip = window.nama?.pip;
    if (!pip) return;
    void pip.getState().then((p) => {
      if (!p) return;
      setState(p);
      // v0.10.7: resume at the transferred position. The handoff payload
      // carries both `startAt` and `currentTime`; only `startAt` was honored
      // and the theater sent 0 — so floating ALWAYS restarted from zero.
      const at = p.startAt > 0 ? p.startAt : p.currentTime ?? 0;
      if (at > 0) resumeAt.current = at;
      if (typeof p.volume === "number") setVolume(p.volume);
      if (typeof p.muted === "boolean") setMuted(p.muted);
      if (typeof p.rate === "number") setRate(p.rate);
    });
    const un = pip.onState((p) => {
      setState(p);
      const at = p.startAt > 0 ? p.startAt : p.currentTime ?? 0;
      resumeAt.current = at > 0 ? at : null;
      setCurrent(0);
      setDuration(0);
      setBuffered(0);
      setEnded(false);
      setCountdown(null);
      setLoading(true);
      setQMenu(false);
    });
    return un;
  }, []);

  /* resolve which source plays: hint → remembered taste → hardsub → dub →
   * catalog order; then the v0.10.6 audio guard — a variant whose first
   * audio track is DTS/AC3 (undecodable by Chromium) is swapped for the
   * closest variant that will actually sound. */
  const stateKey = state ? `${state.slug}|${state.episode?.id ?? 0}|${state.src}` : "";
  // re-runs when the proxy comes up late so the guard always gets its chance
  const guardKey = `${stateKey}|${proxyBase ?? ""}`;
  useEffect(() => {
    if (!state) return;
    const list = state.sources ?? [];
    if (list.length <= 1) {
      setSrcIdx(0);
      return;
    }
    const hint = state.srcIdx ?? -1;
    const remembered = rememberedVariantIdx(list);
    const initial = hint >= 0 && hint < list.length ? hint : remembered >= 0 ? remembered : preferredSourceIdx(list);
    setSrcIdx(initial);
    if (proxyBase) {
      let alive = true;
      void ensurePlayableAudio(list, initial, proxyBase).then((r) => {
        if (!alive || !r) return;
        if (r.switchedTo != null && r.switchedTo !== initial) {
          // v0.10.8: keep the exact position across the audio-guard variant
          // switch (the src change re-keys the <video> element).
          const v = videoRef.current;
          if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
          setSrcIdx(r.switchedTo);
        }
        if (r.message) showNotice(r.message);
      });
      return () => {
        alive = false;
      };
    }
  }, [guardKey]);

  /* restore volume/sub prefs (shared localStorage across app windows).
   * muted is NOT restored — fresh playback always starts unmuted; the
   * in-session handoff payload (state.muted) is honored above instead. */
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(VOL_KEY));
      if (Number.isFinite(v) && v > 0) setVolume(Math.min(1, v));
      setSubOn(localStorage.getItem(SUB_ON_KEY) !== "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VOL_KEY, String(volume));
      localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [volume, muted]);

  /* ---------------- video element wiring ---------------- */
  const save = useCallback(
    (pos: number, dur: number) => {
      if (!state || !dur) return;
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: state.titleId, episodeId: state.episode?.id ?? null, position: pos, duration: dur }),
        keepalive: true,
      }).catch(() => {});
    },
    [state]
  );

  const bumpUi = useCallback(() => {
    setShowUi(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowUi(false);
    }, 2600);
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

  useEffect(() => {
    const v = videoEl;
    if (!v || !activeSrc) return;
    const onLoaded = () => {
      setDuration(v.duration);
      const resume = resumeAt.current ?? state?.startAt ?? 0;
      resumeAt.current = null;
      // v0.10.8: unknown duration (0/NaN) must not skip the resume seek —
      // that is the "film restarts from zero inside the floating window" bug.
      if (resume > 0 && resume < (v.duration || Infinity) - 5) v.currentTime = resume;
      setLoading(false);
      v.volume = volume;
      v.muted = muted;
      v.playbackRate = rate;
      void v.play().catch((err: unknown) => {
        if (err && typeof err === "object" && (err as { name?: string }).name === "NotAllowedError") {
          v.muted = true;
          setMuted(true);
          void v.play().catch(() => {});
        }
      });
    };
    const onTime = () => {
      setCurrent(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      const now = Date.now();
      if (now - lastTick.current > 2000) {
        lastTick.current = now;
        window.nama?.pip?.time(v.currentTime);
      }
      if (now - lastSaved.current > 8000) {
        lastSaved.current = now;
        save(v.currentTime, v.duration);
      }
    };
    const onPlaying = () => {
      setLoading(false);
      if (Math.abs(v.volume - volume) > 0.01) v.volume = volume;
      if (v.muted !== muted) v.muted = muted;
      if (v.playbackRate !== rate) v.playbackRate = rate;
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
      setCountdown(state?.nextEpisode ? 8 : null);
    };
    // v0.10.12: dead source → try the next variant, then a plain notice
    const onWaiting = () => setLoading(true);
    const onError = () => {
      const list = sources;
      const next = srcIdx + 1;
      if (next < list.length && errCountRef.current < list.length) {
        errCountRef.current += 1;
        if (v.currentTime > 0.5) resumeAt.current = v.currentTime;
        setSrcIdx(next);
        setLoading(true);
        showNotice("پخش این نسخه ناموفق بود — نسخه‌ی بعدی امتحان می‌شود");
      } else {
        setFatal(true);
        setLoading(false);
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("error", onError);
    };
  }, [videoEl, activeSrc, state, volume, muted, rate, save, bumpUi, srcIdx, sources, showNotice]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  }, [volume, muted, rate]);

  /* ---------------- extracted MKV subtitles ----------------
   * v0.10.12: ONE programmatic TextTrack fed incrementally — the old
   * <track> swap flickered on every poll and lost the track whenever the
   * <video> re-keyed (quality switch) with no new cues arriving. */
  const subTrackRef = useRef<TextTrack | null>(null);
  const subTrackElRef = useRef<HTMLVideoElement | null>(null);
  const cueKeysRef = useRef<Set<string>>(new Set());
  const subOnRef = useRef(subOn);
  useEffect(() => {
    subOnRef.current = subOn;
  }, [subOn]);

  const syncSubTrack = useCallback(() => {
    const v = videoRef.current;
    if (!v || !state) return;
    let tt = subTrackRef.current;
    if (!tt || subTrackElRef.current !== v) {
      try {
        tt = v.addTextTrack("subtitles", "زیرنویس فارسی", "fa");
      } catch {
        return;
      }
      tt.mode = "disabled";
      subTrackRef.current = tt;
      subTrackElRef.current = v;
      cueKeysRef.current = new Set();
    }
    if (!tt || !mkvVtt) return;
    const added = applyVttToTrack(tt, mkvVtt, cueKeysRef.current);
    if (added > 0) setSubLoaded(true);
    tt.mode = subOnRef.current && (tt.cues?.length ?? 0) > 0 ? "showing" : "disabled";
  }, [state, mkvVtt]);

  useEffect(() => {
    syncSubTrack();
  }, [syncSubTrack, videoEl]);

  // right after a seek, show the freshly scanned cues without waiting for
  // the next scheduled poll
  useEffect(() => {
    if (!videoEl) return;
    const onSeeked = () => kickSubs();
    videoEl.addEventListener("seeked", onSeeked);
    return () => videoEl.removeEventListener("seeked", onSeeked);
  }, [kickSubs, videoEl]);

  /* v0.10.12 lifecycle guard: whenever the playing element goes away — a
   * quality switch re-keying it or the pip window unloading — make sure it
   * is PAUSED and its fetch released; a detached playing <video> keeps its
   * audio alive until GC. */
  useEffect(() => {
    if (!videoEl) return;
    return () => {
      stopMediaEl(videoEl);
    };
  }, [videoEl]);

  useEffect(() => {
    const v = videoRef.current;
    const track = subTrackRef.current;
    if (track) track.mode = subOn && subLoaded ? "showing" : "disabled";
  }, [subOn, subLoaded]);

  /* ---------------- ended countdown → next episode inside the pip ---------------- */
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      window.nama?.pip?.next();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ---------------- keyboard ---------------- */
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
        case "m":
          setMuted((m) => !m);
          break;
      }
      bumpUi();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seek, bumpUi]);

  /* flush progress when the window goes away */
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

  /* ---------------- window commands ---------------- */
  const togglePin = () => {
    setPin((p) => {
      window.nama?.pip?.pin(!p);
      return !p;
    });
  };

  const pickSource = (i: number) => {
    const v = videoRef.current;
    if (v) resumeAt.current = v.currentTime;
    rememberVariantPref(sources[i]?.v);
    errCountRef.current = 0;
    setFatal(false);
    setSrcIdx(i);
    setQMenu(false);
    setLoading(true);
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const active = sources[Math.min(srcIdx, Math.max(0, sources.length - 1))];
  const currentVariant = active?.v || "";

  if (!state) {
    return (
      <div className="force-dark fixed inset-0 grid place-items-center bg-black text-sm text-zinc-500" dir="rtl">
        در حال آماده‌سازی پخش شناور…
      </div>
    );
  }

  if (!window.nama?.pip) {
    return (
      <div className="force-dark fixed inset-0 grid place-items-center bg-black p-6 text-center text-sm leading-7 text-zinc-400" dir="rtl">
        این صفحه فقط داخل برنامه‌ی فریم (پنجره‌ی پخش شناور) باز می‌شود.
      </div>
    );
  }

  return (
    <div
      className={`force-dark fixed inset-0 select-none overflow-hidden bg-black ${showUi ? "cursor-default" : "cursor-none"}`}
      dir="rtl"
      onMouseMove={bumpUi}
      onClick={(e) => {
        if (e.target !== e.currentTarget) {
          const t = e.target as HTMLElement;
          if (t.tagName !== "VIDEO") return;
        }
        togglePlay();
      }}
    >
      {proxyBase !== undefined && (
        <video
          ref={(el) => {
            videoRef.current = el;
            setVideoEl(el);
          }}
          key={`${activeSrc || "empty"}#${reloadKey}`}
          src={activeSrc || undefined}
          poster={state.poster || undefined}
          className="h-full w-full object-contain"
          playsInline
          preload="metadata"
        />
      )}

      {loading && !ended && !fatal && activeSrc && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
        </div>
      )}

      {/* v0.10.12 — every source failed inside the floating window */}
      {fatal && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 px-4" data-ctrl>
          <div className="text-center">
            <p className="text-sm font-black text-white">پخش این نسخه ممکن نشد</p>
            <p className="mt-1 text-[11px] leading-5 text-zinc-400">نسخه یا قسمت دیگری را امتحان کنید.</p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  errCountRef.current = 0;
                  setFatal(false);
                  setLoading(true);
                  const v = videoRef.current;
                  if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
                  setReloadKey((k) => k + 1);
                }}
                className="h-9 rounded-full bg-white px-4 text-xs font-bold text-black"
              >
                تلاش دوباره
              </button>
              <button type="button" onClick={() => window.nama?.pip?.close()} className="h-9 rounded-full border border-white/20 px-4 text-xs font-bold text-white hover:bg-white/10">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v0.10.6 notice banner (audio-guard) */}
      {notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-40 flex justify-center px-3">
          <div className="max-w-[94%] rounded-full border border-amber-300/30 bg-black/85 px-4 py-2 text-center text-[11px] font-semibold leading-5 text-amber-100 backdrop-blur">
            {notice}
          </div>
        </div>
      )}

      {/* top bar = native window drag handle */}
      <div
        className="pip-drag absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/85 to-transparent px-2 py-1.5 transition-opacity duration-300"
        style={{ opacity: showUi ? 1 : 0 }}
        onDoubleClick={() => setQMenu(false)}
      >
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-[12px] font-bold text-white/95">{state.title}</p>
          {state.subtitle && <p className="truncate text-[10px] text-zinc-400">{state.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={togglePin}
          title={pin ? "سنجاق شده — همیشه روی همه‌ی پنجره‌ها" : "سنجاق نشده — زیر پنجره‌های دیگر می‌رود"}
          className={`pip-no-drag grid h-7 w-7 place-items-center rounded-full transition hover:bg-white/20 ${pin ? "text-brand" : "text-zinc-300 opacity-70"}`}
        >
          <PinIcon width={13} height={13} />
        </button>
        <button
          type="button"
          onClick={() => window.nama?.pip?.expand(current, srcIdx)}
          title="بازگشت به برنامه"
          className="pip-no-drag grid h-7 w-7 place-items-center rounded-full text-white transition hover:bg-white/20"
        >
          <ExpandIcon width={13} height={13} />
        </button>
        <button
          type="button"
          onClick={() => window.nama?.pip?.close()}
          title="بستن پخش"
          className="pip-no-drag grid h-7 w-7 place-items-center rounded-full text-white transition hover:bg-white/20"
        >
          <CloseIcon width={13} height={13} />
        </button>
      </div>

      {/* center play */}
      {!playing && !loading && !ended && !fatal && activeSrc && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur">
            <PlayIcon width={26} height={26} className="ms-1" />
          </span>
        </div>
      )}

      {/* ended / next-episode overlay */}
      {ended && (
        <div className="absolute inset-0 grid place-items-center bg-black/75" data-ctrl>
          <div className="p-4 text-center">
            {state.nextEpisode ? (
              <>
                <p className="text-xs text-zinc-400">قسمت بعدی تا {fa(Math.max(0, countdown ?? 0))} ثانیه دیگر</p>
                <p className="mt-1 max-w-[280px] truncate text-base font-black text-white">
                  قسمت {fa(state.nextEpisode.number)}: {state.nextEpisode.name}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.nama?.pip?.next()}
                    className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-bold text-black"
                  >
                    <PlayIcon width={14} height={14} /> پخش
                  </button>
                  <button
                    type="button"
                    onClick={() => window.nama?.pip?.expand(current, srcIdx)}
                    className="flex h-9 items-center gap-2 rounded-full border border-white/20 px-4 text-xs font-bold text-white hover:bg-white/10"
                  >
                    <BackIcon width={14} height={14} /> بازگشت به برنامه
                  </button>
                  <button
                    type="button"
                    onClick={() => window.nama?.pip?.close()}
                    className="h-9 rounded-full border border-white/20 px-4 text-xs font-bold text-white hover:bg-white/10"
                  >
                    بستن
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-black text-white">تماشا به پایان رسید</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.currentTime = 0;
                        setEnded(false);
                        void v.play();
                      }
                    }}
                    className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-bold text-black"
                  >
                    <PlayIcon width={14} height={14} /> دوباره
                  </button>
                  <button
                    type="button"
                    onClick={() => window.nama?.pip?.close()}
                    className="h-9 rounded-full border border-white/20 px-4 text-xs font-bold text-white hover:bg-white/10"
                  >
                    بستن
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* bottom controls */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 transition-opacity duration-300"
        style={{ opacity: showUi ? 1 : 0 }}
        data-ctrl
      >
        <div className="group relative h-3.5 cursor-pointer" dir="ltr">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
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
            {playing ? <PauseIcon width={17} height={17} /> : <PlayIcon width={17} height={17} />}
          </button>
          <button type="button" onClick={() => seek(-10)} className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10" aria-label="۱۰ ثانیه عقب">
            <Rewind10 width={16} height={16} />
          </button>
          <button type="button" onClick={() => seek(10)} className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10" aria-label="۱۰ ثانیه جلو">
            <Forward10 width={16} height={16} />
          </button>
          <button type="button" onClick={() => setMuted((m) => !m)} className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10" aria-label="صدا">
            {muted || volume === 0 ? <MuteIcon width={15} height={15} /> : <VolumeIcon width={15} height={15} />}
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
            className="range-input w-14 shrink-0"
            dir="ltr"
            aria-label="میزان صدا"
          />
          <span className="text-[10px] tabular-nums text-zinc-300" dir="ltr">
            {formatClock(current)} / {formatClock(duration)}
          </span>

          <div className="ms-auto flex items-center gap-1">
            {currentVariant && (
              <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline ${currentVariant.includes("دوبله") ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-zinc-200"}`}>
                {variantShort(currentVariant)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setSubOn((s) => {
                try {
                  localStorage.setItem(SUB_ON_KEY, s ? "0" : "1");
                } catch {}
                return !s;
              })}
              title={subLoaded ? (subOn ? "زیرنویس روشن است" : "زیرنویس خاموش است") : "زیرنویسی داخل این فایل پیدا نشد"}
              className={`grid h-7 w-7 place-items-center rounded-full transition ${subLoaded ? (subOn ? "bg-brand/20 text-white ring-1 ring-brand/60" : "text-white hover:bg-white/10") : "text-zinc-600"}`}
              aria-label="زیرنویس"
            >
              <SubtitleIcon width={14} height={14} />
            </button>
            {sources.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setQMenu((o) => !o)}
                  className={`flex h-7 items-center gap-1 rounded-full border px-2 text-[10px] font-bold transition ${
                    qMenu ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                  }`}
                  aria-label="انتخاب کیفیت"
                >
                  {active?.q || "کیفیت"}
                </button>
                {qMenu && (
                  <ul className="absolute bottom-9 end-0 z-30 w-52 overflow-hidden rounded-xl border border-white/10 bg-ink-800/95 p-1 shadow-2xl">
                    {sources.map((s, i) => {
                      const on = i === srcIdx;
                      return (
                        <li key={`${s.url}-${i}`}>
                          <button
                            type="button"
                            onClick={() => pickSource(i)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] transition ${
                              on ? "bg-brand/20 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="w-11 shrink-0 font-black">{s.q || "عادی"}</span>
                            <span className={`flex-1 text-start text-[10px] ${s.v?.includes("دوبله") ? "text-emerald-300" : s.v?.includes("زیرنویس") ? "text-sky-300" : "text-zinc-500"}`}>
                              {variantShort(s.v) || "اصلی"}
                            </span>
                            {on && <CheckIcon width={12} height={12} className="text-brand" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
