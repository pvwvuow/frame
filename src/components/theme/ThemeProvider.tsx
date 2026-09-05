"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
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
      {children}
      <ThemedToaster />
    </NextThemesProvider>
  );
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
        className: "font-body glass-strong",
        style: {
          fontFamily: "var(--font-sans)",
          background: "var(--toast-bg)",
          border: "1px solid var(--toast-border)",
          color: "var(--toast-fg)",
          borderRadius: 16,
        },
      }}
    />
  );
}
