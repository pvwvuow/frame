"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function ToastStack({ toasts }: { toasts: { id: number; msg: string }[] }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="lg lg-strong flex items-center gap-2.5 rounded-2xl px-5 py-3 text-[12.5px] font-medium shadow-2xl"
            role="status"
          >
            <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
