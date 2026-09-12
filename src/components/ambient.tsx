"use client";

/* v0.30.9 — shared GHOST-POSTER ambient (used by /vip and the home page).
 *
 * The pool is the ALL-TIME FAMOUS list: top-rated movies + series from the
 * catalog with documentaries ("مستند" — genres are stored as Persian JSON
 * arrays; whole doc series sit at 9.2–9.4 and would otherwise own the
 * rating sort) and unknown-genre ("نامشخص") entries filtered out.
 *
 * POSTERS (2/3), not backdrops — the user explicitly prefers the poster
 * form for these ghosts. Each ghost: low opacity + slight blur + an
 * intersect of two linear feather masks so EVERY border pixel reaches
 * zero alpha (a radial mask could never fully erase the flat edges —
 * the cover rectangle stayed visible, v0.30.8 lesson). GPU-only
 * opacity/transform via the vip-ambient keyframes; the poster swaps at
 * the invisible 0-opacity boundary of each cycle. */

import { useEffect, useState } from "react";
import { posterSrc } from "@/lib/covers";

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

/* Edge feathers: each axis fades to transparent exactly AT the element
 * edge; intersected, they guarantee a fully dissolved border while the
 * central plateau keeps the artwork readable. */
export const GHOST_MASK_X = "linear-gradient(to right, transparent 0%, #000 25%, #000 75%, transparent 100%)";
export const GHOST_MASK_Y = "linear-gradient(to bottom, transparent 0%, #000 28%, #000 72%, transparent 100%)";
export const GHOST_MASK = `${GHOST_MASK_X}, ${GHOST_MASK_Y}`;

const NO_GHOST_GENRES = ["مستند", "Documentary", "نامشخص"];

/** Top-rated famous posters (documentaries / unknown filtered), shuffled
 *  so every visit surfaces different covers. Never early-returns for
 *  prefers-reduced-motion — reduced-motion users still get the static
 *  matte via the CSS pin; skipping the fetch left them a black page. */
export function useFamousPosterPool(limit = 42): string[] {
  const [posters, setPosters] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/catalog?type=movie&sort=rating&limit=60").then((r) => (r.ok ? r.json() : { items: [] })),
      fetch("/api/catalog?type=series&sort=rating&limit=60").then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([m, s]) => {
        if (!alive) return;
        const pool = [...(m.items ?? []), ...(s.items ?? [])]
          .filter((t: { genres?: string[] | null }) => {
            const g = Array.isArray(t.genres) ? t.genres : [];
            return !NO_GHOST_GENRES.some((x) => g.includes(x));
          })
          .map((t: { poster?: string | null; posterUrl?: string | null }) => posterSrc(t))
          .filter(Boolean);
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        setPosters(pool.slice(0, limit));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [limit]);
  return posters;
}

/** One floating ghost poster. `advance` = the host's total slot count, so
 *  successive cycles never repeat a poster across simultaneous slots. */
export function AmbientGhost({
  slot,
  posters,
  startIndex,
  advance,
  maxWidth,
}: {
  slot: GhostSlot;
  posters: string[];
  startIndex: number;
  advance: number;
  maxWidth: string;
}) {
  const [idx, setIdx] = useState(() => startIndex % Math.max(1, posters.length));
  const src = posters[idx % posters.length];
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      onAnimationIteration={() => setIdx((i) => (i + advance) % posters.length)}
      className="vip-ambient-img absolute select-none object-cover"
      style={{
        left: slot.left,
        top: slot.top,
        width: slot.w,
        maxWidth,
        aspectRatio: "2 / 3",
        borderRadius: 18,
        opacity: 0,
        filter: `blur(${slot.blur}px) saturate(0.9) brightness(0.85)`,
        WebkitMaskImage: GHOST_MASK,
        maskImage: GHOST_MASK,
        WebkitMaskComposite: "source-in",
        maskComposite: "intersect",
        "--vip-o": slot.o,
        "--vip-tilt": slot.tilt,
        animation: `vip-ambient ${slot.dur}s linear ${slot.delay}s infinite`,
        willChange: "opacity, transform",
      } as React.CSSProperties}
    />
  );
}
