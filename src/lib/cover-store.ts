/* ART-3.0 (v0.36.0) — the desktop LOCAL ARTWORK STORE.
 *
 * Two on-disk stores under the Electron userData dir (paths handed over by
 * main.cjs via env; unset → dev fallbacks next to the standalone cwd):
 *
 *   FRAME_COVERS_STORE   covers-store/   covers/<tt>/poster|backdrop.webp
 *                        + manifest.json {rev, parts[], totalParts, files, bytes}
 *   FRAME_ART_CACHE      art-cache/      <sha1(url)>.<ext> — every image the
 *                        /api/art relay ever fetched, LRU-trimmed
 *
 * Coverpack zips land in FRAME_COVERPACK_CACHE (Frame-coverpack-rN-pNN.zip,
 * downloaded by electron/covers-sync.cjs through the PROXY-AWARE
 * electronNet stack — the same one that provably downloads app updates and
 * the catalog on Iranian machines) and are merged here, part by part, so
 * coverage grows progressively (parts are views-ordered: the most-seen
 * titles land first).
 *
 * Everything is atomic (tmp + rename) and crash-safe: the manifest is
 * written LAST, so a torn run always leaves the previous self-consistent
 * state and the part is simply re-merged next time.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const COVERS_STORE_DIR =
  process.env.FRAME_COVERS_STORE || path.join(process.cwd(), ".covers-store");
export const COVERPACK_CACHE_DIR =
  process.env.FRAME_COVERPACK_CACHE || path.join(os.tmpdir(), "frame-coverpack-cache");
export const ART_CACHE_DIR =
  process.env.FRAME_ART_CACHE || "";
export const ART_CACHE_MAX_BYTES = 800 * 1024 * 1024;

export type CoversManifest = {
  rev: number;
  parts: number[];
  totalParts: number;
  files: number;
  bytes: number;
  updatedAt: string | null;
};

const MANIFEST = "manifest.json";

export function coversManifestPath(): string {
  return path.join(COVERS_STORE_DIR, MANIFEST);
}

export function readCoversManifest(): CoversManifest {
  try {
    const raw = JSON.parse(fs.readFileSync(coversManifestPath(), "utf8")) as Partial<CoversManifest>;
    return {
      rev: Number(raw.rev) || 0,
      parts: Array.isArray(raw.parts) ? raw.parts.filter((n) => typeof n === "number") : [],
      totalParts: Number(raw.totalParts) || 0,
      files: Number(raw.files) || 0,
      bytes: Number(raw.bytes) || 0,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    };
  } catch {
    return { rev: 0, parts: [], totalParts: 0, files: 0, bytes: 0, updatedAt: null };
  }
}

export function writeCoversManifest(m: CoversManifest): void {
  fs.mkdirSync(COVERS_STORE_DIR, { recursive: true });
  const tmp = coversManifestPath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(m), "utf8");
  fs.renameSync(tmp, coversManifestPath());
}

/** Absolute, symlink-free, in-store path for covers/<a>/<b> — throws on any
 *  traversal attempt (zip entries and request segments both funnel here). */
export function safeStorePath(a: string, b: string): string {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(a) || !/^[A-Za-z0-9._-]{1,64}$/.test(b)) {
    throw new Error("bad path segment");
  }
  const p = path.join(COVERS_STORE_DIR, "covers", a, b);
  if (path.dirname(p) !== path.join(COVERS_STORE_DIR, "covers", a)) throw new Error("traversal");
  return p;
}

/** true when the path is a cache zip the shell actually downloaded. */
export function isCoverpackCachePath(p: string): boolean {
  const base = path.basename(p || "");
  if (!/^Frame-coverpack-r\d+-p\d{2,}\.zip$/i.test(base)) return false;
  let resolved: string;
  try {
    resolved = path.resolve(p);
  } catch {
    return false;
  }
  return resolved.startsWith(path.resolve(COVERPACK_CACHE_DIR) + path.sep);
}

/* ------------------------------------------------------------------ */
/* ART-3.0 — server-side rev stamp (SSR local-first agreement)          */
/* ------------------------------------------------------------------ */

let revCache = { rev: -1, at: 0 };

/** Cached manifest rev for the SSR render (30s window). */
export async function serverCoversRev(): Promise<number> {
  if (revCache.rev >= 0 && Date.now() - revCache.at < 30_000) return revCache.rev;
  try {
    const m = readCoversManifest();
    revCache.rev = m.rev > 0 || m.parts.length > 0 ? m.rev : 0;
  } catch {
    revCache.rev = 0; // static export / no store
  }
  revCache.at = Date.now();
  return revCache.rev;
}

/** Stamp the SSR render global — posterSrc/backdropSrc read this during
 *  server rendering so the SSR markup mounts local-first exactly like the
 *  client (whose copy rides in pre-hydration from the root layout). */
export function stampCoversRev(rev: number): void {
  (globalThis as { __frameCoversRev?: number }).__frameCoversRev = rev;
}

/* ------------------------------------------------------------------ */
/* art-cache (the relay's disk layer)                                  */
/* ------------------------------------------------------------------ */

export const ART_CACHE_EXTS = ["jpg", "webp", "png", "gif", "svg"] as const;

/** sha1 hex identity of a relayed art url — the on-disk name is <hex>.<ext>,
 *  the extension is discovered at read time (origin content-type varies). */
export function artCacheKey(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

export function artCacheGet(key: string): string | null {
  if (!ART_CACHE_DIR) return null;
  if (!/^[a-f0-9]{40}$/.test(key)) return null;
  for (const ext of ART_CACHE_EXTS) {
    const p = path.join(ART_CACHE_DIR, `${key}.${ext}`);
    try {
      const st = fs.statSync(p);
      if (!st.isFile() || st.size < 64) continue;
      // touch for LRU-ish trimming (mtime = last hit)
      const now = new Date();
      try {
        fs.utimesSync(p, now, now);
      } catch {
        /* ignore */
      }
      return p;
    } catch {
      /* try next ext */
    }
  }
  return null;
}

/** Keeps the store under ART_CACHE_MAX_BYTES: cheap-enough full scan, run at
 *  most once per minute, oldest-mtime first. */
let lastTrim = 0;
export function artCacheTrim(): void {
  if (!ART_CACHE_DIR) return;
  const now = Date.now();
  if (now - lastTrim < 60_000) return;
  lastTrim = now;
  fs.readdir(ART_CACHE_DIR, (err, names) => {
    if (err || !names.length) return;
    const files: { p: string; size: number; m: number }[] = [];
    let total = 0;
    let done = 0;
    for (const n of names) {
      if (!/^[a-f0-9]{40}\.(jpg|png|webp|gif|svg)$/.test(n)) continue;
      const p = path.join(ART_CACHE_DIR, n);
      fs.stat(p, (e, st) => {
        done++;
        if (!e && st.isFile()) {
          files.push({ p, size: st.size, m: st.mtimeMs });
          total += st.size;
        }
        if (done === names.length) {
          if (total <= ART_CACHE_MAX_BYTES) return;
          files.sort((a, b) => a.m - b.m);
          for (const f of files) {
            if (total <= ART_CACHE_MAX_BYTES) break;
            try {
              fs.unlinkSync(f.p);
              total -= f.size;
            } catch {
              /* already gone */
            }
          }
        }
      });
    }
  });
}

export function artCacheStats(): { files: number; bytes: number } {
  if (!ART_CACHE_DIR) return { files: 0, bytes: 0 };
  try {
    let files = 0;
    let bytes = 0;
    for (const n of fs.readdirSync(ART_CACHE_DIR)) {
      if (!/^[a-f0-9]{40}\.(jpg|png|webp|gif|svg)$/.test(n)) continue;
      try {
        const st = fs.statSync(path.join(ART_CACHE_DIR, n));
        if (st.isFile()) {
          files++;
          bytes += st.size;
        }
      } catch {
        /* ignore */
      }
    }
    return { files, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}
