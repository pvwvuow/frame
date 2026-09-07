"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { bridge, isElectron } from "@/lib/platform";
import UpdaterPopup, { pushUpdaterStatus } from "./UpdaterPopup";

/** Pages that only make sense on the public website (marketing / legal / contact). */
export const WEB_ONLY_ROUTES: Record<string, string> = {
  "/about": "/settings#about",
  "/contact": "/faq",
  "/terms": "/settings#about",
  "/privacy": "/settings#privacy",
  "/download": "/settings#about",
};

/**
 * Glue between the Electron main process and the Next.js UI:
 * - marks <html data-electron="1"> so CSS can hide web-only chrome
 * - redirects web-only pages to their in-app equivalents
 * - listens for menu / tray navigation requests
 * - surfaces auto-update status in a designed popup (v0.10.19)
 * - opens external links in the system browser
 */
export default function ElectronBridge() {
  const router = useRouter();
  const pathname = usePathname();

  // web-only routes → in-app equivalents
  useEffect(() => {
    if (!isElectron() || !pathname) return;
    const target = WEB_ONLY_ROUTES[pathname];
    if (target) router.replace(target);
  }, [pathname, router]);

  useEffect(() => {
    if (!isElectron()) return;
    const html = document.documentElement;
    html.dataset.electron = "1";
    html.dataset.platform = bridge()?.platform ?? "";

    const offNav = bridge()?.onNavigate((p) => router.push(p));
    // v0.10.19: the updater popup replaces the old plain toasts — designed
    // card, brand progress bar, home-style pill buttons
    const offUpd = bridge()?.onUpdateStatus((s) => pushUpdaterStatus(s));

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (/^(https?:|mailto:|tel:)/i.test(href) && !href.startsWith(location.origin)) {
        e.preventDefault();
        bridge()?.openExternal(href);
      }
    };
    // block the default browser context menu on non-editable chrome (feels native)
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,[contenteditable],video")) return;
      e.preventDefault();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      offNav?.();
      offUpd?.();
      document.removeEventListener("click", onClick);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [router]);

  return <UpdaterPopup />;
}
