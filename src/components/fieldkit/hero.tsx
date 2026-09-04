"use client";

import { Play, Plus, Info, Star } from "lucide-react";
import { motion, useMotionValue, useSpring, useTransform, type Variants } from "framer-motion";
import { Corners } from "./atmosphere";
import { HERO } from "@/lib/titles";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function Hero({ onOpen, onToast }: { onOpen: () => void; onToast: (m: string) => void }) {
  const t = HERO;

  /* soft mouse parallax — backdrop and print drift on opposite sides */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 18 });
  const sy = useSpring(my, { stiffness: 55, damping: 18 });
  const bx = useTransform(sx, [-1, 1], [-14, 14]);
  const by = useTransform(sy, [-1, 1], [-9, 9]);
  const px = useTransform(sx, [-1, 1], [12, -12]);
  const py = useTransform(sy, [-1, 1], [9, -9]);

  return (
    <section
      className="scanlines relative h-[58vh] min-h-[450px] overflow-hidden border-b border-line"
      aria-label="فیلم منتخب"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
        my.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
    >
      {/* backdrop — parallax layer */}
      <motion.div className="flicker absolute inset-0" style={{ x: bx, y: by, scale: 1.07 }}>
        <img
          src={t.backdrop}
          alt={`پس‌زمینهٔ ${t.fa}`}
          className="size-full object-cover object-center"
        />
      </motion.div>

      {/* cinematic gradients (RTL: text anchored to the right) */}
      <div className="absolute inset-0 bg-gradient-to-l from-coal via-coal/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-coal via-transparent to-coal/35" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_78%_62%,rgba(255,122,31,0.10),transparent_65%)]" />
      <div className="godrays" />
      {/* film-burn edge on the inline end */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-40 mix-blend-screen"
        style={{
          background:
            "linear-gradient(270deg, rgba(255,122,31,0.20), rgba(229,72,31,0.08) 45%, transparent 75%)",
        }}
      />

      {/* viewfinder + OSD labels */}
      <Corners />
      <span className="absolute left-5 top-5 z-[5] flex items-center gap-2 rounded-sm border border-line/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-ink/85 backdrop-blur-sm">
        <span className="rec-dot" /> REC
      </span>
      <span
        dir="ltr"
        className="absolute right-5 top-5 z-[5] rounded-sm border border-line/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] text-amber/90 backdrop-blur-sm"
      >
        A-CAM · {t.quality} · {t.stock.split("·")[1] ?? "2.39:1"}
      </span>

      {/* floating film print — physical poster on the lab table */}
      <motion.div
        style={{ x: px, y: py }}
        className="absolute bottom-9 left-12 z-[5] hidden xl:block"
        aria-hidden
      >
        <div className="print-frame float-soft w-[212px] rounded-md p-2.5 pb-2" style={{ "--tilt": "-5deg" } as React.CSSProperties}>
          <div className="overflow-hidden rounded-sm">
            <img src={t.poster} alt="" className="aspect-[2/3] w-full object-cover" />
          </div>
          <div dir="ltr" className="mt-2 flex items-center justify-between px-0.5 font-mono text-[8.5px] tracking-[0.2em] text-faint">
            <span>FILM PRINT · №01</span>
            <span className="text-amber/80">{t.stock.split("·")[0]}</span>
          </div>
        </div>
      </motion.div>

      {/* content */}
      <motion.div
        className="absolute inset-x-0 bottom-0 z-[5] px-8 pb-8"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <div className="max-w-[580px]">
          <motion.div variants={item} className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.26em] text-amber/90">
            <span className="inline-block h-px w-8 bg-gradient-to-l from-burn to-transparent" />
            FEATURED REEL · اکران امشب
          </motion.div>

          <motion.h1 variants={item} className="text-ember-glow text-[46px] font-black leading-[1.05] text-ink">
            {t.fa}
          </motion.h1>
          <motion.p variants={item} dir="ltr" className="title-outline mt-1 text-right font-mono text-[15px] font-bold tracking-[0.34em]">
            {t.en}
          </motion.p>

          <motion.div variants={item} className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-mut">
            <span className="flex items-center gap-1 font-bold text-amber">
              <Star size={13} className="fill-amber text-amber" /> {t.rating.toLocaleString("fa-IR")}
            </span>
            <span className="text-faint">|</span>
            <span>{t.year.toLocaleString("fa-IR")}</span>
            {t.genres.map((g) => (
              <span key={g} className="chip !py-0.5">{g}</span>
            ))}
            <span className="text-faint">|</span>
            <span>{t.duration}</span>
            <span className="rounded-sm border border-line2 px-1.5 py-px font-mono text-[9.5px] text-amber/90" dir="ltr">
              {t.quality}
            </span>
          </motion.div>

          <motion.p variants={item} className="mt-3.5 line-clamp-2 max-w-[520px] text-[13.5px] leading-7 text-mut/95">
            {t.synopsis}
          </motion.p>

          <motion.div variants={item} className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn-burn h-11 px-6 text-[14px]" onClick={onOpen}>
              <Play size={17} className="fill-[#191006]" /> پخش فیلم
            </button>
            <button
              className="btn-ghost h-11 px-5 text-[13px]"
              onClick={() => onToast("«دشتِ اخگر» به لیست من اضافه شد")}
            >
              <Plus size={16} /> لیست من
            </button>
            <button className="btn-ghost h-11 px-5 text-[13px]" onClick={onOpen}>
              <Info size={16} /> جزئیات
            </button>
            <span dir="ltr" className="ms-1 hidden font-mono text-[9px] tracking-[0.22em] text-faint 2xl:block">
              SHOT ON {t.stock}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
