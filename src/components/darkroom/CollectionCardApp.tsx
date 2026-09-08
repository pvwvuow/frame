"use client";

/* eslint-disable @next/next/no-img-element */
/**
 * Darkroom — COLLECTION card workshop (v0.10.36).
 * Same professional workshop as the movie cards: pick one of your own
 * collections, choose one of 6 ready-made structures, export a share-ready
 * PNG (post / story). Data comes from the user-collections API (desktop
 * Prisma / mobile Dexie — the same surface the My List page uses), so it
 * works identically on every platform with zero new backend.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { DrCollectionCardView } from "./CollectionCards";
import { INPUT, GRADS, Field, Section, Switch } from "./DarkroomApp";
import {
  DR_COLLECTION_TEMPLATES,
  DR_FORMATS,
  faDigits,
  type DrCollectionData,
  type DrCollectionItem,
  type DrCollectionTplId,
  type DrFormat,
} from "@/lib/darkroom";
import { fetchUserCollections, fetchCollectionItems, type UCollection } from "@/lib/collections";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useLibrary } from "@/components/library/LibraryProvider";
import { useCloudSession } from "@/lib/cloud";
import { DownloadIcon, PlusIcon } from "@/components/Icons";

export default function CollectionCardApp({ modeBar }: { modeBar?: ReactNode }) {
  const { t, locale } = useI18n();
  const { profile } = useLibrary();
  const { session } = useCloudSession();

  /* ---------------- state ---------------- */
  const [cols, setCols] = useState<UCollection[] | null>(null);
  const [colId, setColId] = useState<number | null>(null);
  const [items, setItems] = useState<DrCollectionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [tpl, setTpl] = useState<DrCollectionTplId>("sheet");
  const [fmt, setFmt] = useState<DrFormat>("post");
  const [en, setEn] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [note, setNote] = useState("");
  const [handle, setHandle] = useState("");

  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(0.4);

  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fontCssRef = useRef<string | null>(null);

  const sel = useMemo(() => cols?.find((c) => c.id === colId) ?? null, [cols, colId]);

  /* ---------------- load collections ---------------- */
  useEffect(() => {
    let alive = true;
    fetchUserCollections()
      .then((list) => {
        if (!alive) return;
        setCols(list);
        setColId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(() => alive && setCols([]));
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- load items of the selected collection ---------------- */
  useEffect(() => {
    if (colId == null) {
      setItems([]);
      return;
    }
    let alive = true;
    setItemsLoading(true);
    fetchCollectionItems(colId)
      .then((rows) => {
        if (!alive) return;
        setItems(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            titleEn: r.titleEn,
            poster: r.poster,
            backdrop: r.backdrop,
            year: r.year,
            type: r.type,
          }))
        );
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setItemsLoading(false));
    return () => {
      alive = false;
    };
  }, [colId]);

  /* ---------------- handle default ---------------- */
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

  /* ---------------- card payload ---------------- */
  const profileInitial = (profile.displayName || "F").trim().slice(0, 1).toUpperCase();
  const grad = GRADS[profile.avatar % GRADS.length] ?? GRADS[0];

  const card: DrCollectionData | null = useMemo(() => {
    if (!sel) return null;
    return {
      name: sel.name,
      note,
      items,
      totalCount: sel.count,
      movies: sel.movies,
      series: sel.series,
      tpl,
      fmt,
      lang: en ? "en" : "fa",
      handle: handle.trim(),
      showLogo,
      userInitial: profileInitial,
      avatarGrad: grad,
      avatarImage: profile.avatarImage ?? null,
    };
  }, [sel, items, note, tpl, fmt, en, handle, showLogo, profileInitial, grad, profile.avatarImage]);

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
      a.download = `frame-darkroom-col-${card.name.replace(/[^\w\u0600-\u06FF]+/g, "-")}-${fmt}.png`;
      a.click();
      toast.success(t("colcard.exported"));
    } catch {
      toast.error(t("colcard.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- derived ---------------- */
  const f = DR_FORMATS.find((x) => x.id === fmt)!;
  const previewAspect = fmt === "post" ? "1 / 1" : "9 / 16";

  /* ================================================================ */
  return (
    <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-28">
      {/* ── toolband ──────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-white/[0.07] pb-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black tracking-tight text-white sm:text-[28px]">{t("colcard.title")}</h1>
          <p className="mt-1.5 max-w-lg text-[13px] leading-6 text-zinc-500">{t("colcard.sub")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {modeBar}
          {/* format */}
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

          {/* export */}
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

      {!cols ? (
        <div className="mt-14 flex justify-center">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-white/10" />
        </div>
      ) : cols.length === 0 ? (
        <div className="mt-14 rounded-xl border border-dashed border-white/10 p-14 text-center">
          <p className="text-sm text-zinc-400">{t("colcard.empty")}</p>
          <Link
            href="/my-list"
            className="mx-auto mt-5 flex h-10 w-fit items-center gap-2 rounded-lg bg-brand px-5 text-xs font-extrabold text-white transition hover:bg-brand-600"
          >
            <PlusIcon width={15} height={15} />
            {t("colcard.createFirst")}
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
          {/* ── workshop ──────────────────────────────────────────── */}
          <section className="order-2 min-w-0 lg:order-1">
            {/* 01 — collection */}
            <Section index="01" title={t("colcard.pick")}>
              <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1.5">
                {cols.map((cl) => {
                  const on = cl.id === colId;
                  return (
                    <button
                      key={cl.id}
                      type="button"
                      onClick={() => setColId(cl.id)}
                      className="group w-[132px] shrink-0 text-start"
                      aria-pressed={on}
                    >
                      <span
                        className={`relative block overflow-hidden rounded-md bg-ink-800 transition ${on ? "" : "opacity-80 group-hover:opacity-100"}`}
                        style={{ height: 74, ...(on ? { boxShadow: "0 0 0 1.5px var(--color-brand)" } : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }) }}
                      >
                        <span className="absolute inset-0 flex">
                          {(cl.posters.length ? cl.posters.slice(0, 3) : ["", "", ""]).map((p, i) => (
                            <span key={i} className="relative h-full flex-1 overflow-hidden bg-black/40">
                              {p ? <img src={p} alt="" className="h-full w-full object-cover" /> : null}
                            </span>
                          ))}
                        </span>
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-4">
                          <span className="num block text-[10px] font-bold text-zinc-300">
                            {faDigits(cl.count)} {t("colcard.unit")}
                          </span>
                        </span>
                      </span>
                      <span className={`mt-1.5 block truncate text-[11px] font-bold ${on ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"}`}>
                        {cl.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {itemsLoading && <p className="num mt-2 text-[11px] text-zinc-600">{t("colcard.loading")}</p>}
            </Section>

            {/* 02 — structure */}
            <Section index="02" title={t("darkroom.template")}>
              <div className="flex flex-wrap gap-3">
                {DR_COLLECTION_TEMPLATES.map((x) => {
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
                          {card && <DrCollectionCardView d={{ ...card, tpl: x.id }} />}
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
            <Section index="03" title={t("colcard.details")}>
              <Field label={t("colcard.note")}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={140}
                  placeholder={t("colcard.notePh")}
                  className={`${INPUT} resize-none p-3.5 leading-7`}
                />
              </Field>

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
                {card && <DrCollectionCardView d={card} />}
              </div>
            </div>
            <div className="num mt-3 flex items-center justify-between px-0.5 text-[10.5px] font-medium tracking-wide text-zinc-600">
              <span>
                {t("darkroom.sizeHint")} — 1080 × {faDigits(f.h)}
              </span>
              <span>{en ? "EN" : "FA"}</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
