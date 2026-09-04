"use client";

/* Atmosphere — Field Kit texture layers:
   warm darkroom field, projector beam, drifting dust,
   animated 35mm grain, light leaks, projector vignette */

const MOTES = [
  { x: "8%",  s: 3, d: 19, dl: 0,   o: 0.45, dx: "2.5vw" },
  { x: "16%", s: 2, d: 24, dl: 4.5, o: 0.35, dx: "-2vw" },
  { x: "24%", s: 4, d: 21, dl: 9,   o: 0.5,  dx: "3vw" },
  { x: "33%", s: 2, d: 26, dl: 2,   o: 0.3,  dx: "-3vw" },
  { x: "41%", s: 3, d: 18, dl: 12,  o: 0.45, dx: "2vw" },
  { x: "50%", s: 2, d: 23, dl: 6.5, o: 0.4,  dx: "-1.5vw" },
  { x: "58%", s: 4, d: 20, dl: 14,  o: 0.5,  dx: "2.5vw" },
  { x: "66%", s: 2, d: 25, dl: 1.5, o: 0.3,  dx: "-2.5vw" },
  { x: "74%", s: 3, d: 22, dl: 8,   o: 0.45, dx: "3vw" },
  { x: "83%", s: 2, d: 27, dl: 11,  o: 0.35, dx: "-2vw" },
  { x: "90%", s: 3, d: 20, dl: 5,   o: 0.5,  dx: "2vw" },
  { x: "96%", s: 2, d: 24, dl: 15,  o: 0.3,  dx: "-3vw" },
] as const;

export function Atmosphere() {
  return (
    <>
      <div className="dk-field" aria-hidden />
      <div className="dk-beam" aria-hidden />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="dust"
          aria-hidden
          style={
            {
              "--x": m.x,
              "--s": `${m.s}px`,
              "--d": `${m.d}s`,
              "--dl": `${m.dl}s`,
              "--o": m.o,
              "--dx": m.dx,
            } as React.CSSProperties
          }
        />
      ))}
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
