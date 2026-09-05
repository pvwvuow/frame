"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bridge, isElectron } from "@/lib/platform";

/**
 * Glue between the Electron main process and the Next.js UI:
 * - marks <html data-electron="1"> so CSS can hide web-only chrome
 * - listens for menu / tray navigation requests
 * - surfaces auto-update status as toasts
 * - opens external links in the system browser
 */
export default function ElectronBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isElectron()) return;
    const html = document.documentElement;
    html.dataset.electron = "1";
    html.dataset.platform = bridge()?.platform ?? "";

    const offNav = bridge()?.onNavigate((p) => router.push(p));
    const offUpd = bridge()?.onUpdateStatus((s) => {
      if (s.status === "available") toast.info(`نسخه‌ی ${s.version} در حال دانلود است…`, { id: "upd" });
      else if (s.status === "downloaded") toast.success("به‌روزرسانی آماده است؛ با بستن برنامه نصب می‌شود.", { id: "upd", duration: 8000 });
      else if (s.status === "error") toast.error(`خطا در به‌روزرسانی: ${s.message ?? ""}`, { id: "upd" });
    });

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href) && !href.startsWith(location.origin)) {
        e.preventDefault();
        bridge()?.openExternal(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => {
      offNav?.();
      offUpd?.();
      document.removeEventListener("click", onClick);
    };
  }, [router]);

  return null;
}
