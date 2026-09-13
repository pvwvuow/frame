"use client";

/* v0.31.0 (NOTIF-1) — tap-to-open for Android status-bar notifications.
 * The dispatcher (src/lib/notify-push.ts) puts the in-app href into every
 * notification's extra; this host listens for localNotificationActionPerformed
 * and routes the WebView there. Mounted once in the root layout. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAndroidNative } from "@/lib/native-bridge";

export default function NotificationActionsHost() {
  const router = useRouter();

  useEffect(() => {
    if (!isAndroidNative()) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const sub = await LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
          const extra = e.notification?.extra as { href?: unknown } | undefined;
          const href = typeof extra?.href === "string" ? extra.href : "";
          if (href.startsWith("/") && !href.startsWith("//")) {
            router.push(href);
          }
        });
        if (cancelled) sub.remove();
        else cleanup = () => sub.remove();
      } catch {
        /* بدون پلاگین، کاری نیست که بشود کرد */
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  return null;
}
