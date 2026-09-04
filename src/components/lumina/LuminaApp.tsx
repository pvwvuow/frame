"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Flame, Tv, Play, History } from "lucide-react";
import { Atmosphere } from "./atmosphere";
import { Titlebar } from "./chrome";
import { Dock } from "./sidebar";
import { CommandBar } from "./topbar";
import { Hero } from "./hero";
import { RowHeader, Reel, RankCard, PosterCard, ContinueCard, CollectionBanner } from "./cards";
import { PlayerBar } from "./player-bar";
import { DetailSheet } from "./detail-modal";
import { TREND, SERIES, CONTINUE, type Title } from "@/lib/titles";

/* LUMINA — app shell composition */

type Toast = { id: number; title: string; sub?: string; icon: "check" | "download" | "play" };

const MATCH: Record<string, number> = {
  orbit: 97, neon: 94, cloud: 88, front: 91, sea: 84, room8: 89, caravan: 86, round: 82,
  coldcase: 95, station13: 93, hunters: 90, train: 81,
};

let toastSeq = 0;

export function LuminaApp() {
  const [genre, setGenre] = useState<string>("همه");
  const [sheet, setSheet] = useState<Title | null>(null);
  const [playing, setPlaying] = useState<Title | null>(null);
  const [inList, setInList] = useState<Set<string>>(new Set(["neon"]));
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);

  /* demo: a finished download arrives shortly after boot */
  useEffect(() => {
    const id = setTimeout(() => {
      pushToast({ title: "دانلود کامل شد", sub: "ایستگاه ۱۳ · قسمت ۳ · ۲٫۱ گیگابایت", icon: "download" });
    }, 2200);
    return () => clearTimeout(id);
  }, [pushToast]);

  const openSheet = useCallback((t: Title) => setSheet(t), []);
  const play = useCallback((t: Title) => {
    setSheet(null);
    setPlaying(t);
    pushToast({ title: "پخش آغاز شد", sub: `${t.fa} · ${t.quality} HDR`, icon: "play" });
  }, [pushToast]);

  const toggleList = useCallback((t: Title) => {
    setInList((s) => {
      const n = new Set(s);
      if (n.has(t.id)) { n.delete(t.id); pushToast({ title: "از لیست حذف شد", sub: t.fa, icon: "check" }); }
      else { n.add(t.id); pushToast({ title: "به لیست اضافه شد", sub: t.fa, icon: "check" }); }
      return n;
    });
  }, [pushToast]);

  /* genre filtering — «همه/فیلم/سریال» buckets + genre names */
  const filterT = useMemo(() => {
    if (genre === "همه") return TREND;
    if (genre === "فیلم") return TREND;
    return TREND.filter((t) => t.genres.some((g) => g.includes(genre)));
  }, [genre]);
  const filterS = useMemo(() => {
    if (genre === "همه") return SERIES;
    if (genre === "سریال") return SERIES;
    return SERIES.filter((t) => t.genres.some((g) => g.includes(genre)));
  }, [genre]);

  return (
    <div className="relative h-full">
      <Atmosphere />
      <Titlebar />

      <div className="relative z-[5] flex h-[calc(100%-42px)]">
        {/* main scroll column */}
        <main className="flex-1 min-w-0 overflow-y-auto scroll-lum ps-[254px] pe-5 pb-24">
          <CommandBar genre={genre} onGenre={setGenre} />

          <div className="px-1">
            {/* hero — featured */}
            <Hero
              title={TREND[0]}
              match={MATCH[TREND[0].id] ?? 90}
              onPlay={play}
              onDetails={openSheet}
            />

            {/* continue watching */}
            <RowHeader icon={<History size={14} />} label="ادامهٔ تماشا" link="۳ عنوان در انتظار" />
            <Reel>
              {CONTINUE.map((t) => (
                <ContinueCard key={t.id} t={t} onPlay={play} />
              ))}
            </Reel>

            {/* trending ranked */}
            <RowHeader icon={<Flame size={14} />} label="داغ‌ترین‌های این هفته" link="TOP 10 IRAN" />
            <Reel>
              {filterT.map((t, i) => (
                <RankCard key={t.id} t={t} rank={i + 1} onOpen={openSheet} />
              ))}
            </Reel>

            {/* collection banner */}
            <div className="mt-6">
              <CollectionBanner onExplore={() => pushToast({ title: "مجموعهٔ شب‌های نئون", sub: "۱۲ عنوان منتخب نئو-نوآر", icon: "play" })} />
            </div>

            {/* series */}
            <RowHeader icon={<Tv size={14} />} label="سریال‌های اختصاصی قاب" link="۷ فصل فعال" />
            {filterS.length > 0 ? (
              <Reel>
                {filterS.map((t) => (
                  <PosterCard key={t.id} t={t} onOpen={openSheet} />
                ))}
              </Reel>
            ) : (
              <p className="text-faint text-[12.5px] py-8 text-center">در ژانر «{genre}» فعلاً سریالی نداریم — به‌زودی اضافه می‌شود.</p>
            )}

            {filterT.length === 0 && (
              <p className="text-faint text-[12.5px] py-4 text-center">برای ژانر «{genre}» فیلمی در بخش داغ پیدا نشد.</p>
            )}

            {/* bottom breathing room */}
            <div className="h-10" />
          </div>
        </main>

        <Dock />
      </div>

      {/* now playing */}
      <AnimatePresence>
        {playing && <PlayerBar key={playing.id} title={playing} onClose={() => setPlaying(null)} />}
      </AnimatePresence>

      {/* detail sheet */}
      <AnimatePresence>
        {sheet && (
          <DetailSheet
            key={sheet.id}
            title={sheet}
            onClose={() => setSheet(null)}
            onPlay={play}
            inList={inList.has(sheet.id)}
            onToggleList={toggleList}
          />
        )}
      </AnimatePresence>

      {/* toasts — bottom-left corner (opposite the dock, above the player) */}
      <div className="fixed bottom-24 left-5 z-[90] flex flex-col gap-2.5 w-[330px]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className="toast glass-deep"
              initial={{ opacity: 0, x: -40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
            >
              <span className="toast-ic">
                {t.icon === "download" && <Download size={16} />}
                {t.icon === "check" && <Check size={16} />}
                {t.icon === "play" && <Play size={15} fill="currentColor" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold">{t.title}</span>
                {t.sub && <span className="block text-[10.5px] text-mut truncate">{t.sub}</span>}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
