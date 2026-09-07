"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * تاریکخانه (Darkroom) — share-card generator.
 * Minimal professional workshop: flat hairline sections, quiet inputs,
 * one accent (brand red on the primary action only).
 * Left/right live 1080px card preview (scaled). PNG export @2x via
 * html-to-image (local fonts & covers → no CORS issues).
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
import { fileToAvatarDataUrl } from "@/lib/avatar";
import { j2g, g2j } from "@/lib/jalali";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useLibrary } from "@/components/library/LibraryProvider";
import { useCloudSession } from "@/lib/cloud";
import { CloseIcon, DownloadIcon, SearchIcon } from "@/components/Icons";

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

/* quiet input — one shared voice for the whole workshop */
const INPUT =
  "w-full rounded-lg border border-white/10 bg-black/30 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/35 focus:bg-black/40";

export default function DarkroomApp({ candidates, initialSlug }: { candidates: DrTitle[]; initialSlug?: string }) {
  const { t, locale } = useI18n();
  const { profile, setProfile } = useLibrary();
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
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [scale, setScale] = useState(0.4);

  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fontCssRef = useRef<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  /* ---------------- avatar upload (shared with settings) ---------------- */
  const saveAvatar = async (dataUrl: string | null) => {
    setAvatarBusy(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarImage: dataUrl }),
      });
      if (!r.ok) throw new Error();
      setProfile({ avatarImage: dataUrl });
      toast.success(t(dataUrl ? "darkroom.avatarSaved" : "darkroom.avatarRemoved"));
    } catch {
      toast.error(t("darkroom.avatarFailed"));
    } finally {
      setAvatarBusy(false);
    }
  };

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
      avatarImage: profile.avatarImage ?? null,
    };
  }, [sel, tpl, fmt, en, score, comment, finalWords, handle, when, showLogo, profileInitial, grad, profile.avatarImage]);

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
    <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-28">
      {/* ── toolband ──────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-white/[0.07] pb-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black tracking-tight text-white sm:text-[28px]">{t("darkroom.title")}</h1>
          <p className="mt-1.5 max-w-lg text-[13px] leading-6 text-zinc-500">{t("darkroom.sub")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* format — quiet segmented */}
          <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5" role="group" aria-label={t("darkroom.post")}>
            {DR_FORMATS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setFmt(x.id)}
                aria-pressed={fmt === x.id}
                className={`flex h-9 items-center gap-2 rounded-[7px] px-3.5 text-xs font-bold transition ${
                  fmt === x.id ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                <span className={`inline-block ${x.id === "post" ? "h-3 w-3" : "h-2 w-3.5"} rounded-[2px] border-[1.5px] border-current`} />
                {t(x.id === "post" ? "darkroom.post" : "darkroom.story")}
              </button>
            ))}
          </div>

          {/* English texts */}
          <button
            type="button"
            onClick={() => setEn((v) => !v)}
            aria-pressed={en}
            className={`h-10 rounded-lg border px-3.5 text-xs font-bold transition ${
              en ? "border-white bg-white text-black" : "border-white/10 bg-black/30 text-zinc-400 hover:text-white"
            }`}
          >
            EN
          </button>

          {/* export — the one accent */}
          <button
            type="button"
            onClick={exportPng}
            disabled={busy || !card}
            className="flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-xs font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            <DownloadIcon width={15} height={15} className={busy ? "animate-bounce" : ""} />
            {busy ? t("darkroom.exporting") : t("darkroom.export")}
          </button>
        </div>
      </header>

      {!card ? (
        <div className="mt-14 rounded-xl border border-dashed border-white/10 p-14 text-center">
          <p className="text-sm text-zinc-400">{t("darkroom.empty")}</p>
        </div>
      ) : (
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
          {/* ── workshop ──────────────────────────────────────────── */}
          <section className="order-2 min-w-0 lg:order-1">
            {/* 01 — title */}
            <Section index="01" title={t("darkroom.pickTitle")}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-600" style={{ insetInlineStart: 14 }}>
                  <SearchIcon width={15} height={15} />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("darkroom.searchPh")}
                  className={`${INPUT} h-10 ps-10 pe-9`}
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label={t("common.close")} className="absolute top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white" style={{ insetInlineEnd: 12 }}>
                    <CloseIcon width={13} height={13} />
                  </button>
                )}
              </div>

              {results !== null && (
                <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
                  {results.length === 0 && <p className="px-4 py-3 text-xs text-zinc-500">{t("darkroom.noResult")}</p>}
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        applyTitle(r);
                        setQ("");
                        setList((prev) => (prev.some((x) => x.id === r.id) ? prev : [r, ...prev]));
                      }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-white/[0.05] ${sel?.id === r.id ? "bg-white/[0.06]" : ""}`}
                    >
                      <img src={r.poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-white">{locale === "en" && r.titleEn ? r.titleEn : r.title}</span>
                        <span className="num mt-0.5 block text-[11px] text-zinc-500">
                          {locale === "en" ? r.title : r.titleEn} · {faDigits(r.year)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">{t("darkroom.yourTitles")}</p>
              <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5">
                {list.slice(0, 24).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => applyTitle(r)}
                    title={locale === "en" ? r.titleEn : r.title}
                    className={`group w-[68px] shrink-0 text-start ${sel?.id === r.id ? "" : "opacity-75 hover:opacity-100"}`}
                  >
                    <span className={`block overflow-hidden rounded-md transition ${sel?.id === r.id ? "ring-2 ring-brand" : "ring-1 ring-white/10 group-hover:ring-white/30"}`}>
                      <img src={r.poster} alt="" className="aspect-[2/3] w-full object-cover" />
                    </span>
                    <span className="mt-1.5 block truncate text-[10px] text-zinc-500">{locale === "en" ? r.titleEn || r.title : r.title}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* 02 — structure */}
            <Section index="02" title={t("darkroom.template")}>
              <div className="flex flex-wrap gap-3">
                {DR_TEMPLATES.map((x) => {
                  const on = tpl === x.id;
                  const miniW = fmt === "post" ? 104 : 60;
                  const miniH = fmt === "post" ? 104 : 108;
                  return (
                    <button key={x.id} type="button" onClick={() => setTpl(x.id)} className="group text-start" aria-pressed={on}>
                      <span
                        className="relative block overflow-hidden rounded-md bg-ink-800 transition"
                        style={{ width: miniW, height: miniH, ...(on ? { boxShadow: "0 0 0 1.5px var(--color-brand)" } : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }) }}
                      >
                        <span className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${miniW / 1080})` }}>
                          {card && <DrCardView d={{ ...card, tpl: x.id }} />}
                        </span>
                      </span>
                      <span className={`mt-1.5 block max-w-[104px] truncate text-[10.5px] font-bold ${on ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"}`}>
                        {locale === "en" ? x.en : x.fa}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* 03 — details */}
            <Section index="03" title={t("darkroom.details")}>
              {/* score */}
              <Field label={t("darkroom.score")}>
                <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(n)}
                      aria-label={String(n)}
                      className={`h-6 w-6 rounded-[4px] border text-[11px] font-bold transition ${
                        n <= score ? "border-brand bg-brand text-white" : "border-white/12 bg-transparent text-zinc-500 hover:border-white/40 hover:text-white"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="num ms-3 text-base font-black text-white">{faDigits(score)}</span>
                  <span className="text-[11px] text-zinc-600">/ 10</span>
                </div>
              </Field>

              <Field label={t("darkroom.comment")}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={320}
                  placeholder={t("darkroom.commentPh")}
                  className={`${INPUT} resize-none p-3.5 leading-7`}
                />
              </Field>

              <Field label={t("darkroom.final")}>
                <input
                  value={finalWords}
                  onChange={(e) => setFinalWords(e.target.value)}
                  maxLength={90}
                  placeholder={t("darkroom.finalPh")}
                  className={`${INPUT} h-10 px-3.5`}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("darkroom.handle")}>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    maxLength={30}
                    dir="ltr"
                    placeholder="@your_id"
                    className={`${INPUT} h-10 px-3.5`}
                  />
                </Field>
                <Field label={t("darkroom.watchDate")}>
                  <div className="flex gap-2">
                    <select
                      value={when.gm}
                      onChange={(e) => setWhen((wd) => ({ ...wd, gm: Number(e.target.value) }))}
                      className={`${INPUT} h-10 min-w-0 flex-1 px-2.5`}
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
                      className={`${INPUT} h-10 min-w-0 flex-1 px-2.5`}
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

              {/* avatar */}
              <Field label={t("darkroom.avatar")}>
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-white/10 bg-black/30 p-3.5">
                  {profile.avatarImage ? (
                    <img src={profile.avatarImage} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/20" />
                  ) : (
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-black text-white ${grad}`} style={{ boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.25)" }}>
                      {profileInitial}
                    </span>
                  )}
                  <p className="min-w-0 flex-1 text-[11px] leading-5 text-zinc-500">{t("darkroom.avatarHint")}</p>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > 12 * 1024 * 1024) {
                          toast.error(locale === "en" ? "Image is too large (max 12MB)." : "حجم عکس زیاد است (حداکثر ۱۲ مگابایت).");
                          return;
                        }
                        fileToAvatarDataUrl(file)
                          .then((d) => saveAvatar(d))
                          .catch(() => toast.error(locale === "en" ? "Could not read this image." : "خواندن این عکس ممکن نشد."));
                      }}
                    />
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => avatarInputRef.current?.click()}
                      className="h-8 rounded-md border border-white/15 bg-white/[0.06] px-3 text-[11px] font-bold text-white transition hover:bg-white/10 disabled:opacity-50"
                    >
                      {t("darkroom.changeAvatar")}
                    </button>
                    {profile.avatarImage && (
                      <button
                        type="button"
                        disabled={avatarBusy}
                        onClick={() => saveAvatar(null)}
                        className="h-8 rounded-md px-2.5 text-[11px] font-bold text-zinc-500 transition hover:bg-white/5 hover:text-rose-400 disabled:opacity-50"
                      >
                        {t("darkroom.removeAvatar")}
                      </button>
                    )}
                  </div>
                </div>
              </Field>

              {/* switches */}
              <div className="mt-1 flex flex-wrap gap-2">
                <Switch on={showLogo} onClick={() => setShowLogo((v) => !v)} label={t("darkroom.showLogo")} />
              </div>
            </Section>
          </section>

          {/* ── preview ──────────────────────────────────────────── */}
          <aside className="order-1 lg:order-2 lg:sticky lg:top-24">
            <div
              ref={wrapRef}
              className="relative mx-auto overflow-hidden rounded-lg border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
              style={{ aspectRatio: previewAspect, width: fmt === "post" ? "100%" : "min(100%, calc((100dvh - 220px) * 0.5625))" }}
            >
              <div ref={cardRef} style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <DrCardView d={card} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between px-0.5 text-[10.5px] font-medium tracking-wide text-zinc-600">
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
/* workshop atoms — flat, hairline, quiet                              */
/* ------------------------------------------------------------------ */
function Section({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.07] py-8 first:pt-0 last:border-b-0">
      <p className="mb-5 flex items-baseline gap-3">
        <span className="num text-[10px] font-bold tracking-widest text-zinc-600">{index}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400">{title}</span>
        <span className="h-px flex-1 bg-white/[0.05]" />
      </p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[10.5px] font-bold text-zinc-500">{label}</p>
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
      className={`flex h-9 items-center gap-2.5 rounded-lg border px-3 text-[11px] font-bold transition ${
        on ? "border-white/35 bg-white/[0.08] text-white" : "border-white/10 bg-transparent text-zinc-500 hover:text-white"
      }`}
    >
      <span className={`relative h-3.5 w-6 rounded-full transition ${on ? "bg-white/85" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all ${on ? "bg-black start-3" : "bg-white start-0.5"}`} />
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
