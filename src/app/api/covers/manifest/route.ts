/* ART-3.0 (v0.36.0) — GET /api/covers/manifest
 *
 * One cheap local call that answers "how much artwork lives on THIS machine
 * right now". The boot script (nama-covers-rev in app/layout.tsx) uses rev>0
 * to flip posterSrc/backdropSrc onto the local store; CoverPackCard and the
 * سلامت تصاویر panel render the numbers. Also carries the art-cache stats so
 * the panels need a single round-trip. */
import { artCacheStats, readCoversManifest } from "@/lib/cover-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const m = readCoversManifest();
  return Response.json(
    { ...m, art: artCacheStats(), storeReady: m.rev > 0 || m.parts.length > 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
