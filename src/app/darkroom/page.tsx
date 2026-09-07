import type { Metadata } from "next";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { getUserKey } from "@/lib/user";
import DarkroomApp from "@/components/darkroom/DarkroomApp";
import type { DrTitle } from "@/lib/darkroom";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تاریکخانه | فریم",
  description: "از فیلم‌ها و لیستت پست و استوری بساز — تاریکخانه فریم",
};

/** Minimal structural shape of an included Title row. */
type Row = {
  id: number;
  slug: string;
  title: string;
  titleEn: string;
  type: string;
  year: number;
  genres: string;
  poster: string;
  backdrop: string;
  duration: number;
  director: string;
  country: string;
  rating: number;
};

function toDrTitle(t: Row, myScore: number | null = null, when: string | null = null): DrTitle {
  let genres: string[] = [];
  try {
    genres = JSON.parse(t.genres || "[]");
  } catch {
    /* ignore */
  }
  return { ...t, genres, myScore, when };
}

export default async function DarkroomPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  await ensureSeeded();
  const userKey = await getUserKey();
  const sp = await searchParams;

  // the user's world: rated ∪ watched ∪ favorites — most recent activity first
  const [rts, wls, favs] = await Promise.all([
    db.userRating.findMany({ where: { userKey }, include: { title: true }, orderBy: { updatedAt: "desc" }, take: 60 }),
    db.watchlist.findMany({ where: { userKey, status: "watched" }, include: { title: true }, orderBy: { updatedAt: "desc" }, take: 60 }),
    db.favorite.findMany({ where: { userKey }, include: { title: true }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);

  const acc = new Map<number, { row: Row; when: Date | null; score: number | null }>();
  const put = (title: Row, when: Date | null, score?: number) => {
    const prev = acc.get(title.id);
    const newer = !prev?.when || (when !== null && when > prev.when);
    acc.set(title.id, {
      row: title,
      when: newer ? when : (prev?.when ?? when),
      score: score ?? prev?.score ?? null,
    });
  };

  for (const r of rts) put(r.title, r.updatedAt, r.score);
  for (const w of wls) put(w.title, w.updatedAt);
  for (const fv of favs) put(fv.title, fv.createdAt);

  let candidates: DrTitle[];
  if (acc.size > 0) {
    candidates = [...acc.values()]
      .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0))
      .slice(0, 40)
      .map(({ row, when, score }) => toDrTitle(row, score, when ? when.toISOString() : null));
  } else {
    // fresh account — suggest from trending so the room is never empty
    const rows = await db.title.findMany({ orderBy: [{ trendingScore: "desc" }], take: 12 });
    candidates = rows.map((r) => toDrTitle(r));
  }

  return <DarkroomApp candidates={candidates} initialSlug={sp.title} />;
}
