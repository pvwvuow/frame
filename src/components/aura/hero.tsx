"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { Play, Plus, Star, Clapperboard, Clock3, Languages, Sparkles } from "lucide-react";
import type { Title } from "@/lib/titles";
import { HERO } from "@/lib/titles";

/* ---------- cinematic hero — parallax backdrop + floating glass panel ---------- */
export function Hero({ onOpen, onToast }: { onOpen: () => void; onToast: (m: string) => void }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const bx = useSpring(mx, { stiffness: 55, damping: 18, mass: 0.6 });
  const by = useSpring(my, { stiffness: 55, damping: 18, mass: 0.6 });
  const px = useSpring(mx, { stiffness: 40, damping: 22, mass: 0.8 });

  const move = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5;
    mx.set(nx * 18);
    my.set(ny * 12);
  };
  const leave = () => { mx.set(0); my.set(0); };

  const t: Title = HERO;

  return (
    <section
      onMouseMove={move}
      onMouseLeave={leave}
      className="relative mx-6 mt-2 h-[440px] cursor-default overflow-hidden rounded-[32px] border border-white/10 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]"
      aria-label={`فیلم برجسته: ${t.fa}`}
    >
      {/* parallax backdrop */}
      <motion.div style={{ x: bx, y: by }} className="absolute -inset-8">
        <img src={t.backdrop} alt="" className="flicker size-full object-cover" />
      </motion.div>

      {/* cinematic gradients (text side = start/right in RTL) */}
      <div className="absolute inset-0 bg-gradient-to-l from-[#04060F]/95 via-[#04060F]/45 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#04060F]/85 via-transparent to-[#04060F]/25" />
      <div className="godrays absolute inset-0" aria-hidden />

      {/* film-lab telemetry (field-kit DNA) */}
      <div dir="ltr" className="absolute end-5 top-5 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 font-mono text-[9px] tracking-[0.22em] text-white/75 backdrop-blur-md">
        <span className="rec-dot" />
        A-CAM · {t.stock}
      </div>

      {/* floating poster (end side) */}
      <motion.div
        style={{ x: px }}
        className="absolute end-10 top-1/2 z-10 hidden -translate-y-1/2 xl:block"
        aria-hidden
      >
        <div className="float-slow lg-rim w-[190px] rotate-[4deg] overflow-hidden rounded-3xl border border-white/15 bg-white/[.06] p-2 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <img src={t.poster} alt="" className="aspect-[2/3] w-full rounded-[18px] object-cover" />
        </div>
      </motion.div>

      {/* glass info panel */}
      <div className="absolute bottom-0 start-0 top-0 z-10 flex items-center">
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="glass lg-rim lg-spec ms-7 max-w-[560px] rounded-[28px] p-7"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
            e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="pill !flex !items-center !gap-1.5 !border-transparent !bg-gradient-to-l !from-aqua !to-iris !px-3 !text-[10.5px] !font-extrabold !text-[#061021]">
              <Sparkles size={11} />
              پیشنهاد امشب
            </span>
            <span dir="ltr" className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[10px] text-gold">
              <Star size={10} className="fill-gold" /> {t.rating}
            </span>
            <span dir="ltr" className="rounded-full border border-white/15 bg-white/[.06] px-2.5 py-1 font-mono text-[9.5px] tracking-wider text-dimc">
              {t.quality}
            </span>
          </div>

          <h1 className="text-[38px] font-black leading-[1.15] text-inkc drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
            {t.fa}
          </h1>
          <p dir="ltr" className="mt-1 font-disp text-[12px] font-semibold tracking-[0.34em] text-aura">
            {t.en}
          </p>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-dimc">
            <span>{t.year.toLocaleString("fa-IR", { useGrouping: false })}</span>
            <span className="size-1 rounded-full bg-hushc" aria-hidden />
            <span className="flex items-center gap-1"><Clock3 size={12} className="text-hushc" />{t.duration}</span>
            <span className="size-1 rounded-full bg-hushc" aria-hidden />
            <span>{t.genres.join(" · ")}</span>
            <span className="size-1 rounded-full bg-hushc" aria-hidden />
            <span className="flex items-center gap-1"><Languages size={12} className="text-hushc" />دوبله · زیرنویس</span>
          </div>

          <p className="mt-3.5 line-clamp-2 text-[13px] leading-7 text-dimc">{t.synopsis}</p>

          <div className="mt-5 flex items-center gap-3">
            <button onClick={onOpen} className="btn-liquid h-12 cursor-pointer px-7 text-[14px]">
              <Play size={17} className="fill-[#04101A]" />
              پخش فیلم
            </button>
            <button onClick={onOpen} className="btn-glass h-12 cursor-pointer px-5 text-[13px]">
              <Clapperboard size={16} className="text-aqua" />
              تریلر
            </button>
            <button
              onClick={() => onToast(`«${t.fa}» به لیست من اضافه شد`)}
              className="btn-glass size-12 cursor-pointer !p-0"
              aria-label="افزودن به لیست من"
            >
              <Plus size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
