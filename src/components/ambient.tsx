"use client";

/* v0.30.10 — shared GHOST-COVER ambient (used by /vip and the home page).
 *
 * The pool is the ALL-TIME FAMOUS list: top-rated movies + series from the
 * catalog with documentaries ("مستند" — genres are stored as Persian JSON
 * arrays; whole doc series sit at 9.2–9.4 and would otherwise own the
 * rating sort) and unknown-genre ("نامشخص") entries filtered out.
 *
 * v0.30.12 — the oval fade now COVERS THE FRAME: the feather runs all the
 * way to 100% — the inscribed ellipse — so the fade lands EXACTLY on the
 * cover frame (edge midpoints) and everything beyond it (corners) is
 * already fully transparent; the rectangle can never show.
 *
 * v0.30.14 — the fade now CONSTITUTES THE COVER: he said the solid core
 * still owned too much of the image («هنوزم اون فید می‌تونه بهتر و بیشترم
 * باشه... می‌خوام خیلی بیشتر تو حتی نزدیک به لبه‌ی کاور برسه») — the
 * reverse of the v0.30.12 reading: the SOLID CORE shrinks 48%→20% of the
 * half-axes (≈6× less fully-visible area) and the feather becomes a long
 * multi-stop ease that starts near the center and only hits zero at the
 * inscribed ellipse. Most of the cover is now mid-fade at any moment;
 * the fade reaches near the frame and the frame still never shows.
 *
 * GHOSTS enter ONE BY ONE (v0.30.12): each slot gets a random reveal
 * delay — useGhostDelays — instead of the whole layer popping in as a
 * block (the home complaint that they were not random and did not arrive
 * one after another).
 *
 * OVAL COVERS (16/9 backdrops — the user flipped back to the wide cover
 * form) shaped as soft ELLIPSES. The image swap happens only after the
 * next cover is preloaded AND decoded — otherwise the browser keeps
 * painting the old bitmap until the new one arrives and the poster
 * visibly changes mid-fade (the user-reported bug). GPU-only
 * opacity/transform via the vip-ambient keyframes; the swap lands on
 * the invisible 0-opacity boundary of each cycle. */

import { useCallback, useEffect, useRef, useState } from "react";
import { posterSrc, backdropSrc } from "@/lib/covers";

export type GhostSlot = {
  left: string;
  top: string;
  w: number;
  dur: number;
  delay: number;
  o: number;
  blur: number;
  tilt: string;
};

export type GhostShape = "oval" | "poster";

/* OVAL: radial ellipse with a SMALL solid core (20%) and a LONG multi-stop
 * feather (v0.30.14) that starts near the center and hits zero exactly AT
 * the inscribed ellipse (= the box edge midpoints): the fade constitutes
 * most of the cover and still reaches the frame, so the rectangle can
 * never show.
 * POSTER: intersect of two linear feathers, each hitting transparent
 * exactly AT the edge (kept for the 2/3 variant). */
export const OVAL_MASK =
  "radial-gradient(50% 50% at 50% 50%, #000 20%, rgba(0,0,0,0.9) 38%, rgba(0,0,0,0.72) 55%, rgba(0,0,0,0.48) 70%, rgba(0,0,0,0.26) 83%, rgba(0,0,0,0.1) 93%, transparent 100%)";
export const GHOST_MASK_X = "linear-gradient(to right, transparent 0%, #000 25%, #000 75%, transparent 100%)";
export const GHOST_MASK_Y = "linear-gradient(to bottom, transparent 0%, #000 28%, #000 72%, transparent 100%)";
export const GHOST_MASK = `${GHOST_MASK_X}, ${GHOST_MASK_Y}`;

const NO_GHOST_GENRES = ["مستند", "Documentary", "نامشخص"];

/** Top-rated famous covers (documentaries / unknown filtered), shuffled so
 *  every visit surfaces different art. `kind` picks the artwork crop:
 *  "backdrop" = wide 16/9 cover (default), "poster" = 2/3 key art. Never
 *  early-returns for prefers-reduced-motion — reduced-motion users still
 *  get the static matte via the CSS pin; skipping the fetch left them a
 *  black page. */
export function useFamousPosterPool(limit = 42, kind: "backdrop" | "poster" = "backdrop"): string[] {
  const [covers, setCovers] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/catalog?type=movie&sort=rating&limit=60").then((r) => (r.ok ? r.json() : { items: [] })),
      fetch("/api/catalog?type=series&sort=rating&limit=60").then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([m, s]) => {
        if (!alive) return;
        const pick = (t: { poster?: string | null; posterUrl?: string | null; backdrop?: string | null; backdropUrl?: string | null }) =>
          kind === "poster" ? posterSrc(t) : backdropSrc(t);
        const pool = [...(m.items ?? []), ...(s.items ?? [])]
          .filter((t: { genres?: string[] | null }) => {
            const g = Array.isArray(t.genres) ? t.genres : [];
            return !NO_GHOST_GENRES.some((x) => g.includes(x));
          })
          .map(pick)
          .filter(Boolean);
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        setCovers(pool.slice(0, limit));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [limit, kind]);
  return covers;
}

/** Random per-slot REVEAL delays (seconds) so ghosts surface ONE BY ONE
 *  instead of as a synchronized block — the home-page complaint ("انگار
 *  رندم نیستند و پشت سر نمیان"). Client-only state: the ghosts render
 *  null until the pool fetch lands (post-mount), so this never touches
 *  SSR hydration. */
export function useGhostDelays(count: number, spread = 6): number[] {
  const [delays, setDelays] = useState<number[]>([]);
  useEffect(() => {
    setDelays(Array.from({ length: count }, () => Math.random() * spread));
  }, [count, spread]);
  return delays;
}

/** One floating ghost cover. `advance` = the host's total slot count, so
 *  successive cycles never repeat a cover across simultaneous slots.
 *
 *  The swap fires on the animation's 0-opacity boundary, but ONLY after
 *  the next image is decoded: swapping `src` on an <img> makes the browser
 *  keep painting the OLD bitmap until the new file arrives — on a slow
 *  line that meant the cover visibly changing mid-fade (user report).
 *  `pre.decode()` guarantees the new bitmap is ready at the invisible
 *  instant; a failed decode still commits (the visible <img> runs its own
 *  fallback chain). */
export function AmbientGhost({
  slot,
  covers,
  startIndex,
  advance,
  maxWidth,
  shape = "oval",
  revealDelay = 0,
}: {
  slot: GhostSlot;
  covers: string[];
  startIndex: number;
  advance: number;
  maxWidth: string;
  shape?: GhostShape;
  /** random staggered-entrance delay (s) — see useGhostDelays */
  revealDelay?: number;
}) {
  const [idx, setIdx] = useState(() => startIndex % Math.max(1, covers.length));
  const idxRef = useRef(idx);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  const onIter = useCallback(
    (e: React.AnimationEvent) => {
      if (e.animationName !== "vip-ambient") return;
      const next = (idxRef.current + advance) % covers.length;
      const pre = new Image();
      pre.src = covers[next];
      const commit = () => setIdx(next);
      (pre.decode ? pre.decode().catch(() => {}) : Promise.resolve()).then(commit);
    },
    [advance, covers]
  );

  const src = covers[idx % covers.length];
  const oval = shape === "oval";
  /* v0.30.12: a WRAPPER owns the staggered entrance (ghost-in, one random
   * delay per slot) and the img owns the fade cycle (vip-ambient) — two
   * opacity animations on one element would fight; separate layers keep
   * the reveal and the breathing independent. */
  return (
    <div
      aria-hidden="true"
      className="ghost-in absolute select-none"
      style={{
        left: slot.left,
        top: slot.top,
        width: slot.w,
        maxWidth,
        aspectRatio: oval ? "16 / 9" : "2 / 3",
        opacity: 0,
        animation: `ghost-in 1600ms ease ${revealDelay}s both`,
      }}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        onAnimationIteration={onIter}
        className="vip-ambient-img absolute inset-0 h-full w-full select-none object-cover"
        style={{
          borderRadius: oval ? 0 : 18,
          opacity: 0,
          filter: `blur(${slot.blur}px) saturate(0.9) brightness(0.85)`,
          WebkitMaskImage: oval ? OVAL_MASK : GHOST_MASK,
          maskImage: oval ? OVAL_MASK : GHOST_MASK,
          ...(oval ? {} : { WebkitMaskComposite: "source-in", maskComposite: "intersect" }),
          "--vip-o": slot.o,
          "--vip-tilt": slot.tilt,
          animation: `vip-ambient ${slot.dur}s linear ${slot.delay}s infinite`,
          willChange: "opacity, transform",
        } as React.CSSProperties}
      />
    </div>
  );
}
