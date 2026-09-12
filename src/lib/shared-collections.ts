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
/** v0.29.0 (NEW-DATA-14) — the public wall is read through this projection
 *  view: it exposes the display name/avatar but NOT owner_id. The old public
 *  SELECT on the base table let any anonymous visitor harvest every
 *  publisher's auth UUID. The base table remains the fallback until the
 *  hardened SQL has been applied on the project. */
const WALL_VIEW = "shared_wall_public";
const WALL_COLUMNS = "id,owner_name,owner_avatar,name,description,items,item_count,created_at,updated_at";
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
  /** v0.29.0 — no longer exposed publicly (the wall view omits it). Kept for
   *  typing compatibility; only the OWNER's own rows ever carry it. */
  ownerId?: string;
  ownerName: string;
  /** v0.29.0 — snapshot on the row; the client never joins cinema_profiles */
  ownerAvatar?: string;
  name: string;
  description: string;
  items: SharedCollectionItem[];
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  owner_id?: string;
  owner_name?: string | null;
  owner_avatar?: string | null;
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
  ownerAvatar: (r.owner_avatar || "").trim() || undefined,
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
    // v0.29.0 (NEW-DATA-14) — prefer the hardened projection view; the base
    // table only serves until the new SQL file has been run on the project.
    let rows: Row[] | null = null;
    const fromView = await sb.from(WALL_VIEW).select(WALL_COLUMNS).order("updated_at", { ascending: false }).limit(limit);
    if (!fromView.error && fromView.data) {
      rows = fromView.data as unknown as Row[];
    } else {
      const { data, error } = await sb
        .from(TABLE)
        .select(WALL_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      rows = data as unknown as Row[];
    }
    return rows.map(mapRow);
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

    // v0.29.0 (NEW-DATA-14) — snapshot the display avatar onto the row so the
    // wall never needs to read OTHER users' cinema_profiles rows.
    let ownerAvatar = "";
    try {
      const { data: prof } = await sb.from("cinema_profiles").select("avatar").eq("uid", uid).maybeSingle();
      ownerAvatar = String((prof as { avatar?: unknown } | null)?.avatar ?? "").slice(0, 400);
    } catch {
      /* best-effort */
    }

    const { error } = await sb.from(TABLE).upsert(
      {
        owner_id: uid,
        owner_name: ownerName.slice(0, 40),
        owner_avatar: ownerAvatar,
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
