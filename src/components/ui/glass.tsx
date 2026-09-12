"use client";

/* v0.30.0 — the liquid-glass family (rdev/liquid-glass-react).
 *
 * ONE client-only wrapper around the library plus three tuned presets, so
 * every floating surface in Frame speaks the same Apple-style liquid-glass
 * language:
 *
 *   GlassBar    — rigid bars: the mobile bottom nav and its siblings
 *   GlassCard   — popups / modals: the library's "Card Example"
 *   GlassButton — pill buttons: the library's "Button Example"
 *
 * dynamic(ssr:false) because the library measures the DOM and tracks the
 * mouse on mount. Touch / coarse pointers and narrow viewports get a softer
 * displacement, lower aberration and NO elasticity — the liquid wobble is a
 * mouse affordance; on phones it would only burn GPU and smear text.
 *
 * The library renders `overflow:hidden` + its own border-radius, so
 * full-bleed children (modal media strips) clip correctly. A subtle dark
 * veil is added INSIDE each surface by the call sites (first child) to keep
 * text readable over bright posters — the raw glass alone is too clear for
 * UI text.
 */

import dynamic from "next/dynamic";
import type { CSSProperties, ComponentProps, ReactNode } from "react";
import type LiquidGlass from "liquid-glass-react";

type LGProps = ComponentProps<typeof LiquidGlass>;

const LiquidGlassClient = dynamic(() => import("liquid-glass-react"), { ssr: false });

/* touch/small screens: calmer glass (perf + readability) */
function tune(props: LGProps): LGProps {
  if (typeof window === "undefined") return props;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const small = window.matchMedia?.("(max-width: 1023px)")?.matches ?? false;
  if (!coarse && !small) return props;
  return {
    ...props,
    displacementScale: Math.min(props.displacementScale ?? 64, 32),
    aberrationIntensity: Math.min(props.aberrationIntensity ?? 2, 1),
    elasticity: 0,
  };
}

export function GlassSurface(props: LGProps) {
  const tuned = tune(props);
  return <LiquidGlassClient {...tuned}>{tuned.children}</LiquidGlassClient>;
}

/* ── bars: the bottom-nav family. Rigid (no wobble), wide, quiet glass. ── */
export function GlassBar({
  children,
  radius = 26,
  className,
  style,
}: {
  children: ReactNode;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <GlassSurface
      displacementScale={40}
      blurAmount={0.1}
      saturation={130}
      aberrationIntensity={1.2}
      elasticity={0}
      cornerRadius={radius}
      className={className}
      style={{ width: "100%", ...style }}
    >
      {children}
    </GlassSurface>
  );
}

/* ── cards: popups & modals (the Card Example) ── */
export function GlassCard({
  children,
  radius = 28,
  className,
  style,
  ...rest
}: LGProps & { radius?: number }) {
  return (
    <GlassSurface
      displacementScale={64}
      blurAmount={0.14}
      saturation={140}
      aberrationIntensity={2}
      elasticity={0}
      cornerRadius={radius}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </GlassSurface>
  );
}

/* ── buttons: the Button Example — a liquid pill with press wobble ── */
export function GlassButton({
  children,
  onClick,
  radius = 999,
  className,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <GlassSurface
      onClick={onClick}
      displacementScale={48}
      blurAmount={0.1}
      saturation={130}
      aberrationIntensity={1.5}
      elasticity={0.2}
      cornerRadius={radius}
      className={className}
      style={{ cursor: "pointer", ...style }}
    >
      {children}
    </GlassSurface>
  );
}
