"use client";

import type React from "react";

/* ------------------------------------------------------------------
   Aura atmosphere — Liquid Glass depth over a living film world:
   drifting aurora nebulae · cool cyan leak + warm film-burn leak ·
   godrays · animated 35mm grain · projector vignette
------------------------------------------------------------------- */
export function Aura() {
  return (
    <>
      <div className="aura-night" aria-hidden />
      <div className="aurora aurora-a" aria-hidden />
      <div className="aurora aurora-b" aria-hidden />
      <div className="aurora aurora-c" aria-hidden />
      <div className="aurora aurora-d" aria-hidden />
      <div className="leak leak-cy" aria-hidden />
      <div className="leak leak-bl" aria-hidden />
      <div className="godrays godrays-fx" aria-hidden />
      <div className="grain-layer !opacity-[0.045]" aria-hidden />
      <div className="vignette" aria-hidden />
    </>
  );
}

/* cursor-tracking specular highlight — sets --mx / --my on the glass */
export function trackSheen(e: React.MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}
