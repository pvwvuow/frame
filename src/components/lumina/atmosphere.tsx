"use client";

/* LUMINA atmosphere — obsidian field, aurora, beam, stars, grain, vignette */

const STARS = [
  { x: "6%",  y: "18%", s: 2.5, d: "3.4s", dl: "0s" },
  { x: "14%", y: "62%", s: 1.8, d: "4.2s", dl: "0.8s" },
  { x: "9%",  y: "84%", s: 2.2, d: "3.8s", dl: "1.6s" },
  { x: "24%", y: "34%", s: 1.5, d: "4.6s", dl: "0.3s" },
  { x: "31%", y: "74%", s: 2.6, d: "3.2s", dl: "2.1s" },
  { x: "38%", y: "12%", s: 1.7, d: "4.8s", dl: "1.2s" },
  { x: "46%", y: "88%", s: 2.0, d: "3.6s", dl: "0.5s" },
  { x: "55%", y: "8%",  s: 1.6, d: "4.4s", dl: "2.6s" },
  { x: "63%", y: "52%", s: 2.4, d: "3.9s", dl: "1.8s" },
  { x: "71%", y: "26%", s: 1.5, d: "4.1s", dl: "0.9s" },
  { x: "79%", y: "70%", s: 2.2, d: "3.5s", dl: "2.9s" },
  { x: "86%", y: "44%", s: 1.8, d: "4.7s", dl: "0.2s" },
  { x: "93%", y: "16%", s: 2.6, d: "3.3s", dl: "1.4s" },
  { x: "96%", y: "82%", s: 1.6, d: "4.9s", dl: "2.3s" },
];

export function Atmosphere() {
  return (
    <>
      <div className="lu-field" aria-hidden />
      <div className="lu-aurora" aria-hidden>
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="lu-beam" aria-hidden />
      {STARS.map((st, i) => (
        <span
          key={i}
          className="star"
          aria-hidden
          style={{ "--x": st.x, "--y": st.y, "--s": `${st.s}px`, "--d": st.d, "--dl": st.dl } as React.CSSProperties}
        />
      ))}
      <div className="grain-layer" aria-hidden />
      <div className="vignette" aria-hidden />
    </>
  );
}
