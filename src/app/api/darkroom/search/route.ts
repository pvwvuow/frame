import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

/** GET /api/darkroom/search?q=… — full picker rows (poster, backdrop, director…). */
export async function GET(req: Request) {
  await ensureSeeded();
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  const rows = q
    ? await db.title.findMany({
        where: {
          OR: [
            { title: { contains: q } },
            { titleEn: { contains: q } },
            { slug: { contains: q.replace(/\s+/g, "-").toLowerCase() } },
          ],
        },
        orderBy: [{ trendingScore: "desc" }],
        take: 8,
      })
    : await db.title.findMany({ orderBy: [{ trendingScore: "desc" }], take: 8 });

  return Response.json(
    rows.map((t) => {
      let genres: string[] = [];
      try {
        genres = JSON.parse(t.genres || "[]");
      } catch {
        /* ignore */
      }
      return {
        id: t.id,
        slug: t.slug,
        title: t.title,
        titleEn: t.titleEn,
        type: t.type,
        year: t.year,
        genres,
        poster: t.poster,
        backdrop: t.backdrop,
        duration: t.duration,
        director: t.director,
        country: t.country,
        rating: t.rating,
      };
    })
  );
}
