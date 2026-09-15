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
 * ===================================================================================== */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TitleView } from "@/lib/mobile/db";
import { fa, formatDuration, typeLabel } from "@/lib/format";
import { InfoIcon, PlayIcon, StarIcon } from "./Icons";
import WatchlistButton from "./WatchlistButton";
import FavoriteButton from "./FavoriteButton";
import { useI18n } from "./i18n/LocaleProvider";
import { titleNames } from "@/lib/title-name";
import { titleHref, watchHref } from "@/lib/mobile-links";
import { posterSrc, backdropSrc } from "@/lib/covers";
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
  const dustRef = useRef<HTMLDivElement | null>(null);

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

    /* warm-decode every poster once so slide swaps (esp. the 5→1 wrap, where
     * slide 1's art is the coldest cache entry) never stall on decode */
    items.forEach((t) => {
      const im = new Image();
      im.src = posterSrc(t);
      im.decode?.().catch(() => {});
    });

    const slides = Array.from(stage.querySelectorAll<HTMLElement>(".ch-slide"));
    let idx = 0;
    let timers: number[] = [];
    let slideStart = 0;
    let pausedAt = 0;
    let paused = false;
    let lastMode: Mode | null = null;

    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers = [];
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
    const lightOn = () => {
      /* restart .lit so the light entrance + poster reveal replay every entry */
      stage.classList.remove("lit", "goodnight");
      void stage.offsetWidth;
      stage.classList.add("lit");
      if (posterRef.current) posterRef.current.src = posterSrc(items[idx]);
    };
    const scheduleOut = () => {
      /* the mode for this out+next-in pair is picked in the SAME tick as .goodnight */
      timers.push(
        window.setTimeout(() => {
          setMode(pickMode());
          stage.classList.add("goodnight");
        }, OUT_START),
      );
      timers.push(
        window.setTimeout(() => {
          stage.classList.remove("lit", "goodnight");
          void stage.offsetWidth;
          go(idx + 1, true);
        }, OUT_START + MODES[lastMode ?? "normal"].out),
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
      lightOn();
      slideStart = performance.now();
      paused = false;
      if (!reduce) scheduleOut();
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
          setMode(pickMode());
          stage.classList.add("goodnight");
        }, remain),
      );
      timers.push(
        window.setTimeout(() => {
          stage.classList.remove("lit", "goodnight");
          void stage.offsetWidth;
          go(idx + 1, true);
        }, remain + MODES[lastMode ?? "normal"].out),
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
     
  }, [items, profile.reduceMotion]);

  /* first poster is mounted by React so the plate is never empty on the first light */
  const firstPoster = items[0] ? posterSrc(items[0]) : undefined;

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
            <img ref={posterRef} src={firstPoster} alt="" aria-hidden decoding="async" />
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
