"use client";

/* =====================================================================================
 * v0.37.0 — CINEMA HERO (the approved «preview v7» slider, ported 1:1 into the app)
 *
 * Desktop (lg+): a theater stage built from two local scene boards
 * (scene-dark / scene-lit). The poster of each featured title is mapped onto the
 * scene's plate through a fixed homography; slides change by a LIGHT TRANSITION —
 * the house lights go out (5 random out/in modes, «normal» at 50%) and come back
 * up on the next title. The CURTAINS are the navigation: click the left curtain =
 * next slide, the right curtain = previous; hovering a curtain lays a glassy veil
 * over the measured fabric silhouette (point-in-polygon, never a rectangle) plus a
 * light sweep on click. Info block mirrors the app Hero (chips/title/meta/desc +
 * the same liquid-glass CTAs, wired to the real watch/play actions). No dots, no
 * pause button, no thumbnails — the user removed them all («اون دکمه pause و اون
 * خط قرمز و چیزایی ک نشون میده اسلاید چندومه رو حذف کن»).
 *
 * Mobile (<lg): the previous crossfade hero, with the same controls stripped.
 *
 * v0.38.3 — THE PROJECTOR GATE. v0.38.0 lit the stage the moment a slide
 * swapped and let the new src load async — but an <img> keeps its OLD bitmap
 * while a new src loads, so on a slow route the lights came back on the
 * PREVIOUS film's poster under the new title's info (the «اگه لود بشه اشتباه
 * لود میکنه» report), and the serial error-walk could keep slides dark for
 * the whole timeout chain («پوسترهاش لود نمیاد»). The gate: every title's
 * art is raced OFF-DOM through ALL ladder rungs at once (bounded by the
 * fastest working route, memoized per session), the lights come back only on
 * DECODED current-slide art (warm = instant, cold = a bounded dark beat),
 * and the expiry state is the title's OWN placeholder — upgraded in place
 * when the real art lands. Another film's poster can never be lit again.
 * ===================================================================================== */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { TitleView } from "@/lib/mobile/db";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { InfoIcon, PlayIcon, StarIcon } from "./Icons";
import WatchlistButton from "./WatchlistButton";
import FavoriteButton from "./FavoriteButton";
import { useI18n } from "./i18n/LocaleProvider";
import { titleNames } from "@/lib/title-name";
import { titleHref, watchHref } from "@/lib/mobile-links";
import { artPlaceholder, backdropSrc, heroPosterLadder } from "@/lib/covers";
import { genreListLabel } from "@/lib/genres";
import { useLibrary } from "./library/LibraryProvider";
import { GlassButton } from "./ui/glass";
import {
  CURTAIN_CLIP_L,
  CURTAIN_CLIP_R,
  CURTAIN_L,
  CURTAIN_R,
  POSTER_BOX,
  POSTER_MATRIX,
  SCENE_H,
  SCENE_W,
} from "./hero-curtains";

/* light transition modes — one mode drives one out+in pair; «normal» wins 50%,
 * the four specials share the rest and never repeat back-to-back (preview rule) */
const OUT_START = 6300;
const MODES = {
  normal: { out: 850, in: 1150 },
  flicker: { out: 950, in: 1250 },
  surge: { out: 600, in: 1500 },
  filament: { out: 2100, in: 2600 },
  pulse: { out: 1600, in: 1900 },
} as const;
type Mode = keyof typeof MODES;
const SPECIAL: Mode[] = ["flicker", "surge", "filament", "pulse"];

/* ---- v0.38.3 — the ART RACE (off-DOM, per-title, session-memoized) --------
 * Every ladder rung decodes in PARALLEL on detached <img>s; the best decoded
 * rung wins by ladder position (smaller index = higher-quality route). A slow
 * head no longer serializes the walk (relay 12s timeout × rungs = minutes);
 * the plate is bounded by the FASTEST working route. Winners memoize per
 * session and keep upgrading (local/medium → large) as better rungs land. */
const HERO_DARK_HOLD_MS = 1600;
type HeroArtEntry = {
  src: string;
  rank: number;
  cbs: Set<(src: string) => void>;
};
const heroArt = new Map<number, HeroArtEntry>();

const decodeRung = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      if (im.naturalWidth > 0) {
        if (im.decode) im.decode().then(resolve, () => reject(new Error("decode")));
        else resolve();
      } else reject(new Error("empty"));
    };
    im.onerror = () => reject(new Error("error"));
    im.src = src;
  });

/** Best decoded art known for a title ("" while nothing settled yet). */
function heroArtBest(id: number): string {
  const e = heroArt.get(id);
  return e && e.rank < Infinity && e.src ? e.src : "";
}

/** Race one title's full hero ladder off-DOM. `cb` fires on every improvement
 * (first settle reveals; later settles upgrade in place). The terminal
 * placeholder never races — all rungs failing is what yields it. */
function raceHeroArt(t: TitleView, title: string, cb?: (src: string) => void): void {
  const entry = heroArt.get(t.id);
  if (entry) {
    const best = heroArtBest(t.id);
    if (best) cb?.(best);
    else if (cb) entry.cbs.add(cb);
    return;
  }
  const ladder = heroPosterLadder(t, title);
  const terminal = ladder[ladder.length - 1];
  const rungs = ladder.slice(0, -1).filter((u) => !u.startsWith("data:"));
  const fresh: HeroArtEntry = { src: "", rank: Infinity, cbs: new Set() };
  if (cb) fresh.cbs.add(cb);
  heroArt.set(t.id, fresh);
  const settle = (src: string, rank: number) => {
    if (rank >= fresh.rank) return;
    fresh.src = src;
    fresh.rank = rank;
    const cbs = [...fresh.cbs];
    if (rank === 0) fresh.cbs.clear(); // the head cannot be beaten — done
    cbs.forEach((f) => f(src));
  };
  if (!rungs.length) {
    fresh.src = terminal;
    fresh.rank = ladder.length - 1;
    const cbs = [...fresh.cbs];
    fresh.cbs.clear();
    cbs.forEach((f) => f(terminal));
    return;
  }
  let pending = rungs.length;
  rungs.forEach((u, i) => {
    decodeRung(u).then(
      () => settle(u, i),
      () => {
        pending -= 1;
        if (pending === 0 && fresh.rank === Infinity) {
          /* every route failed — the titled placeholder is the final answer */
          fresh.src = terminal;
          fresh.rank = ladder.length - 1;
          const cbs = [...fresh.cbs];
          fresh.cbs.clear();
          cbs.forEach((f) => f(terminal));
        }
      },
    );
  });
}

/** ray-cast point-in-polygon over the measured curtain silhouettes (stage-%) */
function inPoly(p: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export default function Hero({ items, watchlistIds }: { items: TitleView[]; watchlistIds: number[] }) {
  const router = useRouter();
  const { t: tr, locale } = useI18n();
  const { profile } = useLibrary();
  const reduceMotion =
    profile.reduceMotion ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  /* ---------------- desktop cinematic engine (lg+) ---------------- */
  const stageRef = useRef<HTMLElement | null>(null);
  const litRef = useRef<HTMLImageElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  /* ART-3.1 — the CURRENT slide's healing ladder (v0.38.0 head: HIGH-RES
   * poster/large through the paced relay — the plate is ~490–650 CSS px, the
   * card-sized 300px art read soft; then direct large → relay medium →
   * posterSrc (local pack floor) → titled placeholder). The hero reuses ONE
   * poster element for every slide; the layout's global img-fallback chain is
   * per-element once-only, so after one exhausted slide it would leave every
   * later slide a permanent broken-image glyph. This ladder re-runs per swap
   * instead — and the img opts out of the global chain with data-fb="1" so
   * the two never fight. */
  const ladderRef = useRef<string[]>([]);
  const dustRef = useRef<HTMLDivElement | null>(null);

  /* ART-3.1 — ladder walker: on a failed mount, try the next route for THIS
   * slide (relay → direct metahub → titled placeholder). Stable callback; the
   * ladder itself lives in a ref so slide swaps never re-bind the handler. */
  const onPosterError = useCallback(() => {
    const img = posterRef.current;
    const ladder = ladderRef.current;
    if (!img || !ladder.length) return;
    const step = Math.max(1, ladder.indexOf(img.getAttribute("src") || "") + 1);
    if (step < ladder.length) img.src = ladder[step];
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !items.length) return;
    /* the cinematic stage only exists at lg+; below that the legacy branch renders */
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const reduce =
      profile.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* dust motes inside the light cone (built once) */
    const dust = dustRef.current;
    if (dust && !dust.childElementCount) {
      for (let k = 0; k < 16; k++) {
        const p = document.createElement("i");
        p.style.left = 18 + Math.random() * 36 + "%";
        p.style.top = 18 + Math.random() * 56 + "%";
        p.style.width = p.style.height = `calc(var(--chu) * ${(0.12 + Math.random() * 0.18).toFixed(2)})`;
        p.style.setProperty("--d", (5 + Math.random() * 8).toFixed(1) + "s");
        p.style.setProperty("--dl", (-Math.random() * 9).toFixed(1) + "s");
        dust.appendChild(p);
      }
    }

    /* design space: scale = the scene's object-cover scale, so the plate and the
     * scene stay pixel-glued at every section aspect ratio (v0.37.0 lesson) */
    const design = stage.querySelector<HTMLDivElement>(".ch-design");
    const fit = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      stage.style.setProperty("--chu", w / 100 + "px");
      stage.style.setProperty("--chs", String(Math.max(w / SCENE_W, h / SCENE_H)));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();

    /* v0.38.3 — race EVERY title's art off-DOM at boot (staggered), not just
     * the head rung: the winners memoize per session, so the first swaps are
     * warm and the 5→1 wrap (slide 1 = the coldest entry) is covered too */
    items.forEach((t, k) => {
      window.setTimeout(() => {
        if (!dead) raceHeroArt(t, titleNames(t, locale).primary);
      }, 120 * k);
    });

    const slides = Array.from(stage.querySelectorAll<HTMLElement>(".ch-slide"));
    let idx = 0;
    let timers: number[] = [];
    let slideStart = 0;
    let pausedAt = 0;
    let paused = false;
    let lastMode: Mode | null = null;
    /* v0.38.3 — swap generation + dead flag: async reveals from an aborted
     * swap (curtain spam, unmount) must never touch the stage or the img */
    let swapGen = 0;
    let dead = false;

    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers = [];
      clearSwap(); // the animationend listener + slack safety ride with the timers (declared below; runs post-init only)
    };
    const pickMode = (): Mode => {
      if (Math.random() < 0.5) return "normal";
      const pool = SPECIAL.filter((n) => n !== lastMode);
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const setMode = (m: Mode) => {
      lastMode = m;
      stage.style.setProperty("--ch-out", MODES[m].out + "ms");
      stage.style.setProperty("--ch-in", MODES[m].in + "ms");
      stage.setAttribute("data-mode", m);
    };
    /* v0.38.3 — the PROJECTOR GATE. The lights come back only on art that is
     * DECODED for the CURRENT slide: warm art = instant, cold art = a bounded
     * dark beat while the off-DOM race runs, expiry = the title's OWN titled
     * placeholder. The plate then upgrades in place as better rungs land.
     * The previous film's poster can never be lit under a new title again. */
    const lightOn = () => {
      const t = items[idx];
      const title = titleNames(t, locale).primary;
      const img = posterRef.current;
      if (!img) {
        stage.classList.add("lit");
        return;
      }
      const gen = swapGen;
      const ladder = heroPosterLadder(t, title);
      let hold = 0;
      let didReveal = false;
      const reveal = (src: string) => {
        if (dead || gen !== swapGen) return;
        if (!didReveal) {
          didReveal = true;
          clearTimeout(hold);
          /* the safety walker stays pointed at the revealed rung and beyond */
          ladderRef.current = ladder.slice(Math.max(0, ladder.indexOf(src)));
          if (img.getAttribute("src") !== src) img.src = src;
          /* restart .lit so the light entrance + poster reveal replay */
          stage.classList.remove("goodnight");
          void stage.offsetWidth;
          stage.classList.add("lit");
          slideStart = performance.now();
          if (!paused && !reduce) scheduleOut();
        } else if (
          stage.dataset.idx === String(idx) &&
          !stage.classList.contains("goodnight") &&
          img.getAttribute("src") !== src
        ) {
          /* a better rung (the hi-res large) landed after the plate lit —
           * both srcs are decoded AND both belong to THIS title, so the
           * in-place upgrade is seamless and can never show another film */
          img.src = src;
        }
      };
      const warm = heroArtBest(t.id);
      if (warm) reveal(warm);
      else hold = window.setTimeout(() => reveal(artPlaceholder(title, false)), HERO_DARK_HOLD_MS);
      raceHeroArt(t, title, (src) => reveal(src));
      /* pre-warm the NEXT title mid-slide so its swap lights warm too */
      const nxt = items[(idx + 1) % items.length];
      window.setTimeout(() => {
        if (!dead) raceHeroArt(nxt, titleNames(nxt, locale).primary);
      }, 1400);
    };
    /* v0.38.0 — the swap is driven by the out animation ITSELF, not by a
     * wall-clock timer. v0.37.0 scheduled the swap at OUT_START + out on the
     * TIMER clock while the animation ran on the COMPOSITOR clock from its
     * first rendered frame — any main-thread jank between the .goodnight add
     * and that first frame started the animation LATE, so the timer fired
     * mid-fade and the half-dark old poster was visibly replaced: the
     * «کامل محو شده نیست لحظه آخرش» report (rAF probes measured swaps at
     * opacity 0.33–0.48 under decode jank). animationend fires exactly when
     * opacity is 0; a slack safety timer only covers a dead event path
     * (worst case: a slightly longer dark hold — never a visible cut). */
    let disarmSwap: (() => void) | null = null;
    const clearSwap = () => {
      const d = disarmSwap;
      disarmSwap = null;
      d?.();
    };
    const armSwap = () => {
      clearSwap();
      const img = posterRef.current;
      let fired = false;
      const swap = () => {
        if (fired) return;
        fired = true;
        stage.classList.remove("lit", "goodnight");
        void stage.offsetWidth;
        go(idx + 1, true);
      };
      const onEnd = (e: AnimationEvent) => {
        if (e.animationName !== "ch-poster-out" || e.target !== img) return;
        clearSwap();
        swap();
      };
      img?.addEventListener("animationend", onEnd);
      const safety = window.setTimeout(() => {
        clearSwap();
        swap();
      }, MODES[lastMode ?? "normal"].out + 1600);
      disarmSwap = () => {
        img?.removeEventListener("animationend", onEnd);
        clearTimeout(safety);
      };
    };
    const scheduleOut = () => {
      /* the mode for this out+next-in pair is picked in the SAME tick as .goodnight */
      timers.push(
        window.setTimeout(() => {
          setMode(pickMode());
          stage.classList.add("goodnight");
          armSwap();
        }, OUT_START),
      );
    };
    const go = (i: number, keepMode = false) => {
      clearTimers();
      if (!keepMode && !reduce) setMode(pickMode());
      const wasLit = stage.classList.contains("lit") && !stage.classList.contains("goodnight");
      const next = ((i % slides.length) + slides.length) % slides.length;
      const old = slides[idx];
      if (old && old !== slides[next]) {
        old.classList.remove("active");
        if (wasLit) {
          old.classList.add("leaving");
          window.setTimeout(() => old.classList.remove("leaving"), 460);
        }
      }
      idx = next;
      stage.dataset.idx = String(idx);
      slides.forEach((s, k) => s.toggleAttribute("inert", k !== next));
      slides[idx].classList.add("active");
      paused = false;
      /* v0.38.3: the out timer is armed by the REVEAL — the lit window starts
       * when the art is actually on the plate, not when the swap began */
      lightOn();
    };
    const pause = () => {
      if (paused) return;
      paused = true;
      pausedAt = performance.now();
      clearTimers();
      stage.classList.add("ch-paused");
    };
    const resume = () => {
      if (!paused) return;
      paused = false;
      stage.classList.remove("ch-paused");
      const remain = Math.max(0, OUT_START - (pausedAt - slideStart));
      timers.push(
        window.setTimeout(() => {
          /* mid-goodnight pause: keep the RUNNING out mode (re-picking would
           * restart its animation); otherwise pick the pair's mode now */
          if (!stage.classList.contains("goodnight")) setMode(pickMode());
          stage.classList.add("goodnight");
          armSwap();
        }, remain),
      );
    };

    /* curtain navigation — left curtain = next, right curtain = prev */
    const curtL = stage.querySelector<HTMLElement>(".ch-curt-l");
    const curtR = stage.querySelector<HTMLElement>(".ch-curt-r");
    const curtHit = (e: MouseEvent): HTMLElement | null => {
      if ((e.target as Element | null)?.closest?.("button")) return null;
      const r = stage.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      if (inPoly(CURTAIN_L, x, y)) return curtL;
      if (inPoly(CURTAIN_R, x, y)) return curtR;
      return null;
    };
    const onMove = (e: MouseEvent) => {
      const z = curtHit(e);
      curtL?.classList.toggle("on", z === curtL);
      curtR?.classList.toggle("on", z === curtR);
      stage.style.cursor = z ? "pointer" : "";
    };
    const onLeave = () => {
      curtL?.classList.remove("on");
      curtR?.classList.remove("on");
      stage.style.cursor = "";
    };
    const sweep = (c: HTMLElement | null) => {
      if (!c) return;
      c.classList.remove("sweeping");
      void c.offsetWidth;
      c.classList.add("sweeping");
    };
    const onClick = (e: MouseEvent) => {
      const z = curtHit(e);
      if (!z) return;
      sweep(z);
      if (z === curtL) go(idx + 1);
      else go(idx - 1);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowLeft") go(idx + 1);
      else if (e.key === "ArrowRight") go(idx - 1);
    };
    const onVis = () => {
      if (document.hidden) pause();
      else resume();
    };

    stage.addEventListener("mousemove", onMove);
    stage.addEventListener("mouseleave", onLeave);
    stage.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);

    /* boot */
    if (reduce) {
      /* reduced motion: static lit stage, no auto-rotate; curtain nav still works */
      stage.classList.add("ch-reduce");
      setMode("normal");
      slides[0].classList.add("active");
      slides.forEach((s, k) => s.toggleAttribute("inert", k !== 0));
      stage.dataset.idx = "0";
      lightOn();
    } else {
      window.setTimeout(() => go(0), 300);
    }

    return () => {
      dead = true;
      swapGen += 1;
      clearTimers();
      ro.disconnect();
      stage.removeEventListener("mousemove", onMove);
      stage.removeEventListener("mouseleave", onLeave);
      stage.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
      stage.classList.remove("lit", "goodnight", "ch-paused", "ch-reduce");
      slides.forEach((s) => s.classList.remove("active", "leaving"));
    };
     
  }, [items, profile.reduceMotion, locale]);

  /* first poster is mounted by React so the plate is never empty on the first
   * light — the v0.38.0 high-res ladder head (SSR/web resolves to the direct
   * large variant; the Electron client re-points to the relay on the first
   * lightOn, one warm-up fetch on the very first boot only) */
  const firstPoster = items[0] ? heroPosterLadder(items[0], titleNames(items[0], locale).primary)[0] : undefined;

  if (!items.length) return null;

  /* ---------------- shared info block (used by both branches) ---------------- */
  const info = (t: TitleView) => {
    const names = titleNames(t, locale);
    return (
      <>
        <div className="ch-chips">
          <span className="ch-chip ch-chip-brand">{t.featured ? tr("hero.featured") : typeLabel(t.type)}</span>
          <span className="ch-chip ch-chip-glass">{t.quality}</span>
          <span className="ch-chip ch-chip-glass">{t.ageRating}</span>
        </div>
        <h1 className="ch-title" dir={names.primaryDir}>
          {names.primary}
        </h1>
        {names.secondary ? (
          <div className="ch-subtitle" dir={names.secondaryDir}>
            {names.secondary}
          </div>
        ) : null}
        <div className="ch-meta">
          <span className="ch-rating">
            <StarIcon width={15} height={15} /> {fa(t.rating)}
          </span>
          <span>{fa(t.year)}</span>
          <span>{t.type === "series" ? `${tr("common.perEpisode")} ${formatDuration(t.duration)}` : formatDuration(t.duration)}</span>
          <span className="ch-genr">{genreListLabel(t.genres, locale)}</span>
        </div>
        <p className="ch-desc">{t.description}</p>
        <div className="ch-ctas">
          <GlassButton onClick={() => router.push(watchHref(t.slug))}>
            <span className="flex h-12 items-center gap-2 px-7 text-sm font-extrabold text-white">
              <PlayIcon width={20} height={20} />
              {tr("common.play")}
            </span>
          </GlassButton>
          <GlassButton onClick={() => router.push(titleHref(t.slug))}>
            <span className="flex h-12 items-center gap-2 px-6 text-sm font-bold text-white/85">
              <InfoIcon />
              {tr("common.moreDetails")}
            </span>
          </GlassButton>
          <WatchlistButton titleId={t.id} name={names.primary} initial={watchlistIds.includes(t.id)} variant="icon" />
          <FavoriteButton titleId={t.id} name={names.primary} variant="icon" />
        </div>
      </>
    );
  };

  return (
    <>
      {/* ================= mobile / <lg — previous crossfade hero, controls stripped ================= */}
      <MobileHero items={items} reduceMotion={!!reduceMotion} renderInfo={info} />

      {/* ================= desktop / lg+ — the cinema ================= */}
      <section
        ref={stageRef}
        data-mode="normal"
        className="ch-stage relative hidden h-[82vh] min-h-[560px] w-full overflow-hidden bg-black lg:block"
        aria-roledescription="carousel"
      >
        {/* scene boards */}
        <img src="/images/hero/scene-dark.jpg" alt="" aria-hidden className="ch-scene ch-scene-off" />
        <img ref={litRef} src="/images/hero/scene-lit.jpg" alt="" aria-hidden className="ch-scene ch-scene-lit" />

        {/* readability gradients (from-ink equivalents) */}
        <div className="ch-fade-side" />
        <div className="ch-fade-bottom" />

        {/* fixed design space — poster plate homography */}
        <div className="ch-design">
          <div
            className="ch-poster-wrap"
            style={{ left: POSTER_BOX.left, top: POSTER_BOX.top, width: POSTER_BOX.width, height: POSTER_BOX.height, transform: POSTER_MATRIX, transformOrigin: "0 0" }}
          >
            { }
            <img
              ref={posterRef}
              src={firstPoster}
              alt=""
              aria-hidden
              decoding="async"
              data-fb="1"
              onError={onPosterError}
            />
            <div className="ch-tint" />
            <div className="ch-base" />
            <div className="ch-glass" />
            <div className="ch-glint" />
          </div>
        </div>

        {/* slides — info mirrors the app Hero */}
        <div className="ch-slides">
          {items.map((t) => (
            <div key={t.id} className="ch-slide" aria-hidden={true}>
              <div className="ch-info">{info(t)}</div>
            </div>
          ))}
        </div>

        {/* atmosphere */}
        <div ref={dustRef} className="ch-dust" />
        <div className="ch-grain" />
        <div className="ch-vig" />

        {/* curtain navigation zones — visual layers only (pointer-events:none);
            hit-testing happens on the section via point-in-polygon */}
        <div className="ch-curt ch-curt-l" aria-hidden={true}>
          <span className="ch-pane" style={{ clipPath: CURTAIN_CLIP_L }} />
          <span className="ch-sw" style={{ clipPath: CURTAIN_CLIP_L }} />
        </div>
        <div className="ch-curt ch-curt-r" aria-hidden={true}>
          <span className="ch-pane" style={{ clipPath: CURTAIN_CLIP_R }} />
          <span className="ch-sw" style={{ clipPath: CURTAIN_CLIP_R }} />
        </div>
      </section>
    </>
  );
}

/* =====================================================================================
 * Mobile hero — the v0.25 crossfade kept as-is minus dots/thumbs/pause (v0.37.0:
 * the user removed every rotation control: «اون دکمه pause و اون خط قرمز و
 * چیزایی ک نشون میده اسلاید چندومه رو حذف کن»).
 * ===================================================================================== */
function MobileHero({
  items,
  reduceMotion,
  renderInfo,
}: {
  items: TitleView[];
  reduceMotion: boolean;
  renderInfo: (t: TitleView) => ReactNode;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reduceMotion || items.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(t);
  }, [reduceMotion, items.length]);

  if (!items.length) return null;
  const cur = items[idx];

  return (
    <section className="relative h-[82vh] min-h-[560px] w-full overflow-hidden lg:hidden">
      {items.map((t, i) => {
        /* v0.25.0 — mount ONLY the active slide ±1 (wrap-aware) */
        const dist = Math.min(Math.abs(i - idx), items.length - Math.abs(i - idx));
        return (
          <div
            key={t.id}
            className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? "opacity-100" : "opacity-0"}`}
            aria-hidden={i !== idx}
          >
            {dist <= 1 && (
               
              <img
                src={backdropSrc(t)}
                alt=""
                loading={dist === 0 ? "eager" : "lazy"}
                fetchPriority={dist === 0 ? "high" : undefined}
                decoding="async"
                data-ph-title={t.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-l from-ink via-ink/60 to-ink/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-black/40" />

      <div className="relative z-10 mx-auto flex h-full max-w-[1600px] flex-col justify-end px-4 pb-24 sm:px-8">
        <div key={cur.id} className="max-w-2xl animate-fade-up">{renderInfo(cur)}</div>
      </div>
    </section>
  );
}
