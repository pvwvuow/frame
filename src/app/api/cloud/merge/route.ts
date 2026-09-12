import { db, ensureRuntimeSchema } from "@/lib/db";
import { getUserKey } from "@/lib/user";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/* Merge the cloud snapshot (from Supabase) into the LOCAL database.
 *
 * v0.13.0 — SLUG-BASED MERGE (cloud schema v2):
 *   The snapshot carries STABLE slugs. They are resolved against THIS
 *   device's catalog (slug → local id) in one pass, then merged. Rows whose
 *   slug is unknown on this device are SKIPPED (older/newer catalog) — they
 *   can never poison the library again.
 *
 * v0.27.0 — DELETIONS PROPAGATE + REAL LWW (user-review DATA-2/5/8/16):
 *   - the body may carry `deletions` (other devices' sync_del events): local
 *     rows older than the deletion timestamp are removed — no more
 *     «رستاخیز داده» between two devices, no more duplicate collections
 *     after a rename (rename = delete-old-name + new-name arrives).
 *   - watchlist + ratings now merge by `updated_at` (LWW) instead of
 *     fill-gaps-only: an edit on device B finally reaches device A.
 *   - progress conflicts use a CLOCK-SKEW GUARD: an incoming timestamp more
 *     than 24h in the future (wrong device clock — common without NTP) is
 *     demoted; near-equal timestamps prefer the FURTHER position.
 *
 * Merge policy:
 *   - cloud rows that don't exist locally are ADDED (unless tombstoned)
 *   - conflicts: watchlist/ratings/progress = newer updated_at wins
 *   - deletions (events) beat rows older than the deletion timestamp
 */

type Ref = { slug?: unknown; title?: unknown };
type Deletion = {
  kind?: unknown;
  key?: unknown;
  at?: unknown;
  action?: unknown;
  to?: unknown;
  slug?: unknown;
};
/** v0.29.0 (VERIFY-DATA-1) — the client's own deletion tombstones ship in the
 *  body: the merge runs in the Electron MAIN process and cannot read the
 *  renderer's localStorage, so offline deletions used to be resurrected by
 *  the very next pull on desktop (mobile consulted them locally already). */
type Tombstone = { kind?: unknown; key?: unknown; at?: unknown };
type Body = {
  favorites?: Ref[];
  watchlist?: (Ref & { status?: unknown; updatedAt?: unknown })[];
  ratings?: (Ref & { score?: unknown; updatedAt?: unknown })[];
  collections?: { name?: unknown; cid?: unknown; items?: Ref[] }[];
  progress?: {
    slug?: unknown;
    season?: unknown;
    episode?: unknown;
    position?: unknown;
    duration?: unknown;
    updatedAt?: unknown;
  }[];
  deletions?: Deletion[];
  tombstones?: Tombstone[];
};

const VALID_STATUSES = new Set(["planned", "watching", "watched"]);
const toTs = (v: unknown): number => (typeof v === "number" ? v : Date.parse(String(v)) || 0);
const slugOf = (r: Ref): string => String(r?.slug ?? "").trim().slice(0, 140);
const titleOf = (r: Ref): string => String(r?.title ?? "").slice(0, 220);
const SKEW_MS = 24 * 60 * 60 * 1000; // > 24h in the future = wrong device clock

/* C-7/C-8 — سقف‌های بدنه: آرایه‌ی غیرآرایه‌ای یا بی‌سقف نباید سرور را بکشد
 * (اسکالر به‌جای آرایه قبلاً 500 می‌داد؛ ۱۰۰k ردیف هم رم و قفل SQLite را
 * می‌گرفت). هر سکشن با سقفِ سختمان دارد. */
const MAX_ROWS = 5_000;
function arr<T>(v: unknown, cap = MAX_ROWS): T[] {
  return Array.isArray(v) ? (v as T[]).slice(0, cap) : [];
}

export async function POST(req: Request) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;
  await ensureRuntimeSchema();
  const userKey = await getUserKey();
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const nowMs = Date.now();

  const deletions = arr<Deletion>(body.deletions, 1_000)
    .map((d) => ({
      kind: String(d?.kind ?? ""),
      key: String(d?.key ?? "").slice(0, 160),
      at: toTs(d?.at),
      action: String(d?.action ?? "delete"),
      to: String(d?.to ?? "").slice(0, 60),
      slug: String(d?.slug ?? "").slice(0, 140),
    }))
    .filter((d) => d.kind && d.key && d.at > 0);

  // v0.29.0 (VERIFY-DATA-1/1b) — THIS device's offline deletions. They gate
  // the adds below exactly like the cross-device deletion events do: a row
  // whose slug was tombstoned AFTER the cloud row's updated_at must never be
  // re-created locally, and local rows older than the tombstone are removed.
  const tombstones = arr<Tombstone>(body.tombstones, 2_000)
    .map((t) => ({ kind: String(t?.kind ?? ""), key: String(t?.key ?? "").slice(0, 160), at: toTs(t?.at) }))
    .filter((t) => t.kind && t.key && t.at > 0);

  // one slug → id pass for the whole payload
  const allSlugs = [
    ...arr<Ref>(body.favorites),
    ...arr<Ref>(body.watchlist),
    ...arr<Ref>(body.ratings),
    ...arr<{ items?: Ref[] }>(body.collections).flatMap((c) => arr<Ref>(c?.items)),
    ...arr<Ref>(body.progress),
    ...deletions.filter((d) => d.kind !== "collection" && d.kind !== "progress").map((d) => ({ slug: d.key })),
    ...tombstones.filter((t) => t.kind === "favorite" || t.kind === "watchlist" || t.kind === "rating" || t.kind === "progress").map((t) => ({ slug: t.key })),
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

  /* ---------- tombstone gate (THIS device's offline deletions) ---------- */
  const tombSlugs = new Set<string>();
  for (const t of tombstones) {
    if (t.kind !== "favorite" && t.kind !== "watchlist" && t.kind !== "rating" && t.kind !== "progress") continue;
    if (t.key === "*") {
      // whole-history wipe on this device — only meaningful for progress
      const rows = await db.watchProgress.findMany({ where: { userKey }, select: { id: true, updatedAt: true } });
      for (const r of rows) {
        if (t.at > new Date(r.updatedAt).getTime()) await db.watchProgress.delete({ where: { id: r.id } });
      }
      continue;
    }
    const titleId = idBySlug.get(t.key);
    if (!titleId) continue;
    if (t.kind === "favorite") {
      const row = await db.favorite.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
      if (row && t.at > new Date(row.createdAt).getTime()) {
        await db.favorite.delete({ where: { userKey_titleId: { userKey, titleId } } });
        tombSlugs.add(t.key);
      }
    } else if (t.kind === "watchlist") {
      const row = await db.watchlist.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
      if (row && t.at > new Date(row.updatedAt).getTime()) {
        await db.watchlist.delete({ where: { userKey_titleId: { userKey, titleId } } });
        tombSlugs.add(t.key);
      }
    } else if (t.kind === "rating") {
      const row = await db.userRating.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
      if (row && t.at > new Date(row.updatedAt).getTime()) {
        await db.userRating.delete({ where: { userKey_titleId: { userKey, titleId } } });
        tombSlugs.add(t.key);
      }
    } else {
      const row = await db.watchProgress.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
      if (row && t.at > new Date(row.updatedAt).getTime()) {
        await db.watchProgress.delete({ where: { id: row.id } });
        tombSlugs.add(t.key);
      }
    }
  }

  /* ---------- deletions first (they gate the adds below) ---------- */
  let deletionsApplied = 0;
  const deletedSlugs = new Set<string>();
  const renamedFrom = new Map<string, string>(); // old name → new name
  for (const d of deletions) {
    if (d.kind === "favorite" || d.kind === "watchlist" || d.kind === "rating") {
      const titleId = idBySlug.get(d.key);
      if (!titleId) continue;
      if (d.kind === "favorite") {
        const row = await db.favorite.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
        if (row && d.at > new Date(row.createdAt).getTime()) {
          await db.favorite.delete({ where: { userKey_titleId: { userKey, titleId } } });
          deletionsApplied++;
          deletedSlugs.add(d.key);
        }
      } else if (d.kind === "watchlist") {
        const row = await db.watchlist.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
        if (row && d.at > new Date(row.updatedAt).getTime()) {
          await db.watchlist.delete({ where: { userKey_titleId: { userKey, titleId } } });
          deletionsApplied++;
          deletedSlugs.add(d.key);
        }
      } else {
        const row = await db.userRating.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
        if (row && d.at > new Date(row.updatedAt).getTime()) {
          await db.userRating.delete({ where: { userKey_titleId: { userKey, titleId } } });
          deletionsApplied++;
          deletedSlugs.add(d.key);
        }
      }
      continue;
    }
    if (d.kind === "progress") {
      if (d.key === "*") {
        const rows = await db.watchProgress.findMany({ where: { userKey }, select: { id: true, updatedAt: true } });
        const stale = rows.filter((r) => d.at > new Date(r.updatedAt).getTime());
        for (const r of stale) await db.watchProgress.delete({ where: { id: r.id } });
        deletionsApplied += stale.length;
      } else {
        const titleId = idBySlug.get(d.key);
        if (!titleId) continue;
        const row = await db.watchProgress.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
        if (row && d.at > new Date(row.updatedAt).getTime()) {
          await db.watchProgress.delete({ where: { id: row.id } });
          deletionsApplied++;
          deletedSlugs.add(d.key);
        }
      }
      continue;
    }
    if (d.kind === "collection") {
      if (d.action === "rename") {
        const src = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name: d.key } } });
        if (!src) continue;
        const dst = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name: d.to } } });
        if (dst) {
          // both exist → the snapshot already merged the items under the new
          // name; drop the stale old-name row so the duplicate disappears
          if (d.at > new Date(src.updatedAt).getTime()) {
            await db.userCollection.delete({ where: { id: src.id } });
            deletionsApplied++;
          }
        } else if (d.at > new Date(src.updatedAt).getTime()) {
          await db.userCollection.update({ where: { id: src.id }, data: { name: d.to } });
          deletionsApplied++;
        }
        renamedFrom.set(d.key, d.to);
      } else {
        const src = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name: d.key } } });
        if (src && d.at > new Date(src.updatedAt).getTime()) {
          await db.userCollection.delete({ where: { id: src.id } }); // items cascade
          deletionsApplied++;
        }
      }
      continue;
    }
    if (d.kind === "collection-item") {
      const src = await db.userCollection.findUnique({ where: { userKey_name: { userKey, name: d.key } } });
      if (!src) continue;
      const titleId = idBySlug.get(d.slug);
      if (!titleId) continue;
      const item = await db.userCollectionItem.findUnique({ where: { collectionId_titleId: { collectionId: src.id, titleId } } });
      if (item && d.at > new Date(item.addedAt).getTime()) {
        await db.userCollectionItem.delete({ where: { id: item.id } });
        deletionsApplied++;
      }
    }
  }

  // favorites
  let favoritesAdded = 0;
  const favPairs = arr<Ref>(body.favorites)
    .map((r) => ({ slug: slugOf(r), title: titleOf(r) }))
    .filter((r) => r.slug && !deletedSlugs.has(r.slug) && !tombSlugs.has(r.slug))
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

  // watchlist — LWW by updated_at (DATA-5); the status on the newest side wins
  let listAdded = 0;
  let listUpdated = 0;
  for (const row of arr<Ref & { status?: unknown; updatedAt?: unknown }>(body.watchlist)) {
    const slug = slugOf(row);
    const status = String(row?.status ?? "");
    if (!slug || !VALID_STATUSES.has(status) || deletedSlugs.has(slug) || tombSlugs.has(slug)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const ex = await db.watchlist.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    const cloudTs = toTs(row?.updatedAt);
    if (!ex) {
      await db.watchlist.create({
        data: { userKey, titleId, status, ...(cloudTs ? { createdAt: new Date(Math.min(cloudTs, nowMs)), updatedAt: new Date(Math.min(cloudTs, nowMs)) } : {}) },
      });
      listAdded++;
    } else if (cloudTs > new Date(ex.updatedAt).getTime() + 500) {
      await db.watchlist.update({
        where: { userKey_titleId: { userKey, titleId } },
        data: { status },
      });
      listUpdated++;
    }
  }

  // ratings — LWW by updated_at (never the old fill-gaps-only policy)
  let ratingsAdded = 0;
  for (const row of arr<Ref & { score?: unknown; updatedAt?: unknown }>(body.ratings)) {
    const slug = slugOf(row);
    const score = Number(row?.score);
    if (!slug || !Number.isFinite(score) || score < 1 || score > 10 || deletedSlugs.has(slug) || tombSlugs.has(slug)) continue;
    const titleId = idBySlug.get(slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    const ex = await db.userRating.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    const cloudTs = toTs(row?.updatedAt);
    if (!ex) {
      await db.userRating.create({
        data: { userKey, titleId, score: Math.round(score), ...(cloudTs ? { createdAt: new Date(Math.min(cloudTs, nowMs)), updatedAt: new Date(Math.min(cloudTs, nowMs)) } : {}) },
      });
      ratingsAdded++;
    } else if (cloudTs > new Date(ex.updatedAt).getTime() + 500) {
      await db.userRating.update({
        where: { userKey_titleId: { userKey, titleId } },
        data: { score: Math.round(score) },
      });
      ratingsAdded++;
    }
  }

  // collections — v0.29.0 (VERIFY-DATA-16): matched by the STABLE cloud uuid
  // (`cid`) first, name as the fallback. Items resolved slug → id; renames
  // arrive as deletion events above and must NOT resurrect the old name here.
  // Collection-name tombstones from THIS device gate re-creation too.
  const colTombNames = new Set(tombstones.filter((t) => t.kind === "collection").map((t) => t.key));
  let collectionsAdded = 0;
  let collectionItemsAdded = 0;
  for (const col of arr<{ name?: unknown; cid?: unknown; items?: Ref[] }>(body.collections)) {
    const name = String(col?.name ?? "").trim().slice(0, 60);
    if (!name || [...renamedFrom.keys()].some((old) => old === name) || colTombNames.has(name)) continue;
    const cid = typeof col?.cid === "string" && /^[0-9a-f-]{36}$/i.test(col.cid) ? col.cid : "";
    let row =
      (cid
        ? await db.userCollection.findFirst({ where: { userKey, cloudId: cid } })
        : null) ??
      (await db.userCollection.findUnique({ where: { userKey_name: { userKey, name } } }));
    if (!row) {
      row = await db.userCollection.create({ data: { userKey, name, ...(cid ? { cloudId: cid } : {}) } });
      collectionsAdded++;
    } else if (cid && row.cloudId !== cid) {
      await db.userCollection.update({ where: { id: row.id }, data: { cloudId: cid } });
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
  // the correct one), with a clock-skew guard (DATA-8): a timestamp from the
  // future (>24h ahead of THIS server's clock) cannot hijack the merge — the
  // further position wins instead. Near-equal timestamps prefer the further
  // position so a paused/rewound device never drags the other one back.
  // Episodes are resolved the stable way: (titleId, season, number) instead
  // of the drifting episode id.
  //
  // v0.29.0 (VERIFY-DATA-7b) — the cloud snapshot now carries MULTIPLE rows
  // per slug (every per-episode position other devices pushed). Rows with
  // season/episode > 0 land in the additive WatchEpisodeProgress table; the
  // title-level WatchProgress row takes the NEWEST row per slug (so
  // «ادامه تماشا» points at the episode that was actually played last).
  let progressApplied = 0;
  const progressRows = arr<{
    slug?: unknown;
    season?: unknown;
    episode?: unknown;
    position?: unknown;
    duration?: unknown;
    updatedAt?: unknown;
  }>(body.progress)
    .map((row) => ({
      slug: slugOf(row),
      position: Number(row?.position ?? 0),
      duration: Number(row?.duration ?? 0),
      season: Math.max(0, Math.round(Number(row?.season ?? 0)) || 0),
      number: Math.max(0, Math.round(Number(row?.episode ?? 0)) || 0),
      ts: toTs(row?.updatedAt) || 0,
    }))
    .filter((r) => r.slug && Number.isFinite(r.position) && !deletedSlugs.has(r.slug) && !tombSlugs.has(r.slug));

  // newest row per slug decides the title-level position
  const newestBySlug = new Map<string, (typeof progressRows)[number]>();
  for (const r of progressRows) {
    if (r.ts > (newestBySlug.get(r.slug)?.ts ?? 0)) newestBySlug.set(r.slug, r);
  }

  for (const row of progressRows) {
    const titleId = idBySlug.get(row.slug);
    if (!titleId) {
      skipped++;
      continue;
    }
    let incomingTs = row.ts;
    if (incomingTs > nowMs + SKEW_MS) incomingTs = nowMs; // wrong clock → neutralize
    let episodeId: number | null = null;
    if (row.season > 0 && row.number > 0) {
      const ep = await db.episode.findFirst({ where: { titleId, season: row.season, number: row.number }, select: { id: true } });
      episodeId = ep?.id ?? null;
      if (episodeId) {
        // per-episode row → the additive table (VERIFY-DATA-7b)
        const exEp = await db.watchEpisodeProgress.findUnique({
          where: { userKey_titleId_episodeId: { userKey, titleId, episodeId } },
        });
        if (!exEp) {
          await db.watchEpisodeProgress.create({
            data: { userKey, titleId, episodeId, position: row.position, duration: row.duration, ...(incomingTs ? { updatedAt: new Date(incomingTs) } : {}) },
          });
          progressApplied++;
        } else if (incomingTs > new Date(exEp.updatedAt).getTime() + 500) {
          await db.watchEpisodeProgress.update({
            where: { id: exEp.id },
            data: { position: row.position, duration: row.duration, ...(incomingTs > new Date(exEp.updatedAt).getTime() ? { updatedAt: new Date(incomingTs) } : {}) },
          });
          progressApplied++;
        }
      }
    }
    // the title-level row only follows the NEWEST cloud row for this slug —
    // older episode rows must never drag «ادامه تماشا» backwards
    if (newestBySlug.get(row.slug) !== row) continue;
    const ex = await db.watchProgress.findUnique({ where: { userKey_titleId: { userKey, titleId } } });
    if (!ex) {
      await db.watchProgress.create({ data: { userKey, titleId, episodeId, position: row.position, duration: row.duration, ...(incomingTs ? { updatedAt: new Date(incomingTs) } : {}) } });
      progressApplied++;
    } else {
      const exTs = new Date(ex.updatedAt).getTime();
      const newer = incomingTs > exTs + 500;
      const closeCall = Math.abs(incomingTs - exTs) <= 2_000;
      const further = row.position > ex.position + 1;
      if (newer || (closeCall && further)) {
        await db.watchProgress.update({
          where: { userKey_titleId: { userKey, titleId } },
          data: { position: row.position, duration: row.duration, episodeId, ...(incomingTs > exTs ? { updatedAt: new Date(incomingTs) } : {}) },
        });
        progressApplied++;
      }
    }
  }

  return Response.json({ ok: true, favoritesAdded, listAdded, listUpdated, ratingsAdded, collectionsAdded, collectionItemsAdded, progressApplied, deletionsApplied, skipped });
}
