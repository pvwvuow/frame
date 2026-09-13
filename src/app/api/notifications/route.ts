import { db, ensureRuntimeSchema } from "@/lib/db";
import { getNotifications, maybeScan, runScan } from "@/lib/notifications";
import { getUserKey } from "@/lib/user";
import { sameOriginOrThrow } from "@/lib/api-guard";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/* v0.31.0 (NOTIF-1) — the notification center reads the PERSISTED events the
 * local engine built (see src/lib/notifications.ts). GET also runs the scan
 * throttled (max once per 10 min per account) so the badge the UserMenu polls
 * every 2 minutes is always fresh without any background job. */

export async function GET() {
  const userKey = await getUserKey();
  await maybeScan(userKey);
  return Response.json(await getNotifications(userKey));
}

export async function POST(req: NextRequest) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  await ensureRuntimeSchema();
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string };

  switch (body.action) {
    case "scan":
      await runScan(userKey);
      break;
    case "read":
      if (body.id) await db.notificationEvent.updateMany({ where: { id: body.id, userKey }, data: { readAt: new Date() } });
      break;
    case "read-all":
      await db.notificationEvent.updateMany({ where: { userKey, readAt: null }, data: { readAt: new Date() } });
      break;
    case "hide":
      if (body.id) await db.notificationEvent.deleteMany({ where: { id: body.id, userKey } });
      break;
  }
  return Response.json(await getNotifications(userKey));
}
