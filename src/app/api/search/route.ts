import { search } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const rows = await search(q, 8);
  return Response.json(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      titleEn: r.titleEn,
      poster: r.poster,
      year: r.year,
      type: r.type,
      rating: r.rating,
    }))
  );
}
