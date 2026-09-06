import { readCover, artSvgFor } from "@/lib/source/covers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Serve generated covers for titles that have no artwork in the source.
 *  A pre-generated file in public/covers wins; otherwise the SVG is created
 *  on the fly from the title name. Cover-light packages (v0.10.1+) bundle no
 *  covers directory, so this route is the offline fallback for broken images. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const f = decodeURIComponent(file);
  const hit = readCover(f);
  if (hit) {
    return new Response(hit.body, {
      headers: { "content-type": hit.type, "cache-control": "public, max-age=86400" },
    });
  }
  // on-demand: <slug>.svg (poster) or <slug>-wide.svg (backdrop)
  const m = f.match(/^([\w-]+?)(-wide)?\.svg$/);
  if (m) {
    try {
      const t = await db.title.findUnique({
        where: { slug: m[1] },
        select: { title: true, titleEn: true },
      });
      if (t) {
        const svg = artSvgFor(t.title || t.titleEn, Boolean(m[2]));
        return new Response(svg, {
          headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
        });
      }
    } catch {
      // database unavailable -> fall through to 404
    }
  }
  return new Response("not found", { status: 404 });
}
