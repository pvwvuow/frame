"use client";

/* Shared-collections wall (تاریکخانه) — v0.10.34.
 *
 * A public-social layer ON TOP of private collections: a user can PUBLISH
 * one of their own collections to a public wall that every Frame user —
 * even signed-out — can browse in the Darkroom section.
 *
 * The wall lives ONLY in Supabase (no Prisma/Dexie mirror on purpose):
 * sharing is inherently cross-device/cross-user, and going through the
 * exact same supabase-js client used for auth/sync means desktop and
 * Android need zero shim/bridge work.
 *
 * Read policy is public-anon; writes are owner-only (see
 * supabase-shared-collections.sql). Every function degrades gracefully
 * (empty / {ok:false}) when Supabase is unreachable or the SQL has not
 * been applied yet — the UI must never break because of the wall.
 */

import { getSupabase, localIdsForSlugs } from "./cloud";
import { createCollection, setCollectionItem } from "./collections";
import type { LiteTitle } from "./mobile/db";

const TABLE = "shared_collections";
const MAX_ITEMS = 60;

export type SharedCollectionItem = {
  /** v0.13.0 — the STABLE identity. Numeric ids drift between devices
   *  (a film can be id 663 on one device and 1665 on another), so shares
   *  must always carry the slug. */
  slug?: string;
  /** legacy numeric id (pre-v2 shares) — only a fallback */
  id?: number;
  title: string;
  poster: string;
  year: number;
  type: "movie" | "series";
  rating: number;
};

export type SharedCollection = {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  description: string;
  items: SharedCollectionItem[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  owner_id: string;
  owner_name: string | null;
  name: string;
  description: string | null;
  items: SharedCollectionItem[] | null;
  item_count: number | null;
  created_at: string;
  updated_at: string;
};

const mapRow = (r: Row): SharedCollection => ({
  id: r.id,
  ownerId: r.owner_id,
  ownerName: (r.owner_name || "").trim() || "کاربر فریم",
  name: r.name,
  description: r.description || "",
  items: Array.isArray(r.items) ? r.items : [],
  itemCount: r.item_count ?? (Array.isArray(r.items) ? r.items.length : 0),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** The public wall, newest first. Works signed-out (anon read). [] on any failure. */
export async function listSharedCollections(limit = 60): Promise<SharedCollection[]> {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as Row[]).map(mapRow);
  } catch {
    return [];
  }
}

/** Which of MY collections are already published → name → updatedAt (badges). */
export async function listMySharedNames(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const sb = getSupabase();
    if (!sb) return out;
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return out;
    const { data: rows, error } = await sb.from(TABLE).select("name, updated_at").eq("owner_id", uid);
    if (error || !rows) return out;
    for (const r of rows as { name: string; updated_at: string }[]) out.set(r.name, r.updated_at);
  } catch {
    /* ignore */
  }
  return out;
}

export type ShareResult = { ok: boolean; error?: "signed-out" | "cloud-unavailable" | string };

/** Publish (or refresh) one of MY collections on the public wall.
 *  `items` = the collection's rows (fetchCollectionItems). */
export async function shareCollectionToWall(
  uc: { name: string },
  items: LiteTitle[]
): Promise<ShareResult> {
  try {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: "cloud-unavailable" };
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return { ok: false, error: "signed-out" };

    const payload: SharedCollectionItem[] = (items ?? [])
      .filter((t) => t && t.id)
      .slice(0, MAX_ITEMS)
      .map((t) => ({
        slug: t.slug,
        id: t.id,
        title: t.title,
        poster: t.poster,
        year: t.year,
        type: t.type === "series" ? "series" : "movie",
        rating: t.rating,
      }));

    const meta = (data.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const email = String(data.session?.user?.email ?? "");
    const ownerName =
      String(meta.display_name ?? "").trim() ||
      String(meta.name ?? "").trim() ||
      (email.includes("@") ? email.split("@")[0] : "") ||
      "کاربر فریم";

    const { error } = await sb.from(TABLE).upsert(
      {
        owner_id: uid,
        owner_name: ownerName.slice(0, 40),
        name: String(uc.name ?? "").trim().slice(0, 60),
        description: "",
        items: payload,
        item_count: payload.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,name" }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** Remove one of my publications from the wall. */
export async function unshareCollectionFromWall(name: string): Promise<ShareResult> {
  try {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: "cloud-unavailable" };
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return { ok: false, error: "signed-out" };
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq("owner_id", uid)
      .eq("name", String(name ?? "").trim().slice(0, 60));
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/** Save (clone) a shared collection into MY collections — local first, the
 *  regular collections layer mirrors it to the private cloud sync. Works
 *  signed-out too (then it simply stays local).
 *  v0.13.0 — slugs are resolved against THIS device's catalog; items the
 *  device does not know are skipped instead of landing on wrong titles. */
export async function saveSharedCollectionToLocal(
  sc: SharedCollection
): Promise<{ id: number; name: string; added: number }> {
  const r = await createCollection(sc.name);
  const resolved = await localIdsForSlugs(sc.items.map((i) => i.slug ?? "").filter(Boolean));
  let added = 0;
  for (const item of sc.items.slice(0, MAX_ITEMS)) {
    const local = item.slug ? resolved.get(item.slug) : undefined;
    const id = local?.id ?? (item.id && item.id > 0 ? item.id : 0);
    if (!id) continue; // unknown to this device's catalog — skip
    try {
      await setCollectionItem(r.id, r.name, id, true);
      added++;
    } catch {
      /* unknown/deleted catalog id — skip */
    }
  }
  return { id: r.id, name: r.name, added };
}
