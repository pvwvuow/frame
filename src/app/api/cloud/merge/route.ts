import { db, ensureRuntimeSchema } from "@/lib/db";
import { getUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

/* Merge the cloud snapshot (from Supabase) into the LOCAL database.
 *
 * v0.13.0 — SLUG-BASED MERGE (cloud schema v2):
 *   The snapshot carries STABLE slugs. They are resolved against THIS
 *   device's catalog (slug → local id) in one pass, then merged. Rows whose
 *   slug is unknown on this device are SKIPPED (older/newer catalog) — they
 *   can never poison the library again. The old numeric-id sync made
 *   «Breaking Bad» id 663 on one device and 1665 on another, so favoriting
 *   one film on the phone added a DIFFERENT film on the desktop.
 *
 * Merge policy (safe & predictable):
 *   - cloud rows that don't exist locally are ADDED (cloud fills gaps)
 *   - conflicts keep the LOCAL value (local is the source of truth for the UI)
 *   - nothing is ever deleted locally by a sync
 */

type Ref = { slug?: unknown; title?: unknown };
type Body = {
  favorites?: Ref[];
  watchlist?: (Ref & { status?: unknown })[];
  ratings?: (Ref & { score?: unknown })[];
  collections?: { name?: unknown; items?: Ref[] }[];
  progress?: {
    slug?: unknown;
    season?: unknown;
    episode?: unknown;
    position?: unknown;
    duration?: unknown;
    updatedAt?: unknown;
  }[];
};

const VALID_STATUSES = new Set(["planned", "watching", "watched"]);
const toTs = (v: unknown): number => (typeof v === "number" ? v : Date.parse(String(v)) || 0);
const slugOf = (r: Ref): string => String(r?.slug ?? "").trim().slice(0, 140);
const titleOf = (r: Ref): string => String(r?.title ?? "").slice(0, 220);

export async function POST(req: Request) {
  await ensureRuntimeSchema();
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  // one slug → id pass for the whole payload
  const allSlugs = [
    ...(body.favorites ?? []),
    ...(body.watchlist ?? []),
    ...(body.ratings ?? []),
    ...(body.collections ?? []).flatMap((c) => c.items ?? []),
    ...(body.progress ?? []),
  ]
    .map(slugOf)
    .filter(Boolean);

  const idBySlug = new Map<string, number>();
  if (allSlugs.length) {
    const rows = await db.title.findMany({
      where: { slug: { in: [...new Set(allSlugs)] } },
      select: { id: true, slug: true },
    });
    for (const r of rows) idBySlug.set(r.slug, r.id);
  }
  let skipped = 0;

  // favorites
  let favoritesAdded = 0;
  const favPairs = (body.favorites ?? [])
    .map((r) => ({ slug: slugOf(r), title: titleOf(r) }))
    .filter((r) => r.slug)
    .map((r) => ({ ...r, id: idBySlug.get(r.slug) ?? 0 }))
    .filter((r) => {
      if (!r.id) {
        skipped++;
        return false;
      }
      return true;
    });
  if (favPairs.length) {
    const ids = favPairs.map((p) => p.id);
    const existing = await db.favorite.findMany({ where: { userKey, titleId: { in: ids } }, select: { titleId: true } });
    const have = new Set(existing.map((e) => e.titleId));
    const missing = [...new Map(favPairs.map((p) => [p.id, p])).values()].filter((p) => !have.has(p.id));
    if (missing.length) {
      const r = await db.favorite.createMany({ data: missing.map((p) => ({ userKey, titleId: p.id })) });
      favoritesAdded = r.count;
    }
  }

  // watchlist
  let listAdded = 0;
  for (const row of body.watchlist ?? []) {
    const slug = slugOf(row);
    const status = String(row?.status ?? "");
    if (!slug || !VALID_STATUSES.has(status)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const ex = await db.watchlist.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    if (!ex) {
      await db.watchlist.create({ data: { userKey, titleId, status } });
      listAdded++;
    }
    // conflicts keep the local status on purpose
  }

  // ratings (only fill gaps — never overwrite a local score)
  let ratingsAdded = 0;
  for (const row of body.ratings ?? []) {
    const slug = slugOf(row);
    const score = Number(row?.score);
    if (!slug || !Number.isFinite(score) || score < 1 || score > 10) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const ex = await db.userRating.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    if (!ex) {
      await db.userRating.create({ data: { userKey, titleId, score: Math.round(score) } });
      ratingsAdded++;
    }
  }

  // collections (matched by NAME; items resolved slug → id)
  let collectionsAdded = 0;
  let collectionItemsAdded = 0;
  for (const col of body.collections ?? []) {
    const name = String(col?.name ?? "").trim().slice(0, 60);
    if (!name) continue;
    let row = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name } } });
    if (!row) {
      row = await db.userCollection.create({ data: { userKey, name } });
      collectionsAdded++;
    }
    const items = (col?.items ?? [])
      .map((r) => ({ slug: slugOf(r), id: idBySlug.get(slugOf(r)) ?? 0 }))
      .filter((i) => {
        if (!i.slug) return false;
        if (!i.id) {
          skipped++;
          return false;
        }
        return true;
      });
    if (items.length) {
      const ids = [...new Set(items.map((i) => i.id))];
      const have = await db.userCollectionItem.findMany({ where: { collectionId: row.id, titleId: { in: ids } }, select: { titleId: true } });
      const haveSet = new Set(have.map((h) => h.titleId));
      const missing = ids.filter((id) => !haveSet.has(id));
      if (missing.length) {
        const r = await db.userCollectionItem.createMany({ data: missing.map((titleId) => ({ collectionId: row.id, titleId })) });
        collectionItemsAdded += r.count;
      }
    }
  }

  // watch progress — NEWER WINS per title (the most recent play position is
  // the correct one). Episodes are resolved the stable way: (titleId, season,
  // number) instead of the drifting episode id.
  let progressApplied = 0;
  for (const row of body.progress ?? []) {
    const slug = slugOf(row);
    const position = Number(row?.position ?? 0);
    const duration = Number(row?.duration ?? 0);
    if (!slug || !Number.isFinite(position)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const season = Math.max(0, Math.round(Number(row?.season ?? 0)) || 0);
    const number = Math.max(0, Math.round(Number(row?.episode ?? 0)) || 0);
    let episodeId: number | null = null;
    if (season > 0 && number > 0) {
      const ep = await db.episode.findFirst({ where: { titleId, season, number }, select: { id: true } });
      episodeId = ep?.id ?? null;
    }
    const incomingTs = toTs(row?.updatedAt) || 0;
    const ex = await db.watchProgress.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    if (!ex) {
      await db.watchProgress.create({ data: { userKey, titleId, episodeId, position, duration } });
      progressApplied++;
    } else if (incomingTs > new Date(ex.updatedAt).getTime() + 500) {
      await db.watchProgress.update({
        where: { userKey_titleId: { userKey, titleId } },
        data: { position, duration, episodeId },
      });
      progressApplied++;
    }
  }

  return Response.json({ ok: true, favoritesAdded, listAdded, ratingsAdded, collectionsAdded, collectionItemsAdded, progressApplied, skipped });
}
