"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * تاریکخانه (Darkroom) — share-card generator.
 * Left: live 1080px card preview (scaled). Right: structure gallery + fields.
 * PNG export @2x via html-to-image (local fonts & covers → no CORS issues).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DrCardView } from "./Cards";
import {
  DR_FORMATS,
  DR_TEMPLATES,
  JMONTHS_FA,
  faDigits,
  type DrCardData,
  type DrFormat,
  type DrTemplateId,
  type DrTitle,
  type DrWhen,
} from "@/lib/darkroom";
import { j2g, g2j } from "@/lib/jalali";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useLibrary } from "@/components/library/LibraryProvider";
import { useCloudSession } from "@/lib/cloud";
import { CloseIcon, DownloadIcon, SearchIcon, SparklesIcon } from "@/components/Icons";

const GRADS = [
  "linear-gradient(135deg,#e50914,#7c3aed)",
  "linear-gradient(135deg,#0ea5e9,#22d3ee)",
  "linear-gradient(135deg,#10b981,#a3e635)",
  "linear-gradient(135deg,#f59e0b,#facc15)",
  "linear-gradient(135deg,#ec4899,#f43f5e)",
  "linear-gradient(135deg,#8b5cf6,#6366f1)",
];

type Draft = { score: number; comment: string; finalWords: string; handle: string; when: DrWhen };
const DRAFT_KEY = "frame:darkroom:drafts";

function loadDraft(id: number): Draft | null {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
    return all[id] ?? null;
  } catch {
    return null;
  }
}
function saveDraft(id: number, d: Draft) {
  try {
    const all = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
    all[id] = d;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export default function DarkroomApp({ candidates, initialSlug }: { candidates: DrTitle[]; initialSlug?: string }) {
  const { t, locale } = useI18n();
  const { profile } = useLibrary();
  const { session } = useCloudSession();

  const now = useMemo(() => ({ gy: new Date().getFullYear(), gm: new Date().getMonth() + 1 }), []);

  /* ---------------- state ---------------- */
  const [list, setList] = useState<DrTitle[]>(candidates);
  const initial = useMemo(() => {
    if (initialSlug) {
      const hit = candidates.find((c) => c.slug === initialSlug);
      if (hit) return hit;
    }
    return candidates[0] ?? null;
  }, [candidates, initialSlug]);

  const [sel, setSel] = useState<DrTitle | null>(initial);
  const [tpl, setTpl] = useState<DrTemplateId>("spotlight");
  const [fmt, setFmt] = useState<DrFormat>("post");
  const [en, setEn] = useState(false);
  const [showLogo, setShowLogo] = useState(true);

  const [score, setScore] = useState(initial?.myScore ?? 9);
  const [comment, setComment] = useState("");
  const [finalWords, setFinalWords] = useState("");
  const [handle, setHandle] = useState("");
  const [when, setWhen] = useState<DrWhen>(initial?.when ? isoWhen(initial.when) : now);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<DrTitle[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(0.4);

  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fontCssRef = useRef<string | null>(null);

  /* ---------------- handle default (latin email handle, else display name) --- */
  const email = session?.user?.email ?? "";
  const defaultHandle = useMemo(() => {
    if (email) return `@${email.split("@")[0].replace(/[^\w.-]/g, "")}`.toLowerCase();
    const n = profile.displayName?.trim();
    return n ? `@${n.replace(/\s+/g, "_")}` : "@frame_user";
  }, [email, profile.displayName]);

  useEffect(() => {
    setHandle((h) => h || defaultHandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHandle]);

  /* ---------------- scale observer ---------------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1080));
    ro.observe(el);
    setScale(el.clientWidth / 1080);
    return () => ro.disconnect();
  }, [fmt]);

  /* ---------------- draft load/save per title ---------------- */
  const applyTitle = useCallback((tt: DrTitle) => {
    setSel(tt);
    const draft = loadDraft(tt.id);
    if (draft) {
      setScore(draft.score);
      setComment(draft.comment);
      setFinalWords(draft.finalWords);
      setHandle(draft.handle);
      setWhen(draft.when);
    } else {
      setScore(tt.myScore ?? Math.min(10, Math.max(1, Math.round(tt.rating) || 8)));
      setComment("");
      setFinalWords("");
      setWhen(tt.when ? isoWhen(tt.when) : { gy: new Date().getFullYear(), gm: new Date().getMonth() + 1 });
    }
  }, []);

  useEffect(() => {
    if (!sel) return;
    saveDraft(sel.id, { score, comment, finalWords, handle, when });
  }, [sel, score, comment, finalWords, handle, when]);

  /* ---------------- search (debounced) ---------------- */
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults(null);
      return;
    }
    setSearching(true);
    const tm = setTimeout(() => {
      fetch(`/api/darkroom/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: DrTitle[]) => setResults(rows))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => {
      clearTimeout(tm);
      setSearching(false);
    };
  }, [q]);

  /* ---------------- card payload ---------------- */
  const profileInitial = (profile.displayName || "F").trim().slice(0, 1).toUpperCase();
  const grad = GRADS[profile.avatar % GRADS.length] ?? GRADS[0];

  const card: DrCardData | null = useMemo(() => {
    if (!sel) return null;
    return {
      title: sel,
      tpl,
      fmt,
      lang: en ? "en" : "fa",
      score,
      comment,
      finalWords,
      handle: handle.trim(),
      when,
      showLogo,
      no: String((sel.id % 89) + 7).padStart(2, "0"),
      userInitial: profileInitial,
      avatarGrad: grad,
    };
  }, [sel, tpl, fmt, en, score, comment, finalWords, handle, when, showLogo, profileInitial, grad]);

  /* ---------------- export ---------------- */
  const exportPng = async () => {
    const node = cardRef.current?.firstElementChild as HTMLElement | null;
    if (!node || !card) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const mod = await import("html-to-image");
      if (!fontCssRef.current) {
        fontCssRef.current = await mod.getFontEmbedCSS(node).catch(() => "");
      }
      const f = DR_FORMATS.find((x) => x.id === fmt)!;
      const url = await mod.toPng(node, {
        pixelRatio: 2,
        width: f.w,
        height: f.h,
        fontEmbedCSS: fontCssRef.current || undefined,
        style: { transform: "none", margin: "0" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `frame-darkroom-${card.title.slug}-${fmt}.png`;
      a.click();
      toast.success(t("darkroom.exported"));
    } catch {
      toast.error(t("darkroom.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- derived ---------------- */
  const f = DR_FORMATS.find((x) => x.id === fmt)!;
  const jl = g2j(now.gy, now.gm, 1);
  const yearOptions = Array.from({ length: 16 }, (_, i) => jl.jy - i);
  const previewAspect = fmt === "post" ? "1 / 1" : "9 / 16";

  /* ================================================================ */
  return (
    <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-16 pt-24 sm:px-8 lg:px-12 lg:pt-32">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-white sm:text-4xl">{t("darkroom.title")}</h1>
          <p className="mt-2 max-w-xl text-sm leading-7 text-zinc-400">{t("darkroom.sub")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* format segmented */}
          <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1">
            {DR_FORMATS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setFmt(x.id)}
                aria-pressed={fmt === x.id}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                  fmt === x.id ? "bg-brand text-white shadow-[0_6px_24px_var(--color-brand-glow)]" : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className={`inline-block ${x.id === "post" ? "h-3 w-3" : "h-2 w-3.5 rounded-[2px]"} rounded-[3px] border-[1.5px] border-current`} />
                {t(x.id === "post" ? "darkroom.post" : "darkroom.story")}
              </button>
            ))}
          </div>

          {/* English texts toggle */}
          <button
            type="button"
            onClick={() => setEn((v) => !v)}
            aria-pressed={en}
            className={`flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-bold transition ${
              en ? "border-white/70 bg-white text-black" : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <SparklesIcon width={15} height={15} />
            {t("darkroom.enTexts")}
          </button>

          {/* export */}
          <button
            type="button"
            onClick={exportPng}
            disabled={busy || !card}
            className="flex h-10 items-center gap-2 rounded-full bg-brand px-5 text-xs font-extrabold text-white shadow-[0_10px_40px_var(--color-brand-glow)] transition hover:bg-brand-600 disabled:opacity-60"
          >
            <DownloadIcon width={15} height={15} className={busy ? "animate-bounce" : ""} />
            {busy ? t("darkroom.exporting") : t("darkroom.export")}
          </button>
        </div>
      </div>

      {!card ? (
        <div className="mt-16 rounded-3xl border border-white/10 bg-white/[0.03] p-14 text-center">
          <p className="text-sm text-zinc-300">{t("darkroom.empty")}</p>
        </div>
      ) : (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_500px] xl:grid-cols-[minmax(0,1fr)_560px]">
          {/* ── controls ─────────────────────────────────────────── */}
          <section className="order-2 min-w-0 lg:order-1">
            {/* title picker */}
            <Panel title={t("darkroom.pickTitle")}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-500" style={{ insetInlineStart: 16 }}>
                  <SearchIcon width={16} height={16} />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("darkroom.searchPh")}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] ps-11 pe-10 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60 focus:bg-white/[0.07]"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label={t("common.close")} className="absolute top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" style={{ insetInlineEnd: 12 }}>
                    <CloseIcon width={14} height={14} />
                  </button>
                )}
              </div>

              {results !== null && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[var(--glass-bg-strong)]">
                  {results.length === 0 && <p className="px-4 py-3 text-xs text-zinc-400">{t("darkroom.noResult")}</p>}
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        applyTitle(r);
                        setQ("");
                        setList((prev) => (prev.some((x) => x.id === r.id) ? prev : [r, ...prev]));
                      }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-white/[0.07] ${sel?.id === r.id ? "bg-brand/10" : ""}`}
                    >
                      <img src={r.poster} alt="" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{locale === "en" && r.titleEn ? r.titleEn : r.title}</span>
                        <span className="num mt-0.5 block text-[11px] text-zinc-400">
                          {locale === "en" ? r.title : r.titleEn} · {faDigits(r.year)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* your titles */}
              <p className="mt-4 mb-2 text-[11px] font-bold text-zinc-500">{t("darkroom.yourTitles")}</p>
              <div className="scrollbar-thin -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
                {list.slice(0, 24).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => applyTitle(r)}
                    title={locale === "en" ? r.titleEn : r.title}
                    className={`group w-[76px] shrink-0 text-start ${sel?.id === r.id ? "" : "opacity-80 hover:opacity-100"}`}
                  >
                    <span className={`block overflow-hidden rounded-xl transition ${sel?.id === r.id ? "ring-2 ring-brand" : "ring-1 ring-white/10 group-hover:ring-white/30"}`}>
                      <img src={r.poster} alt="" className="aspect-[2/3] w-full object-cover" />
                    </span>
                    <span className="mt-1.5 block truncate text-[10px] text-zinc-400">{locale === "en" ? r.titleEn || r.title : r.title}</span>
                  </button>
                ))}
              </div>
            </Panel>

            {/* structure gallery — fixed-size live minis (scale = 110/1080) */}
            <Panel title={t("darkroom.template")}>
              <div className="flex flex-wrap gap-3">
                {DR_TEMPLATES.map((x) => {
                  const on = tpl === x.id;
                  const miniW = fmt === "post" ? 110 : 64;
                  const miniH = fmt === "post" ? 110 : 114;
                  return (
                    <button key={x.id} type="button" onClick={() => setTpl(x.id)} className="group text-start" aria-pressed={on}>
                      <span
                        className="relative block overflow-hidden rounded-xl bg-ink-800 transition"
                        style={{ width: miniW, height: miniH, ...(on ? { boxShadow: "0 0 0 2px var(--color-brand)" } : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }) }}
                      >
                        <span className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${miniW / 1080})` }}>
                          {card && <DrCardView d={{ ...card, tpl: x.id }} />}
                        </span>
                      </span>
                      <span className={`mt-1.5 block max-w-[110px] truncate text-[11px] font-bold ${on ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}>
                        {locale === "en" ? x.en : x.fa}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* fields */}
            <Panel title={t("darkroom.details")}>
              {/* score */}
              <Field label={t("darkroom.score")}>
                <div className="flex flex-wrap items-center gap-2" dir="ltr">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(n)}
                      aria-label={String(n)}
                      className={`h-8 w-8 rounded-md border text-xs font-bold transition ${
                        n <= score ? "border-brand bg-brand text-white" : "border-white/15 bg-white/[0.04] text-zinc-400 hover:border-white/40 hover:text-white"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="num ms-2 text-lg font-black text-white">{faDigits(score)}</span>
                  <span className="text-xs text-zinc-500">/ 10</span>
                </div>
              </Field>

              <Field label={t("darkroom.comment")}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={320}
                  placeholder={t("darkroom.commentPh")}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 text-sm leading-7 text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60 focus:bg-white/[0.07]"
                />
              </Field>

              <Field label={t("darkroom.final")}>
                <input
                  value={finalWords}
                  onChange={(e) => setFinalWords(e.target.value)}
                  maxLength={90}
                  placeholder={t("darkroom.finalPh")}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60 focus:bg-white/[0.07]"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("darkroom.handle")}>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    maxLength={30}
                    dir="ltr"
                    placeholder="@your_id"
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-brand/60 focus:bg-white/[0.07]"
                  />
                </Field>
                <Field label={t("darkroom.watchDate")}>
                  <div className="flex gap-2">
                    <select
                      value={when.gm}
                      onChange={(e) => setWhen((wd) => ({ ...wd, gm: Number(e.target.value) }))}
                      className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-brand/60"
                    >
                      {JMONTHS_FA.map((m, i) => (
                        <option key={m} value={i + 1} className="bg-ink-800">
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={when.gy}
                      onChange={(e) => {
                        const jy = Number(e.target.value);
                        const g = j2g(jy, when.gm, 1);
                        setWhen({ gy: g.gy, gm: g.gm });
                      }}
                      className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-brand/60"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y} className="bg-ink-800">
                          {faDigits(y)}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>

              {/* switches */}
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Switch on={showLogo} onClick={() => setShowLogo((v) => !v)} label={t("darkroom.showLogo")} />
              </div>
            </Panel>
          </section>

          {/* ── preview ──────────────────────────────────────────── */}
          <aside className="order-1 lg:order-2 lg:sticky lg:top-24">
            <div
              ref={wrapRef}
              className="relative mx-auto overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              style={{ aspectRatio: previewAspect, width: fmt === "post" ? "100%" : "min(100%, calc((100dvh - 210px) * 0.5625))" }}
            >
              <div ref={cardRef} style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <DrCardView d={card} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-zinc-500">
              <span className="num">
                {t("darkroom.sizeHint")} — 1080 × {faDigits(f.h)}
              </span>
              <span className="num">
                {en ? "EN" : "FA"} · {scoreTextShort(score)}
              </span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* small UI atoms                                                      */
/* ------------------------------------------------------------------ */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <p className="mb-3 text-xs font-black tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[11px] font-bold text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-10 items-center gap-2.5 rounded-full border px-4 text-xs font-bold transition ${
        on ? "border-brand/50 bg-brand/15 text-white" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"
      }`}
    >
      <span className={`relative h-4 w-7 rounded-full transition ${on ? "bg-brand" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "start-3.5" : "start-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function scoreTextShort(score: number) {
  return `${score}.0/10`;
}

function isoWhen(iso: string): DrWhen {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return { gy: new Date().getFullYear(), gm: new Date().getMonth() + 1 };
  return { gy: dt.getFullYear(), gm: dt.getMonth() + 1 };
}
