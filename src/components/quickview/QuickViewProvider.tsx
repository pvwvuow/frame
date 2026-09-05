"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { TitleView } from "@/lib/queries";
import TitleModal from "./TitleModal";

type Ctx = {
  open: (t: TitleView) => void;
  close: () => void;
  current: TitleView | null;
};

const QuickViewCtx = createContext<Ctx | null>(null);

export function useQuickView() {
  const ctx = useContext(QuickViewCtx);
  if (!ctx) throw new Error("useQuickView must be used inside QuickViewProvider");
  return ctx;
}

export default function QuickViewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<TitleView | null>(null);
  const pathname = usePathname();

  const open = useCallback((t: TitleView) => setCurrent(t), []);
  const close = useCallback(() => setCurrent(null), []);

  // close on route change
  useEffect(() => {
    setCurrent(null);
  }, [pathname]);

  // lock scroll when modal is open
  useEffect(() => {
    if (!current) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [current]);

  const value = useMemo(() => ({ open, close, current }), [open, close, current]);

  return (
    <QuickViewCtx.Provider value={value}>
      {children}
      <TitleModal title={current} onClose={close} onSwitch={open} />
    </QuickViewCtx.Provider>
  );
}
