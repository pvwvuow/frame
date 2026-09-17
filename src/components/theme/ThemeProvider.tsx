"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Theme = "dark" | "light" | "system"
 * Persisted by next-themes in localStorage under `nama-theme`; the class
 * (`.dark` / `.light`) is applied to <html> before hydration so there is
 * no flash of the wrong theme.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem storageKey="nama-theme" disableTransitionOnChange={false}>
      <MorphBeacon />
      {children}
      <ThemedToaster />
    </NextThemesProvider>
  );
}

/** BUG-014 — marks the theme morph window on <html data-morph="1"> for ~1s.
 *  CSS uses it to hide the hero's mix-blend-mode grain while the 800ms token
 *  ramp repaints the whole document (the blend stack used to re-composite
 *  every frame of the flip — the biggest single cost of the theme swap). */
function MorphBeacon() {
  const { resolvedTheme } = useTheme();
  const timer = useRef<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const html = document.documentElement;
    html.setAttribute("data-morph", "1");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => html.removeAttribute("data-morph"), 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [resolvedTheme]);
  return null;
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-center"
      dir="rtl"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      richColors
      closeButton
      toastOptions={{
        className: "font-body",
        style: {
          fontFamily: "var(--font-sans)",
          /* --toast-bg is now TRANSLUCENT (v0.30.9) — the blur does the
             legibility work: every toast reads as the same matte glass
             the user picked as the reference material (the details pill) */
          background: "var(--toast-bg)",
          backdropFilter: "blur(28px) saturate(170%)",
          WebkitBackdropFilter: "blur(28px) saturate(170%)",
          border: "1px solid var(--toast-border)",
          color: "var(--toast-fg)",
          borderRadius: 16,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
        },
      }}
    />
  );
}
