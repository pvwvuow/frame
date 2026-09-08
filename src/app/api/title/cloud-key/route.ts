import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/* v0.13.0 — the id ↔ slug translation endpoint.
 *
 * Numeric local title/episode ids DRIFT between devices and catalog rebuilds
 * (the same series was id 663 on one device and 1665 on another), so cloud
 * sync stores the stable SLUG instead. This endpoint is the bridge:
 *
 *   POST { ids?: number[], episodeIds?: number[], slugs?: string[] }
 *        → { titles: {id, slug, title}[], episodes: {id, season, number}[] }
 *
 *   GET /api/title/cloud-key?ids=1,2,3   → same shape (titles only)
 *
 * The mobile fetch shim implements the exact same contract on top of Dexie
 * (see src/lib/mobile/shim.ts), so the cloud layer works unchanged on
 * Android. */

type Body = {
  ids?: unknown;
  episodeIds?: unknown;
  slugs?: unknown;
};

const numArray = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const ids = numArray(body?.ids);
  const episodeIds = numArray(body?.episodeIds);
  const slugs = strArray(body?.slugs);

  const or: Prisma.TitleWhereInput[] = [];
  if (ids.length) or.push({ id: { in: [...new Set(ids)] } });
  if (slugs.length) or.push({ slug: { in: [...new Set(slugs)] } });

  const [titles, episodes] = await Promise.all([
    or.length
      ? db.title.findMany({ where: { OR: or }, select: { id: true, slug: true, title: true } })
      : Promise.resolve([]),
    episodeIds.length
      ? db.episode.findMany({ where: { id: { in: episodeIds } }, select: { id: true, season: true, number: true } })
      : Promise.resolve([]),
  ]);

  return Response.json({ titles, episodes }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  const slugs = (sp.get("slugs") ?? "")
    .split(",")
    .map((s) => decodeURIComponent(s).trim())
    .filter(Boolean);

  const or: Prisma.TitleWhereInput[] = [];
  if (ids.length) or.push({ id: { in: [...new Set(ids)] } });
  if (slugs.length) or.push({ slug: { in: [...new Set(slugs)] } });

  const titles = or.length
    ? await db.title.findMany({ where: { OR: or }, select: { id: true, slug: true, title: true } })
    : [];

  return Response.json({ titles, episodes: [] }, { headers: { "Cache-Control": "no-store" } });
}
