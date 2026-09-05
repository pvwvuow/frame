"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { bridge, isElectron } from "@/lib/platform";

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
 * - surfaces auto-update status as toasts
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
    const offUpd = bridge()?.onUpdateStatus((s) => {
      if (s.status === "available") toast.info(`نسخه‌ی ${s.version} در حال دانلود است…`, { id: "upd" });
      else if (s.status === "downloading" && typeof s.percent === "number")
        toast.loading(`دانلود به‌روزرسانی… ${Math.round(s.percent)}٪`, { id: "upd" });
      else if (s.status === "downloaded")
        toast.success("به‌روزرسانی آماده است؛ با بستن برنامه نصب می‌شود.", {
          id: "upd",
          duration: 10000,
          action: { label: "همین حالا", onClick: () => bridge()?.installUpdate?.() },
        });
      else if (s.status === "error") toast.error(`خطا در به‌روزرسانی: ${s.message ?? ""}`, { id: "upd" });
    });

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

  return null;
}
