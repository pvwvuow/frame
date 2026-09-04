"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Atmosphere } from "@/components/fieldkit/atmosphere";
import { StatusBar, TitleBar } from "@/components/fieldkit/chrome";
import { Sidebar, type NavId } from "@/components/fieldkit/sidebar";
import { TopBar } from "@/components/fieldkit/topbar";
import { Hero } from "@/components/fieldkit/hero";
import { ContinueCard, PosterCard, Reel, RowHeader } from "@/components/fieldkit/cards";
import { DetailModal } from "@/components/fieldkit/detail-modal";
import { ALL, CONTINUE, HERO, SERIES, TREND, type Title } from "@/lib/titles";

export default function Page() {
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
      : chip === "فیلم" || chip === "سریال" ? t.kind === chip
      : t.genres.some((g) => g.includes(chip)),
  );
  const series = SERIES.filter((t) =>
    chip === "همه" || chip === "سریال" ? true : t.genres.some((g) => g.includes(chip)),
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-coal text-ink">
      <Atmosphere />
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar active={nav} onPick={setNav} />

        <main className="scroll-film relative z-10 min-w-0 flex-1 overflow-y-auto" dir="rtl">
          <TopBar chip={chip} onChip={setChip} />
          <Hero onOpen={() => setOpen(HERO)} onToast={showToast} />

          <div className="space-y-10 px-8 py-8">
            {/* continue watching */}
            <section aria-label="ادامه تماشا">
              <RowHeader reel="REEL 01" title="ادامهٔ تماشا" en="RESUME" hint="همه" />
              <Reel>
                {CONTINUE.map((t) => (
                  <div key={t.id} className="w-[300px] shrink-0 sm:w-[330px]">
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
                    <div key={t.id} className="w-[172px] shrink-0 sm:w-[188px]">
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
                    <div key={t.id} className="w-[172px] shrink-0 sm:w-[188px]">
                      <PosterCard t={t} onOpen={setOpen} onToast={showToast} />
                    </div>
                  ))}
                </Reel>
              </section>
            )}

            {/* browse-all grid (when a genre chip narrows things down) */}
            {chip !== "همه" && ALL.filter((t) => t.genres.some((g) => g.includes(chip))).length > 0 && (
              <section aria-label="نتایج دسته‌بندی">
                <RowHeader reel="REEL 04" title={`دستهٔ «${chip}»`} en="GENRE BIN" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">
                  {ALL.filter((t) => t.genres.some((g) => g.includes(chip))).map((t) => (
                    <PosterCard key={t.id} t={t} onOpen={setOpen} onToast={showToast} />
                  ))}
                </div>
              </section>
            )}

            {/* trailer strip — darkroom footer note */}
            <footer className="burn-edge mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-panel/50 px-5 py-4">
              <span className="font-mono text-[9px] tracking-[0.26em] text-faint" dir="ltr">
                GHAB · FIELD KIT BUILD 0.2.0 — DEMO REEL
              </span>
              <span className="text-[11.5px] text-faint" dir="rtl">
                تمام پوسترها و اطلاعات این پیش‌نمایش، دادهٔ نمایشی (دمو) هستند.
              </span>
              <span className="ms-auto flex items-center gap-2 font-mono text-[9px] tracking-[0.2em] text-faint" dir="ltr">
                <span className="rec-dot" /> PROJECTION ON
              </span>
            </footer>
          </div>
        </main>
      </div>

      <StatusBar playing={open ? open.fa : HERO.fa} />

      <DetailModal t={open} onClose={() => setOpen(null)} onToast={showToast} />

      {/* toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            dir="rtl"
            className="lab-panel fixed bottom-14 left-6 z-[95] flex items-center gap-2.5 rounded-md px-4 py-3 text-[12.5px] text-ink shadow-halation"
            initial={{ opacity: 0, y: 14, x: -12 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            role="status"
          >
            <span className="rec-dot" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
