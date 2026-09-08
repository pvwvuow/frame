"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { TitleCardData } from "@/components/TitleCard";
import TitleModal from "./TitleModal";

type Ctx = {
  open: (t: TitleCardData) => void;
  close: () => void;
  current: TitleCardData | null;
};

const QuickViewCtx = createContext<Ctx | null>(null);

export function useQuickView() {
  const ctx = useContext(QuickViewCtx);
  if (!ctx) throw new Error("useQuickView must be used inside QuickViewProvider");
  return ctx;
}

/* v0.11.0: the quick-view participates in session history.
 *
 * On Android the HARDWARE BACK button walks the WebView history — with a
 * modal open it used to navigate the whole page back ("I tap back and the
 * app leaves") because the overlay was invisible to history. Now:
 *   • open()  → pushState() a marker entry
 *   • UI close (X / backdrop / route change) → history.back() consumes it
 *   • hardware/gesture back or browser-back → popstate closes the modal
 *     INSTEAD of leaving the page
 * The popstate handler is idempotent: closing via the UI already pops the
 * marker, so the follow-up popstate just finds the modal closed. */
const QV_FLAG = "namaQv";

/* Set while a programmatic history.back() is in flight — guards against
 * double-popping when close() fires twice before the popstate lands. */
let popping = false;

function pushModalEntry() {
  try {
    const s = window.history.state;
    if (s && s[QV_FLAG]) return; // already pushed (double-open guards)
    window.history.pushState({ ...s, [QV_FLAG]: Date.now() }, "");
  } catch {
    /* history may throw in exotic embeds — modal still works, back falls
     * back to the old page-navigation behavior */
  }
}

function popModalEntry() {
  try {
    if (popping) return;
    if (window.history.state && window.history.state[QV_FLAG]) {
      popping = true;
      window.history.back();
    }
  } catch {
    popping = false;
  }
}

export default function QuickViewProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<TitleCardData | null>(null);
  const pathname = usePathname();

  const open = useCallback((t: TitleCardData) => {
    setCurrent(t);
    pushModalEntry();
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    popModalEntry();
  }, []);

  // hardware / browser back always closes the modal instead of leaving.
  // A marker that got BURIED under a later navigation (user followed a link
  // from inside the modal) is skipped through automatically here, so the
  // back button never feels like a dead press.
  useEffect(() => {
    const onPop = () => {
      popping = false;
      setCurrent(null);
      popModalEntry(); // landed on a buried marker → skip past it
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // close on route change (consume the pushed history entry, if any)
  useEffect(() => {
    setCurrent(null);
    popModalEntry();
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
