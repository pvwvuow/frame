"use client";

/* Atmosphere — Field Kit texture layers:
   animated 35mm grain, light leaks, projector vignette */

export function Atmosphere() {
  return (
    <>
      <div className="leak leak-tr" aria-hidden />
      <div className="leak leak-bl" aria-hidden />
      <div className="grain-layer" aria-hidden />
      <div className="vignette" aria-hidden />
    </>
  );
}

/* Camera viewfinder corner brackets */
export function Corners({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={className}>
      <span className="vf vf-tl" />
      <span className="vf vf-tr" />
      <span className="vf vf-bl" />
      <span className="vf vf-br" />
    </span>
  );
}
