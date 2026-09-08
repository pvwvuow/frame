"use client";

/* Ready-made collection templates (قالب‌های آماده) — v0.10.34.
 *
 * A template = a themed name + a seed rule (genre / minRating / sort / kind).
 * Creating from a template builds a REAL user collection (private, synced,
 * editable — nothing "locked") and pre-fills it with the top catalog
 * matches; the user then adds/removes freely and can even publish it to
 * the Darkroom wall.
 *
 * Seeding reads go through the SAME cross-platform data layer as the rest
 * of the app (lib/mobile/db.ts → Prisma bridge on desktop, Dexie on
 * Android); writes go through lib/collections.ts — so templates work
 * identically on every platform and sync to the account automatically.
 */

import { getByType, type LiteTitle } from "@/lib/mobile/db";
import { createCollection, setCollectionItem } from "@/lib/collections";

export type CollectionTemplate = {
  id: string;
  name: string;
  desc: string;
  kind: "movie" | "series";
  seed: { genre?: string; minRating?: number; sort?: "rating" | "views" | "trending" | "newest"; limit: number };
};

export const COLLECTION_TEMPLATES: CollectionTemplate[] = [
  { id: "masterpieces", name: "شاهکارهای سینما", desc: "بالاترین امتیازهای تاریخ سینما", kind: "movie", seed: { minRating: 8.4, sort: "rating", limit: 12 } },
  { id: "horror-night", name: "ترسناک برای شب", desc: "وقتی دل‌تا دلِ تاریکی می‌خواهد", kind: "movie", seed: { genre: "ترسناک", sort: "rating", limit: 12 } },
  { id: "comedy", name: "کمدی حال‌خوب", desc: "برای شب‌های سبک و خنده‌دار", kind: "movie", seed: { genre: "کمدی", sort: "views", limit: 12 } },
  { id: "scifi", name: "علمی‌تخیلی ذهن‌گیر", desc: "دنیاهای بزرگ، ایده‌های بزرگ‌تر", kind: "movie", seed: { genre: "علمی‌تخیلی", sort: "rating", limit: 12 } },
  { id: "romance", name: "عاشقانه دونه‌دونه", desc: "احساسی، لطیف و به‌یادماندنی", kind: "movie", seed: { genre: "عاشقانه", sort: "rating", limit: 12 } },
  { id: "action", name: "اکشن نفس‌گیر", desc: "آدرنالین خالص، اول تا آخر", kind: "movie", seed: { genre: "اکشن", sort: "views", limit: 12 } },
  { id: "mystery", name: "معمایی و جنایی", desc: "برای ذهن‌های کنجکاو", kind: "movie", seed: { genre: "معمایی", sort: "rating", limit: 12 } },
  { id: "must-series", name: "سریال‌های ضروری", desc: "سریال‌هایی که باید دید", kind: "series", seed: { sort: "rating", limit: 12 } },
];

export type TemplateCreateResult = { id: number; name: string; added: number };

/** Create a collection from a template and pre-fill it with catalog matches. */
export async function createCollectionFromTemplate(tpl: CollectionTemplate): Promise<TemplateCreateResult> {
  const rows: LiteTitle[] = await getByType(tpl.kind, { ...tpl.seed });
  const r = await createCollection(tpl.name);
  let added = 0;
  for (const t of rows) {
    try {
      await setCollectionItem(r.id, r.name, t.id, true);
      added++;
    } catch {
      /* skip ids the local catalog doesn't know */
    }
  }
  return { id: r.id, name: r.name, added };
}
