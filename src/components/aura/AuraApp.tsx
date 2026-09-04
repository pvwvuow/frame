"use client";

/* ------------------------------------------------------------------
   AURA skin — Liquid Glass × Field Kit
   oc_liquid_glass (glass depth · refraction rims · specular sheen) ×
   cavalry-field-kit (grain · halation · light leaks · timecode)
------------------------------------------------------------------- */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Aura } from "@/components/aura/atmosphere";
import { StatusBar, TitleBar } from "@/components/aura/chrome";
import { Sidebar, type NavId } from "@/components/aura/sidebar";
import { TopBar } from "@/components/aura/topbar";
import { Hero } from "@/components/aura/hero";
import { ContinueCard, PosterCard, Reel, RowHeader } from "@/components/aura/cards";
import { DetailModal } from "@/components/aura/detail-modal";
import { ALL, CONTINUE, HERO, SERIES, TREND, type Title } from "@/lib/titles";

export function AuraApp({ onSwitchSkin }: { onSwitchSkin?: () => void }) {
  const [nav, setNav] = useState<NavId>("home");
  const [chip, setChip] = useState("همه");
  const [open, setOpen] = useState<Title | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((m: string) => setToast(m), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const showFilms = chip === "همه" || chip === "فیلم" || chip === "اکشن" || chip === "علمی‌تخیلی";
  const showSeries = chip === "همه" || chip === "سریال" || chip === "جنایی" || chip === "فانتزی";

  const trend = TREND.filter((t) =>
    chip === "همه" ? true
      : chip === "فیلم" || chip === "سریال" ? t.kind === (chip as Title["kind"])
      : t.genres.some((g) => g.includes(chip)),
  );
  const series = SERIES.filter((t) =>
    chip === "همه" || chip === "سریال" ? true : t.genres.some((g) => g.includes(chip)),
  );

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-abyss text-inkc">
      <Aura />
      <TitleBar />

      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar active={nav} onPick={setNav} />

        <main className="scroll-glass relative min-w-0 flex-1 overflow-y-auto" dir="rtl">
          <TopBar chip={chip} onChip={setChip} />
          <Hero onOpen={() => setOpen(HERO)} onToast={showToast} />

          <div className="space-y-12 px-6 py-10">
            {/* continue watching */}
            <section aria-label="ادامه تماشا">
              <RowHeader reel="REEL 01" title="ادامهٔ تماشا" en="RESUME" hint="همه" />
              <Reel>
                {CONTINUE.map((t) => (
                  <div key={t.id} className="w-[310px] shrink-0 sm:w-[335px]">
                    <ContinueCard t={t} onOpen={setOpen} />
                  </div>
                ))}
              </Reel>
            </section>

            {/* trending films */}
            {showFilms && trend.length > 0 && (
              <section aria-label="ترند این هفته">
                <RowHeader reel="REEL 02" title="ترندِ این هفته" en="TRENDING" hint="همهٔ فیلم‌ها" />
                <Reel>
                  {trend.map((t, i) => (
                    <div key={t.id} className="w-[176px] shrink-0 pt-6 sm:w-[190px]">
                      <PosterCard t={t} rank={i + 1} onOpen={setOpen} onToast={showToast} />
                    </div>
                  ))}
                </Reel>
              </section>
            )}

            {/* series */}
            {showSeries && series.length > 0 && (
              <section aria-label="سریال‌های جدید">
                <RowHeader reel="REEL 03" title="سریال‌های تازه رسیده" en="NEW SERIES" hint="همهٔ سریال‌ها" />
                <Reel>
                  {series.map((t) => (
                    <div key={t.id} className="w-[176px] shrink-0 sm:w-[190px]">
                      <PosterCard t={t} onOpen={setOpen} onToast={showToast} />
                    </div>
                  ))}
                </Reel>
              </section>
            )}

            {/* browse-all grid when a genre chip narrows things down */}
            {chip !== "همه" && ALL.filter((t) => t.genres.some((g) => g.includes(chip))).length > 0 && (
              <section aria-label="نتایج دسته‌بندی">
                <RowHeader reel="REEL 04" title={`دستهٔ «${chip}»`} en="GENRE BIN" />
                <div className="grid grid-cols-2 gap-5 pt-4 sm:grid-cols-4 xl:grid-cols-6">
                  {ALL.filter((t) => t.genres.some((g) => g.includes(chip))).map((t) => (
                    <PosterCard key={t.id} t={t} onOpen={setOpen} onToast={showToast} />
                  ))}
                </div>
              </section>
            )}

            {/* footer note */}
            <footer className="glass lg-rim mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl px-6 py-4">
              <span dir="ltr" className="font-disp text-[9.5px] tracking-[0.26em] text-hushc">
                GHAB · LIQUID CINEMA BUILD 0.3.0 — DEMO REEL
              </span>
              <span className="text-[11.5px] text-hushc" dir="rtl">
                تمام پوسترها و اطلاعات این پیش‌نمایش، دادهٔ نمایشی (دمو) هستند.
              </span>
              <span dir="ltr" className="ms-auto flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-hushc">
                <span className="rec-dot" /> PROJECTION ON
              </span>
            </footer>
          </div>
        </main>
      </div>

      <StatusBar playing={open ? open.fa : HERO.fa} onSwitchSkin={onSwitchSkin} />

      <DetailModal t={open} onClose={() => setOpen(null)} onToast={showToast} />

      {/* toast — liquid droplet */}
      <AnimatePresence>
        {toast && (
          <motion.div
            dir="rtl"
            className="glass lg-rim fixed bottom-14 end-6 z-[95] flex items-center gap-2.5 rounded-full px-5 py-3 text-[12.5px] text-inkc"
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            role="status"
          >
            <span className="size-2 rounded-full bg-aqua shadow-[0_0_10px_rgba(109,232,255,0.9)]" aria-hidden />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
