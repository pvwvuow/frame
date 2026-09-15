/* ART-3.0 (v0.36.0) — POST /api/covers/merge
 *
 * The server-side half of the desktop coverpack sync: the Electron shell
 * (electron/covers-sync.cjs) downloads Frame-coverpack-rN-pNN.zip parts
 * through the proxy-aware Chromium stack into FRAME_COVERPACK_CACHE, then
 * hands each landed zip here. The zip is opened with adm-zip, only
 * covers/<tt>/poster|backdrop.webp entries pass the sanitizer, every file is
 * written atomically into the covers-store, and the manifest (rev/parts/
 * files/bytes) is rewritten LAST so a kill mid-merge never poisons the
 * state — the next run simply re-merges that part.
 *
 * Contract: 200 {ok, manifest} · 400 bad payload/zip · 403 cross-origin ·
 * 412 the store env is not configured (not the packaged desktop app).
 * The zip is deleted after a successful merge (disk hygiene).
 */
import type { NextRequest } from "next/server";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import {
  COVERPACK_CACHE_DIR,
  COVERS_STORE_DIR,
  isCoverpackCachePath,
  readCoversManifest,
  safeStorePath,
  writeCoversManifest,
  type CoversManifest,
} from "@/lib/cover-store";
import { sameOriginOrThrow } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** only covers/<tt>/<name>.webp|jpg entries are admitted */
const ENTRY_RE = /^covers[/\\](tt\d+)[/\\](poster|backdrop)\.(webp|jpg|jpeg)$/i;

export async function POST(req: NextRequest) {
  const guard = sameOriginOrThrow(req);
  if (guard) return guard;

  if (!process.env.FRAME_COVERS_STORE || !COVERPACK_CACHE_DIR) {
    return Response.json({ error: "store-not-configured" }, { status: 412 });
  }

  let body: { zipPath?: string; rev?: number; part?: number; totalParts?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }
  const zipPath = String(body.zipPath || "");
  const rev = Math.max(1, Number(body.rev) || 0);
  const part = Math.max(1, Number(body.part) || 0);
  const totalParts = Math.max(1, Number(body.totalParts) || 0);
  if (!rev || !part) return Response.json({ error: "bad-payload" }, { status: 400 });

  if (!isCoverpackCachePath(zipPath) || !fs.existsSync(zipPath)) {
    return Response.json({ error: "bad-zip-path" }, { status: 400 });
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    return Response.json({ error: "bad-zip" }, { status: 400 });
  }

  const m = readCoversManifest();
  if (m.parts.includes(part)) {
    // already merged (crash after manifest write, retried boot) — idempotent
    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore */
    }
    return Response.json({ ok: true, manifest: m, dedup: true });
  }

  let added = 0;
  let addedBytes = 0;
  try {
    for (const entry of zip.getEntries()) {
      const name = entry.entryName;
      if (entry.isDirectory) continue;
      const hit = ENTRY_RE.exec(name);
      if (!hit) continue;
      const [, tt, kind, extRaw] = hit;
      const ext = extRaw.toLowerCase() === "jpeg" ? "jpg" : extRaw.toLowerCase();
      const data = entry.getData();
      if (!data || data.length < 64) continue; // torn entry → skip, next sync re-lands it
      const dst = safeStorePath(tt, `${kind}.${ext}`);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const tmp = dst + ".tmp";
      fs.writeFileSync(tmp, data);
      fs.renameSync(tmp, dst);
      added++;
      addedBytes += data.length;
    }
  } catch {
    return Response.json({ error: "extract-failed" }, { status: 400 });
  }
  if (!added) return Response.json({ error: "no-entries" }, { status: 400 });

  const next: CoversManifest = {
    rev: Math.max(m.rev, rev),
    parts: [...m.parts, part].sort((a, b) => a - b),
    totalParts: totalParts || m.totalParts,
    files: m.files + added,
    bytes: m.bytes + addedBytes,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(COVERS_STORE_DIR, { recursive: true });
  writeCoversManifest(next);

  try {
    fs.unlinkSync(zipPath);
  } catch {
    /* ignore */
  }

  return Response.json({ ok: true, manifest: next });
}
