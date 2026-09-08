"use client";

/* User-collections client layer (v0.10.32).
 *
 * ONE fetch surface for every platform:
 *   - desktop / Electron  → the real /api/collections* routes (Prisma)
 *   - Android / browser   → the mobile fetch shim implements the SAME
 *                           routes on top of Dexie
 * Cloud sync mirrors favorites: every mutation fires an idempotent
 * push to Supabase (no-ops while signed out), and fullSync() converges
 * both directions on login / app start.
 */

import { pushCollectionDelete, pushCollectionItemRemove, pushCollectionRename, pushCollectionsUp } from "./cloud";

export type UCollection = {
  id: number;
  name: string;
  count: number;
  posters: string[];
  movies: number;
  series: number;
  createdAt: string;
  updatedAt: string;
};

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}`);
  return (await r.json()) as T;
}

export async function fetchUserCollections(): Promise<UCollection[]> {
  return call<UCollection[]>("/api/collections", "GET");
}

export async function createCollection(name: string): Promise<{ id: number; name: string }> {
  const r = await call<{ id: number; name: string }>("/api/collections", "POST", { name });
  void pushCollectionsUp([{ name: r.name, items: [] }]);
  return r;
}

export async function renameCollection(id: number, oldName: string, newName: string): Promise<void> {
  await call("/api/collections", "PATCH", { id, name: newName });
  void pushCollectionRename(oldName, newName);
}

export async function deleteCollection(id: number, name: string): Promise<void> {
  await call("/api/collections", "DELETE", { id });
  void pushCollectionDelete(name);
}

export async function fetchCollectionItems(collectionId: number): Promise<
  import("@/lib/mobile/db").LiteTitle[]
> {
  return call<import("@/lib/mobile/db").LiteTitle[]>(`/api/collections/items?collectionId=${collectionId}`, "GET");
}

/** Which of my collections already contain this title. */
export async function collectionsContainingTitle(titleId: number): Promise<number[]> {
  const d = await call<{ collectionIds: number[] }>(`/api/collections/items?titleId=${titleId}`, "GET");
  return d.collectionIds;
}

/** Add/remove a title; removals are ALSO pushed to the cloud (otherwise the
 *  next pull would re-add the title — cloud-fill only ever adds). */
export async function setCollectionItem(
  collectionId: number,
  collectionName: string,
  titleId: number,
  value?: boolean
): Promise<{ inCollection: boolean; items: number[] }> {
  const d = await call<{ inCollection: boolean; items: number[] }>("/api/collections/items", "POST", {
    collectionId,
    titleId,
    value,
  });
  if (d.inCollection) void pushCollectionsUp([{ name: collectionName, items: d.items }]);
  else void pushCollectionItemRemove(collectionName, titleId);
  return d;
}
