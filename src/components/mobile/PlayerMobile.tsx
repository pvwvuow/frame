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
 * drag = scrub with time preview, vertical drag = brightness/volume,
 * hold = 2×, pinch = zoom), screen lock (hold 1s to unlock), bottom
 * sheets (quality / speed / subtitles / episodes / sleep timer / player
 * settings), cinema drawer, network drop retry with backoff, wake lock,
 * MediaSession, background pause, data-saver + slow-net badge, mini
 * player, safe-area padding and an Android back-button contract:
 *   fullscreen → hardware back exits to portrait; portrait → back closes
 *   the player (progress saved). All system helpers degrade to no-ops on
 *   desktop/Electron (src/lib/mobile-ui.ts).
 */
import Link from "next/link";
import { flushProgressOne, markProfilePlaybackTouched, pushProgressOne } from "@/lib/cloud";
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
import { classifyUrl, isMkvUrl, loadProxyBase, mediaSrc } from "@/lib/video-url";
import { probeMkvHead } from "@/lib/mkv-web";
import { useMkvWebSubs } from "@/lib/mkv-web-subs";
import { MkvMseSession } from "@/lib/mkv-mse";
import { parseVtt, srtToVtt, stopMediaEl, type ParsedCue } from "@/lib/media";
import { useSubs } from "@/lib/subs-engine";
import SubOverlay from "../SubOverlay";
import { ensurePlayableAudio } from "@/lib/audio-guard";
import { preferredSourceIdx, qualityPrefIdx, rememberedVariantIdx, rememberVariantPref, variantShort } from "@/lib/variant";
import { setQualityPref } from "@/lib/quality-pref";
import { titleHref, watchHref } from "@/lib/mobile-links";
import { isLocalFile, localFilePath, nativeBridge, probeNativeBridge, getInstallInfo } from "@/lib/native-bridge";
import { resolveOwner, shouldLadderAdvance, isLadderExhausted, isDuplicateNotice, metaWatchdogMs, preflightDecision, nextWebIdxSkippingNative, type PlaybackOwner } from "@/lib/mobile-playback";
import { getPlayerEngine, setPlayerEngine, type PlayerEngine } from "@/lib/player-prefs";
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
  lockPortrait,
  isCellular,
  netInfo,
} from "@/lib/mobile-ui";
import {
  getAutoLock,
  getDataSaver,
  getKeepAwake,
  getOrientLock,
  getRatePref,
  getSubDelay,
  getSubPos,
  getZoomMode,
  nextZoomMode,
  pickDataSaverIdx,
  qNum,
  setAutoLock,
  setDataSaver,
  setKeepAwake,
  setOrientLock,
  setRatePref,
  setSeekStepPref,
  setSubDelay,
  setSubPos,
  setZoomMode,
  buildEpisodesManifest,
  type OrientLock,
  type ZoomMode,
} from "@/lib/player-prefs";
import { MobileDownloadButton } from "../download/MobileDownloads";

const SUB_SIZE_KEY = "nama-sub-size";
const SUB_ON_KEY = "nama-sub-on";
const VOL_KEY = "nama-volume";
const MUTED_KEY = "nama-muted";

type SheetKind = null | "quality" | "speed" | "subs" | "episodes" | "sleep" | "settings";
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
  // v0.16.3 — hasBridge comes from a REAL health probe (null = probing):
  // Capacitor's registerPlugin() yields a truthy Proxy even for a dead plugin,
  // and trusting it once burned the whole ladder into a fake «اتصال برقرار
  // نشد» (the v0.12.0→v0.16.2 root bug). While probing, a native-classified
  // source stays "pending" — no phantom fetch, no premature handoff. A PROBED
  // dead plugin → "unsupported": the honest «اپ را آپدیت کنید» screen.
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void probeNativeBridge().then((ok) => {
      if (alive) setBridgeOk(ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  // v0.18.1 — user-chosen player engine (settings sheet / app settings).
  // Re-read on every open: the pref can change in the /settings page while
  // the player is closed. webOverride = the native player's «سوئیچ به وب»
  // (cinema) came back for THIS session — it must beat the «همیشه نیتیو»
  // preference or the switch would boomerang straight back into native.
  const [engine, setEngineState] = useState<PlayerEngine>("auto");
  const [webOverride, setWebOverride] = useState(false);
  useEffect(() => {
    if (open) {
      setEngineState(getPlayerEngine());
    } else {
      setWebOverride(false); // a fresh open re-applies the saved engine
    }
  }, [open]);
  const effEngine: PlayerEngine = webOverride ? "auto" : engine;
  // v0.20.0 — fresh reads from async preflight promises (stale-state guards)
  const effEngineRef = useRef(effEngine);
  const bridgeOkRef = useRef(bridgeOk);
  useEffect(() => {
    effEngineRef.current = effEngine;
  }, [effEngine]);
  useEffect(() => {
    bridgeOkRef.current = bridgeOk;
  }, [bridgeOk]);
  // v0.19.0 — the native FALLBACK rung of the web-first ladder. When every
  // web attempt failed, the best still-untried source is handed to Media3:
  // while nativeFallbackIdx === srcIdx the owner is forced to "native" so the
  // WebView unmounts and the normal handoff effect takes over. The Set makes
  // the fallback one-shot per source — no web⇄native ping-pong.
  const [nativeFallbackIdx, setNativeFallbackIdx] = useState<number | null>(null);
  const [natUnavailable, setNatUnavailable] = useState(false);
  const nativeTriedRef = useRef<Set<number>>(new Set());
  /** v0.21.1 — a fallback rung deferred until the bridge probe resolves
   *  (bridgeOk null at call time). Holds the pending notice text. */
  const nativeFallbackQueuedRef = useRef<string | null>(null);
  /* ---- v0.21.0 — the MSE fallback transport (fMP4 over MediaSource) ----
   * mseWanted = the raw URL the MSE session owns; mseUrl = its blob URL for
   * the <video>. A device that cannot demux Matroska directly gets its
   * catalog remuxed in JS instead of losing the cinema player. */
  const [mseWanted, setMseWanted] = useState<string | null>(null);
  const [mseUrl, setMseUrl] = useState<string | null>(null);
  const [mseStateLabel, setMseStateLabel] = useState<string>("off");
  const mseSessionRef = useRef<MkvMseSession | null>(null);
  const mseWantedRef = useRef<string | null>(null);
  const mseTriedRef = useRef<Set<string>>(new Set());
  const msePendingSeekRef = useRef<number | null>(null);
  const mseSeekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mseWantedRef.current = mseWanted;
  }, [mseWanted]);
  /* ---- v0.21.0 — diagnostics (the «کامل بررسی کن» surface: the settings
   * sheet and the fatal panel show REAL state — version, engine, owner,
   * transport, last media error, probe verdict — so a device report is
   * actionable instead of «هیچی کار نمی‌کنه») ---- */
  const [lastVideoErr, setLastVideoErr] = useState<string>("—");
  const [probeInfo, setProbeInfo] = useState<string>("—");
  const [appVer, setAppVer] = useState<string>("—");
  useEffect(() => {
    void getInstallInfo().then((i) => {
      if (i?.versionName) setAppVer(`${i.versionName} (n${i.nativeRev ?? "?"})`);
    }).catch(() => {});
  }, []);
  /* ---- v0.21.0 — bandwidth pacing for BOTH background byte consumers
   * (subtitle scanner + MSE session). The v0.20.0 scanner ripped 768KB
   * chunks back-to-back from open and starved the <video>'s own buffering
   * on a real link — the «هیچی پخش نمی‌کند» experience. Every consumer
   * waits while buffer health is low and keeps a base inter-chunk gap. */
  const mkvPace = useCallback(async () => {
    for (let i = 0; i < 20; i++) {
      const v = videoRef.current;
      if (!v || !usePlayerStore.getState().open) return;
      if (v.paused || v.ended) break; // nothing to starve while paused
      const ahead = v.buffered.length ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 99;
      if (ahead >= 24) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    await new Promise((r) => setTimeout(r, 1100)); // base gap between chunks
  }, []);

  /* v0.21.0 — the subtitle scan gate (scanReady) is declared after the
   * `playing` state below — it must not read it before initialization. */

  const owner: PlaybackOwner =
    nativeFallbackIdx !== null && nativeFallbackIdx === srcIdx && bridgeOk
      ? "native"
      : resolveOwner({
          hasBridge: bridgeOk,
          cinemaActive: cin.status !== "idle",
          proxyReady: proxyBase !== undefined,
          url: activeSrc,
          engine: effEngine,
        });
  const wantsNative = owner === "native";
  const ownerUnsupported = owner === "unsupported";

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);

  /* v0.21.0 — the subtitle scan gates on PLAYBACK being established (first
   * `playing` — or a 15s grace for paused opens). It never races the video
   * to byte 0 again. */
  const [scanReady, setScanReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setScanReady(false);
      return;
    }
    if (playing) {
      setScanReady(true);
      return;
    }
    const t = setTimeout(() => setScanReady(true), 15000);
    return () => clearTimeout(t);
  }, [open, playing]);
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

  // ---- v0.18.0 feature state ------------------------------------------------
  const [zoomMode, setZoomModeState] = useState<ZoomMode>("contain");
  const [pinchScale, setPinchScale] = useState(1);
  const [pinchOrigin, setPinchOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dim, setDim] = useState(0); // gesture brightness — CSS dim 0..0.8
  const [hud, setHud] = useState<{ kind: "bright" | "vol"; pct: number } | null>(null);
  const [tapHolding, setTapHolding] = useState(false); // hold = 2× active
  const prevRateRef = useRef(1);
  const [subDelay, setSubDelayState] = useState(0);
  const [subPos, setSubPosState] = useState(85);
  const [orientLock, setOrientLockState] = useState<OrientLock>("auto");
  const [autoLock, setAutoLockState] = useState(false);
  const [keepAwake, setKeepAwakeState] = useState(true);
  const [dataSaver, setDataSaverState] = useState(false);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null); // seconds
  const [sleepMin, setSleepMin] = useState<number | null>(null);
  const [sleepEop, setSleepEop] = useState(false); // end-of-episode mode
  const sleepEopRef = useRef(false); // mirror for the <video> listener closure
  useEffect(() => {
    sleepEopRef.current = sleepEop;
  }, [sleepEop]);
  const [slowNet, setSlowNet] = useState(false);
  const slowRef = useRef({ since: 0, shownAt: 0 });
  const [epProgress, setEpProgress] = useState<Map<number, { position: number; duration: number }>>(new Map());
  const [seasonTab, setSeasonTab] = useState<number | null>(null);
  const [confirmHighQ, setConfirmHighQ] = useState<number | null>(null);
  const [synopsis, setSynopsis] = useState("");
  const autoLockRef = useRef<number | null>(null);

  // restore prefs once — every one degrades gracefully to its default
  useEffect(() => {
    // v0.27.0 (DATA-11) — per-title subtitle delay (fallback: the global key)
    setSubDelayState(getSubDelay(slug));
    setSubPosState(getSubPos());
    setOrientLockState(getOrientLock());
    setAutoLockState(getAutoLock());
    setKeepAwakeState(getKeepAwake());
    setDataSaverState(getDataSaver());
    const r = getRatePref();
    if (r !== 1) setRate(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist the playback rate (was reset to 1× on every open before v0.18.0)
  useEffect(() => {
    setRatePref(rate);
  }, [rate]);

  // zoom mode is remembered per TITLE (nama-zoom-<titleId>) — NOT per open:
  // contentKey is a bump counter that changes on every play() call, so it
  // would silently forget the user's fit/fill/stretch choice between runs.
  // A new title still resets the pinch + sheet state.
  const zoomTitleKey = String(titleId || slug);
  useEffect(() => {
    setZoomModeState(getZoomMode(zoomTitleKey));
    setPinchScale(1);
    setPinchOrigin(null);
    setSeasonTab(null);
    setConfirmHighQ(null);
  }, [zoomTitleKey]);

  // short synopsis for the portrait info section (one request per open)
  useEffect(() => {
    if (!open || !slug) return;
    let alive = true;
    fetch(`/api/title/${slug}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { title?: { synopsis?: string } }) => {
        if (alive && d.title?.synopsis) setSynopsis(d.title.synopsis);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, slug]);

  // restore volume preference — including a deliberate 0 (B-10: the old
  // `v > 0` guard discarded an explicit «میکس روی صفر»). muted is deliberately
  // NOT restored (desktop parity: a stale muted flag was the
  // «the movie has no sound» bug)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOL_KEY);
      if (raw === null) return; // never set — keep the default 1
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0) setVolume(Math.min(1, v));
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

  /* B-10: unmuting while volume === 0 kept the film silent — restore a
   * sensible level whenever that combination unmutes. */
  const toggleMute = useCallback(() => {
    if (muted && volume === 0) setVolume(0.6);
    setMuted((m) => !m);
  }, [muted, volume]);

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
    let initial =
      hint >= 0 && hint < srcList.length
        ? hint
        : qp >= 0
          ? qp
          : remembered >= 0
            ? remembered
            : preferredSourceIdx(srcList);
    // v0.18.0 — data saver: on cellular with no explicit user taste, start
    // with the sharpest variant ≤720p instead of the catalog default
    if (hint < 0 && qp < 0 && getDataSaver() && isCellular()) {
      const ds = pickDataSaverIdx(srcList);
      if (ds >= 0 && ds !== initial) {
        initial = ds;
        setTimeout(() => showNotice("ذخیره داده فعال است — کیفیت متوسط انتخاب شد"), 0);
      }
    }
    // v0.19.0 — web-first default: with NO explicit user taste, never START
    // on a source only the native player could own when any web-ownable
    // variant exists (it carries the cinema + the whole W-feature set). An
    // explicit hint / quality pref / remembered taste always wins untouched.
    if (hint < 0 && qp < 0 && remembered < 0 && initial >= 0) {
      const cls0 = classifyUrl(mediaSrc(srcList[initial]?.url ?? "", proxyBase ?? null));
      if (cls0 === "native") {
        const w = srcList.findIndex((s) => classifyUrl(mediaSrc(s.url, proxyBase ?? null)) !== "native");
        if (w >= 0) initial = w;
      }
    }
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
    // v0.21.1 — the initial-only preflight moved to the PER-SOURCE effect
    // right below: every ladder step / manual pick now gets the same
    // byte-level verdict BEFORE mounting, with a stale-result guard (the
    // old block could double-step the ladder from a probe that resolved
    // after the element had already moved on).
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

  // v0.29.0 (NEW-DATA-4) — flush the throttled cloud row on pause / app-hide
  // / pagehide; the last minutes of watching used to never leave the phone
  // when they fell inside the 20s throttle window.
  useEffect(() => {
    const flush = () => void flushProgressOne();
    const v = videoRef.current;
    v?.addEventListener("pause", flush);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      v?.removeEventListener("pause", flush);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

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

  /* v0.19.0 — the LAST rung of the web-first ladder. The web player owns
   * everything it can sniff; when the whole variant ladder burned without a
   * single web playback, the still-untried native-capable sources (mkv with
   * exotic codecs, token URLs, avi/local/http) get ONE native attempt each.
   * Returns true when the rung handled the exhaustion (fallback fired or the
   * honest «نیتیو در دسترس نیست» panel) — false when plain fatal is right. */
  const tryNativeFallback = useCallback(
    (notice?: string): boolean => {
      if (effEngine === "native") return false; // the ladder already walked natively
      const capable = srcList
        .map((s, i) => ({ i, cls: classifyUrl(mediaSrc(s.url, proxyBase ?? null)) }))
        .filter((x) => x.cls !== "web" && !nativeTriedRef.current.has(x.i))
        .map((x) => x.i);
      if (!capable.length) return false;
      if (bridgeOk === null) {
        // v0.21.1 — the plugin probe is STILL IN FLIGHT: the old `!bridgeOk`
        // read null as «dead» and flashed the honest-unavailable panel for a
        // verdict nobody had yet. Queue the rung; it fires the moment the
        // probe resolves (true → native, false → the honest panel below).
        nativeFallbackQueuedRef.current =
          notice || "پخش وب ممکن نشد — پلیر نیتیو امتحان می‌شود";
        return true;
      }
      if (!bridgeOk) {
        // the probe PROVED the plugin dead and only native could decode what is
        // left → the honest panel instead of a fake «اتصال برقرار نشد»
        const v = videoRef.current;
        if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
        stopMediaEl(v);
        setLoading(false);
        setNatUnavailable(true);
        return true;
      }
      const idx = capable.includes(srcIdxRef.current) ? srcIdxRef.current : capable[0];
      nativeTriedRef.current.add(idx);
      setNatUnavailable(false);
      // v0.21.0 — the MSE transport cannot follow us to native
      setMseWanted(null);
      setMseUrl(null);
      setNativeFallbackIdx(idx);
      if (idx !== srcIdxRef.current) setSrcIdx(idx);
      else setReloadKey((k) => k + 1); // same idx → bump the handoff identity
      setLoading(true);
      showNotice(notice || "پخش وب ممکن نشد — پلیر نیتیو امتحان می‌شود");
      return true;
    },
    // v0.21.1 — the setState setters are listed explicitly so the manual
    // memoization matches React Compiler's inference (they are stable
    // identities; this is lint hygiene, not behavior).
    [effEngine, bridgeOk, srcList, proxyBase, showNotice, setNatUnavailable, setMseWanted, setMseUrl, setNativeFallbackIdx, setSrcIdx, setReloadKey, setLoading]
  );

  // v0.21.1 — drain the deferred fallback rung the moment the bridge probe
  // resolves: true → run it for real; false → the honest «نیتیو در دسترس
  // نیست» panel (the exact UI the queued call would have shown, minus the
  // guess). A close clears the queue before any verdict can land.
  useEffect(() => {
    if (bridgeOk === null) return;
    const queued = nativeFallbackQueuedRef.current;
    if (!queued) return;
    nativeFallbackQueuedRef.current = null;
    if (bridgeOk) tryNativeFallback(queued);
    else {
      const v = videoRef.current;
      if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
      stopMediaEl(v);
      setLoading(false);
      setNatUnavailable(true);
    }
  }, [bridgeOk, tryNativeFallback]);

  const advanceLadder = useCallback(
    (resumePos?: number) => {
      const now = Date.now();
      if (!shouldLadderAdvance(ladderAtRef.current, srcIdxRef.current, now)) return;
      ladderAtRef.current = { idx: srcIdxRef.current, at: now };
      errCountRef.current += 1;
      // v0.21.1 — LAND on a web-ownable variant. The old `current + 1` step
      // landed blindly on codec-native MKVs (classifyUrl "native") — a
      // guaranteed second failure plus another watchdog burn (the v0.20.0
      // «هیچی پخش نمیکنه» report). While ANY web-ownable variant remains, the
      // ladder skips the native-class ones (they are the fallback rung's
      // candidates) and lands on the next one that can actually play.
      const classes = srcList.map((s) => classifyUrl(mediaSrc(s.url, proxyBase ?? null)));
      const next = nextWebIdxSkippingNative(classes, srcIdxRef.current);
      if (next >= 0 && !isLadderExhausted(next, srcList.length, errCountRef.current)) {
        if (!resumePos) {
          const v = videoRef.current;
          if (v && v.currentTime > 0.5) resumeAt.current = v.currentTime;
        } else if (resumePos > 0.5) {
          resumeAt.current = resumePos;
        }
        setSrcIdx(next);
        setLoading(true);
        showNotice("پخش این نسخه ناموفق بود — نسخه‌ی بعدی امتحان می‌شود");
      } else if (!tryNativeFallback()) {
        haltForFatal();
      }
    },
    [srcList, proxyBase, showNotice, haltForFatal, tryNativeFallback]
  );

  /* v0.21.1 — BYTE-AWARE PREFLIGHT for EVERY source, not just the first.
   *
   * The v0.20.0 preflight ran ONCE per open: dead/undecodable sources that
   * the LADDER stepped onto afterwards mounted blind — each one burned the
   * full 12s metadata watchdog (or played a silent AC3/DTS film) before
   * anything learned what the HEAD bytes already knew. This effect re-runs
   * the verdict whenever the ACTIVE source changes (probe results are
   * cached per URL, so re-checks are instant) and when the bridge verdict
   * lands — a queued AC3/DTS handoff fires the moment Media3 is proven
   * alive. Gates: auto engine, no desktop proxy (ensurePlayableAudio owns
   * that path), no cinema (the watch-party always rides the <video>), and
   * the native-fallback rung owns the source (its handoff is in flight —
   * a second verdict here could halt the very handoff it started). */
  useEffect(() => {
    if (!open || cinActive) return;
    if (effEngineRef.current !== "auto") return;
    if (proxyBase) return; // desktop: ensurePlayableAudio + the proxy own routing
    if (nativeFallbackIdx !== null && nativeFallbackIdx === srcIdx) return;
    if (mseWantedRef.current) return; // an active MSE session owns playback
    const url0 = srcList[srcIdx]?.url ?? "";
    if (!url0) return;
    if (classifyUrl(mediaSrc(url0, proxyBase ?? null)) !== "fragile") return; // native-class → owner; web-class → element
    const idxAtProbe = srcIdx;
    let alive = true;
    void probeMkvHead(url0).then((p) => {
      if (!alive) return;
      if (usePlayerStore.getState().contentKey !== contentKey) return;
      if (srcIdxRef.current !== idxAtProbe) return; // the ladder/user moved on — stale probe
      let preferMse = false;
      try {
        preferMse = sessionStorage.getItem("nama-mkv-mse") === "1";
      } catch {
        /* no storage */
      }
      const d = preflightDecision(
        {
          reachable: p.reachable,
          status: p.status,
          matroska: p.matroska,
          audioOk: p.audioOk,
          mse: p.mse ? { supported: p.mse.supported } : null,
        },
        { preferMse, bridgeOk: bridgeOkRef.current, engine: effEngineRef.current }
      );
      setProbeInfo(
        p.matroska
          ? `matroska · صدا: ${p.audioLabel ?? "?"} · ${p.mse?.supported ? `MSE OK (${p.mse.videoCodec})` : p.mse ? `MSE ✗ ${p.mse.reason}` : "MSE ?"}`
          : "matroska نیست"
      );
      if (d.action === "next") {
        advanceLadder(); // proven-dead source — step now, no watchdog burn
        return;
      }
      if (d.action === "mse") {
        resumeAt.current = resumeAt.current ?? startAt ?? 0;
        setMseUrl(null);
        setMseWanted(url0);
        setLoading(true);
        return;
      }
      if (d.action === "native") {
        tryNativeFallback(
          `صوت این نسخه (${p.audioLabel ?? "پشتیبانی‌نشده"}) در پلیر وب قابل پخش نیست — پلیر نیتیو باز می‌شود`
        );
      }
      // keep / wait → the element path proceeds untouched
    });
    return () => {
      alive = false;
    };
  }, [open, cinActive, contentKey, srcIdx, proxyBase, bridgeOk, nativeFallbackIdx, srcList, startAt, advanceLadder, tryNativeFallback]);

  useEffect(() => {
    const b = nativeBridge();
    if (!b) return;
    if (!open) {
      // v0.16.2 — a fresh open must always re-handoff (same-title resume bug)
      nativeKeyRef.current = null;
      pendingNativeRef.current = false;
      // v0.18.1 — a resume carried for an engine flip must never leak into
      // the NEXT title's first mount
      resumeAt.current = null;
      // v0.19.0 — the fallback rung is per-open too
      nativeTriedRef.current = new Set();
      setNativeFallbackIdx(null);
      setNatUnavailable(false);
      // v0.21.1 — a deferred rung belongs to THIS open only
      nativeFallbackQueuedRef.current = null;
      return;
    }
    // v0.18.1 — the engine choice is part of the handoff identity: flipping
    // «همیشه نیتیو»/«هوشمند» mid-title MUST re-handoff even for a source the
    // key already covers (same contentKey#srcIdx#reloadKey).
    if (!wantsNative) {
      pendingNativeRef.current = false;
      return;
    }
    if (fatal) return;
    if (!activeSrc) return;
    const key = `${contentKey}#${srcIdx}#${reloadKey}#${effEngine}`;
    if (nativeKeyRef.current === key) return;
    nativeKeyRef.current = key;
    pendingNativeRef.current = true;
    setNativeActive(true);
    setLoading(true);
    const startMs = Math.round((resumeAt.current ?? startAt ?? 0) * 1000);
    resumeAt.current = null;
    const relKey = contentKey;
    // v0.18.0 — the native player renders its OWN episodes sheet: ship a
    // lightweight manifest (seasons/numbers/watched/progress) along with the
    // zoom-neutral extras. Results (switchTo / switchToWeb) come back below.
    const manifest = episodes.length
      ? buildEpisodesManifest(episodes, episode?.id ?? null, epProgress)
      : null;
    // v0.19.0 — the «سوییچ به نسخه وب‌سازگار» offer must land on a source
    // GUARANTEED to play on the web (classify "web"), not merely web-first
    // ("fragile" might fail the same way that just pushed us native).
    const webSafeIdx = srcList.findIndex((s) => classifyUrl(mediaSrc(s.url, proxyBase ?? null)) === "web");
    b.playVideo({
      url: isLocalFile(activeSrc) ? localFilePath(activeSrc) : activeSrc,
      title: title ?? "Frame",
      subtitle: subtitle ?? "",
      positionMs: startMs,
      episodes: manifest ? manifest.episodes : undefined,
      episodeIndex: manifest ? manifest.episodeIndex : undefined,
      poster: poster || undefined,
      seekStepSec: getSeekStep(),
      hasWebVariant: webSafeIdx >= 0,
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
        // v0.18.1 — remember where native left off: if the user now flips the
        // engine to web (videoEl is still unmounted, so the flip handler has
        // no currentTime), the web mount resumes exactly here
        if (pos > 0.5) resumeAt.current = pos;
        // v0.18.0 — the native episodes sheet picked another episode → the
        // normal JS engine opens it (handoff re-runs there if it is MKV)
        if (r.switchToEpisodeId) {
          setNativeActive(false);
          setPlaying(false);
          setLoading(false);
          // v0.18.1 — the OLD episode's position must not resume inside the
          // newly picked episode's first mount
          resumeAt.current = null;
          router.push(watchHref(slug, r.switchToEpisodeId));
          return;
        }
        // v0.18.0 — «سوییچ به نسخه وب‌سازگار»: re-open the SAME position on
        // the first WebView-safe variant and light the cinema drawer up.
        // v0.18.1 — webOverride: with «همیشه نیتیو» saved, the plain owner
        // rule would send the very next render straight back to native (the
        // cinema switch would boomerang) — this session now stays on the web
        // engine until the player closes.
        if (r.switchToWeb) {
          setWebOverride(true);
          setNativeActive(false);
          setPlaying(false);
          const wIdx = srcList.findIndex((s) => classifyUrl(mediaSrc(s.url, proxyBase ?? null)) === "web");
          if (wIdx >= 0) {
            resumeAt.current = pos > 0.5 ? pos : startMs / 1000;
            manualPickRef.current = true;
            errCountRef.current = 0;
            ladderAtRef.current = null;
            nativeTriedRef.current = new Set();
            setNativeFallbackIdx(null);
            setFatal(false);
            setSrcIdx(wIdx);
            setLoading(true);
            setShowCinema(true);
            showNotice("به پخش وب سوئیچ شد — سینما آماده است");
          } else {
            showNotice("این فایل نسخه وب‌سازگار ندارد — سینما برای آن ممکن نیست");
          }
          return;
        }
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
          // v0.18.0 — native sleep «پایان همین قسمت» suppresses auto-next
          if (nextEpisode && !r.suppressNext) setCountdown(8);
        }
        goBackToTitle();
      })
      .catch((e: unknown) => {
        // v0.16.3 — never swallow the rejection: a dead plugin used to burn the
        // whole ladder into a fake «اتصال برقرار نشد» within milliseconds.
        console.error("[nama] playVideo rejected:", e);
        if (nativeKeyRef.current !== key) return;
        pendingNativeRef.current = false;
        setNativeActive(false);
        const msg = String((e as { message?: string; code?: string })?.message ?? (e as { code?: string })?.code ?? e ?? "");
        if (/not implemented|Unimplemented/i.test(msg)) {
          // the plugin is NOT registered on the native side — the ladder must
          // not burn; flip ownership to the honest «unsupported» screen
          showNotice("پلیر نیتیو در این نسخه در دسترس نیست — اپ را آپدیت کنید");
          setBridgeOk(false);
          return;
        }
        // bridge/activity failure = THIS source unavailable → ladder on,
        // like any other source failure
        advanceLadder();
      });
  }, [open, wantsNative, effEngine, activeSrc, proxyBase, fatal, contentKey, srcIdx, reloadKey, advanceLadder, save, startAt, title, subtitle, nextEpisode, goBackToTitle, episodes, episode?.id, epProgress, poster, slug, router, showNotice]);

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
    // v0.19.0 — fresh title: the fallback rung re-arms
    nativeTriedRef.current = new Set();
    setNativeFallbackIdx(null);
    setNatUnavailable(false);
    setSheet(null);
    // v0.19.2 — a fresh open must LOOK fresh: this component stays mounted
    // across opens (only the render is skipped while closed), so loading/
    // playing/time leak in from the PREVIOUS session — the next movie opened
    // with the old pause icon, NO loading spinner and a center-play that did
    // nothing until metadata arrived (the «موقع باز کردن فیلم باگه» report).
    setLoading(true);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
    setEpProgress(new Map());
    // v0.21.0 — fresh transport + diagnostics per open
    setMseWanted(null);
    setMseUrl(null);
    setMseStateLabel("off");
    mseSessionRef.current = null;
    mseTriedRef.current = new Set();
    msePendingSeekRef.current = null;
    setLastVideoErr("—");
    setProbeInfo("—");
  }, [contentKey]);

  // ---- Subs v3: proxy-extracted cues + user-loaded file --------------------
  const { cues: mkvCues, status: proxySubInfo, kick: kickSubs } = useSubs(
    rawActive || null,
    proxyBase,
    open,
    () => videoRef.current?.currentTime ?? 0,
    () => videoRef.current?.duration ?? 0
  );
  // v0.20.0 — IN-WEBVIEW subs for the no-proxy (Android) path. The web
  // cinema player used to ship ZERO embedded subtitles (the proxy never
  // exists there) while the native player rendered them — the core of the
  // «پلیر اصلی کار نمی‌کنه» report. The scanner feeds the SAME cue pipeline.
  const { cues: webSubCues, status: webSubStatus, kick: webKick } = useMkvWebSubs(
    rawActive || null,
    Boolean(
      open &&
        owner === "web" &&
        !fatal &&
        !nativeActive &&
        subOn &&
        !proxyBase &&
        !mseWanted && // v0.21.0 — the MSE session's own store feeds cues then
        isMkvUrl(rawActive || "") &&
        scanReady
    ),
    () => videoRef.current?.currentTime ?? 0,
    () => !(videoRef.current?.paused ?? true),
    () => videoRef.current?.duration ?? 0,
    mkvPace
  );
  const [fileCues, setFileCues] = useState<ParsedCue[] | null>(null);
  useEffect(() => {
    setFileCues(null);
  }, [contentKey]);
  // v0.21.0 — when the MSE transport owns playback, its demux scanner is
  // ALREADY parsing the file: poll the same cue store (the subs pipeline
  // gets its cues without a second ranged scan).
  const [mseCues, setMseCues] = useState<ParsedCue[]>([]);
  const [mseSubInfo, setMseSubInfo] = useState<{ kinds: string[]; probed: boolean; audio: string[] } | null>(null);
  useEffect(() => {
    if (!mseWanted) {
      setMseCues([]);
      setMseSubInfo(null);
      return;
    }
    let lastCount = -1;
    const tick = setInterval(() => {
      const s = mseSessionRef.current;
      if (!s) return;
      const st = s.store_;
      const list = st.cues();
      if (list.length !== lastCount) {
        lastCount = list.length;
        setMseCues(list);
      }
      setMseSubInfo({ kinds: [...st.kinds], probed: st.probed, audio: [...st.audioCodecs] });
    }, 3000);
    return () => clearInterval(tick);
  }, [mseWanted]);
  const subCues = fileCues ?? (mkvCues.length ? mkvCues : mseCues.length ? mseCues : webSubCues);
  const subLoaded = subCues.length > 0;
  // the subs sheet speaks SubStatus: whichever path actually probed wins
  // (proxy on desktop/Electron; the in-WebView scanner on Android; the MSE
  // session's own store when the fMP4 transport owns the file)
  const subInfo = proxySubInfo.probed
    ? proxySubInfo
    : mseWanted && mseSubInfo
      ? {
          found: mseCues.length > 0,
          probed: mseSubInfo.probed,
          matroska: true,
          cueCount: mseCues.length,
          cov: null,
          kinds: mseSubInfo.kinds,
          audio: mseSubInfo.audio,
          audioOk: null,
          audioLabel: null,
        }
      : {
        found: webSubStatus.subFound,
        probed: webSubStatus.probed,
        matroska: webSubStatus.matroska,
        cueCount: webSubStatus.cueCount,
        cov: webSubStatus.cov,
        kinds: webSubStatus.kinds,
        audio: webSubStatus.audio,
        audioOk: webSubStatus.audioOk,
        audioLabel: webSubStatus.audioLabel,
      };

  useEffect(() => {
    if (!videoEl) return;
    const onSeeked = () => {
      kickSubs();
      webKick();
    };
    videoEl.addEventListener("seeked", onSeeked);
    return () => videoEl.removeEventListener("seeked", onSeeked);
  }, [kickSubs, webKick, videoEl]);

  // ---- v0.21.0 — the MSE session lifecycle --------------------------------
  // One session per (open, web-owner, wanted url). The <video> renders the
  // session's blob URL; sourceopen drives the init segments; the session's
  // own stall-watch and append errors feed the honest ladder on death.
  useEffect(() => {
    if (!open || !videoEl || owner !== "web" || fatal || !mseWanted) return;
    if (mseWanted !== rawActive) return; // stale want (source switched)
    if (typeof MediaSource === "undefined") {
      setMseWanted(null);
      return;
    }
    setMseStateLabel("probing");
    const s = new MkvMseSession(rawActive, {
      onObjectUrl: (u) => setMseUrl(u),
      onState: (st) => setMseStateLabel(st),
      onFatal: (reason) => {
        setLastVideoErr((e) => (e === "—" ? `MSE: ${reason}` : e));
        setMseWanted(null);
        setMseUrl(null);
        if (!tryNativeFallback("پخش وب (بازسازی فایل) هم ممکن نشد — پلیر نیتیو امتحان می‌شود")) {
          advanceLadder();
        }
      },
      pace: mkvPace,
    });
    mseSessionRef.current = s;
    s.noteVideoDuration(videoEl.duration);
    const startPos = msePendingSeekRef.current ?? resumeAt.current ?? startAt ?? 0;
    msePendingSeekRef.current = null;
    void s.start(startPos).catch((e) => {
      console.error("[nama] mse start:", e);
    });
    return () => {
      s.stop();
      if (mseSessionRef.current === s) mseSessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoEl, owner, fatal, mseWanted, rawActive]);

  // v0.21.0 — MSE seek handling: a scrub to an UNBUFFERED position restarts
  // the session at the new byte offset (covered seeks stay inside MSE).
  useEffect(() => {
    if (!videoEl || !mseWanted) return;
    const onSeeking = () => {
      const s = mseSessionRef.current;
      const v = videoRef.current;
      if (!s || !v) return;
      const t = v.currentTime;
      for (let i = 0; i < v.buffered.length; i++) {
        if (t >= v.buffered.start(i) - 0.25 && t < v.buffered.end(i)) return; // covered
      }
      if (mseSeekTimer.current) clearTimeout(mseSeekTimer.current);
      mseSeekTimer.current = setTimeout(() => {
        msePendingSeekRef.current = t;
        s.seekTo(t);
      }, 700);
    };
    videoEl.addEventListener("seeking", onSeeking);
    return () => {
      if (mseSeekTimer.current) clearTimeout(mseSeekTimer.current);
      videoEl.removeEventListener("seeking", onSeeking);
    };
  }, [videoEl, mseWanted]);

  /* v0.21.0 — THE failure verdict. A media error is no longer blindly fed to
   * the variant ladder — the class of failure decides:
   *  - decode/src-not-supported (code 3/4) on Matroska content → ONE MSE
   *    attempt on the SAME bytes (the device WebView may just not demux
   *    Matroska — the file is still H.264/AAC web-playable). MSE failure →
   *    the native fallback rung DIRECTLY (identical variants would fail
   *    identically — no 5×12s ladder burn into the no-cinema player).
   *  - network errors keep the classic ladder (another variant may live on
   *    a healthier host). */
  const handleMediaFailure = useCallback(
    (v: HTMLVideoElement) => {
      const code = v.error?.code ?? 0;
      const msg = String(v.error?.message ?? "").slice(0, 90);
      setLastVideoErr(`code ${code}${msg ? ` · ${msg}` : ""}`);
      const cur = srcList[Math.min(srcIdxRef.current, srcList.length - 1)]?.url || src || "";
      const idxAtFail = srcIdxRef.current;
      const cls = classifyUrl(mediaSrc(cur, proxyBase ?? null));
      const mkvish = isMkvUrl(cur) || cls === "fragile";
      if (mkvish && (code === 3 || code === 4) && typeof MediaSource !== "undefined" && !mseTriedRef.current.has(cur) && mseWantedRef.current !== cur) {
        mseTriedRef.current.add(cur);
        try {
          sessionStorage.setItem("nama-mkv-mse", "1"); // this device prefers the fMP4 transport from now on
        } catch {
          /* no storage */
        }
        const pos = v.currentTime > 0.5 ? v.currentTime : 0;
        void probeMkvHead(cur)
          .then((p) => {
            if (usePlayerStore.getState().contentKey !== contentKey) return;
            if (srcIdxRef.current !== idxAtFail) return; // user already moved on
            if (!p.reachable || !p.matroska) {
              advanceLadder();
              return;
            }
            if (p.mse?.supported) {
              resumeAt.current = pos > 0.5 ? pos : resumeAt.current;
              stopMediaEl(v);
              setFatal(false);
              setMseUrl(null);
              setMseWanted(cur);
              setLoading(true);
              showNotice("پخش مستقیم ممکن نشد — بازسازی فایل برای پلیر وب…");
              return;
            }
            // this WebView cannot demux MKV and the file is not MSE-able either
            if (!tryNativeFallback("پلیر وب این فایل را پخش نمی‌کند — پلیر نیتیو باز می‌شود")) haltForFatal();
          })
          .catch(() => {
            if (srcIdxRef.current === idxAtFail) advanceLadder();
          });
        return;
      }
      if (mseWantedRef.current === cur && code >= 3) {
        // the MSE transport itself died at the element level → native rung
        if (!tryNativeFallback("پخش وب ممکن نشد — پلیر نیتیو امتحان می‌شود")) haltForFatal();
        return;
      }
      advanceLadder();
    },
    [srcList, src, proxyBase, contentKey, advanceLadder, tryNativeFallback, haltForFatal, showNotice]
  );

  // ---- core <video> listeners ----------------------------------------------
  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const onLoaded = () => {
      setDuration(Number.isFinite(v.duration) ? v.duration : 0); // MSE: Infinity until duration lands
      errCountRef.current = 0; // v0.16.2 — a successful start re-arms the ladder
      // v0.21.0 — a pending MSE restart-seek wins over resume/startAt
      const pending = msePendingSeekRef.current;
      if (pending != null) {
        msePendingSeekRef.current = null;
        if (pending > 0 && pending < (v.duration || Infinity) - 5) v.currentTime = pending;
      } else {
        const resume = resumeAt.current ?? startAt;
        resumeAt.current = null;
        if (resume > 0 && resume < (v.duration || Infinity) - 5) v.currentTime = resume;
      }
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
      // v0.18.0 — sustained low buffer health while playing → «اینترنت کند»
      const now = Date.now();
      const behind = v.buffered.length ? v.buffered.end(v.buffered.length - 1) - v.currentTime : 99;
      if (!v.paused && behind < 6) {
        if (!slowRef.current.since) slowRef.current.since = now;
        if (now - slowRef.current.since > 8000 && now - slowRef.current.shownAt > 25000) {
          slowRef.current.shownAt = now;
          setSlowNet(true);
          setTimeout(() => setSlowNet(false), 8000);
        }
      } else {
        slowRef.current.since = 0;
      }
      // v0.21.0 — feed the MSE session (park/resume + runway logic) + duration
      const mse = mseSessionRef.current;
      if (mse) {
        mse.noteVideoDuration(v.duration);
        mse.progress(v.currentTime);
      }
      // v0.21.0 — MSE durations can land late/corrected (Info Duration lies,
      // endOfStream): keep the seekbar in sync as the element re-reports it
      setDuration((d) =>
        Number.isFinite(v.duration) && v.duration > 0 && Math.abs(v.duration - d) > 0.5 ? v.duration : d
      );
    };
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
      bumpUi();
      // v0.18.0 — «قفل خودکار هنگام شروع»: once per title, on first play
      if (autoLock && autoLockRef.current !== contentKey) {
        autoLockRef.current = contentKey;
        haptic(16);
        setLocked(true);
        setShowUi(true);
      }
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
      if (sleepEopRef.current) {
        // v0.18.0 — sleep timer «پایان همین قسمت»: stop here, no auto-next
        sleepEopRef.current = false;
        setSleepEop(false);
        return;
      }
      if (nextEpisode && useCinema.getState().status !== "joined") setCountdown(8);
    };
    const onWaiting = () => setLoading(true);
    const onError = () => {
      if (!usePlayerStore.getState().open) return;
      // v0.16.2 — the native player owns playback right now: not our error
      if (pendingNativeRef.current) return;
      // v0.19.0 — MEDIA_ERR_ABORTED (code 1) = OUR OWN src swap mid-load; an
      // echo, never a dead link. The 1500ms same-idx guard usually eats it;
      // this is belt+braces so a swap can never double-burn the ladder.
      if (v.error?.code === 1) return;
      // network drop ≠ dead link — never burn the variant ladder for it
      if (!navigator.onLine) {
        netDownRef.current = true;
        setNetDown(true);
        setLoading(false);
        showNotice("اتصال اینترنت قطع شده است — با وصل شدن ادامه می‌دهیم");
        return;
      }
      // v0.21.0 — the failure verdict (MSE attempt / smart ladder)
      handleMediaFailure(v);
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
  }, [videoEl, startAt, save, bumpUi, nextEpisode, volume, muted, advanceLadder, handleMediaFailure, showNotice, tapHolding, rate, autoLock, contentKey]);

  // v0.19.2 — METADATA WATCHDOG. A hung/slow host must never leave the open
  // spinner up forever: Chromium can stall a fetch far beyond any patience
  // without firing `error`, and the ladder had no way to learn about it (the
  // «باز کردن فیلم باگه» report). If the mounted web <video> still has NO
  // metadata (readyState 0) when the timer fires, THIS source is declared
  // dead exactly like an error event — the echo-guarded ladder steps and
  // finally hands the native fallback rung its chance. Metadata already in,
  // an offline overlay, a pending error event, or an ACTIVE MSE session
  // (it owns startup + its own stall-watch) → the timer is a no-op.
  useEffect(() => {
    if (!open || owner !== "web" || !videoEl || !activeSrc || mseWanted) return;
    const t = setTimeout(() => {
      const v = videoRef.current;
      if (!v || !usePlayerStore.getState().open) return;
      if (v.readyState >= 1) return; // metadata arrived — progress, not a hang
      if (!navigator.onLine) return; // the offline overlay owns this state
      if (v.error) return; // the error handler already owns this state
      advanceLadder();
    }, metaWatchdogMs());
    return () => clearTimeout(t);
  }, [open, owner, videoEl, activeSrc, reloadKey, advanceLadder, mseWanted]);

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
      // v0.19.0 — an explicit pick re-arms the fallback rung and cancels any
      // pending native-fallback ownership for the PREVIOUS source
      nativeTriedRef.current = new Set();
      setNativeFallbackIdx(null);
      setNatUnavailable(false);
      setFatal(false);
      // v0.21.0 — a manual pick leaves the MSE transport (the new source
      // starts on the plain element; the verdict ladder re-owns it if needed)
      setMseWanted(null);
      setMseUrl(null);
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
    v.playbackRate = tapHolding ? 2 : rate; // hold = 2× overrides the saved rate
  }, [volume, muted, rate, tapHolding]);

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
    if (!ok) {
      // B-9: a refusal must not be silent — the helpers swallow the rejection
      showNotice("حالت تمام‌صفحه در دسترس نیست");
      return;
    }
    // v0.18.0 — the «قفل جهت» setting governs the fullscreen orientation
    if (orientLock === "portrait") void lockPortrait();
    else void lockLandscape(); // auto (sensor landscape) + forced landscape
  }, [bumpUi, orientLock, showNotice]);

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
    if (!open || !playing || !keepAwake) {
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
  }, [open, playing, keepAwake]);

  // ---- v0.18.0 — sleep timer (web player) -----------------------------------
  const fireSleep = useCallback(() => {
    setSleepLeft(null);
    setSleepMin(null);
    setSleepEop(false);
    sleepEopRef.current = false;
    const v = videoRef.current;
    if (!v) return;
    const startVol = v.volume;
    let step = 0;
    const iv = setInterval(() => {
      const cur = videoRef.current;
      if (!cur) {
        clearInterval(iv);
        return;
      }
      step += 1;
      cur.volume = Math.max(0, startVol * (1 - step / 10));
      if (step >= 10) {
        clearInterval(iv);
        try {
          cur.pause();
        } catch {
          /* ignore */
        }
        cur.volume = startVol; // restore for the next session
        setShowUi(true);
      }
    }, 500);
  }, []);

  const cancelSleep = useCallback(() => {
    haptic(10);
    setSleepLeft(null);
    setSleepMin(null);
    setSleepEop(false);
    sleepEopRef.current = false;
  }, []);

  useEffect(() => {
    if (sleepLeft === null) return;
    if (sleepLeft <= 0) {
      fireSleep();
      return;
    }
    const t = setTimeout(() => setSleepLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [sleepLeft, fireSleep]);

  // ---- v0.18.0 — MediaSession: metadata + hardware/lockscreen buttons -------
  useEffect(() => {
    if (!open || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: title ?? "نما",
        artist: subtitle || (episode ? `فصل ${fa(episode.season)} · قسمت ${fa(episode.number)}` : ""),
        album: "نما — Frame",
        artwork: poster ? [{ src: poster, sizes: "512x512", type: "image/jpeg" }] : [],
      });
    } catch {
      /* older WebView without MediaMetadata */
    }
    ms.playbackState = playing ? "playing" : "paused";
  }, [open, title, subtitle, poster, episode, playing]);

  useEffect(() => {
    if (!open || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const step = getSeekStep();
    const epIdx = episodes.findIndex((e) => e.id === episode?.id);
    const goEp = (e?: (typeof episodes)[number]) => {
      if (!e) return;
      setCountdown(null);
      router.push(watchHref(slug, e.id));
    };
    try {
      ms.setActionHandler("play", () => void videoRef.current?.play().catch(() => {}));
      ms.setActionHandler("pause", () => videoRef.current?.pause());
      ms.setActionHandler("seekbackward", () => seek(-step));
      ms.setActionHandler("seekforward", () => seek(step));
      ms.setActionHandler("previoustrack", () => goEp(episodes[epIdx - 1]));
      ms.setActionHandler("nexttrack", () => goEp(episodes[epIdx + 1]));
    } catch {
      /* unsupported action */
    }
    return () => {
      try {
        ("play\u0000pause\u0000seekbackward\u0000seekforward\u0000previoustrack\u0000nexttrack".split("\u0000") as MediaSessionAction[]).forEach((a) =>
          ms.setActionHandler(a, null)
        );
      } catch {
        /* ignore */
      }
    };
  }, [open, episodes, episode?.id, slug, router, seek]);

  // ---- v0.18.0 — backgrounding pauses; coming back stays paused -------------
  useEffect(() => {
    if (!open) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const v = videoRef.current;
        if (v && !v.paused && !v.ended) {
          try {
            v.pause();
          } catch {
            /* ignore */
          }
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open]);

  // ---- v0.18.0 — episode progress map (watched ticks + native manifest) -----
  useEffect(() => {
    if (!open || !titleId || !episodes.length) return;
    let alive = true;
    fetch(`/api/progress?titleId=${titleId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { progress?: { episodeId: number | null; position: number; duration: number }[] }) => {
        if (!alive || !d.progress) return;
        const m = new Map<number, { position: number; duration: number }>();
        for (const p of d.progress) if (p.episodeId) m.set(p.episodeId, { position: p.position, duration: p.duration });
        setEpProgress(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, titleId, episodes.length, contentKey]);

  // season tabs default to the episode being played
  const seasons = useMemo(() => [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b), [episodes]);
  useEffect(() => {
    if (sheet !== "episodes" || seasonTab !== null) return;
    setSeasonTab(episode?.season ?? seasons[0] ?? null);
  }, [sheet, seasonTab, episode?.season, seasons]);

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

  // ---- touch gestures (v0.18.0 — + vertical brightness/volume, hold 2x,
  // pinch zoom, zoom cycle on the top corners) --------------------------------
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [scrubPreview, setScrubPreview] = useState<{ t: number; d: number } | null>(null);
  const lastTapAt = useRef(0);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrub = useRef<{
    mode: "none" | "h" | "v";
    side: "l" | "r";
    startX: number;
    startY: number;
    base: number;
    width: number;
    height: number;
    startVal: number;
  } | null>(null);
  const scrubTargetRef = useRef(0);
  const movedRef = useRef(false);
  const tapHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinch = useRef<{ startDist: number; startScale: number; midX: number; midY: number } | null>(null);
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

  const cycleZoom = useCallback(() => {
    haptic(14);
    setPinchScale(1);
    setPinchOrigin(null);
    setZoomModeState((m) => {
      const nm = nextZoomMode(m);
      setZoomMode(zoomTitleKey, nm); // per-title memory
      return nm;
    });
  }, [zoomTitleKey]);

  const handleTap = useCallback(
    (clientX: number, clientY: number) => {
      if (locked) {
        bumpUi();
        return;
      }
      const now = Date.now();
      if (now - lastTapAt.current < 280) {
        lastTapAt.current = 0;
        if (singleTimer.current) {
          clearTimeout(singleTimer.current);
          singleTimer.current = null;
        }
        const rect = surfaceRef.current?.getBoundingClientRect();
        const xPct = rect ? Math.max(4, Math.min(96, ((clientX - rect.left) / rect.width) * 100)) : 50;
        const rel = rect ? (clientX - rect.left) / rect.width : 0.5;
        const yRel = rect ? (clientY - rect.top) / rect.height : 0.5;
        // v0.18.0 — double-tap the UPPER far corners = zoom cycle
        // (fit → fill → stretch); the seek zones stay untouched
        if (yRel < 0.22 && (rel < 0.18 || rel > 0.82)) {
          cycleZoom();
          bumpUi();
          return;
        }
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
    [locked, addRipple, seek, togglePlay, bumpUi, cycleZoom]
  );

  // hold-2x cleanup — fires on movement, second finger or finger lift
  const clearTapHold = useCallback(() => {
    if (tapHoldTimer.current) {
      clearTimeout(tapHoldTimer.current);
      tapHoldTimer.current = null;
    }
    setTapHolding((h) => {
      if (h) setRate(prevRateRef.current); // restore the saved rate
      return false;
    });
  }, []);

  const onSurfaceTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      // pinch begins immediately with the second finger
      const a = e.touches[0];
      const b = e.touches[1];
      pinch.current = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        startScale: pinchScale,
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
      };
      clearTapHold();
      scrub.current = null;
      setScrubPreview(null);
      setHud(null);
      return;
    }
    const t = e.touches[0];
    const v = videoRef.current;
    movedRef.current = false;
    // hold = 2× — armed only while playing, unlocked, not a cinema guest
    if (v && !v.paused && !locked && !guestLock && !ended) {
      clearTapHold();
      const rateNow = rate;
      tapHoldTimer.current = setTimeout(() => {
        if (!movedRef.current && videoRef.current && !videoRef.current.paused) {
          prevRateRef.current = rateNow;
          setTapHolding(true);
          setRate(2);
          haptic(20);
        }
      }, 500);
    }
    scrub.current = {
      mode: "none",
      side: "l",
      startX: t.clientX,
      startY: t.clientY,
      base: v?.currentTime ?? current,
      width: surfaceRef.current?.clientWidth ?? 1,
      height: surfaceRef.current?.clientHeight ?? 1,
      startVal: 0,
    };
  };

  const onSurfaceTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length >= 2 && pinch.current) {
      const a = e.touches[0];
      const b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (rect) {
        setPinchOrigin({
          x: ((pinch.current.midX - rect.left) / rect.width) * 100,
          y: ((pinch.current.midY - rect.top) / rect.height) * 100,
        });
      }
      // v0.18.0 — continuous 0.5×–3× zoom, centered on the touch midpoint
      setPinchScale(Math.max(0.5, Math.min(3, pinch.current.startScale * (d / pinch.current.startDist))));
      return;
    }
    const s = scrub.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      movedRef.current = true;
      clearTapHold(); // any movement kills the hold-2×
    }
    if (s.mode === "none") {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.4) s.mode = "h";
      else if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.4) {
        // vertical: LEFT half = brightness, RIGHT half = volume
        s.mode = "v";
        s.side = s.startX < s.width / 2 ? "l" : "r";
        // W1/W2 — «val» is the NORMALIZED LEVEL (0..1, up = higher level):
        // brightness starts from how NOT-dim the screen is right now
        // (startVal 0 would clamp the very first downward drag at 0 and
        // make the gesture feel dead from the default state), volume keeps
        // its audio level. Up = brighter/louder (MX Player convention).
        s.startVal = s.side === "l" ? 1 - dim / 0.8 : muted ? 0 : volume;
        haptic(10);
      }
    }
    if (s.mode === "none") return;
    if (singleTimer.current) {
      clearTimeout(singleTimer.current);
      singleTimer.current = null;
    }
    if (s.mode === "h") {
      const dur = duration || 0;
      const target = Math.max(0, Math.min(dur, s.base + (dx / (s.width * 1.4)) * dur));
      scrubTargetRef.current = target;
      setScrubPreview({ t: target, d: target - s.base });
    } else {
      const delta = -dy / (s.height * 0.9); // up = brighter / louder
      const val = Math.max(0, Math.min(1, s.startVal + delta));
      if (s.side === "l") {
        setDim((1 - val) * 0.8); // brightness level → dim overlay amount
        setHud({ kind: "bright", pct: Math.round(val * 100) });
      } else {
        setVolume(val);
        setMuted(val === 0);
        setHud({ kind: "vol", pct: Math.round(val * 100) });
      }
    }
  };

  const onSurfaceTouchEnd = (e: React.TouchEvent) => {
    const s = scrub.current;
    const wasPinch = !!pinch.current;
    pinch.current = null;
    clearTapHold();
    scrub.current = null;
    setHud(null);
    if (wasPinch) return; // zoom level stays where the fingers left it
    if (!s) return;
    if (s.mode === "h") {
      setScrubPreview(null);
      applyScrub(scrubTargetRef.current);
      haptic(14);
      bumpUi();
      return;
    }
    if (s.mode === "v") {
      haptic(10);
      bumpUi();
      return; // brightness/volume already applied live
    }
    const t = e.changedTouches[0];
    handleTap(t.clientX, t.clientY);
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
  // v0.18.0 — mini player: the user browsed away from the watch page while
  // playback is alive — collapse into a floating card, video stays mounted
  const mini =
    open && !onWatch && !isLandscape && !nativeActive && !fatal && !ended && !guestLock && !ownerUnsupported && !!activeSrc;
  const chromeVisible = showUi && !locked && !nativeActive && !fatal && !ended && !!activeSrc && !mini;
  const sig = (d: number) => `${d >= 0 ? "+" : "-"}${formatClock(Math.abs(d))}`;

  const closeMini = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) save(v.currentTime, v.duration);
    try {
      v?.pause();
    } catch {
      /* ignore */
    }
    store.close();
  }, [save, store]);
  const miniDrag = useRef<{ y0: number } | null>(null);

  if (!open) return null;

  return (
    <div
      ref={wrapRef}
      data-subsize={subSize}
      data-player="mobile"
      className={
        mini
          ? "force-dark fixed bottom-4 start-4 z-[95] w-[300px] max-w-[80vw] select-none overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/20"
          : "force-dark fixed inset-0 z-[100] select-none overflow-hidden bg-black"
      }
      dir="rtl"
      style={{ paddingTop: isLandscape || mini ? "0px" : "env(safe-area-inset-top)" }}
      onTouchStart={
        mini
          ? (e) => {
              miniDrag.current = { y0: e.touches[0].clientY };
            }
          : undefined
      }
      onTouchMove={
        mini
          ? (e) => {
              if (miniDrag.current && e.touches[0].clientY - miniDrag.current.y0 > 90) {
                miniDrag.current = null;
                haptic(16);
                closeMini();
              }
            }
          : undefined
      }
      onTouchEnd={mini ? () => (miniDrag.current = null) : undefined}
    >
        {/* video surface — fullscreen layer in landscape, 16:9 strip in portrait */}
      <div
        className={isLandscape ? "absolute inset-0" : mini ? "relative w-full" : "relative w-full bg-black"}
        style={isLandscape ? undefined : { aspectRatio: "16 / 9" }}
      >
        {/* v0.16.2 — the WebView element only mounts for WEB-owned sources and
            never under the fatal overlay: nothing can play behind the message.
            v0.16.3 — "pending"/"unsupported"/"native" owners mount nothing
            either (a phantom MKV fetch would fire a fake error and burn the
            ladder — the exact v0.16.1 disease). */}
        {proxyBase !== undefined && owner === "web" && !fatal && !nativeActive && (
          <video
            ref={(el) => {
              videoRef.current = el;
              setVideoEl(el);
            }}
            key={`${activeSrc}#${reloadKey}`}
            src={mseWanted ? (mseUrl ?? undefined) : activeSrc}
            poster={poster}
            className="h-full w-full"
            style={{
              objectFit: zoomMode, // v0.18.0 — fit/fill/stretch, per title
              transform: pinchScale !== 1 ? `scale(${pinchScale})` : undefined,
              transformOrigin: pinchOrigin ? `${pinchOrigin.x}% ${pinchOrigin.y}%` : "center",
            }}
            playsInline
            preload="metadata"
          />
        )}

        <SubOverlay cues={subCues} videoRef={videoRef} on={subOn} size={subSize} delaySec={subDelay} vPos={subPos} />

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

        {/* v0.18.0 — brightness gesture: CSS dim over the video only */}
        {dim > 0.01 && <div className="pointer-events-none absolute inset-0 z-[15] bg-black" style={{ opacity: dim }} />}

        {/* v0.18.0 — brightness/volume gesture HUD */}
        {hud && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-black/75 px-6 py-4 backdrop-blur">
              <span className="text-xs font-bold text-zinc-200">{hud.kind === "bright" ? "روشنایی" : "صدا"}</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/20" dir="ltr">
                <div className="h-full rounded-full bg-brand" style={{ width: `${hud.pct}%` }} />
              </div>
              <span className="text-[11px] font-black tabular-nums text-white">{fa(hud.pct)}٪</span>
            </div>
          </div>
        )}

        {/* v0.18.0 — hold-to-2× badge */}
        {tapHolding && (
          <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-brand px-4 py-1.5 text-sm font-black text-white shadow-lg">
            ۲x
          </div>
        )}

        {/* v0.18.0 — slow network badge */}
        {slowNet && !nativeActive && (
          <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center">
            <span className="rounded-full bg-amber-500/25 px-3 py-1 text-[11px] font-black text-amber-200 backdrop-blur">
              اینترنت کند است — بافر می‌گیرد…
            </span>
          </div>
        )}

        {/* v0.18.0 — sleep timer chip (tap = cancel) */}
        {(sleepLeft !== null || sleepEop) && !nativeActive && (
          <button
            type="button"
            onClick={cancelSleep}
            className="absolute left-1/2 top-[max(env(safe-area-inset-top),10px)] z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-[11px] font-black text-white ring-1 ring-white/20 backdrop-blur"
          >
            {sleepEop
              ? "خواب: پایان همین قسمت — لغو"
              : `خواب: ${fa(Math.max(0, Math.floor((sleepLeft ?? 0) / 60)))}:${fa(String((sleepLeft ?? 0) % 60).padStart(2, "0"))} — لغو`}
          </button>
        )}

        {/* v0.18.0 — mini player overlay: tap = expand, hold controls */}
        {mini && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/85 via-transparent to-black/50 px-2 pb-1.5 pt-1.5"
            onClick={() => void enterLandscape()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="grid h-9 w-9 place-items-center rounded-full text-white active:bg-white/20"
              aria-label="پخش/توقف"
            >
              {playing ? <PauseIcon width={20} height={20} /> : <PlayIcon width={20} height={20} />}
            </button>
            <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-bold text-white">{title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptic(14);
                closeMini();
              }}
              className="grid h-9 w-9 place-items-center rounded-full text-white active:bg-white/20"
              aria-label="بستن مینی‌پلیر"
            >
              <CloseIcon width={16} height={16} />
            </button>
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
                  <button type="button" onClick={toggleMute} className="grid h-9 w-8 place-items-center text-white" aria-label="صدا">
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
                  onClick={() => {
                    haptic();
                    cycleZoom();
                  }}
                  aria-label="چرخه زوم"
                  className="flex h-9 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-black text-white active:bg-white/25"
                >
                  {zoomMode === "contain" ? "اندازه" : zoomMode === "cover" ? "پر" : "کشیده"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setSheet("sleep");
                  }}
                  aria-label="تایمر خواب"
                  className={`flex h-9 items-center rounded-full border px-2.5 text-[11px] font-black active:bg-white/25 ${sleepLeft !== null || sleepEop ? "border-brand/60 bg-brand/20 text-white" : "border-white/20 bg-white/10 text-white"}`}
                >
                  خواب
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setSheet("settings");
                  }}
                  aria-label="تنظیمات پلیر"
                  className="flex h-9 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-black text-white active:bg-white/25"
                >
                  تنظیمات
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
            {/* v0.18.0 — offline download in the action row (native engine) */}
            <MobileDownloadButton
              titleId={titleId}
              slug={slug}
              title={title ?? ""}
              poster={poster ?? ""}
              type={episodes.length ? "series" : "movie"}
              episodeId={episode?.id ?? null}
              episodeLabel={episode ? `فصل ${fa(episode.season)} · قسمت ${fa(episode.number)}` : null}
              size={40}
            />
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
          {synopsis && <p className="mt-3 line-clamp-3 text-[11px] leading-5 text-zinc-500">{synopsis}</p>}
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
            <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[10px] leading-5 text-zinc-500" dir="ltr">
              {appVer} · err: {lastVideoErr} · src: {probeInfo}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  errCountRef.current = 0;
                  ladderAtRef.current = null;
                  nativeTriedRef.current = new Set();
                  setNativeFallbackIdx(null);
                  setNatUnavailable(false);
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
                    nativeTriedRef.current = new Set();
                    setNativeFallbackIdx(null);
                    setNatUnavailable(false);
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

      {/* v0.16.3 — the health probe PROVED the native plugin is dead (or the
          runtime rejected it): be honest instead of a fake «اتصال برقرار نشد».
          v0.19.0 — ALSO shown when the web-first ladder burned everything and
          the only remaining sources need the (absent) native player. */}
      {(ownerUnsupported || natUnavailable) && activeSrc && !fatal && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/90" dir="rtl">
          <div className="max-w-sm p-6 text-center">
            <p className="text-xl font-black text-white">پلیر نیتیو در دسترس نیست</p>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              {ownerUnsupported
                ? "این نسخه از اپ نمی‌تواند فایل‌های MKV و کانتینرهای خاص را پخش کند. اپ را به آخرین نسخه آپدیت کنید؛ نسخه‌های mp4 همچنان پخش می‌شوند."
                : "پخش وب این نسخه‌ها ممکن نشد و پلیر نیتیو هم در این نسخه از اپ در دسترس نیست. اپ را آپدیت کنید یا نسخه/قسمت دیگری را امتحان کنید."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setBridgeOk(null);
                  void probeNativeBridge(true).then(setBridgeOk);
                }}
                className="flex h-12 items-center rounded-full bg-white px-6 text-sm font-bold text-black"
              >
                بررسی دوباره
              </button>
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
                {dataSaver && <p className="mb-2 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300">ذخیره داده روشن است — روی نسخه‌های سنگین بج «حجم بالا» می‌بینی</p>}
                <ul className="space-y-1">
                  {srcList.map((s, i) => {
                    const on = i === srcIdx;
                    const heavy = dataSaver && qNum(s.q) > 720;
                    return (
                      <li key={`${s.url}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (heavy && !manualPickRef.current) setConfirmHighQ(i);
                            else {
                              setConfirmHighQ(null);
                              pickSource(i);
                            }
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-xs transition active:bg-white/10 ${on ? "bg-brand/20 text-white" : "text-zinc-300"}`}
                        >
                          <span className="w-12 shrink-0 font-black">{s.q || "عادی"}</span>
                          <span className={`flex-1 text-start text-[11px] ${s.v?.includes("دوبله") ? "text-emerald-300" : s.v?.includes("زیرنویس") ? "text-sky-300" : "text-zinc-500"}`}>
                            {variantShort(s.v) || "اصلی"}
                          </span>
                          {heavy && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-300">حجم بالا</span>}
                          {s.mb ? <span className="text-[10px] text-zinc-500 num">{fa(s.mb)}MB</span> : null}
                          {on && <CheckIcon width={14} height={14} className="text-brand" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {confirmHighQ !== null && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5">
                    <p className="flex-1 text-[11px] font-bold leading-5 text-amber-200">حجم دانلود این نسخه بالاست — با ذخیرهٔ داده ادامه می‌دهی؟</p>
                    <button
                      type="button"
                      onClick={() => {
                        const i = confirmHighQ;
                        setConfirmHighQ(null);
                        if (i !== null) pickSource(i);
                      }}
                      className="h-9 rounded-full bg-amber-400 px-4 text-[11px] font-black text-black"
                    >
                      ادامه
                    </button>
                    <button type="button" onClick={() => setConfirmHighQ(null)} className="h-9 rounded-full border border-white/20 px-3 text-[11px] font-bold text-white">
                      لغو
                    </button>
                  </div>
                )}
              </>
            )}
            {sheet === "speed" && (
              <>
                <p className="mb-3 text-sm font-black text-white">سرعت پخش</p>
                <div className="grid grid-cols-4 gap-2">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={guestLock}
                      onClick={() => {
                        haptic();
                        setTapHolding(false);
                        setRate(r);
                        setSheet(null);
                      }}
                      className={`rounded-xl border py-3 text-sm font-black transition active:bg-white/10 ${rate === r ? "border-brand/60 bg-brand/20 text-white" : "border-white/10 bg-white/5 text-zinc-300"} disabled:opacity-40`}
                    >
                      {fa(r)}x
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-zinc-500">سرعت بین تیتراژها و ری‌استارت‌ها به‌یاد می‌ماند. نگه‌داشتن انگشت روی تصویر = پخش موقت ۲x.</p>
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
                {/* v0.18.0 — subtitle delay */}
                <p className="mb-1 mt-3 text-[11px] font-black text-zinc-400">تأخیر زیرنویس</p>
                <div className="flex items-center gap-1">
                  {(
                    [
                      [-1, "−۱s"],
                      [-0.5, "−۰٫۵s"],
                      [0.5, "+۰٫۵s"],
                      [1, "+۱s"],
                      [0, "ریست"],
                    ] as const
                  ).map(([d, l]) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        haptic(8);
                        const nv = d === 0 ? 0 : Math.round((subDelay + d) * 10) / 10;
                        setSubDelayState(nv);
                        setSubDelay(nv, slug);
                        markProfilePlaybackTouched();
                      }}
                      className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${subDelay === 0 && d === 0 ? "bg-white text-black" : "bg-white/5 text-zinc-300 active:bg-white/10"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-center text-[10px] tabular-nums text-zinc-500" dir="ltr">
                  {subDelay >= 0 ? "+" : ""}{fa(subDelay)}s
                </p>
                {/* v0.18.0 — vertical position */}
                <p className="mb-1 mt-3 text-[11px] font-black text-zinc-400">موقعیت عمودی</p>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={5}
                  value={subPos}
                  onChange={(e) => {
                    const nv = Number(e.target.value);
                    setSubPosState(nv);
                    setSubPos(nv);
                  }}
                  className="range-input w-full"
                  dir="ltr"
                  aria-label="موقعیت عمودی زیرنویس"
                />
              </>
            )}
            {sheet === "episodes" && (
              <>
                <p className="mb-2 text-sm font-black text-white">قسمت‌ها</p>
                {/* v0.18.0 — season tabs */}
                {seasons.length > 1 && (
                  <div className="mb-2 flex items-center gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
                    {seasons.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeasonTab(s)}
                        className={`shrink-0 rounded-lg px-3.5 py-2 text-[11px] font-black transition ${seasonTab === s ? "bg-white text-black" : "text-zinc-300"}`}
                      >
                        فصل {fa(s)}
                      </button>
                    ))}
                  </div>
                )}
                <ul className="space-y-2">
                  {episodes
                    .filter((e) => seasonTab === null || e.season === seasonTab)
                    .map((e) => {
                      const p = epProgress.get(e.id);
                      const watched = !!p && p.duration > 0 && p.position / p.duration >= 0.92;
                      const epPct = p && p.duration > 0 ? Math.min(100, Math.round((p.position / p.duration) * 100)) : 0;
                      return (
                        <li key={e.id}>
                          <Link
                            href={watchHref(slug, e.id)}
                            onClick={() => setSheet(null)}
                            className={`relative flex gap-3 overflow-hidden rounded-xl p-2 transition active:bg-white/10 ${e.id === episode?.id ? "bg-brand/20 ring-1 ring-brand/60" : ""}`}
                          >
                            <div className="relative shrink-0">
                              <img src={e.thumbnail} alt="" className="h-14 w-24 rounded-lg object-cover" loading="lazy" />
                              {epPct > 0 && !watched && (
                                <span className="absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-black/60">
                                  <span className="block h-full rounded-full bg-brand" style={{ width: `${epPct}%` }} />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-zinc-400">
                                فصل {fa(e.season)} · قسمت {fa(e.number)}
                              </p>
                              <p className="truncate text-sm font-semibold text-white">{e.name}</p>
                              {watched && <p className="mt-0.5 text-[10px] font-bold text-emerald-400">دیده‌شده</p>}
                            </div>
                            {watched && <CheckIcon width={14} height={14} className="ms-auto self-center text-emerald-400" />}
                            {e.id === episode?.id && !watched && <CheckIcon width={14} height={14} className="ms-auto self-center text-brand" />}
                            {/* v0.18.0 — per-row download (native engine) */}
                            <MobileDownloadButton
                              titleId={titleId}
                              slug={slug}
                              title={title ?? ""}
                              poster={poster ?? ""}
                              type="series"
                              episodeId={e.id}
                              episodeLabel={`فصل ${fa(e.season)} · قسمت ${fa(e.number)}`}
                              size={36}
                            />
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
            {sheet === "sleep" && (
              <>
                <p className="mb-3 text-sm font-black text-white">تایمر خواب</p>
                <div className="grid grid-cols-2 gap-2">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        haptic(14);
                        setSleepMin(m);
                        setSleepEop(false);
                        sleepEopRef.current = false;
                        setSleepLeft(m * 60);
                        setSheet(null);
                      }}
                      className={`rounded-xl border py-3.5 text-sm font-black transition active:bg-white/10 ${sleepMin === m && !sleepEop ? "border-brand/60 bg-brand/20 text-white" : "border-white/10 bg-white/5 text-zinc-300"}`}
                    >
                      {fa(m)} دقیقه
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      haptic(14);
                      setSleepMin(null);
                      setSleepEop(true);
                      sleepEopRef.current = true;
                      setSleepLeft(null);
                      setSheet(null);
                    }}
                    className={`col-span-2 rounded-xl border py-3.5 text-sm font-black transition active:bg-white/10 ${sleepEop ? "border-brand/60 bg-brand/20 text-white" : "border-white/10 bg-white/5 text-zinc-300"}`}
                  >
                    پایان همین قسمت
                  </button>
                </div>
                {(sleepLeft !== null || sleepEop) && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelSleep();
                      setSheet(null);
                    }}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-zinc-300 active:bg-white/10"
                  >
                    لغو تایمر
                  </button>
                )}
                <p className="mt-2 text-[10px] leading-4 text-zinc-500">پایان تایمر: صدا کم‌کم محو و پخش متوقف می‌شود. چیپ شمارش معکوس بالای صفحه نمایان است — ضربه روی آن هم لغو می‌کند.</p>
              </>
            )}
            {sheet === "settings" && (
              <>
                <p className="mb-3 text-sm font-black text-white">تنظیمات پلیر</p>
                {/* v0.18.1 — which engine plays the video */}
                <p className="mb-1 text-[11px] font-black text-zinc-400">پلیر ویدیو</p>
                <div className="mb-1.5 flex items-center gap-1 rounded-xl bg-white/5 p-1">
                  {(
                    [
                      ["auto", "هوشمند (پیش‌فرض)"],
                      ["native", "همیشه نیتیو"],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        haptic(8);
                        if (v === engine) return;
                        // carry the exact position into the new engine —
                        // the handoff effect picks resumeAt.current up
                        const t = videoEl?.currentTime ?? 0;
                        if (t > 0.5) resumeAt.current = t;
                        setEngineState(v);
                        setPlayerEngine(v);
                      }}
                      className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${engine === v ? "bg-white text-black" : "text-zinc-300"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <p className="mb-3 text-[10px] leading-4 text-zinc-500">
                  {engine === "native"
                    ? "همه‌ی ویدیوها با پلیر نیتیو (Media3) پخش می‌شود — تجربه‌ی یکدست برای هر فرمتی."
                    : "پلیر وب — سینما و همه‌ی امکانات — برای همه‌ی ویدیوها اولویت دارد؛ فقط اگر وب نتوانست پخش کند، نسخه به پلیر نیتیو سپرده می‌شود."}
                </p>
                {/* seek step */}
                <p className="mb-1 text-[11px] font-black text-zinc-400">گام پرش (دابل‌تپ)</p>
                <div className="mb-3 flex items-center gap-1 rounded-xl bg-white/5 p-1">
                  {[5, 10, 15, 30].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        haptic(8);
                        setSeekStepPref(s);
                      }}
                      className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${getSeekStep() === s ? "bg-white text-black" : "text-zinc-300"}`}
                    >
                      {fa(s)}s
                    </button>
                  ))}
                </div>
                {/* orientation lock */}
                <p className="mb-1 text-[11px] font-black text-zinc-400">قفل جهت</p>
                <div className="mb-3 flex items-center gap-1 rounded-xl bg-white/5 p-1">
                  {(
                    [
                      ["auto", "سنسور"],
                      ["portrait", "پرتره"],
                      ["landscape", "لنداسکیپ"],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        haptic(8);
                        setOrientLockState(v);
                        setOrientLock(v);
                      }}
                      className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition ${orientLock === v ? "bg-white text-black" : "text-zinc-300"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {/* toggles */}
                {(
                  [
                    ["قفل خودکار هنگام شروع", autoLock, (v: boolean) => { setAutoLockState(v); setAutoLock(v); }],
                    ["روشن‌ماندن صفحه هنگام پخش", keepAwake, (v: boolean) => { setKeepAwakeState(v); setKeepAwake(v); }],
                    ["ذخیره داده (اینترنت موبایل)", dataSaver, (v: boolean) => { setDataSaverState(v); setDataSaver(v); }],
                  ] as const
                ).map(([label, val, set]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      haptic(8);
                      set(!val);
                    }}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-zinc-200"
                  >
                    <span>{label}</span>
                    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${val ? "bg-brand" : "bg-white/15"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${val ? "start-[22px]" : "start-0.5"}`} />
                    </span>
                  </button>
                ))}
                {/* stream info + v0.21.0 diagnostics */}
                <p className="mb-1 mt-3 text-[11px] font-black text-zinc-400">اطلاعات پخش</p>
                <div className="rounded-xl bg-white/5 p-3 text-[11px] leading-6 text-zinc-400">
                  <p>اپ: {appVer}</p>
                  <p>
                    پلیر فعال: {owner === "native" ? `نیتیو (Media3)${engine === "native" && !webOverride ? " — انتخاب شما" : ""}` : mseWanted ? "وب — بازسازی فایل (MSE)" : "وب (مستقیم)"}
                    {webOverride && owner !== "native" ? " — این جلسه، با سوئیچ شما" : ""}
                  </p>
                  {mseWanted && <p>وضعیت MSE: {mseStateLabel}</p>}
                  <p>خطای آخر ویدیو: <span dir="ltr" className="tabular-nums">{lastVideoErr}</span></p>
                  <p>پیش‌بررسی منبع: <span dir="ltr" className="tabular-nums">{probeInfo}</span></p>
                  <p>رزولوشن: {videoEl && videoEl.videoWidth ? `${fa(videoEl.videoWidth)}×${fa(videoEl.videoHeight)}` : "—"}</p>
                  <p>نسخه فعال: {qualityLabel || "عادی"}{currentVariant ? ` · ${variantShort(currentVariant) || "اصلی"}` : ""}</p>
                  <p>سلامت بافر: {fa(Math.max(0, Math.round(buffered - current)))} ثانیه</p>
                  <p>شبکه: {netInfo().type}{fa(netInfo().downlink ?? 0) !== "۰" ? ` · ~${fa(netInfo().downlink ?? 0)}Mb/s` : ""}</p>
                </div>
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

