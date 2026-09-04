"use client";

import { useRef } from "react";
import {
  motion, useMotionValue, useSpring, useTransform, type Variants,
} from "framer-motion";
import { Play, Plus, Info, Sparkles, Star, Clapperboard, Flame } from "lucide-react";
import type { Title } from "@/lib/titles";
import { toFa } from "./utils";

const parent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 26, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] } },
};

/* Ambient billboard — featured title with mouse parallax */

export function Hero({
  title,
  match,
  onPlay,
  onDetails,
}: {
  title: Title;
  match: number;
  onPlay: (t: Title) => void;
  onDetails: (t: Title) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 18 });
  const sy = useSpring(my, { stiffness: 55, damping: 18 });
  const bgX = useTransform(sx, [-1, 1], [14, -14]);
  const bgY = useTransform(sy, [-1, 1], [10, -10]);
  const poX = useTransform(sx, [-1, 1], [-10, 10]);
  const poY = useTransform(sy, [-1, 1], [-7, 7]);

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  const words = title.en.split(" ");
  const head = words.slice(0, Math.max(1, words.length - 1)).join(" ");
  const tail = words[words.length - 1];

  return (
    <section
      ref={ref}
      className="hero"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      aria-label={`پیشنهاد ویژه: ${title.fa}`}
    >
      {/* backdrop + scrims */}
      <motion.div className="hero-backdrop" style={{ x: bgX, y: bgY }} aria-hidden>
        {title.backdrop && <img src={title.backdrop} alt="" />}
      </motion.div>
      <div className="hero-scrim-x" aria-hidden />
      <div className="hero-scrim-y" aria-hidden />

      {/* copy */}
      <motion.div className="hero-content" variants={parent} initial="hidden" animate="show">
        <motion.div variants={item} className="flex items-center gap-2.5 mb-5 flex-wrap">
          <span className="badge-prism">
            <Sparkles size={11} />
            پیشنهاد ویژهٔ امشب
          </span>
          <span className="badge-prism border-rose/40! bg-rose/10! text-[#FFB1D0]!">
            <Flame size={11} />
            TOP 1 · TRENDING
          </span>
        </motion.div>

        <motion.h1 variants={item} className="hero-title-en mb-1.5">
          {head} <span className="ghost">{tail}</span>
        </motion.h1>

        <motion.p variants={item} className="text-mut text-[17px] font-medium mb-4">
          {title.fa} <span className="text-faint mx-1">·</span> {toFa(title.year)}
        </motion.p>

        <motion.div variants={item} className="flex items-center gap-2 flex-wrap mb-4">
          <span className="hero-meta">
            <Star size={12} className="text-amber-300" fill="currentColor" />
            {toFa(title.rating)}
          </span>
          <span className="hero-meta match">{toFa(match)}٪ تطابق</span>
          <span className="hero-meta">{title.duration}</span>
          <span className="hero-meta">{title.genres.join(" · ")}</span>
          <span className="hero-meta border-aqua/30! text-aqua!">{title.quality} HDR</span>
          {title.dub && <span className="hero-meta">دوبلهٔ فارسی</span>}
        </motion.div>

        <motion.p variants={item} className="text-[13.5px] leading-7 text-[#B9B6CE] max-w-[540px] mb-7 line-clamp-2">
          {title.synopsis}
        </motion.p>

        <motion.div variants={item} className="flex items-center gap-3">
          <button className="btn-prism" onClick={() => onPlay(title)}>
            <Play size={17} fill="currentColor" className="relative z-[2]" />
            <span className="relative z-[2]">پخش فیلم</span>
          </button>
          <button className="btn-glass" onClick={() => onDetails(title)}>
            <Plus size={16} />
            لیست من
          </button>
          <button className="btn-orb" aria-label="جزئیات" onClick={() => onDetails(title)}>
            <Info size={18} />
          </button>
        </motion.div>
      </motion.div>

      {/* floating poster */}
      <motion.div
        className="hero-poster-slot absolute top-1/2 -translate-y-1/2 left-12 z-[6] w-[264px] hidden xl:block"
        style={{ x: poX, y: poY }}
        initial={{ opacity: 0, y: 40, rotate: 6, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
        transition={{ duration: 1, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="prism-frame floaty" style={{ "--tilt": "3.5deg" } as React.CSSProperties}>
          <div className="relative">
            <img src={title.poster} alt={`پوستر ${title.fa}`} />
            <span className="badge-float"><b>{title.quality}</b> · DOLBY VISION</span>
            <span className="absolute bottom-2.5 inset-x-3 z-[2] osd text-[7.5px]! flex items-center justify-between">
              <span>2.39 : 1</span>
              <span className="text-aqua/90">REC.2020</span>
            </span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 osd text-[8px]!">
          <Clapperboard size={10} className="text-iris2" />
          اوریجینال قاب · ۱۴۰۳
        </div>
      </motion.div>
    </section>
  );
}
