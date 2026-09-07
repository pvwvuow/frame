"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * Darkroom share cards — 7 structures × 2 formats (post 1080², story 1080×1920).
 * Pure inline-style renders (html-to-image friendly). All typography follows
 * the approved v2 editorial system: hairlines, hard grids, film motifs,
 * Estedad display / Vazirmatn body / Frame Grotesk + Frame Mono latin.
 */

import type { CSSProperties, ReactNode } from "react";
import {
  DR_FORMATS,
  DR_INK,
  DR_PANEL,
  DR_PAPER,
  DR_RED,
  durationLabel,
  faDigits,
  genresOf,
  scoreText,
  whenLabels,
  type DrCardData,
} from "@/lib/darkroom";

type S = CSSProperties;

/* ------------------------------------------------------------------ */
/* shared tokens                                                       */
/* ------------------------------------------------------------------ */
const EST = '"Estedad","Vazirmatn",sans-serif';
const VAZ = '"Vazirmatn",sans-serif';
const GRO = '"Frame Grotesk","Vazirmatn",sans-serif';
const MONO = '"Frame Mono",monospace';

const mute = (a = 0.62): string => `rgba(244,242,236,${a})`;
const faint = (a = 0.4): string => `rgba(244,242,236,${a})`;
const line = (a = 0.14): string => `rgba(255,255,255,${a})`;

/** LTR island inside RTL flow (latin names, mono codes). */
const LTR: S = { direction: "ltr", unicodeBidi: "isolate" };

/* ------------------------------------------------------------------ */
/* per-language copy                                                    */
/* ------------------------------------------------------------------ */
const COPY = {
  fa: {
    review: "نظر من",
    final: "حرف نهایی",
    score: "امتیاز من — از ۱۰",
    scoreShort: "امتیاز من",
    director: "کارگردان",
    genre: "ژانر",
    country: "محصول",
    yearL: "سال",
    status: "وضعیت",
    watched: "تماشا شد",
    watchedAt: (w: string) => `تماشا: ${w}`,
    madeWith: "ساخته‌شده با فریم",
    frameDarkroom: "FRAME DARKROOM",
    ticket: "بلیت تماشا",
    darkroomMast: "تاریکخانه",
    vol: "جلد ۱ / تماشا‌شده",
    statusWatched: (w: string) => `تماشا شد — ${w}`,
  },
  en: {
    review: "My Review",
    final: "Final Words",
    score: "My Rating — Out of 10",
    scoreShort: "My Rating",
    director: "Director",
    genre: "Genre",
    country: "Country",
    yearL: "Year",
    status: "Status",
    watched: "Watched",
    watchedAt: (w: string) => `Watched ${w}`,
    madeWith: "Made with Frame",
    frameDarkroom: "FRAME DARKROOM",
    ticket: "Ticket",
    darkroomMast: "Darkroom.",
    vol: "Vol. 1 / Watched",
    statusWatched: (w: string) => `Watched — ${w}`,
  },
} as const;

function copyOf(d: DrCardData) {
  return COPY[d.lang];
}

/** Primary/secondary title pair for the active language. */
function titlesOf(d: DrCardData) {
  const fa = d.title.title || d.title.titleEn;
  const en = d.title.titleEn || d.title.title;
  return d.lang === "fa" ? { main: fa, sub: en, mainDir: "rtl" as const, subDir: "ltr" as const } : { main: en, sub: fa, mainDir: "ltr" as const, subDir: "rtl" as const };
}

function quoteMarks(d: DrCardData) {
  return d.lang === "fa" ? { o: "«", c: "»" } : { o: "“", c: "”" };
}

/* ------------------------------------------------------------------ */
/* atoms                                                               */
/* ------------------------------------------------------------------ */
function Img({ src, style, pos }: { src: string; style?: S; pos?: string }) {
  return <img src={src} alt="" draggable={false} style={{ display: "block", objectFit: "cover", width: "100%", height: "100%", objectPosition: pos ?? "center", ...style }} />;
}

/** 10 score cells (editorial idiom of the whole system). */
function Cells({ score, size = 19, gap = 5, color = DR_RED, border = faint(0.55) }: { score: number; size?: number; gap?: number; color?: string; border?: string }) {
  const items: ReactNode[] = [];
  for (let i = 0; i < 10; i++) {
    const on = i < Math.round(score);
    items.push(
      <i key={i} style={{ display: "block", width: size, height: size, background: on ? color : "transparent", border: on ? "none" : `1px solid ${border}` }} />
    );
  }
  return <div style={{ display: "flex", gap }}>{items}</div>;
}

function Star({ fill, size, color }: { fill: number; size: number; color: string }) {
  // fill: 0 | .5 | 1
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  const path = "M12 2.6l2.75 5.93 6.5.68-4.85 4.37 1.37 6.4L12 16.75 6.23 19.98 7.6 13.58 2.75 9.21l6.5-.68L12 2.6z";
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.4" />
      </svg>
      {pct > 0 && (
        <svg viewBox="0 0 24 24" width={size} height={size} style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
          <path d={path} fill={color} />
        </svg>
      )}
    </span>
  );
}

function Stars({ score, size = 48, gap = 8, color = DR_RED }: { score: number; size?: number; gap?: number; color?: string }) {
  const units = score / 2; // 0..5 in half steps
  return (
    <div style={{ display: "flex", gap, direction: "ltr" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} color={color} fill={units >= i + 1 ? 1 : units >= i + 0.5 ? 0.5 : 0} />
      ))}
    </div>
  );
}

/** Real Frame logo lockup (alpha-keyed, from the official artwork). */
function Logo({ h = 64, style }: { h?: number; style?: S }) {
  return <img src="/darkroom/logo-lockup.png" alt="Frame" draggable={false} style={{ height: h, width: "auto", ...style }} />;
}

/** Brand corner: real logo (or the typographic red-square mark when off). */
function Brand({ d, faSize = 29, gap = 12, enSub = true }: { d: DrCardData; faSize?: number; gap?: number; enSub?: boolean }) {
  if (d.showLogo) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: gap * 0.9 }}>
        <Logo h={faSize * 1.9} />
      </div>
    );
  }
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
        {enSub && <div style={{ fontFamily: MONO, fontSize: faSize * 0.42, letterSpacing: "0.42em", color: faint(), marginTop: faSize * 0.32, ...LTR }}>DARKROOM</div>}
      </div>
    </div>
  );
}

/** Open clapper glyph (Spotlight meta row). */
function ClapperGlyph({ size = 40, color = DR_RED }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <g fill="none" stroke={color} strokeWidth="1.7" strokeLinejoin="round">
        <path d="M3.5 10.5h17V19a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 19v-8.5z" fill="rgba(229,9,20,.16)" />
        <path d="M3.7 9.9 20.2 5.8l-.75-2.55a1 1 0 0 0-1.22-.68L4.6 6.4a1 1 0 0 0-.7 1.22L3.7 9.9z" />
        <path d="m7.6 8.9 1.5-3.4M12.1 7.75l1.5-3.4M16.6 6.6l1.5-3.4" strokeWidth="1.4" />
        <path d="m10.6 13.4 4.4 2.3-4.4 2.3v-4.6z" fill={color} stroke="none" />
      </g>
    </svg>
  );
}

function Q({ d, children, style }: { d: DrCardData; children: ReactNode; style?: S }) {
  const q = quoteMarks(d);
  return (
    <p dir="auto" style={{ margin: 0, ...style }}>
      <span style={{ color: DR_RED }}>{q.o}</span> {children} <span style={{ color: DR_RED }}>{q.c}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* 1 — SPOTLIGHT (the user's cinematic template)                        */
/* ------------------------------------------------------------------ */
function Spotlight({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const mainSize = story ? 94 : 56;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#050507" }}>
      <Img src={d.title.backdrop} style={{ position: "absolute", inset: 0, filter: story ? "brightness(.48) saturate(1.06)" : "brightness(.42) saturate(1.05)" }} />
      {/* cinematic vignette + brand-red glow */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,.12) 20%,rgba(0,0,0,.16) 55%,rgba(0,0,0,.78) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(78% 60% at 50% 42%,rgba(0,0,0,0) 40%,rgba(0,0,0,.5) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(52% 34% at 14% 92%,rgba(229,9,20,.26),transparent 72%)` }} />

      <div style={{ position: "absolute", inset: 0, padding: story ? "56px 68px 60px" : "42px 58px 46px", display: "flex", flexDirection: "column", zIndex: 2 }}>
        {/* header — logo lockup + darkroom wordmark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {d.showLogo ? <Logo h={story ? 62 : 50} /> : <Brand d={d} faSize={story ? 30 : 25} enSub={false} />}
          <div style={{ fontFamily: GRO, fontWeight: 700, fontSize: story ? 40 : 30, letterSpacing: "0.14em", ...LTR }}>
            <span style={{ color: "#fff" }}>dark</span>
            <span style={{ color: DR_RED }}>room</span>
          </div>
        </div>

        <div style={{ flex: story ? 1 : 0.62 }} />

        {/* centered poster card */}
        <div
          style={{
            alignSelf: "center",
            width: story ? 462 : 306,
            height: story ? 693 : 459,
            borderRadius: story ? 30 : 22,
            overflow: "hidden",
            border: "1.5px solid rgba(229,9,20,.55)",
            boxShadow: "0 34px 90px rgba(0,0,0,.6), 0 0 70px rgba(229,9,20,.16)",
            flexShrink: 0,
          }}
        >
          <Img src={d.title.poster} />
        </div>

        {/* identity */}
        <div style={{ marginTop: story ? 52 : 34, display: "flex", alignItems: "center", gap: story ? 22 : 16 }}>
          <span
            style={{
              width: story ? 92 : 64,
              height: story ? 92 : 64,
              borderRadius: "50%",
              background: d.avatarGrad,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: EST,
              fontWeight: 900,
              fontSize: story ? 40 : 28,
              color: "#fff",
              boxShadow: "inset 0 0 0 2px rgba(255,255,255,.28)",
              flexShrink: 0,
            }}
          >
            {d.userInitial}
          </span>
          <div>
            <div dir="auto" style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 31 : 24, color: "#fff", letterSpacing: "0.02em" }}>
              {d.handle}
            </div>
            <div style={{ marginTop: story ? 12 : 8, display: "flex", alignItems: "center", gap: story ? 16 : 12 }}>
              <Stars score={d.score} size={story ? 44 : 32} gap={story ? 8 : 6} />
              <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 28 : 21, color: "#fff" }}>
                {(d.score / 2).toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        {/* review */}
        {d.comment.trim() !== "" && (
          <p
            dir="auto"
            style={{
              margin: 0,
              marginTop: story ? 38 : 24,
              fontSize: story ? 29 : 23,
              fontWeight: 500,
              lineHeight: 1.85,
              color: "#ecebe6",
              textShadow: "0 2px 24px rgba(0,0,0,.55)",
            }}
          >
            {d.comment}
          </p>
        )}

        <div style={{ flex: story ? 1 : 0.5 }} />

        {/* meta — clapper + title/year | pills */}
        <div style={{ borderTop: `1px solid ${line(0.16)}`, paddingTop: story ? 30 : 22, display: "flex", alignItems: "center", gap: story ? 26 : 18 }}>
          <ClapperGlyph size={story ? 46 : 36} />
          <div style={{ minWidth: 0 }}>
            <div dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: mainSize * 0.34, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.main}
            </div>
            <div style={{ fontFamily: GRO, fontWeight: 500, fontSize: story ? 22 : 17, color: mute(0.75), marginTop: 4, ...LTR }}>
              {d.title.year}
              {d.title.type === "series" ? ` · ${d.lang === "fa" ? "سریال" : "SERIES"}` : ""}
            </div>
          </div>
          <div style={{ width: 1, height: story ? 46 : 36, background: line(0.2), marginInlineStart: "auto" }} />
          <div style={{ display: "flex", gap: story ? 12 : 9, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {genres.slice(0, 3).map((g) => (
              <span
                key={g}
                dir="auto"
                style={{
                  border: "1px solid rgba(255,255,255,.3)",
                  borderRadius: 999,
                  padding: story ? "10px 24px" : "7px 16px",
                  fontSize: story ? 20 : 15,
                  fontWeight: 600,
                  color: "#fff",
                  fontFamily: d.lang === "en" ? GRO : VAZ,
                  whiteSpace: "nowrap",
                }}
              >
                {g}
              </span>
            ))}
          </div>
        </div>
        {/* watch stamp */}
        <div style={{ marginTop: story ? 22 : 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: VAZ, fontWeight: 500, fontSize: story ? 18 : 14, color: faint(0.75) }}>
            {d.lang === "fa" ? c.watchedAt(w.fa) : c.watchedAt(w.en)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: story ? 13 : 11, letterSpacing: "0.3em", color: faint(0.55), ...LTR }}>
            {d.lang === "fa" ? "MADE WITH FRAME" : "FRAME · DARKROOM"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2 — STRIP (refined v0 DNA: full backdrop + perforated right rail)    */
/* ------------------------------------------------------------------ */
function Strip({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const dur = durationLabel(d.title.duration, d.lang);
  const railW = story ? 84 : 62;
  const cellW = story ? 34 : 25;
  const cellH = story ? 48 : 35;

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      <Img src={d.title.backdrop} style={{ position: "absolute", inset: 0, filter: "brightness(.6) saturate(1.05) contrast(1.02)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,10,12,.34) 0%,rgba(10,10,12,.5) 42%,rgba(10,10,12,.93) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(270deg,rgba(10,10,12,.52) 0%,rgba(10,10,12,0) 34%)" }} />

      {/* the strip — solid rail + true perforations */}
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: railW, background: "#08080a", borderLeft: `1px solid ${line()}`, display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center", zIndex: 3 }}>
        {Array.from({ length: story ? 22 : 13 }).map((_, i) => (
          <i key={i} style={{ display: "block", width: cellW, height: cellH, borderRadius: 6, background: "#1a1a1e", border: "1px solid rgba(255,255,255,.055)" }} />
        ))}
      </div>

      <div style={{ position: "absolute", inset: 0, padding: story ? "72px 150px 56px 80px" : "46px 126px 44px 60px", display: "flex", flexDirection: "column", zIndex: 2 }}>
        {/* head */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Brand d={d} faSize={story ? 31 : 24} />
          <div style={{ fontFamily: MONO, fontSize: story ? 13 : 11, lineHeight: 1.9, color: mute(), letterSpacing: "0.14em", textAlign: "end", ...LTR }}>
            <b style={{ color: DR_PAPER, fontWeight: 600 }}>NO. {d.no}</b> — {d.lang === "fa" ? w.faYear : w.enYear}
            <br />
            {c.frameDarkroom}
          </div>
        </div>

        {/* hero */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: story ? 50 : 26, gap: 24 }}>
          <div style={{ maxWidth: story ? 560 : 520, paddingTop: 6 }}>
            <h1 dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 92 : 60, lineHeight: 1.06, letterSpacing: "-0.5px", margin: 0, textAlign: "start" }}>
              {t.main}
            </h1>
            <div style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 24 : 17, letterSpacing: "0.24em", color: mute(), marginTop: story ? 16 : 10, ...LTR }}>
              {t.sub} · {d.title.year}
            </div>
            <div style={{ width: story ? 62 : 44, height: story ? 4 : 3, background: DR_RED, marginTop: story ? 22 : 14 }} />
            <div dir="auto" style={{ marginTop: story ? 18 : 12, fontSize: story ? 21 : 16, fontWeight: 500, color: mute(), lineHeight: 1.8 }}>
              {d.title.director ? (
                <>
                  {c.director} <b style={{ color: DR_PAPER, fontWeight: 700 }}>{d.title.director}</b>
                </>
              ) : null}
              {genres.length ? ` · ${genres.join(d.lang === "fa" ? "، " : " · ")}` : ""}
              {dur ? ` · ${dur}` : ""}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: story ? 24 : 16, marginTop: story ? 40 : 22 }}>
              <div style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 84 : 52, lineHeight: 1, letterSpacing: "-0.02em", ...LTR }}>{scoreText(d.score)}</div>
              <div>
                <div style={{ fontSize: story ? 16 : 13, fontWeight: 500, color: faint(), marginTop: story ? 4 : 2 }}>{c.score}</div>
                <div style={{ marginTop: story ? 12 : 8 }}>
                  <Cells score={d.score} size={story ? 19 : 13} gap={story ? 5 : 3.5} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ position: "relative", width: story ? 300 : 232, height: story ? 450 : 348, flexShrink: 0, outline: "1px solid rgba(255,255,255,.24)", outlineOffset: -1 }}>
            <Img src={d.title.poster} />
            <span style={{ position: "absolute", top: 0, left: 0, background: DR_INK, color: DR_PAPER, fontFamily: MONO, fontSize: story ? 12 : 10, letterSpacing: "0.3em", padding: story ? "8px 12px 7px 16px" : "6px 9px 5px 13px", ...LTR }}>
              {c.watched}
            </span>
          </div>
        </div>

        {/* review + final anchored to the bottom */}
        <div style={{ marginTop: "auto", paddingTop: story ? 40 : 22 }}>
          {d.comment.trim() !== "" && (
            <>
              <div style={{ fontFamily: EST, fontWeight: 700, fontSize: story ? 17 : 13, color: DR_RED, marginBottom: story ? 12 : 8 }}>{c.review}</div>
              <p dir="auto" style={{ margin: 0, fontSize: story ? 28 : 21, fontWeight: 500, lineHeight: 1.9, color: "#eae7e0", maxWidth: story ? 866 : 830 }}>
                {d.comment}
              </p>
            </>
          )}
          {d.finalWords.trim() !== "" && (
            <div style={{ marginTop: story ? 34 : 20 }}>
              <Q d={d} style={{ fontFamily: EST, fontWeight: 700, fontSize: story ? 41 : 27, lineHeight: 1.55 }}>
                {d.finalWords}
              </Q>
            </div>
          )}
        </div>

        {/* foot */}
        <div style={{ marginTop: story ? 36 : 22, borderTop: `1px solid ${line()}`, paddingTop: story ? 20 : 14, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: story ? 17 : 14, letterSpacing: "0.06em", ...LTR, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 9, height: 9, background: DR_RED, display: "inline-block" }} />
            {d.handle}
          </div>
          <div style={{ fontSize: story ? 15 : 12, fontWeight: 500, color: faint(), display: "flex", alignItems: "baseline", gap: 18 }}>
            <span>{d.lang === "fa" ? c.watchedAt(w.fa) : c.watchedAt(w.en)}</span>
            <span style={{ fontFamily: MONO, fontSize: story ? 12 : 10, letterSpacing: "0.2em", color: faint(), ...LTR }}>MADE WITH FRAME</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3 — TYPE POSTER (A24 billing-block)                                  */
/* ------------------------------------------------------------------ */
function TypePoster({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const directorLatin = d.title.director;

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK }}>
      <Img src={d.title.backdrop} style={{ position: "absolute", inset: 0, filter: "brightness(.58) saturate(1.08) contrast(1.03)" }} />
      <div style={{ position: "absolute", inset: 0, background: story ? "linear-gradient(180deg,rgba(10,10,12,.44) 0%,rgba(10,10,12,.08) 26%,rgba(10,10,12,.1) 48%,rgba(10,10,12,.64) 74%,rgba(10,10,12,.94) 100%)" : "linear-gradient(180deg,rgba(10,10,12,.5) 0%,rgba(10,10,12,.14) 34%,rgba(10,10,12,.66) 72%,rgba(10,10,12,.95) 100%)" }} />

      <div style={{ position: "absolute", inset: 0, padding: story ? "66px 78px 56px" : "44px 60px 42px", display: "flex", flexDirection: "column", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Brand d={d} faSize={story ? 29 : 23} enSub={false} />
          <div style={{ fontFamily: MONO, fontSize: story ? 13 : 11, letterSpacing: "0.4em", color: mute(), textAlign: "end", ...LTR, lineHeight: 2 }}>
            <b style={{ color: DR_PAPER, fontWeight: 600 }}>FRAME DARKROOM</b>
            <br />
            NO.{d.no} — {d.lang === "fa" ? w.faYear : w.enYear}
          </div>
        </div>

        {/* poster stamp — top corner, straight, hairline */}
        <div style={{ position: "absolute", top: story ? 176 : 138, left: story ? 78 : 60, width: story ? 252 : 188, height: story ? 378 : 282, outline: "1px solid rgba(255,255,255,.3)", outlineOffset: 8 }}>
          <Img src={d.title.poster} />
        </div>

        <div style={{ flex: story ? 1 : 0.55 }} />

        {d.comment.trim() !== "" && (
          <div style={{ maxWidth: story ? 840 : 850, marginInlineStart: "auto", marginBottom: story ? 48 : 26 }}>
            <div style={{ fontFamily: MONO, fontSize: story ? 13 : 11, letterSpacing: "0.34em", color: DR_RED, fontWeight: 600, marginBottom: story ? 16 : 10, textAlign: "end", ...LTR }}>
              {d.lang === "fa" ? `REVIEW / ${c.review}` : "REVIEW"}
            </div>
            <p dir="auto" style={{ margin: 0, fontSize: story ? 29 : 23, fontWeight: 500, lineHeight: 1.95, color: "#efede6", textShadow: "0 2px 26px rgba(0,0,0,.6)" }}>
              {d.comment}
            </p>
          </div>
        )}

        {/* billing block */}
        <div style={{ borderTop: `1px solid ${line(0.16)}`, paddingTop: story ? 40 : 26 }}>
          {directorLatin && (
            <div style={{ fontFamily: MONO, fontSize: story ? 17 : 13, letterSpacing: "0.32em", color: mute(), textAlign: "end", ...LTR }}>
              {d.lang === "fa" ? "A FILM BY" : "A FILM BY"} {directorLatin.toUpperCase()}
            </div>
          )}
          <h1 dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 122 : 66, lineHeight: 1.08, margin: 0, marginTop: story ? 14 : 10, letterSpacing: "-1px", textAlign: "start" }}>
            {t.main}
          </h1>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: story ? 12 : 8 }}>
            <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 27 : 19, letterSpacing: "0.26em", color: mute(), ...LTR }}>
              {t.sub}
            </span>
            <span style={{ fontFamily: GRO, fontWeight: 500, fontSize: story ? 23 : 16, color: faint(), letterSpacing: "0.14em", ...LTR }}>
              {d.title.year}
              {d.title.duration ? ` · ${d.title.duration} MIN` : ""}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: story ? 46 : 26 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: story ? 18 : 12 }}>
              <div style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 114 : 62, lineHeight: 0.9, letterSpacing: "-0.02em", ...LTR }}>{scoreText(d.score)}</div>
              <div style={{ fontFamily: GRO, fontWeight: 500, fontSize: story ? 29 : 18, color: faint(), marginTop: story ? 8 : 4, ...LTR }}>/10</div>
            </div>
            <div>
              <div style={{ fontSize: story ? 17 : 13, fontWeight: 700, color: mute(), marginBottom: story ? 14 : 8, textAlign: "end" }}>{c.score}</div>
              <Cells score={d.score} size={story ? 21 : 14} gap={story ? 6 : 4} color={DR_PAPER} />
            </div>
          </div>
          {genres.length > 0 && (
            <div dir="auto" style={{ marginTop: story ? 18 : 10, fontFamily: d.lang === "en" ? GRO : VAZ, fontSize: story ? 17 : 13, fontWeight: 500, color: faint(), letterSpacing: d.lang === "en" ? "0.18em" : 0 }}>
              {genres.join(d.lang === "fa" ? " ، " : " · ").toUpperCase()}
            </div>
          )}
        </div>

        {/* final words */}
        {d.finalWords.trim() !== "" && (
          <div style={{ marginTop: story ? 42 : 24, borderTop: `1px solid ${line(0.16)}`, paddingTop: story ? 34 : 20, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 36 }}>
            <Q d={d} style={{ fontFamily: EST, fontWeight: 800, fontSize: story ? 45 : 28, lineHeight: 1.5 }}>
              {d.finalWords}
            </Q>
            <span style={{ fontFamily: MONO, fontSize: story ? 13 : 10, letterSpacing: "0.3em", color: faint(), whiteSpace: "nowrap", ...LTR }}>FINAL WORDS</span>
          </div>
        )}

        <div style={{ marginTop: story ? 36 : 20, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: story ? 19 : 14, letterSpacing: "0.06em", ...LTR, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 10, height: 10, background: DR_RED, display: "inline-block" }} />
            {d.handle}
          </div>
          <div style={{ fontSize: story ? 16 : 12, fontWeight: 500, color: faint() }}>{d.lang === "fa" ? c.watchedAt(w.fa) : c.watchedAt(w.en)}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4 — SPLIT (image | data with perforation seam)                       */
/* ------------------------------------------------------------------ */
function Split({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const dur = durationLabel(d.title.duration, d.lang);

  const finalOverlay = (
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 40 }}>
      {d.finalWords.trim() !== "" && (
        <>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.32em", color: DR_RED, fontWeight: 600, marginBottom: 14, textAlign: "end", ...LTR }}>FINAL WORDS</div>
          <Q d={d} style={{ fontFamily: EST, fontWeight: 800, fontSize: story ? 40 : 33, lineHeight: 1.7 }}>
            {d.finalWords}
          </Q>
        </>
      )}
    </div>
  );

  const seam = story ? (
    <div style={{ position: "absolute", left: 0, right: 0, top: 880, height: 8, background: DR_INK, zIndex: 3, display: "flex", justifyContent: "space-evenly", alignItems: "center" }}>
      {Array.from({ length: 26 }).map((_, i) => (
        <i key={i} style={{ display: "block", width: 22, height: 14, borderRadius: 3, background: "#232327", outline: "1px solid rgba(255,255,255,.07)" }} />
      ))}
    </div>
  ) : (
    <div style={{ position: "absolute", left: 466, top: 0, bottom: 0, width: 4, background: DR_INK, zIndex: 3, display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center" }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <i key={i} style={{ display: "block", width: 14, height: 22, borderRadius: 3, background: "#232327", outline: "1px solid rgba(255,255,255,.07)" }} />
      ))}
    </div>
  );

  const sheetRows: [string, string, string?][] = [
    [c.director, d.title.director || "—", directorLatinPart(d.title.director)],
    [c.genre, genres.join(d.lang === "fa" ? "، " : " · ") + (dur ? (d.lang === "fa" ? " · " : " · ") + dur : ""), undefined],
    [c.status, d.lang === "fa" ? c.statusWatched(w.fa) : c.statusWatched(w.en), undefined],
  ];

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_PANEL }}>
      {/* image panel */}
      <div style={{ position: "absolute", left: 0, top: 0, ...(story ? { right: 0, height: 888 } : { width: 466, bottom: 0 }), overflow: "hidden" }}>
        <Img src={d.title.backdrop} style={{ position: "absolute", inset: 0, filter: "brightness(.78) saturate(1.05)" }} />
        <div style={{ position: "absolute", inset: 0, background: story ? "linear-gradient(180deg,rgba(10,10,12,.14) 0%,rgba(10,10,12,.05) 45%,rgba(10,10,12,.9) 100%)" : "linear-gradient(180deg,rgba(10,10,12,.14) 0%,rgba(10,10,12,.05) 45%,rgba(10,10,12,.88) 100%)" }} />
        <div style={{ position: "absolute", top: 36, left: 36, fontFamily: MONO, fontSize: 13, letterSpacing: "0.3em", color: "rgba(244,242,236,.85)", background: "rgba(10,10,12,.72)", padding: "9px 14px 8px", ...LTR }}>
          {d.lang === "fa" ? `${w.enMonth} ${w.faYear}` : w.en}
        </div>
        {finalOverlay}
      </div>

      {seam}

      {/* data panel */}
      <div
        style={{
          position: "absolute",
          ...(story ? { left: 0, right: 0, top: 888, bottom: 0 } : { right: 0, top: 0, bottom: 0, left: 470 }),
          padding: story ? "40px 62px 40px" : "50px 58px 42px 46px",
          display: "flex",
          flexDirection: "column",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Brand d={d} faSize={story ? 27 : 25} enSub={false} />
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.3em", color: faint(), ...LTR }}>DARKROOM — NO.{d.no}</div>
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: story ? 26 : 34, alignItems: "flex-start" }}>
          <div style={{ width: story ? 148 : 148, height: story ? 222 : 222, flexShrink: 0, outline: "1px solid rgba(255,255,255,.26)", outlineOffset: -1 }}>
            <Img src={d.title.poster} />
          </div>
          <div style={{ paddingTop: 4, minWidth: 0 }}>
            <h1 dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 52 : 54, lineHeight: 1.15, margin: 0, textAlign: "start" }}>
              {t.main}
            </h1>
            <div style={{ fontFamily: GRO, fontWeight: 600, fontSize: 16, letterSpacing: "0.22em", color: mute(), marginTop: 10, textAlign: "start", ...LTR }}>
              {d.title.year}
            </div>
            <div style={{ width: 44, height: 3, background: DR_RED, marginTop: 14 }} />
          </div>
        </div>

        {/* sheet */}
        <div style={{ marginTop: story ? 24 : 28, borderTop: `1px solid ${line(0.13)}` }}>
          {sheetRows.map(([k, v, latin], idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: story ? "12px 2px" : "11px 2px", borderBottom: `1px solid ${line(0.13)}`, gap: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: faint(), whiteSpace: "nowrap" }}>{k}</span>
              <span dir="auto" style={{ fontSize: 18, fontWeight: 700, textAlign: "end", color: idx === 2 ? DR_RED : DR_PAPER, minWidth: 0 }}>
                {v}
                {latin && <span style={{ fontFamily: GRO, fontWeight: 500, color: mute(), fontSize: 15, letterSpacing: "0.08em", ...LTR }}> · {latin}</span>}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: story ? 22 : 24 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: 56, lineHeight: 1, ...LTR }}>{scoreText(d.score)}</span>
            <span style={{ fontFamily: GRO, fontWeight: 500, fontSize: 19, color: faint(), ...LTR }}>/10</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: mute() }}>{c.scoreShort}</span>
          </div>
          <Cells score={d.score} size={14} gap={4} />
        </div>

        {d.comment.trim() !== "" && (
          <div style={{ marginTop: story ? 22 : 26 }}>
            <div style={{ fontFamily: EST, fontWeight: 700, fontSize: 15, color: DR_RED, marginBottom: 10 }}>{c.review}</div>
            <p dir="auto" style={{ margin: 0, fontSize: story ? 20 : 20, fontWeight: 500, lineHeight: 1.85, color: "#e9e6df" }}>
              {d.comment}
            </p>
          </div>
        )}

        <div style={{ marginTop: "auto", borderTop: `1px solid ${line(0.13)}`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15, ...LTR, display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 8, height: 8, background: DR_RED, display: "inline-block" }} />
            {d.handle}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.22em", color: faint(), ...LTR }}>MADE WITH FRAME</span>
        </div>
      </div>
    </div>
  );
}

/** The director name is stored latin — show it as the small LTR companion. */
function directorLatinPart(dir: string): string | undefined {
  return dir && /[A-Za-z]/.test(dir) ? dir.toUpperCase() : undefined;
}

/* ------------------------------------------------------------------ */
/* 5 — JOURNAL (light print review page)                                */
/* ------------------------------------------------------------------ */
function Journal({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const dur = durationLabel(d.title.duration, d.lang);
  const INK = "#17150f";
  const BODY = "#34322a";
  const FAINT = "#8b887c";
  const HAIR = "rgba(23,21,15,.28)";

  return (
    <div style={{ position: "absolute", inset: 0, background: "#f0ede5", color: INK, fontFamily: VAZ }}>
      <div style={{ position: "absolute", inset: 0, padding: story ? "56px 68px 44px" : "42px 56px 36px", display: "flex", flexDirection: "column" }}>
        {/* masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {d.showLogo && <Logo h={story ? 58 : 46} />}
            <div>
              <div style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 42 : 33, lineHeight: 1 }}>
                {d.lang === "fa" ? (
                  <>
                    تاریکخانه<b style={{ color: DR_RED }}>.</b>
                  </>
                ) : (
                  <>
                    Darkroo<b style={{ color: DR_RED }}>m.</b>
                  </>
                )}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.34em", color: FAINT, marginTop: 7, ...LTR }}>FRAME — DARKROOM</div>
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.9, color: FAINT, letterSpacing: "0.16em", textAlign: "end", ...LTR }}>
            <b style={{ color: INK, fontWeight: 600 }}>NO. {d.no}</b> — {d.lang === "fa" ? `TIR ${w.faYear}` : w.en}
            <br />
            {c.vol}
          </div>
        </div>
        <div style={{ marginTop: 18, borderTop: `3px solid ${INK}` }} />
        <div style={{ borderTop: `1px solid ${INK}`, marginTop: 4 }} />

        {/* image band */}
        <div style={{ marginTop: 24, position: "relative", border: `1px solid ${INK}`, height: story ? 700 : 386, overflow: "hidden", flexShrink: 0 }}>
          <Img src={d.title.backdrop} style={{ filter: "saturate(1.02) contrast(1.02)", objectPosition: "center 30%" }} />
          <span style={{ position: "absolute", top: 0, right: 0, background: DR_RED, color: "#fff", fontFamily: EST, fontWeight: 700, fontSize: 16, padding: "10px 18px 9px" }}>
            {c.watched}
          </span>
          <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 20px 12px", background: "linear-gradient(180deg,rgba(23,21,15,0),rgba(23,21,15,.55))", fontFamily: MONO, fontSize: 12, letterSpacing: "0.3em", color: "rgba(255,255,255,.85)", textAlign: "end", ...LTR }}>
            STILL — {t.sub.toUpperCase()} ({d.title.year})
          </span>
        </div>

        {/* article head */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 40, marginTop: story ? 30 : 22 }}>
          <div style={{ maxWidth: 790 }}>
            <h1 dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 74 : 52, lineHeight: 1.1, margin: 0, textAlign: "start" }}>
              {t.main}
            </h1>
            <div style={{ fontFamily: GRO, fontWeight: 600, fontSize: 19, letterSpacing: "0.24em", color: FAINT, marginTop: 10, textAlign: "start", ...LTR }}>
              {t.sub} · {d.title.year}
            </div>
            <div dir="auto" style={{ marginTop: 14, fontSize: 18, fontWeight: 500, color: BODY }}>
              {d.title.director ? (
                <>
                  {c.director} <b style={{ fontWeight: 700, color: INK }}>{d.title.director}</b>
                </>
              ) : null}
              {genres.length ? ` · ${genres.join(d.lang === "fa" ? "، " : " · ")}` : ""}
              {dur ? ` · ${dur}` : ""}
            </div>
          </div>
          <div style={{ width: story ? 176 : 148, height: story ? 264 : 222, flexShrink: 0, border: `1px solid ${INK}`, padding: 6, background: "#fff" }}>
            <Img src={d.title.poster} />
          </div>
        </div>

        {/* body copy */}
        {d.comment.trim() !== "" && (
          <div style={{ marginTop: story ? 26 : 18 }}>
            <div style={{ fontFamily: EST, fontWeight: 700, fontSize: 16, color: DR_RED, marginBottom: 10 }}>{c.review}</div>
            <p dir="auto" style={{ margin: 0, fontSize: story ? 25 : 20, fontWeight: 500, lineHeight: 1.9, color: BODY }}>
              {d.comment}
            </p>
          </div>
        )}
        {d.finalWords.trim() !== "" && (
          <div style={{ marginTop: story ? 26 : 16, borderInlineStart: `6px solid ${DR_RED}`, paddingInlineStart: 24 }}>
            <Q d={d} style={{ fontFamily: EST, fontWeight: 800, fontSize: story ? 40 : 28, lineHeight: 1.55, color: INK }}>
              {d.finalWords}
            </Q>
          </div>
        )}

        {/* foot */}
        <div style={{ marginTop: "auto" }}>
          <div style={{ borderTop: `1px solid ${INK}` }} />
          <div style={{ borderTop: `3px solid ${INK}`, marginTop: 3 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: 42, lineHeight: 1, color: INK, ...LTR }}>{scoreText(d.score)}</span>
              <span style={{ fontFamily: GRO, fontWeight: 500, fontSize: 16, color: FAINT, ...LTR }}>/10</span>
              <Cells score={d.score} size={13} gap={4} color={INK} border={HAIR} />
              <span style={{ fontSize: 14, fontWeight: 700, color: BODY }}>{c.scoreShort}</span>
            </div>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16, color: INK, ...LTR, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 9, height: 9, background: DR_RED, display: "inline-block" }} />
              {d.handle}
            </div>
            <div style={{ fontSize: 13, color: FAINT, display: "flex", alignItems: "baseline", gap: 12 }}>
              <span>{d.lang === "fa" ? c.watchedAt(w.fa) : c.watchedAt(w.en)}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.24em", ...LTR }}>MADE WITH FRAME</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6 — TICKET (top film edge + perforation + barcode stub)              */
/* ------------------------------------------------------------------ */
function Ticket({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const dur = durationLabel(d.title.duration, d.lang);

  return (
    <div style={{ position: "absolute", inset: 0, background: DR_INK, display: "flex", flexDirection: "column" }}>
      {/* top film edge */}
      <div style={{ height: story ? 64 : 44, background: "#08080a", borderBottom: `1px solid ${line(0.15)}`, display: "flex", justifyContent: "space-evenly", alignItems: "center", flexShrink: 0 }}>
        {Array.from({ length: story ? 17 : 21 }).map((_, i) => (
          <i key={i} style={{ display: "block", width: story ? 26 : 18, height: story ? 36 : 26, borderRadius: 6, background: "#1a1a1e", border: "1px solid rgba(255,255,255,.055)" }} />
        ))}
      </div>

      {/* picture */}
      <div style={{ margin: story ? "42px 54px 0" : "30px 42px 0", height: story ? 880 : 462, position: "relative", border: `1px solid ${line(0.15)}`, overflow: "hidden", flexShrink: 0 }}>
        <Img src={d.title.backdrop} style={{ filter: "brightness(.72) saturate(1.06)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(10,10,12,.08) 30%,rgba(10,10,12,.88) 100%)" }} />
        <span style={{ position: "absolute", top: 24, left: 26, fontFamily: MONO, fontSize: 13, letterSpacing: "0.3em", color: "rgba(244,242,236,.85)", ...LTR }}>
          NO. {d.no} — {d.lang === "fa" ? w.faYear : w.enYear}
        </span>
        <span style={{ position: "absolute", top: 24, right: 26, background: DR_RED, color: "#fff", fontFamily: EST, fontWeight: 700, fontSize: 16, padding: "9px 16px 8px" }}>
          {c.watched}
        </span>
        <div style={{ position: "absolute", right: 34, left: 34, bottom: 26 }}>
          {d.title.director && (
            <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: "0.3em", color: mute(), textAlign: "end", ...LTR }}>
              A FILM BY {d.title.director.toUpperCase()}
            </div>
          )}
          <h1 dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 86 : 50, lineHeight: 1.1, margin: 0, marginTop: 8, textAlign: "start" }}>
            {t.main}
          </h1>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 8 }}>
            <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 21 : 15, letterSpacing: "0.24em", color: mute(), ...LTR }}>{t.sub}</span>
            <span dir="auto" style={{ fontSize: story ? 17 : 13, fontWeight: 500, color: mute() }}>
              {genres.join(d.lang === "fa" ? "، " : " · ")}
              {dur ? ` · ${dur}` : ""}
            </span>
          </div>
        </div>
      </div>

      {/* perforation */}
      <div style={{ position: "relative", height: story ? 54 : 42, flexShrink: 0 }}>
        <span style={{ position: "absolute", top: story ? -30 : -24, width: 56, height: 56, borderRadius: "50%", background: DR_INK, border: "1px solid rgba(255,255,255,.22)", left: -26 }} />
        <span style={{ position: "absolute", top: story ? -30 : -24, width: 56, height: 56, borderRadius: "50%", background: DR_INK, border: "1px solid rgba(255,255,255,.22)", right: -26 }} />
        <span style={{ position: "absolute", top: story ? 27 : 21, right: 48, left: 48, borderTop: "3px dashed rgba(255,255,255,.28)" }} />
      </div>

      {/* stub */}
      <div style={{ padding: story ? "4px 54px 40px" : "0 42px 30px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: EST, fontWeight: 800, fontSize: story ? 24 : 19 }}>
            {d.lang === "fa" ? (
              <>
                بلیت تماشا<span style={{ color: DR_RED }}>.</span>
              </>
            ) : (
              <>
                Ticket<span style={{ color: DR_RED }}>.</span>
              </>
            )}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.36em", color: faint(), ...LTR }}>ADMIT ONE</div>
        </div>

        {d.comment.trim() !== "" && (
          <div style={{ marginTop: story ? 24 : 14 }}>
            <div style={{ fontFamily: EST, fontWeight: 700, fontSize: 16, color: DR_RED, marginBottom: 10 }}>{c.review}</div>
            <p dir="auto" style={{ margin: 0, fontSize: story ? 25 : 19, fontWeight: 500, lineHeight: 1.85, color: "#eae7e0" }}>
              {d.comment}
            </p>
          </div>
        )}
        {d.finalWords.trim() !== "" && (
          <div style={{ marginTop: story ? 22 : 12 }}>
            <Q d={d} style={{ fontFamily: EST, fontWeight: 800, fontSize: story ? 37 : 24, lineHeight: 1.6 }}>
              {d.finalWords}
            </Q>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: story ? 28 : 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 104 : 56, lineHeight: 0.92, ...LTR }}>{scoreText(d.score)}</span>
            <span style={{ fontFamily: GRO, fontWeight: 500, fontSize: story ? 27 : 17, color: faint(), marginTop: story ? 8 : 4, ...LTR }}>/10</span>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: story ? 16 : 13, fontWeight: 700, color: mute() }}>{c.score}</div>
              <div style={{ marginTop: story ? 12 : 7 }}>
                <Cells score={d.score} size={story ? 18 : 12} gap={4.5} color={DR_PAPER} />
              </div>
              <div style={{ marginTop: story ? 14 : 8, fontSize: story ? 16 : 12, fontWeight: 500, color: faint() }}>
                {d.lang === "fa" ? c.watchedAt(w.fa) : c.watchedAt(w.en)}
              </div>
            </div>
          </div>
          <div style={{ width: story ? 190 : 138, height: story ? 285 : 207, outline: "1px solid rgba(255,255,255,.26)", outlineOffset: -1 }}>
            <Img src={d.title.poster} />
          </div>
        </div>

        <div style={{ marginTop: "auto", borderTop: `1px solid ${line(0.15)}`, paddingTop: story ? 22 : 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              width: story ? 300 : 220,
              height: story ? 54 : 38,
              flexShrink: 0,
              background:
                "repeating-linear-gradient(90deg,rgba(244,242,236,.94) 0 3px,transparent 3px 9px),repeating-linear-gradient(90deg,rgba(244,242,236,.94) 0 2px,transparent 2px 17px),repeating-linear-gradient(90deg,rgba(244,242,236,.94) 0 5px,transparent 5px 26px)",
            }}
          />
          <div style={{ textAlign: "end" }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: story ? 18 : 14, ...LTR, display: "inline-flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 9, height: 9, background: DR_RED, display: "inline-block" }} />
              {d.handle}
            </div>
            <div style={{ fontSize: story ? 14 : 11, fontWeight: 500, color: faint(), marginTop: 6 }}>
              {d.lang === "fa" ? "ساخته‌شده با فریم — تاریکخانه" : "Made with Frame — Darkroom"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7 — SLATE (clapperboard table + poster column)                       */
/* ------------------------------------------------------------------ */
function Slate({ d }: { d: DrCardData }) {
  const story = d.fmt === "story";
  const t = titlesOf(d);
  const c = copyOf(d);
  const w = whenLabels(d.when);
  const genres = genresOf(d.title, d.lang);
  const dur = durationLabel(d.title.duration, d.lang);

  const rows: [string, string][] = [
    [c.director, d.title.director || "—"],
    [c.genre, genres.join(d.lang === "fa" ? "، " : " · ")],
    [c.country, d.title.country || "—"],
    [c.yearL, d.lang === "fa" ? faDigits(d.title.year) : String(d.title.year)],
    [dur ? (d.lang === "fa" ? "مدت" : "Runtime") : "", dur || ""],
  ].filter((r) => r[1]) as [string, string][];

  return (
    <div style={{ position: "absolute", inset: 0, background: "#0d0d0f", display: "flex", flexDirection: "column" }}>
      {/* clapper bar */}
      <div style={{ height: story ? 64 : 56, flexShrink: 0, display: "flex", borderBottom: `1px solid ${line(0.13)}`, flexDirection: d.lang === "fa" ? "row" : "row-reverse" }}>
        <div style={{ flex: 1, background: "repeating-linear-gradient(-45deg,#16161a 0 34px,#e9e6dd 34px 68px)" }} />
        <div style={{ width: story ? 330 : 300, background: "#08080a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 14, letterSpacing: "0.3em", color: mute(), ...LTR }}>
          FRAME <b style={{ color: DR_RED, fontWeight: 600 }}>—</b> DARKROOM
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, flexDirection: d.lang === "fa" ? "row" : "row-reverse" }}>
        {/* table column */}
        <div style={{ flex: 1, padding: story ? "36px 50px 32px" : "30px 44px 28px", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ borderBottom: `1px solid ${line(0.13)}`, paddingBottom: story ? 24 : 18, marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <h1 dir={t.mainDir} style={{ fontFamily: EST, fontWeight: 900, fontSize: story ? 64 : 52, lineHeight: 1.15, margin: 0, textAlign: "start" }}>
                  {t.main}
                </h1>
                <div style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 16 : 13, letterSpacing: "0.2em", color: mute(), marginTop: 10, ...LTR }}>
                  {t.sub.toUpperCase()} · {d.title.year}
                  {d.title.duration ? ` · ${d.title.duration} MIN` : ""}
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.26em", color: faint(), textAlign: "end", lineHeight: 2, ...LTR }}>
                <b style={{ color: DR_RED, fontWeight: 600 }}>SCENE {d.no}</b>
                <br />
                {d.lang === "fa" ? `TIR ${w.faYear}` : w.en}
              </div>
            </div>
          </div>

          {rows.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20, padding: story ? "17px 2px" : "12.5px 2px", borderBottom: `1px solid ${line(0.13)}` }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: faint(), whiteSpace: "nowrap" }}>{k}</span>
              <span dir="auto" style={{ fontSize: 19, fontWeight: 700, textAlign: "start", minWidth: 0 }}>
                {v}
              </span>
            </div>
          ))}

          {d.comment.trim() !== "" && (
            <div style={{ marginTop: story ? 28 : 16 }}>
              <div style={{ fontFamily: EST, fontWeight: 700, fontSize: 15, color: DR_RED, marginBottom: 8 }}>{c.review}</div>
              <p dir="auto" style={{ margin: 0, fontSize: story ? 21 : 17, fontWeight: 500, lineHeight: 1.9, color: "#e9e6df" }}>
                {d.comment}
              </p>
            </div>
          )}
          {d.finalWords.trim() !== "" && (
            <div style={{ marginTop: story ? 22 : 12 }}>
              <Q d={d} style={{ fontFamily: EST, fontWeight: 800, fontSize: story ? 33 : 24, lineHeight: 1.6 }}>
                {d.finalWords}
              </Q>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: "auto", paddingTop: 18, borderTop: `1px solid ${line(0.13)}` }}>
            <span style={{ fontFamily: GRO, fontWeight: 600, fontSize: story ? 64 : 52, lineHeight: 1, ...LTR }}>{scoreText(d.score)}</span>
            <span style={{ fontFamily: GRO, fontWeight: 500, fontSize: 19, color: faint(), ...LTR }}>/10</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: mute() }}>{c.scoreShort}</span>
            <div style={{ marginInlineStart: "auto" }}>
              <Cells score={d.score} size={15} gap={4} />
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 15, ...LTR, display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 8, height: 8, background: DR_RED, display: "inline-block" }} />
              {d.handle}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: faint() }}>{d.lang === "fa" ? "ساخته‌شده با فریم — تاریکخانه" : "Made with Frame — Darkroom"}</span>
          </div>
        </div>

        {/* poster column + rail */}
        <div style={{ width: story ? 340 : 300, flexShrink: 0, borderInlineStart: `1px solid ${line(0.13)}`, display: "flex", flexDirection: d.lang === "fa" ? "row" : "row-reverse" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative", width: story ? 262 : 226, height: story ? 393 : 339 }}>
              <Img src={d.title.poster} style={{ outline: "1px solid rgba(255,255,255,.28)", outlineOffset: -1 }} />
              <span style={{ position: "absolute", top: "100%", right: 0, left: 0, marginTop: 14, fontFamily: MONO, fontSize: 11, letterSpacing: "0.26em", color: faint(), textAlign: "center", whiteSpace: "nowrap", ...LTR }}>
                POSTER — {d.title.year}
              </span>
            </div>
          </div>
          <div style={{ width: 48, background: "#08080a", borderInlineStart: `1px solid ${line(0.13)}`, display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center" }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <i key={i} style={{ display: "block", width: 22, height: 32, borderRadius: 4, background: "#1a1a1e", border: "1px solid rgba(255,255,255,.055)" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* card view                                                            */
/* ------------------------------------------------------------------ */
export function DrCardView({ d }: { d: DrCardData }) {
  const f = DR_FORMATS.find((x) => x.id === d.fmt) ?? DR_FORMATS[0];
  return (
    <div
      dir={d.lang === "fa" ? "rtl" : "ltr"}
      style={{ position: "relative", width: f.w, height: f.h, overflow: "hidden", background: DR_INK, color: DR_PAPER, fontFamily: VAZ }}
    >
      {d.tpl === "spotlight" && <Spotlight d={d} />}
      {d.tpl === "strip" && <Strip d={d} />}
      {d.tpl === "type" && <TypePoster d={d} />}
      {d.tpl === "split" && <Split d={d} />}
      {d.tpl === "journal" && <Journal d={d} />}
      {d.tpl === "ticket" && <Ticket d={d} />}
      {d.tpl === "slate" && <Slate d={d} />}
    </div>
  );
}

