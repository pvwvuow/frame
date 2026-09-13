"use client";

/* v0.31.0 (NOTIF-1) — Android status-bar dispatcher for the local notification
 * engine. ONLY the Android/Capacitor runtime pushes to the status bar; on
 * Electron/browser this is a no-op and the events live in the in-app center.
 *
 * Anti-spam contract (the same rules the settings page advertises):
 *   • quiet hours ۰۰:۰۰–۰۸:۰۰ — events are created silently, NO status-bar
 *     ping (they are still in the center when the user wakes up);
 *   • daily cap — at most 8 status-bar notifications per calendar day;
 *   • per-category switches — the caller's profile flags are honored here;
 *   • channels — «قسمت‌های جدید» high-importance, «یادآوری‌ها» default.
 *
 * Click → deep link: every notification carries { href } in extra; the host
 * component (NotificationActionsHost) routes the WebView on
 * localNotificationActionPerformed. */

import { isAndroidNative } from "@/lib/native-bridge";
import { db } from "@/lib/mobile/db";
import type { Importance } from "@capacitor/local-notifications";

export type LocalPushEvent = {
  id: string;
  kind: "episode" | "continue" | "system";
  title: string;
  body: string;
  href: string;
  image?: string;
};

const DAY_CAP = 8;
const QUIET_START = 0; // 00:00
const QUIET_END = 8; // 08:00
/* Android NotificationManager importance levels — the plugin's `Importance`
 * enum is exported as a TYPE only, so the values ride as typed numbers. */
const IMPORTANCE_HIGH = 4 as Importance;
const IMPORTANCE_DEFAULT = 3 as Importance;
const VISIBILITY_PUBLIC = 1;

/** 32-bit positive hash → the numeric id the plugin requires */
function numericId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483646;
}

/** آیا الان زمان سکوت شبانه است؟ */
export function inQuietHours(d = new Date()): boolean {
  const h = d.getHours();
  return h >= QUIET_START && h < QUIET_END;
}

export async function dispatchLocalPush(events: LocalPushEvent[]): Promise<void> {
  if (!events.length || !isAndroidNative()) return;
  let LocalNotifications: (typeof import("@capacitor/local-notifications"))["LocalNotifications"];
  try {
    const mod = await import("@capacitor/local-notifications");
    LocalNotifications = mod.LocalNotifications;
  } catch {
    return; // web build without the plugin — in-app center only
  }

  // permission (Android 13+ needs the runtime grant)
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display !== "granted") {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== "granted") return;
    }
  } catch {
    return;
  }

  // channels (idempotent)
  try {
    await LocalNotifications.createChannel({ id: "episodes", name: "قسمت‌های جدید", importance: IMPORTANCE_HIGH, visibility: VISIBILITY_PUBLIC, lights: true, sound: undefined });
    await LocalNotifications.createChannel({ id: "reminders", name: "یادآوری‌ها", importance: IMPORTANCE_DEFAULT, visibility: VISIBILITY_PUBLIC });
  } catch {
    /* کانال‌ها اختیاری‌اند */
  }

  // سکوت شبانه — رویداد در مرکز می‌ماند، استاتوس‌بار بی‌صدا می‌ماند
  if (inQuietHours()) return;

  // سقف روزانه (شمارنده در kv، کلید تقویمی)
  const dayKey = `notif:pushcnt:${new Date().toISOString().slice(0, 10)}`;
  const row = await db.kv.get(dayKey);
  let budget = DAY_CAP - (Number(row?.value) || 0);
  if (budget <= 0) return;

  const batch: Parameters<typeof LocalNotifications.schedule>[0]["notifications"] = [];
  for (const e of events) {
    if (budget <= 0) break;
    budget--;
    batch.push({
      id: numericId(e.id),
      title: e.title,
      body: e.body,
      channelId: e.kind === "episode" ? "episodes" : "reminders",
      smallIcon: "ic_notif",
      largeIcon: e.image ?? undefined,
      extra: { href: e.href, eventId: e.id },
    });
  }
  if (!batch.length) return;

  try {
    await LocalNotifications.schedule({ notifications: batch });
    const used = (Number(row?.value) || 0) + batch.length;
    await db.kv.put({ key: dayKey, value: String(used) });
  } catch {
    /* schedule می‌تواند روی برخی اندرویدها شکست بخورد — مرکز اعلان‌ها پشتیبان است */
  }
}
