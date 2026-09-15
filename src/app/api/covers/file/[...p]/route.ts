/* ART-3.0 (v0.36.0) — GET /api/covers/file/[...p]
 *
 * Streams one file out of the local covers-store (userData/covers-store/
 * covers/<tt>/<file>). The browser NEVER sees this URL — next.config
 * rewrites /covers/:path* here after static files miss (the packaged app
 * ships NO public/covers), so posterSrc's /covers/<tt>/poster.webp resolves
 * through this route while dev/bundled installs keep hitting real static
 * files. 404 is a normal outcome (tt not merged yet) — the IMG_FALLBACK
 * chain takes over.
 */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { safeStorePath } from "@/lib/cover-store";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
};

export async function GET(_req: Request, ctx: { params: Promise<{ p: string[] }> }) {
  const { p } = await ctx.params;
  if (!Array.isArray(p) || p.length !== 2) {
    return new Response("not found", { status: 404 });
  }
  const [dir, file] = p;
  const ext = path.extname(file || "").replace(".", "").toLowerCase();
  if (!MIME[ext]) return new Response("not found", { status: 404 });

  let abs: string;
  try {
    abs = safeStorePath(dir, file);
  } catch {
    return new Response("not found", { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
    if (!stat.isFile()) return new Response("not found", { status: 404 });
  } catch {
    return new Response("not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": MIME[ext],
      "Content-Length": String(stat.size),
      /* same directive as the next.config /covers headers — content-keyed by
       * tt id, so a long window is safe; the SW sits cache-first in front */
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    },
  });
}
