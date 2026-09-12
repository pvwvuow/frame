"use client";

/* v0.30.1 — the liquid-glass family, REBUILT without liquid-glass-react.
 *
 * v0.30.0 shipped a wrapper around rdev/liquid-glass-react and it demolished
 * the layout. That library renders 5–8 SIBLING layers per surface (two
 * shadow divs, the glass container, two rim spans, three hover-glow layers
 * when onClick is set) and every one of them is
 * `position: relative; top: 50%; left: 50%; translate(-50%,-50%)` —
 * a construction that only works when the pill floats ALONE, absolutely
 * centered over a huge demo backdrop. Inside real app flow:
 *
 *   • all siblings stay in normal flow → every surface became a 5–8× tall
 *     stack of boxes (bottom nav, hero CTAs, quick-view modal, updater
 *     popup),
 *   • each layer is displaced by ½ parent size minus ½ own size → every
 *     layer landed somewhere else, off-screen or over other UI,
 *   • the content box forced `font: 500 20px/1 system-ui` + `padding:
 *     24px 32px` → Persian typography and metrics broke even where it
 *     happened to be visible.
 *
 * This rebuild keeps the SAME three-component API and the same visual
 * language (deep blur + saturation, specular chromatic rim, sheen, inner
 * highlight — the CSS tokens live in globals.css), but on boring, proven,
 * in-flow DOM: one positioned surface + pointer-events-none decoration
 * layers. Nothing here can explode a layout, and every effect degrades to
 * plain dark glass on weak webviews (backdrop-filter is progressive by
 * nature — when it is unsupported the translucent background still reads).
 *
 * Library-specific props (blurAmount, displacementScale, …) are accepted
 * and ignored so the v0.30.0 call sites stay untouched.
 */

import type { CSSProperties, ReactNode } from "react";

type LegacyGlassProps = {
  blurAmount?: number;
  displacementScale?: number;
  aberrationIntensity?: number;
  saturation?: number;
  elasticity?: number;
  cornerRadius?: number;
  mode?: string;
  overLight?: boolean;
};

/* The shared decoration: a masked specular rim with faint chromatic
 * fringes + a diagonal sheen + the top inner highlight. Absolutely
 * positioned, pointer-events-none, clipped to the surface radius. */
function GlassDecor({ radius }: { radius: number }) {
  const mask =
    "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          padding: "1.5px",
          background: "var(--glass-rim)",
          WebkitMask: mask,
          WebkitMaskComposite: "xor",
          mask,
          maskComposite: "exclude",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background: "var(--glass-sheen)",
          boxShadow: "inset 0 1px 0 var(--glass-hl)",
        }}
      />
    </>
  );
}

/* ── bars: the bottom-nav family. Rigid, wide, quiet glass. ── */
export function GlassBar({
  children,
  radius = 26,
  className = "",
  style,
}: {
  children: ReactNode;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative isolate ${className}`}
      style={{
        borderRadius: radius,
        background: "var(--glass-bg)",
        WebkitBackdropFilter: "blur(22px) saturate(170%) brightness(1.04)",
        backdropFilter: "blur(22px) saturate(170%) brightness(1.04)",
        border: "1px solid var(--glass-border)",
        boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)",
        ...style,
      }}
    >
      <GlassDecor radius={radius} />
      {children}
    </div>
  );
}

/* ── cards: popups & modals (the Card Example look) ── */
export function GlassCard({
  children,
  radius = 28,
  className = "",
  style,
}: {
  children: ReactNode;
  radius?: number;
  className?: string;
  style?: CSSProperties;
} & LegacyGlassProps) {
  return (
    <div
      className={`relative isolate overflow-hidden ${className}`}
      style={{
        borderRadius: radius,
        background: "var(--glass-bg)",
        WebkitBackdropFilter: "blur(30px) saturate(180%) brightness(1.05)",
        backdropFilter: "blur(30px) saturate(180%) brightness(1.05)",
        border: "1px solid var(--glass-border)",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35)",
        ...style,
      }}
    >
      <GlassDecor radius={radius} />
      {children}
    </div>
  );
}

/* ── buttons: the Button Example — a liquid pill with press feedback ── */
export function GlassButton({
  children,
  onClick,
  radius = 999,
  className = "",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  radius?: number;
  className?: string;
  style?: CSSProperties;
} & LegacyGlassProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative isolate inline-flex select-none items-center justify-center transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.96] ${className}`}
      style={{
        borderRadius: radius,
        background: "var(--glass-bg)",
        WebkitBackdropFilter: "blur(18px) saturate(170%)",
        backdropFilter: "blur(18px) saturate(170%)",
        border: "1px solid var(--glass-border)",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
        cursor: "pointer",
        ...style,
      }}
    >
      <GlassDecor radius={radius} />
      {children}
    </button>
  );
}
