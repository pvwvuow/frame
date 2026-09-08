"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * Darkroom COLLECTION share cards — 6 structures × 2 formats (post 1080²,
 * story 1080×1920). Same editorial system as the movie cards (hairlines,
 * hard grids, film motifs, Estedad / Vazirmatn / Frame Grotesk + Frame Mono)
 * but the subject is one of the user's own collections: poster collages,
 * contact sheets, reels, indexes. Pure inline styles (html-to-image friendly).
 */

import type { CSSProperties, ReactNode } from "react";
import {
  DR_FORMATS,
  DR_INK,
  DR_PAPER,
  DR_RED,
  faDigits,
  type DrCollectionData,
} from "@/lib/darkroom";

type S = CSSProperties;

const EST = '"Estedad","Vazirmatn",sans-serif';
const VAZ = '"Vazirmatn",sans-serif';
const GRO = '"Frame Grotesk","Vazirmatn",sans-serif';
const MONO = '"Frame Mono",monospace';

const mute = (a = 0.62): string => `rgba(244,242,236,${a})`;
const faint = (a = 0.4): string => `rgba(244,242,236,${a})`;
const line = (a = 0.14): string => `rgba(255,255,255,${a})`;

const LTR: S = { direction: "ltr", unicodeBidi: "isolate" };

const COPY = {
  fa: {
    kicker: "کالکشن",
    titles: (n: string) => `${n} عنوان`,
    movies: (n: string) => `${n} فیلم`,
    series: (n: string) => `${n} سریال`,
    more: (n: string) => `+${n}`,
    madeWith: "ساخته‌شده با فریم",
    frameDarkroom: "FRAME DARKROOM",
    no: "NO.",
    empty: "از لیست من",
  },
  en: {
    kicker: "Collection",
    titles: (n: string) => `${n} titles`,
    movies: (n: string) => `${n} films`,
    series: (n: string) => `${n} series`,
    more: (n: string) => `+${n}`,
    madeWith: "Made with Frame",
    frameDarkroom: "FRAME DARKROOM",
    no: "NO.",
    empty: "From My List",
  },
} as const;

function copyOf(d: DrCollectionData) {
  return COPY[d.lang];
}

const num = (d: DrCollectionData, v: number | string) => (d.lang === "fa" ? faDigits(v) : String(v));

function titleOf(d: DrCollectionData, i: number): string {
  const it = d.items[i];
  if (!it) return "";
  return d.lang === "fa" ? it.title || it.titleEn : it.titleEn || it.title;
}

/* ------------------------------------------------------------------ */
/* atoms                                                               */
/* ------------------------------------------------------------------ */
function Img({ src, style, pos }: { src: string; style?: S; pos?: string }) {
  return <img src={src} alt="" draggable={false} style={{ display: "block", objectFit: "cover", width: "100%", height: "100%", objectPosition: pos ?? "center", ...style }} />;
}

function Logo({ h = 64, style }: { h?: number; style?: S }) {
  return <img src="/darkroom/logo-lockup.png" alt="Frame" draggable={false} style={{ height: h, width: "auto", ...style }} />;
}

/** Brand corner: real logo, or the typographic red-square mark. */
function Brand({ d, faSize = 28, gap = 12 }: { d: DrCollectionData; faSize?: number; gap?: number }) {
  if (d.showLogo) return <Logo h={faSize * 1.9} />;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap }}>
      <span style={{ width: faSize * 0.55, height: faSize * 0.55, background: DR_RED, marginTop: faSize * 0.4 }} />
      <div>
        <div style={{ fontFamily: EST, fontWeight: 900, fontSize: faSize, lineHeight: 1 }}>
          {d.lang === "fa" ? (
            <>
              فریم<b style={{ color: DR_RED }}>.</b>
            </>
          ) : (
            <>
              fram<b style={{ color: DR_RED }}>e.</b>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ d, size = 56 }: { d: DrCollectionData; size?: number }) {
  if (d.avatarImage) {
    return <img src={d.avatarImage} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 0 2px rgba(255,255,255,.28), 0 10px 30px rgba(0,0,0,.5)", flexShrink: 0 }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: d.avatarGrad, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: EST, fontWeight: 900, fontSize: size * 0.42, color: "#fff", boxShadow: "inset 0 0 0 2px rgba(255,255,255,.26)", flexShrink: 0 }}>
      {d.userInitial}
    </span>
  );
}

/** Identity row: avatar + handle. */
function Identity({ d, size = 56 }: { d: DrCollectionData; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.34, minWidth: 0 }}>
      <Avatar d={d} size={size} />
      <span dir="auto" style={{ fontFamily: GRO, fontWeight: 600, fontSize: size * 0.44, color: "#fff", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {d.handle}
      </span>
    </div>
  );
}

/** Poster tile — falls back to a quiet placeholder when the slot is empty. */
function Tile({ d, i, style }: { d: DrCollectionData; i: number; style?: S }) {
  const it = d.items[i];
  if (!it) {
    return (
      <div style={{ position: "relative", background: "#101014", border: `1px solid ${line(0.09)}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", ...style }}>
        <span style={{ width: "22%", aspectRatio: "1 / 1", background: DR_RED, opacity: 0.85 }} />
      </div>
    );
  }
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "#101014", ...style }}>
      <Img src={it.poster} />
    </div>
  );
}

/** «+N» overflow tile (last grid cell when items don't fit). */
function MoreTile({ d, extra, style }: { d: DrCollectionData; extra: number; style?: S }) {
  if (extra <= 0) return <Tile d={d} i={-1} style={style} />;
  return (
    <div style={{ position: "relative", background: "linear-gradient(160deg,#141418,#0c0c0f)", border: `1.5px solid rgba(229,9,20,.55)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4%", overflow: "hidden", ...style }}>
      <span style={{ fontFamily: GRO, fontWeight: 700, fontSize: "38%", color: DR_RED, ...LTR }}>{copyOf(d).more(num(d, extra))}</span>
      <span style={{ fontFamily: VAZ, fontWeight: 500, fontSize: "15%", color: mute(0.55) }}>{copyOf(d).kicker}</span>
    </div>
  );
}

/** Footer strip: identity + made-with mark. */
function Footer({ d, pad, borderTop = true }: { d: DrCollectionData; pad: number; borderTop?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, borderTop: borderTop ? `1px solid ${line(0.15)}` : "none", paddingTop: pad * 0.42, width: "100%" }}>
      <Identity d={d} size={54} />
      <span style={{ fontFamily: MONO, fontSize: 15, letterSpacing: "0.3em", color: faint(0.55), ...LTR }}>
        {d.lang === "fa" ? "MADE WITH FRAME" : "FRAME · DARKROOM"}
      </span>
    </div>
  );
}

/** Meta chips row: count · movies · series. */
function Meta({ d, size = 20, color = mute(0.85) }: { d: DrCollectionData; size?: number; color?: string }) {
  const c = copyOf(d);
  const parts = [c.titles(num(d, d.totalCount || d.items.length))];
  if (d.movies) parts.push(c.movies(num(d, d.movies)));
  if (d.series) parts.push(c.series(num(d, d.series)));
  return (
    <div dir="auto" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: size * 0.7, fontFamily: d.lang === "en" ? GRO : VAZ, fontWeight: 500, fontSize: size, color }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: size * 0.7 }}>
          {i > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: DR_RED, flexShrink: 0 }} />}
          {p}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1 — SHEET (contact sheet: hairline grid of posters on ink)          */
/* ------------------------------------------------------------------ */
function Sheet({ d }: { d: DrCollectionData }) {
  const story = d.fmt === "story";
  const cols = 3;
  const rows = story ? 4 : 3;
  const slots = cols * rows;
  const c = copyOf(d);
  const pad = story ? 72 : 54;
  const gap = 5;
  const nameSize = story ? 78 : 56;

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      {/* hairline frame */}
      <div style={{ position: "absolute", inset: story ? 40 : 30, border: `1px solid ${line(0.13)}`, pointerEvents: "none", zIndex: 3 }} />

      <div style={{ position: "absolute", inset: 0, padding: `${pad}px ${pad + 14}px`, display: "flex", flexDirection: "column", zIndex: 2 }}>
        {/* head */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Brand d={d} faSize={story ? 30 : 24} />
          <div style={{ fontFamily: MONO, fontSize: story ? 14 : 11.5, lineHeight: 1.9, color: mute(), letterSpacing: "0.16em", textAlign: "end", ...LTR }}>
            <b style={{ color: DR_PAPER, fontWeight: 600 }}>{c.no} 07</b>
            <br />
            {c.frameDarkroom}
          </div>
        </div>

        {/* masthead */}
        <div style={{ marginTop: story ? 52 : 30, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 26, height: 3.5, background: DR_RED }} />
              <span style={{ fontFamily: VAZ, fontWeight: 700, fontSize: story ? 22 : 17, letterSpacing: d.lang === "en" ? "0.3em" : "0.14em", color: DR_RED }}>
                {c.kicker}
              </span>
            </div>
            <h1 dir="auto" style={{ margin: 0, marginTop: story ? 20 : 12, fontFamily: EST, fontWeight: 900, fontSize: nameSize, lineHeight: 1.12, color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {d.name}
            </h1>
          </div>
          <div style={{ fontFamily: GRO, fontWeight: 700, fontSize: story ? 30 : 22, color: faint(0.9), whiteSpace: "nowrap", paddingBottom: 8, ...LTR }}>
            {num(d, d.totalCount || d.items.length)}
            <span style={{ fontSize: "55%", color: faint() }}> /{d.lang === "fa" ? " عنوان" : " TITLES"}</span>
          </div>
        </div>

        {/* the sheet */}
        <div style={{ flex: 1, minHeight: 0, marginTop: story ? 46 : 28, display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)`, gap, marginBottom: story ? 46 : 28 }}>
          {Array.from({ length: slots }, (_, i) => {
            const extra = Math.max(0, (d.totalCount || d.items.length) - slots);
            const isLast = i === slots - 1;
            if (isLast && extra > 0) return <MoreTile key={i} d={d} extra={extra} style={{ borderRadius: 0 }} />;
            return <Tile key={i} d={d} i={i} style={{ borderRadius: 0 }} />;
          })}
        </div>

        <Footer d={d} pad={0} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2 — REEL (backdrop + filmstrip band across the middle)              */
/* ------------------------------------------------------------------ */
function Reel({ d }: { d: DrCollectionData }) {
  const story = d.fmt === "story";
  const c = copyOf(d);
  const n = story ? 4 : 4;
  const bandH = story ? 560 : 420;
  const perf = story ? 26 : 20;
  const pad = story ? 76 : 56;
  const backdrop = d.items[0]?.backdrop || "";

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      {backdrop ? <Img src={backdrop} style={{ position: "absolute", inset: 0, filter: "brightness(.42) saturate(1.05)" }} /> : null}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(8,8,10,.72) 0%,rgba(8,8,10,.32) 34%,rgba(8,8,10,.55) 62%,rgba(8,8,10,.94) 100%)" }} />

      <div style={{ position: "absolute", inset: 0, padding: `${pad}px ${pad + 12}px`, display: "flex", flexDirection: "column", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Brand d={d} faSize={story ? 30 : 24} />
          <span style={{ fontFamily: MONO, fontSize: story ? 14 : 11.5, letterSpacing: "0.3em", color: faint(0.6), ...LTR }}>{c.frameDarkroom}</span>
        </div>

        <div style={{ flex: story ? 0.62 : 0.5 }} />

        {/* masthead */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ width: 34, height: 4, background: DR_RED, flexShrink: 0 }} />
          <span style={{ fontFamily: VAZ, fontWeight: 700, fontSize: story ? 24 : 18, letterSpacing: d.lang === "en" ? "0.3em" : "0.14em", color: "#fff" }}>
            {c.kicker}
          </span>
        </div>
        <h1 dir="auto" style={{ margin: 0, marginTop: story ? 22 : 13, fontFamily: EST, fontWeight: 900, fontSize: story ? 86 : 60, lineHeight: 1.1, color: "#fff", textShadow: "0 4px 34px rgba(0,0,0,.65)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {d.name}
        </h1>
        <div style={{ marginTop: story ? 24 : 14 }}>
          <Meta d={d} size={story ? 24 : 19} />
        </div>
        {d.note.trim() !== "" && (
          <p dir="auto" style={{ margin: 0, marginTop: story ? 26 : 16, maxWidth: 780, fontSize: story ? 25 : 19, fontWeight: 500, lineHeight: 1.8, color: "#e8e6df", textShadow: "0 2px 22px rgba(0,0,0,.6)", display: "-webkit-box", WebkitLineClamp: story ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {d.note}
          </p>
        )}

        {/* filmstrip band */}
        <div style={{ marginTop: story ? 56 : 34, background: "#08080a", border: `1px solid ${line(0.12)}`, padding: `${perf * 0.62}px`, display: "flex", flexDirection: "column", gap: perf * 0.5 }}>
          {/* perforation row */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={`t${i}`} style={{ display: "block", width: perf * 1.35, height: perf * 0.82, borderRadius: 5, background: "#1b1b20", border: "1px solid rgba(255,255,255,.05)" }} />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${n},1fr)`, gap: 6, height: bandH }}>
            {Array.from({ length: n }, (_, i) => (
              <Tile key={i} d={d} i={i} style={{ borderRadius: 0 }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={`b${i}`} style={{ display: "block", width: perf * 1.35, height: perf * 0.82, borderRadius: 5, background: "#1b1b20", border: "1px solid rgba(255,255,255,.05)" }} />
            ))}
          </div>
        </div>

        <div style={{ flex: 0.5 }} />
        <Footer d={d} pad={story ? 26 : 18} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 — HERO (one hero poster + stats + mini grid)                      */
/* ------------------------------------------------------------------ */
function Hero({ d }: { d: DrCollectionData }) {
  const story = d.fmt === "story";
  const c = copyOf(d);
  const pad = story ? 76 : 56;
  const it = d.items[0];

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      <div style={{ position: "absolute", inset: 0, display: story ? "block" : "flex" }}>
        {/* hero poster */}
        <div style={story ? { position: "absolute", inset: 0, overflow: "hidden" } : { width: "46%", height: "100%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
          {it ? (
            <Img src={story ? it.backdrop || it.poster : it.poster} style={story ? { filter: "brightness(.5)" } : undefined} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#101014" }} />
          )}
          {/* scrim toward the content side */}
          <div style={{ position: "absolute", inset: 0, background: story
            ? "linear-gradient(180deg,rgba(10,10,12,.25) 0%,rgba(10,10,12,.1) 40%,rgba(10,10,12,.96) 88%)"
            : "linear-gradient(270deg,rgba(10,10,12,0) 30%,rgba(10,10,12,.55) 74%,rgba(10,10,12,.98) 100%)" }} />
        </div>

        {/* content */}
        <div style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: story ? `${pad}px ${pad + 10}px` : `56px ${pad + 10}px 52px ${pad + 10}px`,
          minHeight: 0,
          justifyContent: story ? "flex-end" : "flex-start",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Brand d={d} faSize={story ? 30 : 24} />
            <span style={{ fontFamily: MONO, fontSize: story ? 14 : 11.5, letterSpacing: "0.3em", color: faint(0.6), ...LTR }}>{c.frameDarkroom}</span>
          </div>

          <div style={{ flex: story ? 0 : 1, minHeight: story ? 420 : 0 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: story ? 0 : 26 }}>
            <span style={{ width: 26, height: 3.5, background: DR_RED }} />
            <span style={{ fontFamily: VAZ, fontWeight: 700, fontSize: story ? 22 : 17, letterSpacing: d.lang === "en" ? "0.3em" : "0.14em", color: DR_RED }}>
              {c.kicker}
            </span>
          </div>
          <h1 dir="auto" style={{ margin: 0, marginTop: story ? 18 : 13, fontFamily: EST, fontWeight: 900, fontSize: story ? 84 : 62, lineHeight: 1.1, color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textShadow: story ? "0 4px 34px rgba(0,0,0,.7)" : "none" }}>
            {d.name}
          </h1>

          {d.note.trim() !== "" && (
            <p dir="auto" style={{ margin: 0, marginTop: story ? 24 : 16, fontSize: story ? 25 : 19, fontWeight: 500, lineHeight: 1.8, color: "#e6e4dc", display: "-webkit-box", WebkitLineClamp: story ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {d.note}
            </p>
          )}

          {/* stats strip */}
          <div style={{ marginTop: story ? 34 : 22, display: "flex", border: `1px solid ${line(0.13)}`, width: "fit-content" }}>
            {[
              { v: num(d, d.totalCount || d.items.length), l: d.lang === "fa" ? "عنوان" : "titles" },
              { v: num(d, d.movies), l: d.lang === "fa" ? "فیلم" : "films" },
              { v: num(d, d.series), l: d.lang === "fa" ? "سریال" : "series" },
            ].map((s, i) => (
              <div key={i} style={{ padding: `${story ? 18 : 13}px ${story ? 34 : 24}px`, borderInlineStart: i ? `1px solid ${line(0.13)}` : "none", textAlign: "center" }}>
                <div style={{ fontFamily: GRO, fontWeight: 700, fontSize: story ? 34 : 26, lineHeight: 1, color: DR_PAPER, ...LTR }}>{s.v}</div>
                <div style={{ marginTop: 7, fontFamily: VAZ, fontWeight: 500, fontSize: story ? 15 : 12.5, color: mute() }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* mini grid */}
          <div style={{ marginTop: story ? 40 : 24, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, height: story ? 300 : 210, maxWidth: 640 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <Tile key={i} d={d} i={i + 1} style={{ borderRadius: 0 }} />
            ))}
          </div>

          <div style={{ marginTop: story ? 44 : 30 }}>
            <Footer d={d} pad={story ? 24 : 18} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — INDEX (editorial numbered list of the collection)               */
/* ------------------------------------------------------------------ */
function Index({ d }: { d: DrCollectionData }) {
  const story = d.fmt === "story";
  const c = copyOf(d);
  const pad = story ? 76 : 56;
  const rows = story ? 7 : 5;
  const list = d.items.slice(0, rows);

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      <div style={{ position: "absolute", inset: story ? 40 : 30, border: `1px solid ${line(0.13)}`, pointerEvents: "none", zIndex: 3 }} />
      <div style={{ position: "absolute", inset: 0, padding: `${story ? 74 : 54}px ${pad + 16}px`, display: "flex", flexDirection: "column", zIndex: 2 }}>
        {/* masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Brand d={d} faSize={story ? 29 : 23} />
          <span style={{ fontFamily: MONO, fontSize: story ? 14 : 11.5, letterSpacing: "0.3em", color: faint(0.6), ...LTR }}>{c.frameDarkroom}</span>
        </div>

        <div style={{ marginTop: story ? 48 : 30, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20 }}>
          <h1 dir="auto" style={{ margin: 0, fontFamily: EST, fontWeight: 900, fontSize: story ? 76 : 54, lineHeight: 1.1, color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {d.name}
          </h1>
        </div>
        <div style={{ marginTop: story ? 22 : 13, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Meta d={d} size={story ? 23 : 18} />
          <span style={{ fontFamily: VAZ, fontWeight: 700, fontSize: story ? 21 : 16, color: DR_RED, letterSpacing: d.lang === "en" ? "0.24em" : "0.1em" }}>
            {c.kicker}
          </span>
        </div>
        {d.note.trim() !== "" && (
          <p dir="auto" style={{ margin: 0, marginTop: story ? 20 : 12, fontSize: story ? 23 : 17.5, fontWeight: 500, lineHeight: 1.75, color: mute(0.92), display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {d.note}
          </p>
        )}

        {/* the list */}
        <div style={{ flex: 1, minHeight: 0, marginTop: story ? 36 : 24, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
          {list.map((it, i) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: story ? 26 : 20, borderTop: i ? `1px solid ${line(0.11)}` : "none", padding: `${story ? 15 : 10}px 0` }}>
              <span style={{ fontFamily: GRO, fontWeight: 700, fontSize: story ? 30 : 23, color: DR_RED, width: story ? 62 : 48, flexShrink: 0, ...LTR }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <Tile d={d} i={i} style={{ width: story ? 64 : 50, aspectRatio: "2 / 3", borderRadius: 0, flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span dir="auto" style={{ display: "block", fontFamily: d.lang === "en" ? GRO : VAZ, fontWeight: 700, fontSize: story ? 27 : 21, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {titleOf(d, i)}
                </span>
                <span dir="auto" style={{ display: "block", marginTop: 5, fontFamily: d.lang === "en" ? VAZ : GRO, fontWeight: 500, fontSize: story ? 17 : 14, color: faint(0.75) }}>
                  {num(d, it.year)} · {it.type === "series" ? (d.lang === "fa" ? "سریال" : "Series") : d.lang === "fa" ? "فیلم" : "Film"}
                </span>
              </span>
            </div>
          ))}
        </div>

        <Footer d={d} pad={story ? 22 : 16} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5 — MOSAIC (full-bleed poster wall + centered masthead)             */
/* ------------------------------------------------------------------ */
function Mosaic({ d }: { d: DrCollectionData }) {
  const story = d.fmt === "story";
  const c = copyOf(d);
  const cols = 2;
  const rows = story ? 3 : 2;
  const slots = cols * rows;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#08080a" }}>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)`, gap: 4 }}>
        {Array.from({ length: slots }, (_, i) => (
          <Tile key={i} d={d} i={i} />
        ))}
      </div>
      {/* scrims */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(72% 58% at 50% 46%,rgba(5,5,7,.9) 0%,rgba(5,5,7,.72) 46%,rgba(5,5,7,.3) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(5,5,7,.6) 0%,rgba(5,5,7,0) 26%,rgba(5,5,7,0) 62%,rgba(5,5,7,.85) 100%)" }} />

      <div style={{ position: "absolute", inset: 0, padding: `${story ? 80 : 58}px ${story ? 86 : 64}px`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", zIndex: 2 }}>
        {d.showLogo ? <Logo h={story ? 58 : 44} /> : <Brand d={d} faSize={26} />}

        <div style={{ flex: story ? 0.9 : 0.72 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ width: 44, height: 2.5, background: DR_RED }} />
          <span style={{ fontFamily: VAZ, fontWeight: 700, fontSize: story ? 25 : 19, letterSpacing: d.lang === "en" ? "0.42em" : "0.2em", textIndent: d.lang === "en" ? "0.42em" : "0.2em", color: DR_RED }}>
            {c.kicker}
          </span>
          <span style={{ width: 44, height: 2.5, background: DR_RED }} />
        </div>
        <h1 dir="auto" style={{ margin: 0, marginTop: story ? 30 : 18, maxWidth: 880, fontFamily: EST, fontWeight: 900, fontSize: story ? 96 : 68, lineHeight: 1.12, color: "#fff", textShadow: "0 6px 44px rgba(0,0,0,.75)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {d.name}
        </h1>
        {d.note.trim() !== "" && (
          <p dir="auto" style={{ margin: 0, marginTop: story ? 28 : 17, maxWidth: 720, fontSize: story ? 26 : 20, fontWeight: 500, lineHeight: 1.85, color: "#eceae3", textShadow: "0 2px 26px rgba(0,0,0,.7)", display: "-webkit-box", WebkitLineClamp: story ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {d.note}
          </p>
        )}
        <div style={{ marginTop: story ? 34 : 20 }}>
          <Meta d={d} size={story ? 24 : 19} color="rgba(255,255,255,.92)" />
        </div>

        <div style={{ flex: story ? 1 : 0.72 }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: story ? 22 : 15, width: "100%" }}>
          <Identity d={d} size={story ? 66 : 52} />
          <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: `1px solid ${line(0.18)}`, paddingTop: story ? 20 : 13, width: "100%", justifyContent: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: story ? 14 : 11, letterSpacing: "0.32em", color: faint(0.6), ...LTR }}>
              {d.lang === "fa" ? "MADE WITH FRAME" : "FRAME · DARKROOM"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — SLATE (clapperboard: stripes + stats + poster row)              */
/* ------------------------------------------------------------------ */
function Slate({ d }: { d: DrCollectionData }) {
  const story = d.fmt === "story";
  const c = copyOf(d);
  const pad = story ? 76 : 56;

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      <div style={{ position: "absolute", inset: 0, padding: `${pad}px ${pad + 12}px`, display: "flex", flexDirection: "column" }}>
        {/* clapper stripes */}
        <div style={{ border: `1px solid ${line(0.16)}`, padding: 10, display: "flex", gap: 10 }}>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ flex: 1, height: story ? 52 : 38, background: i % 2 ? DR_PAPER : "#0b0b0d", transform: "skewX(-18deg)" }} />
          ))}
        </div>

        {/* head row on the board */}
        <div style={{ marginTop: story ? 40 : 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Brand d={d} faSize={story ? 29 : 23} />
          <span style={{ fontFamily: MONO, fontSize: story ? 14 : 11.5, letterSpacing: "0.26em", color: faint(0.6), ...LTR }}>{c.frameDarkroom}</span>
        </div>

        <div style={{ flex: story ? 0.42 : 0.3 }} />

        <span style={{ fontFamily: VAZ, fontWeight: 700, fontSize: story ? 23 : 18, letterSpacing: d.lang === "en" ? "0.34em" : "0.16em", color: DR_RED }}>
          {c.kicker}
        </span>
        <h1 dir="auto" style={{ margin: 0, marginTop: story ? 20 : 12, fontFamily: EST, fontWeight: 900, fontSize: story ? 88 : 62, lineHeight: 1.1, color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {d.name}
        </h1>
        {d.note.trim() !== "" && (
          <p dir="auto" style={{ margin: 0, marginTop: story ? 26 : 15, maxWidth: 800, fontSize: story ? 25 : 19, fontWeight: 500, lineHeight: 1.8, color: mute(0.92), display: "-webkit-box", WebkitLineClamp: story ? 3 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {d.note}
          </p>
        )}

        {/* stats */}
        <div style={{ marginTop: story ? 44 : 26, display: "grid", gridTemplateColumns: "repeat(3,1fr)", border: `1px solid ${line(0.14)}` }}>
          {[
            { v: num(d, d.totalCount || d.items.length), l: d.lang === "fa" ? "عنوان" : "titles" },
            { v: num(d, d.movies), l: d.lang === "fa" ? "فیلم" : "films" },
            { v: num(d, d.series), l: d.lang === "fa" ? "سریال" : "series" },
          ].map((s, i) => (
            <div key={i} style={{ padding: `${story ? 24 : 16}px 12px`, borderInlineStart: i ? `1px solid ${line(0.14)}` : "none", textAlign: "center" }}>
              <div style={{ fontFamily: GRO, fontWeight: 700, fontSize: story ? 44 : 34, lineHeight: 1, color: DR_PAPER, ...LTR }}>{s.v}</div>
              <div style={{ marginTop: 9, fontFamily: VAZ, fontWeight: 500, fontSize: story ? 17 : 14, color: mute() }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* poster row */}
        <div style={{ marginTop: story ? 48 : 28, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7, height: story ? 460 : 330 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Tile key={i} d={d} i={i} style={{ borderRadius: 0, border: `1px solid ${line(0.1)}` }} />
          ))}
        </div>

        <div style={{ flex: story ? 0.58 : 0.4 }} />
        <Footer d={d} pad={story ? 24 : 16} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* card view                                                           */
/* ------------------------------------------------------------------ */
export function DrCollectionCardView({ d }: { d: DrCollectionData }) {
  const f = DR_FORMATS.find((x) => x.id === d.fmt) ?? DR_FORMATS[0];
  return (
    <div
      dir={d.lang === "fa" ? "rtl" : "ltr"}
      style={{ position: "relative", width: f.w, height: f.h, overflow: "hidden", background: DR_INK, color: DR_PAPER, fontFamily: VAZ }}
    >
      {d.tpl === "sheet" && <Sheet d={d} />}
      {d.tpl === "reel" && <Reel d={d} />}
      {d.tpl === "hero" && <Hero d={d} />}
      {d.tpl === "index" && <Index d={d} />}
      {d.tpl === "mosaic" && <Mosaic d={d} />}
      {d.tpl === "slate" && <Slate d={d} />}
    </div>
  );
}
