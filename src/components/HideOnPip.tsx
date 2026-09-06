"use client";

/* Hides app chrome (navbar/footer/global player) inside the desktop floating
 * window, which loads the /pip route in its own frameless BrowserWindow. */
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function HideOnPip({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/pip")) return null;
  return <>{children}</>;
}
