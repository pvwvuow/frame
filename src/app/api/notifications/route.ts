import { getNotifications } from "@/lib/notifications";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET() {
  const userKey = await getUserKey();
  return Response.json(await getNotifications(userKey));
}
