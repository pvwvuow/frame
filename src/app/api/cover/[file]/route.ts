import { readCover } from "@/lib/source/covers";

export const dynamic = "force-dynamic";

/** سرو کردن کاورهای تولیدشده برای عناوین بدون تصویر در منبع */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const hit = readCover(decodeURIComponent(file));
  if (!hit) return new Response("not found", { status: 404 });
  return new Response(hit.body, {
    headers: { "content-type": hit.type, "cache-control": "public, max-age=86400" },
  });
}
