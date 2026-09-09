"use client";

/* نما — mobile player (v0.15.0)
 *
 * A touch-first player for the Capacitor Android build (NAMA_MOBILE=1).
 * Mounted by GlobalPlayer INSTEAD of the desktop theater (Player.tsx) — the
 * desktop component and its behavior are untouched.
 *
 * Engine parity with the desktop theater (ported 1:1): smart variant pick +
 * audio guard, proxy SRT extraction from MKV (Subs v3 overlay), progress
 * save (local via the mobile fetch shim + Supabase), resume, next-episode
 * countdown, dead-link ladder → fatal, offline-first local files, native
 * Media3 handoff for MKV, and the cinema watch-party (host beats / guest
 * mirror / follow handler / resume).
 *
 * v0.16.2 STRUCTURAL REWORK — «بازنگری کامل ساختار پخش»:
 *  - OWNERSHIP is declarative (resolveOwner, render-time): native-owned
 *    sources never mount the WebView <video> at all → no phantom fetches,
 *    no WebView errors racing the Media3 handoff.
 *  - FATAL halts the media (stopMediaEl) and unmounts the video → the
 *    «پیام اتصال برقرار نشد روی فیلمی که پخش می‌شود» class is dead.
 *  - The dead-link ladder is echo-proof (one step per source per window,
 *    stale native results ignored) and re-arms on every successful start.
 *
 * Mobile layer: fullscreen-first (Netflix-style) with a portrait strip
 * fallback, touch gestures (single tap = controls, double-tap sides =
 * ±seek with ripple + haptic, double-tap center = play/pause, horizontal
 * drag = scrub with time preview), screen lock (hold 1s to unlock), bottom
 * sheets (quality / speed / subtitles / episodes), cinema drawer, network
 * drop retry with backoff, wake lock, safe-area padding and an Android
 * back-button contract:
 *   fullscreen → hardware back exits to portrait; portrait → back closes
 *   the player (progress saved). All system helpers degrade to no-ops on
 *   desktop/Electron (src/lib/mobile-ui.ts).
 */
import Link from "next/link";
import { pushProgressOne } from "@/lib/cloud";
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
  UsersIcon,
} from "../Icons";
import FavoriteButton from "../FavoriteButton";
import WatchlistButton from "../WatchlistButton";
import { isMkvUrl, loadProxyBase, mediaSrc } from "@/lib/video-url";
import { parseVtt, srtToVtt, stopMediaEl, type ParsedCue } from "@/lib/media";
import { useSubs } from "@/lib/subs-engine";
import SubOverlay from "../SubOverlay";
import { ensurePlayableAudio } from "@/lib/audio-guard";
import { preferredSourceIdx, qualityPrefIdx, rememberedVariantIdx, rememberVariantPref, variantShort } from "@/lib/variant";
import { setQualityPref } from "@/lib/quality-pref";
import { titleHref, watchHref } from "@/lib/mobile-links";
import { isLocalFile, localFilePath, nativeBridge } from "@/lib/native-bridge";
import { resolveOwner, shouldLadderAdvance, isLadderExhausted, isDuplicateNotice } from "@/lib/mobile-playback";
import { useCinema, cinemaTargetPosition, setCinemaFollowHandler, type CinemaBeat } from "@/lib/cinema";
import CinemaPanel from "../cinema/CinemaPanel";
import { useLibrary } from "../library/LibraryProvider";
import { useCinemaIdentity } from "@/lib/shown-name";
import {
  acquireWakeLock,
  releaseWakeLock,
  lockLandscape,
  unlockOrientation,
  enterFullscreen,
  exitFullscreen,
  haptic,
  getSeekStep,
} from "@/lib/mobile-ui";

const SUB_SIZE_KEY = "nama-sub-size";
const SUB_ON_KEY = "nama-sub-on";
const VOL_KEY = "nama-volume";
const MUTED_KEY = "nama-muted";

type SheetKind = null | "quality" | "speed" | "subs" | "episodes";
type Ripple = { id: number; x: number; dir: -1 | 1 };

export default function PlayerMobile() {
  const router = useRouter();
  const pathname = usePathname();
  const store = usePlayerStore();
  const cin = useCinema();
  const { profile } = useLibrary();
  const selfId = useCinemaIdentity();
  const { open, titleId, slug, title, subtitle, src, poster, startAt, episode, nextEpisode, episodes, contentKey } = store;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(0);

  // ---- quality / variant sources (parity with desktop) --------------------
  const sources = store.sources ?? [];
  const srcList = useMemo(
    () => (sources.length ? sources : src ? [{ q: "", v: "", url: src }] : []),
    [sources, src]
  );
  const [srcIdx, setSrcIdx] = useState(0);
  const [proxyBase, setProxyBase] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void loadProxyBase().then((b) => setProxyBase(b || null));
  }, []);
  const rawActive = srcList[Math.min(srcIdx, srcList.length - 1)]?.url || src;
  const activeSrc = mediaSrc(rawActive, proxyBase);

  // v0.16.2 — ONE declarative ownership decision per source. When native owns
  // playback the WebView element is never mounted, so it can neither race the
  // Media3 activity nor fire phantom errors into the failure ladder.
  const wantsNative =
    resolveOwner({
      hasBridge: !!nativeBridge(),
      cinemaActive: cin.status !== "idle",
      proxyReady: proxyBase !== undefined,
      url: activeSrc,
    }) === "native";

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [showUi, setShowUi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [nativeActive, setNativeActive] = useState(false);
  const nativeKeyRef = useRef<string | null>(null);
  const errCountRef = useRef(0);
  const resumeAt = useRef<number | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v0.16.2 — race-proofing state
  const ladderAtRef = useRef<{ idx: number; at: number } | null>(null);
  const lastNoticeRef = useRef<{ msg: string; at: number } | null>(null);
  const pendingNativeRef = useRef(false);

  const showNotice = useCallback((msg: string) => {
    const now = Date.now();
    if (isDuplicateNotice(lastNoticeRef.current, msg, now)) return;
    lastNoticeRef.current = { msg, at: now };
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  const cinActive = cin.status !== "idle";
  const guestLock = cin.status === "joined";
  const [showCinema, setShowCinema] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  // ---- mobile screen state -------------------------------------------------
  const [mode, setMode] = useState<"portrait" | "landscape">("portrait");
  const [locked, setLocked] = useState(false);
  const [netDown, setNetDown] = useState(false);
  const netDownRef = useRef(false);
  const wasOpenRef = useRef(false);
  const onWatch = pathname?.startsWith("/watch") ?? false;

  // restore volume preference — muted is deliberately NOT restored (desktop
  // parity: a stale muted flag was the «the movie has no sound» bug)
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(VOL_KEY));
      if (Number.isFinite(v) && v > 0) setVolume(Math.min(1, v));
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

  // default variant: pip hint → user quality pick → remembered variant taste →
  // hardsub → dub → catalog order + the AUDIO GUARD (undecodable DTS/AC3 audio
  // switches to the closest playable variant, carrying the exact position)
  const srcIdxRef = useRef(0);
  const manualPickRef = useRef(false);
  useEffect(() => {
    if (!srcList.length) return;
    const hint = usePlayerStore.getState().srcHint;
    const qp = qualityPrefIdx(srcList);
    const remembered = rememberedVariantIdx(srcList);
    const initial =
      hint >= 0 && hint < srcList.length
        ? hint
        : qp >= 0
          ? qp
          : remembered >= 0
            ? remembered
            : preferredSourceIdx(srcList);
    setSrcIdx(initial);
    manualPickRef.current = false;
    setSheet(null);
    if (proxyBase) {
      const guardCtl = new AbortController();
      let alive = true;
      void ensurePlayableAudio(srcList, initial, proxyBase, guardCtl.signal).then((r) => {
        if (!alive || !r) return;
        if (r.switchedTo != null && r.switchedTo !== srcIdxRef.current) {
          const v = videoRef.current;
          if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
          setSrcIdx(r.switchedTo);
          setLoading(true);
        }
        if (r.message) showNotice(r.message);
      });
      return () => {
        alive = false;
        guardCtl.abort();
      };
    }
  }, [contentKey, srcList.length, proxyBase]);

  // lock body scroll behind the player overlay
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // subtitle prefs — default ON (the extracted MKV subs ARE the experience)
  const [subOn, setSubOn] = useState(false);
  const [subSize, setSubSize] = useState<"s" | "m" | "l" | "xl">("m");
  useEffect(() => {
    try {
      setSubOn(localStorage.getItem(SUB_ON_KEY) !== "0");
      const s = localStorage.getItem(SUB_SIZE_KEY) as "s" | "m" | "l" | "xl" | null;
      if (s) setSubSize(s);
    } catch {
      /* ignore */
    }
  }, []);

  const save = useCallback(
    (pos: number, dur: number) => {
      if (!dur) return;
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId, episodeId: episode?.id ?? null, position: pos, duration: dur }),
        keepalive: true,
      }).catch(() => {});
      void pushProgressOne({ titleId, episodeId: episode?.id ?? null, position: pos, duration: dur });
    },
    [titleId, episode?.id]
  );

  const bumpUi = useCallback(() => {
    setShowUi(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowUi(false);
    }, 3000);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (useCinema.getState().status === "joined") {
      showNotice("کنترل پخش دست میزبان سینماست");
      return;
    }
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, [showNotice]);

  const seek = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (useCinema.getState().status === "joined") {
        showNotice("جلو و عقب دست میزبان سینماست");
        return;
      }
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    },
    [showNotice]
  );

  const goBackToTitle = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) save(v.currentTime, v.duration);
    if (v) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    }
    store.close();
    router.push(titleHref(slug));
  }, [save, store, router, slug]);

  /* ---- native Android playback (Media3) — parity with desktop ------------- */
  // v0.16.2 — shared failure-ladder primitives. advanceLadder steps ONE source
  // per window (echo-proof), preserves the resume position and only declares
  // fatal when every variant is exhausted. haltForFatal STOPS the media before
  // showing the overlay — the fatal screen never plays over live audio again.
  const haltForFatal = useCallback(() => {
    const v = videoRef.current;
    if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime; // keep position for retry
    stopMediaEl(v);
    setLoading(false);
    setFatal(true);
  }, []);

  const advanceLadder = useCallback(
    (resumePos?: number) => {
      const now = Date.now();
      if (!shouldLadderAdvance(ladderAtRef.current, srcIdxRef.current, now)) return;
      ladderAtRef.current = { idx: srcIdxRef.current, at: now };
      errCountRef.current += 1;
      const next = srcIdxRef.current + 1;
      if (!isLadderExhausted(next, srcList.length, errCountRef.current)) {
        if (!resumePos) {
          const v = videoRef.current;
          if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
        } else if (resumePos > 0.5) {
          resumeAt.current = resumePos;
        }
        setSrcIdx(next);
        setLoading(true);
        showNotice("پخش این نسخه ناموفق بود — نسخه‌ی بعدی امتحان می‌شود");
      } else {
        haltForFatal();
      }
    },
    [srcList.length, showNotice, haltForFatal]
  );

  useEffect(() => {
    const b = nativeBridge();
    if (!b) return;
    if (!open) {
      // v0.16.2 — a fresh open must always re-handoff (same-title resume bug)
      nativeKeyRef.current = null;
      pendingNativeRef.current = false;
      return;
    }
    if (!wantsNative) {
      pendingNativeRef.current = false;
      return;
    }
    if (fatal) return;
    if (!activeSrc) return;
    const key = `${contentKey}#${srcIdx}#${reloadKey}`;
    if (nativeKeyRef.current === key) return;
    nativeKeyRef.current = key;
    pendingNativeRef.current = true;
    setNativeActive(true);
    setLoading(true);
    const startMs = Math.round((resumeAt.current ?? startAt ?? 0) * 1000);
    resumeAt.current = null;
    const relKey = contentKey;
    b.playVideo({
      url: isLocalFile(activeSrc) ? localFilePath(activeSrc) : activeSrc,
      title: title ?? "Frame",
      subtitle: subtitle ?? "",
      positionMs: startMs,
    })
      .then((r) => {
        // v0.16.2 — a STALE activity result (source already superseded) must
        // never touch the ladder — this was the silent double-burn
        if (nativeKeyRef.current !== key) return;
        pendingNativeRef.current = false;
        setNativeActive(false);
        if (usePlayerStore.getState().contentKey !== relKey) return;
        const pos = (r.positionMs || 0) / 1000;
        const dur = (r.durationMs || 0) / 1000;
        if (dur > 0) save(Math.min(pos, dur), dur);
        if (r.error) {
          advanceLadder(pos);
          return;
        }
        errCountRef.current = 0; // success re-arms the ladder
        setPlaying(false);
        setLoading(false);
        setCurrent(pos);
        if (dur > 0) setDuration(dur);
        if (r.ended) {
          setEnded(true);
          if (nextEpisode) setCountdown(8);
        }
        goBackToTitle();
      })
      .catch(() => {
        // v0.16.2 — bridge/activity failure = THIS source unavailable →
        // ladder on, like any other source failure (was: instant fatal)
        if (nativeKeyRef.current !== key) return;
        pendingNativeRef.current = false;
        setNativeActive(false);
        advanceLadder();
      });
  }, [open, wantsNative, activeSrc, proxyBase, fatal, contentKey, srcIdx, reloadKey, advanceLadder, save, startAt, title, subtitle, nextEpisode, goBackToTitle]);

  // lifecycle guard: a detached <video> must never keep playing in the void
  useEffect(() => {
    if (!videoEl) return;
    return () => {
      stopMediaEl(videoEl);
    };
  }, [videoEl, open]);

  // new content resets stale end/error state (chain-skip bug guard)
  useEffect(() => {
    setCountdown(null);
    setEnded(false);
    setFatal(false);
    errCountRef.current = 0;
    ladderAtRef.current = null;
    pendingNativeRef.current = false;
    lastNoticeRef.current = null;
    setSheet(null);
  }, [contentKey]);

  // ---- Subs v3: proxy-extracted cues + user-loaded file --------------------
  const { cues: mkvCues, status: subInfo, kick: kickSubs } = useSubs(
    rawActive || null,
    proxyBase,
    open,
    () => videoRef.current?.currentTime ?? 0,
    () => videoRef.current?.duration ?? 0
  );
  const [fileCues, setFileCues] = useState<ParsedCue[] | null>(null);
  useEffect(() => {
    setFileCues(null);
  }, [contentKey]);
  const subCues = fileCues ?? mkvCues;
  const subLoaded = subCues.length > 0;

  useEffect(() => {
    if (!videoEl) return;
    const onSeeked = () => kickSubs();
    videoEl.addEventListener("seeked", onSeeked);
    return () => videoEl.removeEventListener("seeked", onSeeked);
  }, [kickSubs, videoEl]);

  // ---- core <video> listeners ----------------------------------------------
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const onLoaded = () => {
      setDuration(v.duration);
      errCountRef.current = 0; // v0.16.2 — a successful start re-arms the ladder
      const resume = resumeAt.current ?? startAt;
      resumeAt.current = null;
      if (resume > 0 && resume < (v.duration || Infinity) - 5) v.currentTime = resume;
      setLoading(false);
      v.volume = volume;
      v.muted = muted;
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
      if (nextEpisode && useCinema.getState().status !== "joined") setCountdown(8);
    };
    const onWaiting = () => setLoading(true);
    const onError = () => {
      if (!usePlayerStore.getState().open) return;
      // v0.16.2 — the native player owns playback right now: not our error
      if (pendingNativeRef.current) return;
      // network drop ≠ dead link — never burn the variant ladder for it
      if (!navigator.onLine) {
        netDownRef.current = true;
        setNetDown(true);
        setLoading(false);
        showNotice("اتصال اینترنت قطع شده است — با وصل شدن ادامه می‌دهیم");
        return;
      }
      advanceLadder();
    };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("error", onError);
    };
  }, [videoEl, startAt, save, bumpUi, nextEpisode, volume, muted, advanceLadder, showNotice]);

  const pickSource = (i: number, manual = true) => {
    const v = videoRef.current;
    if (v) resumeAt.current = v.currentTime;
    if (manual) {
      manualPickRef.current = true;
      rememberVariantPref(srcList[i]?.v);
      setQualityPref(srcList[i]?.q || "best");
      errCountRef.current = 0;
      ladderAtRef.current = null;
      pendingNativeRef.current = false;
      setFatal(false);
    }
    setSrcIdx(i);
    setSheet(null);
    setLoading(true);
  };

  useEffect(() => {
    srcIdxRef.current = srcIdx;
  }, [srcIdx]);

  const onSubFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const vtt = /^\uFEFF?WEBVTT/.test(text.trim()) ? text : srtToVtt(text);
      const parsed = parseVtt(vtt);
      if (parsed.length > 1) parsed.sort((a, b) => a.s - b.s);
      setFileCues(parsed);
      setSubOn(true);
      try {
        localStorage.setItem(SUB_ON_KEY, "1");
      } catch {}
      setSheet(null);
    };
    reader.readAsText(f, "utf-8");
  };
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0 && nextEpisode) {
      setCountdown(null);
      router.push(watchHref(slug, nextEpisode.id));
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextEpisode, router, slug]);

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

  // ---- CINEMA (parity with desktop) ----------------------------------------
  const cinBeatRef = useRef(0);
  useEffect(() => {
    if (!open || cin.status !== "hosting" || !activeSrc) return;
    const beat = () => {
      const v = videoRef.current;
      if (!v) return;
      const st = usePlayerStore.getState();
      const p: CinemaBeat = {
        slug: st.slug,
        title: st.title,
        poster: st.poster,
        kind: st.episodes.length ? "series" : "movie",
        season: st.episode?.season ?? 0,
        epnum: st.episode?.number ?? 0,
        position: v.currentTime || 0,
        duration: v.duration || 0,
        isPlaying: !v.paused && !v.ended,
      };
      cinBeatRef.current = Date.now();
      useCinema.getState().hostBeat(p);
    };
    const v = videoEl;
    if (!v) return;
    const onPlayB = () => beat();
    const onPauseB = () => beat();
    const onSeekedB = () => beat();
    v.addEventListener("play", onPlayB);
    v.addEventListener("pause", onPauseB);
    v.addEventListener("seeked", onSeekedB);
    const iv = setInterval(beat, 5000);
    beat();
    return () => {
      clearInterval(iv);
      v.removeEventListener("play", onPlayB);
      v.removeEventListener("pause", onPauseB);
      v.removeEventListener("seeked", onSeekedB);
    };
  }, [open, cin.status, activeSrc, videoEl, contentKey]);

  // GUEST: mirror the host — seek on drift > 2.2s, follow play/pause
  useEffect(() => {
    if (!open || cin.status !== "joined") return;
    const cst = useCinema.getState();
    const room = cst.room;
    const pst = usePlayerStore.getState();
    if (!room || pst.slug !== room.slug) return;
    if (
      pst.episodes.length &&
      room.kind === "series" &&
      pst.episode &&
      (pst.episode.season !== room.season || pst.episode.number !== room.epnum)
    ) {
      return;
    }
    const target = cinemaTargetPosition();
    if (target == null) return;
    const v = videoRef.current;
    if (!v || !v.duration || v.ended) return;
    if (Math.abs(v.currentTime - target) > 2.2) {
      v.currentTime = Math.max(0, Math.min(v.duration || Infinity, target));
    }
    if (cst.hostPlaying && v.paused) void v.play().catch(() => {});
    else if (!cst.hostPlaying && !v.paused) v.pause();
  }, [open, cin.status, cin.hostAt, contentKey]);

  // GUEST: follow the content the host switches to
  useEffect(() => {
    setCinemaFollowHandler((fslug, fseason, fepnum) => {
      const base = watchHref(fslug);
      const q = fseason > 0 && fepnum > 0 ? `season=${fseason}&epnum=${fepnum}` : "";
      router.push(q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base);
    });
    return () => setCinemaFollowHandler(null);
  }, [router]);

  // app reloaded mid-session → silently rejoin the stored room
  const cinResumeRef = useRef(0);
  useEffect(() => {
    if (!open || !activeSrc) return;
    if (cinResumeRef.current === contentKey) return;
    cinResumeRef.current = contentKey;
    const st = useCinema.getState();
    if (st.status === "idle") void st.resume(selfId.name || profile.displayName || "کاربر");
  }, [open, activeSrc, contentKey]);

  // ---- fullscreen-first + rotation ------------------------------------------
  const enterLandscape = useCallback(async () => {
    haptic();
    bumpUi();
    const ok = await enterFullscreen(wrapRef.current);
    if (ok) void lockLandscape();
  }, [bumpUi]);

  const exitToPortrait = useCallback(async () => {
    haptic();
    await exitFullscreen();
    await unlockOrientation();
    setMode("portrait");
    bumpUi();
  }, [bumpUi]);

  useEffect(() => {
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setMode(fs ? "landscape" : "portrait");
      if (!fs) void unlockOrientation();
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // opening playback is (almost always) still inside the tap's transient
  // activation window → try fullscreen immediately; refusal falls back to
  // the portrait strip silently (the expand button is one tap away)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      void enterFullscreen(wrapRef.current).then((ok) => {
        if (ok) void lockLandscape();
      });
    }
    if (!open) wasOpenRef.current = false;
    else wasOpenRef.current = true;
  }, [open]);

  // closing the player must never leave fs/locks/wakelock dangling
  useEffect(() => {
    if (open) return;
    void exitFullscreen();
    void unlockOrientation();
    void releaseWakeLock();
    setSheet(null);
    setShowCinema(false);
    setLocked(false);
    setMode("portrait");
  }, [open]);

  // ---- Android hardware back ------------------------------------------------
  // fullscreen → the browser consumes back to exit fullscreen (portrait);
  // portrait → popstate closes the player, progress saved. If we land back on
  // a bare /watch entry we leave it for the title page (desktop parity).
  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      const st = usePlayerStore.getState();
      if (!st.open) return;
      const v = videoRef.current;
      if (v && v.duration) save(v.currentTime, v.duration);
      try {
        v?.pause();
      } catch {
        /* ignore */
      }
      st.close();
      setTimeout(() => {
        const p = window.location.pathname;
        if (/^\/watch\//.test(p)) {
          const idx = typeof window.history.state?.idx === "number" ? window.history.state.idx : 0;
          if (idx > 0) router.back();
          else router.push(titleHref(usePlayerStore.getState().slug));
        }
      }, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, router, save]);

  // ---- wake lock: the screen stays on while playing -------------------------
  useEffect(() => {
    if (!open || !playing) {
      void releaseWakeLock();
      return;
    }
    void acquireWakeLock();
    const onVis = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void releaseWakeLock();
    };
  }, [open, playing]);

  // ---- network drop → auto-resume when connectivity returns -----------------
  useEffect(() => {
    const onOffline = () => {
      netDownRef.current = true;
      setNetDown(true);
      showNotice("اتصال اینترنت قطع شده است");
    };
    const onOnline = () => {
      netDownRef.current = false;
      setNetDown(false);
      const v = videoRef.current;
      if (v && usePlayerStore.getState().open && !fatal) {
        if (v.currentTime > 0.5) resumeAt.current = v.currentTime;
        setLoading(true);
        setReloadKey((k) => k + 1);
        showNotice("اتصال برگشت — ادامه پخش…");
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [showNotice, fatal]);

  // ---- touch gestures --------------------------------------------------------
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [scrubPreview, setScrubPreview] = useState<{ t: number; d: number } | null>(null);
  const lastTapAt = useRef(0);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrub = useRef<{ active: boolean; startX: number; startY: number; base: number; width: number } | null>(null);
  const scrubTargetRef = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [holdPct, setHoldPct] = useState(0);

  const addRipple = useCallback((x: number, dir: -1 | 1) => {
    haptic(18);
    const id = Date.now() + Math.random();
    setRipples((r) => [...r.slice(-3), { id, x, dir }]);
    setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 600);
  }, []);

  const applyScrub = useCallback(
    (target: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (useCinema.getState().status === "joined") {
        showNotice("جابه‌جایی دست میزبان سینماست");
        return;
      }
      v.currentTime = Math.max(0, Math.min(v.duration || 0, target));
    },
    [showNotice]
  );

  const handleTap = useCallback(
    (clientX: number) => {
      if (locked) {
        bumpUi();
        return;
      }
      const now = Date.now();
      const w = surfaceRef.current?.clientWidth ?? 1;
      if (now - lastTapAt.current < 280) {
        lastTapAt.current = 0;
        if (singleTimer.current) {
          clearTimeout(singleTimer.current);
          singleTimer.current = null;
        }
        const rect = surfaceRef.current?.getBoundingClientRect();
        const xPct = rect ? Math.max(4, Math.min(96, ((clientX - rect.left) / rect.width) * 100)) : 50;
        const rel = rect ? (clientX - rect.left) / rect.width : 0.5;
        if (rel < 0.35) {
          addRipple(xPct, -1);
          seek(-getSeekStep());
        } else if (rel > 0.65) {
          addRipple(xPct, 1);
          seek(getSeekStep());
        } else {
          haptic();
          togglePlay();
        }
        bumpUi();
      } else {
        lastTapAt.current = now;
        if (singleTimer.current) clearTimeout(singleTimer.current);
        singleTimer.current = setTimeout(() => {
          singleTimer.current = null;
          bumpUi();
        }, 290);
      }
    },
    [locked, addRipple, seek, togglePlay, bumpUi]
  );

  const onSurfaceTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    scrub.current = {
      active: false,
      startX: t.clientX,
      startY: t.clientY,
      base: videoRef.current?.currentTime ?? current,
      width: surfaceRef.current?.clientWidth ?? 1,
    };
  };

  const onSurfaceTouchMove = (e: React.TouchEvent) => {
    const s = scrub.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (!s.active && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) s.active = true;
    if (!s.active) return;
    if (singleTimer.current) {
      clearTimeout(singleTimer.current);
      singleTimer.current = null;
    }
    const dur = duration || 0;
    const target = Math.max(0, Math.min(dur, s.base + (dx / (s.width * 1.4)) * dur));
    scrubTargetRef.current = target;
    setScrubPreview({ t: target, d: target - s.base });
  };

  const onSurfaceTouchEnd = (e: React.TouchEvent) => {
    const s = scrub.current;
    scrub.current = null;
    if (!s) return;
    if (s.active) {
      setScrubPreview(null);
      applyScrub(scrubTargetRef.current);
      haptic(14);
      bumpUi();
      return;
    }
    const t = e.changedTouches[0];
    handleTap(t.clientX);
  };

  // lock/unlock — hold the padlock 1s to unlock
  const startHold = () => {
    setHoldPct(0);
    if (holdTimer.current) clearInterval(holdTimer.current);
    const t0 = Date.now();
    holdTimer.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - t0) / 1000) * 100);
      setHoldPct(p);
      if (p >= 100) {
        if (holdTimer.current) clearInterval(holdTimer.current);
        holdTimer.current = null;
        setLocked(false);
        haptic(30);
        bumpUi();
      }
    }, 50);
  };
  const cancelHold = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    setHoldPct(0);
  };

  const lockPlayer = () => {
    haptic(20);
    setLocked(true);
    setShowUi(true);
  };

  // ---- derived ---------------------------------------------------------------
  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const active = srcList[Math.min(srcIdx, srcList.length - 1)];
  const qualityLabel = active?.q || "";
  const currentVariant = active?.v || "";
  const isLandscape = mode === "landscape";
  const chromeVisible = showUi && !locked && !nativeActive && !fatal && !ended && !!activeSrc;
  const sig = (d: number) => `${d >= 0 ? "+" : "-"}${formatClock(Math.abs(d))}`;

  if (!open) return null;

  return (
    <div
      ref={wrapRef}
      data-subsize={subSize}
      data-player="mobile"
      className="force-dark fixed inset-0 z-[100] select-none overflow-hidden bg-black"
      dir="rtl"
      style={{ paddingTop: isLandscape ? "0px" : "env(safe-area-inset-top)" }}
    >
        {/* video surface — fullscreen layer in landscape, 16:9 strip in portrait */}
      <div
        className={isLandscape ? "absolute inset-0" : "relative w-full bg-black"}
        style={isLandscape ? undefined : { aspectRatio: "16 / 9" }}
      >
        {/* v0.16.2 — the WebView element only mounts for WEB-owned sources and
            never under the fatal overlay: nothing can play behind the message */}
        {proxyBase !== undefined && !wantsNative && !fatal && !nativeActive && (
          <video
            ref={(el) => {
              videoRef.current = el;
              setVideoEl(el);
            }}
            key={`${activeSrc}#${reloadKey}`}
            src={activeSrc}
            poster={poster}
            className="h-full w-full object-contain"
            playsInline
            preload="metadata"
          />
        )}

        <SubOverlay cues={subCues} videoRef={videoRef} on={subOn} size={subSize} />

        {/* gesture surface — under every control bar */}
        {!nativeActive && !fatal && !ended && (
          <div
            ref={surfaceRef}
            className="absolute inset-0 z-10"
            style={{ touchAction: "none" }}
            onTouchStart={onSurfaceTouchStart}
            onTouchMove={onSurfaceTouchMove}
            onTouchEnd={onSurfaceTouchEnd}
          />
        )}

        {/* double-tap seek ripples */}
        {ripples.map((r) => (
          <div
            key={r.id}
            className="pointer-events-none absolute z-20 grid place-items-center rounded-full bg-white/20 text-white backdrop-blur-sm ripple-pop"
            style={{ left: `${r.x}%`, top: "50%", width: "96px", height: "96px", transform: "translate(-50%, -50%)" }}
          >
            <span className="flex flex-col items-center text-[11px] font-black">
              {r.dir < 0 ? <Rewind10 width={22} height={22} /> : <Forward10 width={22} height={22} />}
              {fa(getSeekStep())} ثانیه
            </span>
          </div>
        ))}

        {/* horizontal scrub preview */}
        {scrubPreview && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center" dir="ltr">
            <div className="rounded-2xl bg-black/75 px-5 py-2 text-center backdrop-blur">
              <p className="text-base font-black tabular-nums text-white">{formatClock(scrubPreview.t)}</p>
              <p className={`text-[11px] font-bold tabular-nums ${scrubPreview.d >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                {sig(scrubPreview.d)}
              </p>
            </div>
          </div>
        )}

        {/* loading */}
        {loading && !ended && !fatal && !nativeActive && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
          </div>
        )}

        {/* center play */}
        {!playing && !loading && !ended && !fatal && !!activeSrc && !nativeActive && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-md">
              <PlayIcon width={38} height={38} className="ms-1.5" />
            </span>
          </div>
        )}

        {/* top bar (landscape) / compact strip bar (portrait) */}
        {chromeVisible && (
          <div
            className={`absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 pb-8 pt-2 transition-opacity duration-300 ${isLandscape ? "" : "!pb-3"}`}
            style={{ paddingTop: isLandscape ? "max(env(safe-area-inset-top), 8px)" : undefined }}
          >
            <button
              type="button"
              onClick={() => {
                if (isLandscape) void exitToPortrait();
                else goBackToTitle();
              }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur active:bg-white/25"
              aria-label="بازگشت"
            >
              <BackIcon />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">{title}</p>
              {subtitle && isLandscape && <p className="truncate text-[11px] text-zinc-300">{subtitle}</p>}
            </div>
            {isLandscape && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setShowCinema((s) => !s);
                  }}
                  className={`flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold backdrop-blur active:bg-white/25 ${cinActive ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white"}`}
                >
                  <UsersIcon width={14} height={14} />
                  {cinActive && cin.members.length > 1 && (
                    <span className="rounded-full bg-brand px-1.5 text-[10px] font-black">{fa(cin.members.length)}</span>
                  )}
                </button>
                {episodes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setSheet("episodes");
                    }}
                    className="flex h-10 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-bold text-white backdrop-blur active:bg-white/25"
                  >
                    قسمت‌ها
                    <ChevronLeft width={14} height={14} />
                  </button>
                )}
              </>
            )}
            {!isLandscape && (
              <button
                type="button"
                onClick={() => void enterLandscape()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur active:bg-white/25"
                aria-label="تمام‌صفحه"
              >
                <FullscreenIcon width={20} height={20} />
              </button>
            )}
          </div>
        )}

        {/* bottom controls (landscape) */}
        {chromeVisible && isLandscape && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
          >
            <div className="relative h-7" dir="ltr">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${bufPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${pct}%` }}>
                  <span className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_0_5px_rgba(229,9,20,0.3)]" />
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={current}
                onChange={(e) => {
                  if (guestLock) return;
                  const v = videoRef.current;
                  if (v) v.currentTime = Number(e.target.value);
                }}
                className="absolute inset-0 h-full w-full opacity-0"
                style={{ touchAction: "none" }}
                aria-label="پیشرفت"
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-y-1 gap-x-1.5">
              <button type="button" onClick={togglePlay} className="grid h-12 w-12 place-items-center rounded-full text-white active:bg-white/15" aria-label="پخش/توقف">
                {playing ? <PauseIcon width={26} height={26} /> : <PlayIcon width={26} height={26} />}
              </button>
              <button type="button" onClick={() => seek(-getSeekStep())} className="grid h-11 w-11 place-items-center rounded-full text-white active:bg-white/15" aria-label="عقب">
                <Rewind10 width={23} height={23} />
              </button>
              <button type="button" onClick={() => seek(getSeekStep())} className="grid h-11 w-11 place-items-center rounded-full text-white active:bg-white/15" aria-label="جلو">
                <Forward10 width={23} height={23} />
              </button>
              <span className="ms-1 text-[11px] tabular-nums text-zinc-200" dir="ltr">
                {formatClock(current)} / {formatClock(duration)}
              </span>
              {netDown && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-300">آفلاین</span>}

              <div className="ms-auto flex items-center gap-1.5">
                {currentVariant && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setSheet("quality");
                    }}
                    className="flex h-9 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-black text-white active:bg-white/25"
                  >
                    {qualityLabel || "عادی"}
                  </button>
                )}
                <div className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2" dir="ltr">
                  <button type="button" onClick={() => setMuted((m) => !m)} className="grid h-9 w-8 place-items-center text-white" aria-label="صدا">
                    {muted || volume === 0 ? <MuteIcon width={18} height={18} /> : <VolumeIcon width={18} height={18} />}
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
                    className="range-input w-16"
                    aria-label="میزان صدا"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setSheet("speed");
                  }}
                  className="flex h-9 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-black text-white active:bg-white/25"
                >
                  {fa(rate)}x
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setSheet("subs");
                  }}
                  aria-label="زیرنویس"
                  className={`relative grid h-9 w-9 place-items-center rounded-full border active:bg-white/25 ${subOn && subLoaded ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white"}`}
                >
                  <SubtitleIcon width={16} height={16} />
                  {subLoaded && subOn && <span className="absolute -top-0.5 end-0 h-2 w-2 rounded-full bg-brand ring-2 ring-black" />}
                </button>
                <button
                  type="button"
                  onClick={lockPlayer}
                  aria-label="قفل صفحه"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white active:bg-white/25"
                >
                  <LockGlyph open={false} />
                </button>
                <button
                  type="button"
                  onClick={() => void exitToPortrait()}
                  aria-label="خروج از تمام‌صفحه"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white active:bg-white/25"
                >
                  <RotateGlyph />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* bottom controls (portrait strip) — compact: play, time, seekbar */}
        {chromeVisible && !isLandscape && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-6">
            <div className="flex items-center gap-1.5 px-1">
              <button type="button" onClick={togglePlay} className="grid h-10 w-10 place-items-center rounded-full text-white active:bg-white/15" aria-label="پخش/توقف">
                {playing ? <PauseIcon width={22} height={22} /> : <PlayIcon width={22} height={22} />}
              </button>
              <span className="text-[10px] tabular-nums text-zinc-200" dir="ltr">
                {formatClock(current)} / {formatClock(duration)}
              </span>
              {netDown && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-300">آفلاین</span>}
              <button
                type="button"
                onClick={() => void enterLandscape()}
                className="ms-auto grid h-10 w-10 place-items-center rounded-full text-white active:bg-white/15"
                aria-label="تمام‌صفحه"
              >
                <FullscreenIcon width={19} height={19} />
              </button>
            </div>
            <div className="relative h-4" dir="ltr">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20">
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
                  if (guestLock) return;
                  const v = videoRef.current;
                  if (v) v.currentTime = Number(e.target.value);
                }}
                className="absolute inset-0 h-full w-full opacity-0"
                aria-label="پیشرفت"
              />
            </div>
          </div>
        )}
      </div>

      {/* portrait info section — only while the watch page is behind us */}
      {!isLandscape && onWatch && (
        <div className="absolute inset-x-0 bottom-0 overflow-y-auto px-4 pb-10 pt-4" style={{ top: "calc(56.25vw + env(safe-area-inset-top))" }} dir="rtl">
          <h1 className="text-lg font-black leading-7 text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>}
          <div className="mt-4 flex items-center gap-2">
            <FavoriteButton titleId={titleId} name={title} variant="mini" className="!h-10 !w-10 !bg-white/10 !ring-0" />
            <WatchlistButton titleId={titleId} name={title} variant="mini" className="!h-10 !w-10 !bg-white/10 !ring-0" />
            {episodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  haptic();
                  setSheet("episodes");
                }}
                className="flex h-10 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-4 text-xs font-bold text-white active:bg-white/25"
              >
                قسمت‌ها
                <ChevronLeft width={14} height={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                haptic();
                setShowCinema((s) => !s);
              }}
              className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-xs font-bold active:bg-white/25 ${cinActive ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white"}`}
            >
              <UsersIcon width={14} height={14} />
              سینما
            </button>
          </div>
          {currentVariant && (
            <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="rounded-md bg-white/10 px-2 py-1 font-bold text-zinc-300">{variantShort(currentVariant) || "اصلی"}</span>
              <span>کیفیت فعال</span>
            </div>
          )}
        </div>
      )}

      {/* screen lock — everything else is inert; hold 1s to unlock */}
      {locked && (
        <div className="absolute inset-0 z-40" style={{ touchAction: "none" }} onClick={bumpUi} onTouchStart={bumpUi}>
          {showUi && (
            <button
              type="button"
              className="absolute end-4 top-4 grid h-12 w-12 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
              style={{
                backgroundImage: `conic-gradient(rgba(229,9,20,0.9) ${holdPct}%, transparent 0)`,
                boxShadow: "0 0 0 2px rgba(255,255,255,0.15) inset",
              }}
              onTouchStart={startHold}
              onTouchEnd={cancelHold}
              onTouchMove={cancelHold}
              aria-label="باز کردن قفل"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-black/70">
                <LockGlyph open={false} />
              </span>
            </button>
          )}
        </div>
      )}

      {/* notice banner */}
      {notice && !nativeActive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="max-w-[92%] rounded-full border border-amber-300/30 bg-black/85 px-5 py-2.5 text-center text-xs font-semibold leading-6 text-amber-100 shadow-2xl backdrop-blur">
            {notice}
          </div>
        </div>
      )}

      {/* unavailable — no playable source */}
      {!activeSrc && !nativeActive && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/85" dir="rtl">
          <div className="max-w-sm p-6 text-center">
            <p className="text-xl font-black text-white">این نسخه در دسترس نیست</p>
            <p className="mt-2 text-sm leading-7 text-zinc-400">لینک معتبری برای این {episode ? "قسمت" : "عنوان"} پیدا نشد. قسمت یا نسخه‌ی دیگری را امتحان کنید.</p>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" onClick={goBackToTitle} className="flex h-12 items-center rounded-full bg-white px-6 text-sm font-bold text-black">
                بازگشت به جزئیات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* fatal — every source failed */}
      {fatal && activeSrc && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/90" dir="rtl">
          <div className="max-w-sm p-6 text-center">
            <p className="text-xl font-black text-white">پخش این نسخه ممکن نشد</p>
            <p className="mt-2 text-sm leading-7 text-zinc-400">اتصال به منبع پخش برقرار نشد یا فایل قابل پخش نیست. دوباره تلاش کنید یا نسخه/قسمت دیگری را امتحان کنید.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  errCountRef.current = 0;
                  ladderAtRef.current = null;
                  setFatal(false);
                  setLoading(true);
                  // resumeAt was already preserved by haltForFatal
                  setReloadKey((k) => k + 1);
                }}
                className="flex h-12 items-center rounded-full bg-white px-6 text-sm font-bold text-black"
              >
                تلاش دوباره
              </button>
              {srcList.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    errCountRef.current = 0;
                    ladderAtRef.current = null;
                    setFatal(false);
                    pickSource(0);
                  }}
                  className="h-12 rounded-full border border-white/20 px-6 text-sm font-bold text-white"
                >
                  نسخه اول
                </button>
              )}
              <button type="button" onClick={goBackToTitle} className="h-12 rounded-full border border-white/20 px-6 text-sm font-bold text-white">
                بازگشت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ended + auto-next countdown */}
      {ended && activeSrc && !nativeActive && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/75" dir="rtl">
          <div className="w-full max-w-sm px-6 text-center">
            {nextEpisode ? (
              <>
                <p className="text-sm text-zinc-400">قسمت بعدی تا {fa(countdown ?? 0)} ثانیه دیگر</p>
                <p className="mt-2 text-2xl font-black text-white">
                  قسمت {fa(nextEpisode.number)}: {nextEpisode.name}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link href={watchHref(slug, nextEpisode.id)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white font-bold text-black">
                    <PlayIcon /> پخش قسمت بعد
                  </Link>
                  <button type="button" onClick={() => setCountdown(null)} className="h-12 rounded-full border border-white/20 font-bold text-white">
                    لغو
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-2xl font-black text-white">تماشا به پایان رسید</p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.currentTime = 0;
                        void v.play();
                      }
                    }}
                    className="flex h-12 items-center justify-center gap-2 rounded-full bg-white font-bold text-black"
                  >
                    <PlayIcon /> تماشای دوباره
                  </button>
                  <button type="button" onClick={goBackToTitle} className="h-12 rounded-full border border-white/20 font-bold text-white">
                    بازگشت
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* native Media3 handoff — the Android player owns the screen */}
      {nativeActive && (
        <div className="absolute inset-0 z-[70] grid place-items-center bg-black" dir="rtl">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
            <p className="mt-4 text-sm font-bold text-white">در حال پخش با پلیر دستگاه…</p>
            <button type="button" onClick={goBackToTitle} className="mt-5 h-11 rounded-full border border-white/20 px-6 text-sm font-bold text-white">
              بازگشت
            </button>
          </div>
        </div>
      )}

      {/* cinema drawer (reused as-is — it is already a side sheet) */}
      {showCinema && !nativeActive && (
        <CinemaPanel
          getBeat={() => {
            const st = usePlayerStore.getState();
            const v = videoRef.current;
            return {
              slug: st.slug,
              title: st.title,
              poster: st.poster,
              kind: st.episodes.length ? "series" : "movie",
              season: st.episode?.season ?? 0,
              epnum: st.episode?.number ?? 0,
              position: v?.currentTime ?? 0,
              duration: v?.duration ?? 0,
              isPlaying: !!v && !v.paused && !v.ended,
            };
          }}
          hostName={selfId.name || profile.displayName || "میزبان"}
          onClose={() => setShowCinema(false)}
        />
      )}

      {/* bottom sheets */}
      {sheet && !nativeActive && (
        <div className="absolute inset-0 z-[60]" dir="rtl">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSheet(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[70%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-ink-800/95 px-4 pt-2 backdrop-blur-xl" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-white/25" />
            {sheet === "quality" && (
              <>
                <p className="mb-2 text-sm font-black text-white">کیفیت و نسخه</p>
                <ul className="space-y-1">
                  {srcList.map((s, i) => {
                    const on = i === srcIdx;
                    return (
                      <li key={`${s.url}-${i}`}>
                        <button
                          type="button"
                          onClick={() => pickSource(i)}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-xs transition active:bg-white/10 ${on ? "bg-brand/20 text-white" : "text-zinc-300"}`}
                        >
                          <span className="w-12 shrink-0 font-black">{s.q || "عادی"}</span>
                          <span className={`flex-1 text-start text-[11px] ${s.v?.includes("دوبله") ? "text-emerald-300" : s.v?.includes("زیرنویس") ? "text-sky-300" : "text-zinc-500"}`}>
                            {variantShort(s.v) || "اصلی"}
                          </span>
                          {s.mb ? <span className="text-[10px] text-zinc-500 num">{fa(s.mb)}MB</span> : null}
                          {on && <CheckIcon width={14} height={14} className="text-brand" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {sheet === "speed" && (
              <>
                <p className="mb-3 text-sm font-black text-white">سرعت پخش</p>
                <div className="grid grid-cols-3 gap-2">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={guestLock}
                      onClick={() => {
                        haptic();
                        setRate(r);
                        setSheet(null);
                      }}
                      className={`rounded-xl border py-3 text-sm font-black transition active:bg-white/10 ${rate === r ? "border-brand/60 bg-brand/20 text-white" : "border-white/10 bg-white/5 text-zinc-300"} disabled:opacity-40`}
                    >
                      {fa(r)}x
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === "subs" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black text-white">زیرنویس</p>
                  <button type="button" onClick={() => setSheet(null)} aria-label="بستن" className="text-zinc-500">
                    <CloseIcon width={14} height={14} />
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
                    className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-xs font-bold ${subOn ? "border-brand/50 bg-brand/15 text-white" : "border-white/10 bg-white/5 text-zinc-300"}`}
                  >
                    <span className="flex items-center gap-2">
                      <SubtitleIcon width={14} height={14} /> نمایش زیرنویس
                    </span>
                    <span>{subOn ? "روشن" : "خاموش"}</span>
                  </button>
                ) : (
                  <p className="mb-2 rounded-xl bg-white/5 p-2.5 text-[11px] leading-5 text-zinc-400">
                    {isMkvUrl(rawActive) && subInfo?.probed && (subInfo.kinds ?? []).some((k) => /S_IMAGE|PGS|VobSub|^S_HDMV/i.test(k)) ? (
                      <>زیرنویس داخل این فایل از نوع تصویری (PGS/VobSub) است و به‌عنوان متن قابل نمایش نیست؛ نسخه‌های «زیرنویس چسبیده» زیرنویس را داخل خود تصویر دارند.</>
                    ) : isMkvUrl(rawActive) && subInfo?.probed && !(subInfo.kinds ?? []).length ? (
                      <>زیرنویس متنی داخل این فایل پیدا نشد؛ احتمالاً نسخه «زیرنویس چسبیده» زیرنویس را داخل تصویر دارد. می‌توانید فایل SRT خودتان را هم لود کنید.</>
                    ) : (
                      <>نسخه‌های «زیرنویس چسبیده» زیرنویس داخل تصویر دارند و به‌صورت پیش‌فرض انتخاب می‌شوند. می‌توانید فایل SRT خودتان را هم لود کنید.</>
                    )}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-zinc-200 active:bg-white/10"
                >
                  بارگذاری فایل زیرنویس (SRT / VTT)
                </button>
                <input ref={fileRef} type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={(e) => onSubFile(e.target.files?.[0])} />
                <div className="mt-2 flex items-center gap-1 rounded-xl bg-white/5 p-1">
                  {(
                    [
                      ["s", "کوچک"],
                      ["m", "متوسط"],
                      ["l", "بزرگ"],
                      ["xl", "خیلی بزرگ"],
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
                      className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${subSize === v ? "bg-white text-black" : "text-zinc-300"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}
            {sheet === "episodes" && (
              <>
                <p className="mb-2 text-sm font-black text-white">قسمت‌ها</p>
                <ul className="space-y-2">
                  {episodes.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={watchHref(slug, e.id)}
                        onClick={() => setSheet(null)}
                        className={`flex gap-3 rounded-xl p-2 transition active:bg-white/10 ${e.id === episode?.id ? "bg-brand/20 ring-1 ring-brand/60" : ""}`}
                      >
                        <img src={e.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover" loading="lazy" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-zinc-400">
                            فصل {fa(e.season)} · قسمت {fa(e.number)}
                          </p>
                          <p className="truncate text-sm font-semibold text-white">{e.name}</p>
                        </div>
                        {e.id === episode?.id && <CheckIcon width={14} height={14} className="ms-auto self-center text-brand" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* inline glyphs (kept local so the shared Icons file stays desktop-untouched) */
function LockGlyph({ open }: { open: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      {open ? <path d="M8 11V7a4 4 0 0 1 7.5-2" /> : <path d="M8 11V7a4 4 0 0 1 8 0v4" />}
    </svg>
  );
}

function RotateGlyph() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M3 8a9 9 0 0 1 3-4M21 16a9 9 0 0 1-3 4" />
    </svg>
  );
}

