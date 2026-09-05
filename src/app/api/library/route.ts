import { getLibrarySnapshot } from "@/lib/library";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

/** Snapshot of the user's library: watchlist ids/status, favorites, personal ratings, profile. */
export async function GET() {
  const userKey = await getUserKey();
  const snap = await getLibrarySnapshot(userKey);
  return Response.json(snap, { headers: { "Cache-Control": "no-store" } });
}
