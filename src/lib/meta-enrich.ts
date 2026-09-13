/**
 * meta-enrich (v0.32.0) — تکمیل خودکار ژانر و توضیح برای عنوان‌های همگام‌شده
 * از منبع دایرکتوری (placeholder).
 *
 * موتور همان اسکریپت enrich-catalog.mjs است: ویکی‌دیتا با شناسه‌ی IMDb،
 * وگرنه جست‌وجوی عنوان؛ توضیح از خلاصه‌ی fa/en ویکی‌پدیا.
 *
 * سیاست نوشتن (هرگز محتوای واقعی را خراب نمی‌کند):
 *   - genres فقط وقتی نوشته می‌شود که فعلی زباله/خالی باشد
 *   - description فقط وقتی که فعلی خالی/کوتاه/قالبی باشد
 * خطاها ۲۴ س cooldown دارند تا برای همیشه بی‌خود فشار نیاورند.
 */
import { db } from "@/lib/db";
import { normalizeGenres, genresAreJunk, fallbackDescription, descriptionNeedsWork, imdbIdFrom } from "./genre-map";
import { fetchMetaByImdb, searchEntityByTitle, fetchBestSummary, sparqlSleep, type MetaHit } from "./wikidata";

const FAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SPARQL_BATCH = 60;

export interface EnrichStats {
  running: boolean;
  scanned: number;
  tried: number;
  genresFixed: number;
  descriptionsFixed: number;
  unresolved: number;
}

let running = false;
const failedUntil = new Map<string, number>();

function onCooldown(key: string): boolean {
  const until = failedUntil.get(key);
  return typeof until === "number" && until > Date.now();
}

/** تعداد عنوان‌هایی که هنوز ژانر/توضیح قابل‌قبول ندارند (برای UI) */
export async function enrichStats(): Promise<{ needGenres: number; needDesc: number; running: boolean }> {
  const [g, d] = await Promise.all([
    db.title.count({
      where: {
        OR: [
          { genres: { in: ["", "[]"] } },
          { genres: { contains: "نامشخص" } },
          { genres: { contains: "—\"" } },
        ],
      },
    }),
    db.title.count({
      where: {
        OR: [
          { description: "" },
          { description: { contains: "منبع دایرکتوری" } },
          { description: { contains: "آرشیو دنیای" } },
        ],
      },
    }),
  ]);
  return { needGenres: g, needDesc: d, running };
}

/**
 * یک بچه تکمیل می‌کند (حداکثر limit عنوان). برای فراخوانی پس از سینک و
 * از رابط کاربری؛ خودش موازی‌سازی و cooldown را مدیریت می‌کند.
 */
export async function enrichBatch(limit = 30): Promise<EnrichStats> {
  const stats: EnrichStats = { running, scanned: 0, tried: 0, genresFixed: 0, descriptionsFixed: 0, unresolved: 0 };
  if (running) return stats;
  running = true;
  stats.running = true;
  try {
    const candidates = await db.title.findMany({
      where: {
        OR: [
          { genres: { in: ["", "[]"] } },
          { genres: { contains: "نامشخص" } },
          { genres: { contains: "—\"" } },
          { description: "" },
          { description: { contains: "منبع دایرکتوری" } },
          { description: { contains: "آرشیو دنیای" } },
        ],
      },
      select: { id: true, slug: true, title: true, titleEn: true, type: true, year: true, genres: true, description: true, poster: true },
      take: Math.min(400, limit * 6),
      orderBy: { views: "desc" },
    });
    stats.scanned = candidates.length;

    // فقط آن‌ها که واقعاً کار دارند و cooldown ندارند
    const todo = candidates.filter((t) => {
      if (!onCooldown(t.slug)) {
        let arr: unknown[] = [];
        try { arr = JSON.parse(t.genres || "[]"); } catch {}
        const gJunk = genresAreJunk(arr);
        const dJunk = descriptionNeedsWork(t.description);
        return gJunk || dJunk;
      }
      return false;
    });
    const targets = todo.slice(0, Math.max(1, limit));
    stats.tried = targets.length;
    if (!targets.length) return stats;

    // ۱) فراداده از ویکی‌دیتا با tt (یک راند SPARQL برای کل بچه)
    const metaByImdb = new Map<string, MetaHit>();
    const ttTargets = targets.filter((t) => imdbIdFrom(t.poster, t.slug));
    const ttIds = [...new Set(ttTargets.map((t) => imdbIdFrom(t.poster, t.slug) as string))];
    for (let i = 0; i < ttIds.length; i += SPARQL_BATCH) {
      try {
        const hits = await fetchMetaByImdb(ttIds.slice(i, i + SPARQL_BATCH));
        for (const [k, v] of hits) metaByImdb.set(k, v);
      } catch {
        /* شکست شبکه → همان مسیر جست‌وجوی عنوان/توضیح جایگزین */
      }
      await sparqlSleep();
    }

    // ۲) اعمال روی هر عنوان
    for (const t of targets) {
      const tt = imdbIdFrom(t.poster, t.slug);
      let hit = tt ? metaByImdb.get(tt) : undefined;
      let anyHit = !!hit;
      if ((!hit || (!hit.genres.length && !hit.faTitle && !hit.enTitle)) && !tt) {
        // بدون tt → جست‌وجوی عنوان (فقط وقتی هیچ نداریم؛ تا حد ممکن کم)
        const q = (t.titleEn && /[a-z]/i.test(t.titleEn) ? t.titleEn : t.title).replace(/\s+\d{4}$/, "").trim();
        if (q) {
          const found = await searchEntityByTitle(q, t.type === "series");
          if (found) {
            hit = found;
            anyHit = true;
          }
          await sparqlSleep();
        }
      }

      let wroteGenre = false;
      let wroteDesc = false;
      let curGenres: unknown[] = [];
      try { curGenres = JSON.parse(t.genres || "[]"); } catch {}

      if (genresAreJunk(curGenres)) {
        if (hit && hit.genres.length) {
          await db.title.update({ where: { id: t.id }, data: { genres: JSON.stringify(hit.genres) } });
          wroteGenre = true;
        }
      } else {
        // نرمال‌سازی نرم (املاهای بد) بدون دست‌زدن به ژانر واقعی
        const norm = normalizeGenres(curGenres);
        if (JSON.stringify(norm) !== JSON.stringify(curGenres)) {
          await db.title.update({ where: { id: t.id }, data: { genres: JSON.stringify(norm) } });
          wroteGenre = true;
        }
      }

      if (descriptionNeedsWork(t.description)) {
        let finalDesc: string | null = null;
        if (hit && (hit.faTitle || hit.enTitle)) {
          const s = await fetchBestSummary(hit.faTitle, hit.enTitle, 100);
          if (s && (s.extract.length >= 100 || (t.description || "").trim().length < 80)) finalDesc = s.extract;
        }
        if (!finalDesc) {
          const cur = (t.description || "").trim();
          if (cur.length >= 80 && !/منبع دایرکتوری|آرشیو دنیای/.test(cur)) {
            finalDesc = cur;
          } else {
            const gForFb = wroteGenre ? (hit?.genres ?? []) : (curGenres as string[]);
            finalDesc = fallbackDescription({ title: t.title, type: t.type as "movie" | "series", year: t.year ?? undefined, genres: gForFb });
          }
        }
        if (finalDesc && finalDesc !== t.description) {
          await db.title.update({ where: { id: t.id }, data: { description: finalDesc } });
          wroteDesc = true;
        }
      }

      if (wroteGenre) stats.genresFixed++;
      if (wroteDesc) stats.descriptionsFixed++;
      if (!anyHit || (!wroteGenre && !wroteDesc)) {
        stats.unresolved++;
        failedUntil.set(t.slug, Date.now() + FAIL_COOLDOWN_MS);
        if (failedUntil.size > 5000) {
          // نقشه سبک بماند
          for (const [k, v] of failedUntil) if (v < Date.now()) failedUntil.delete(k);
        }
      }
    }
    return stats;
  } finally {
    running = false;
  }
}

/** حلقه‌ی پس‌زمینه‌ی نرم — هر تیک یک بچه کوچک؛ بعد از سینک کاتالوگ روشن می‌شود */
export function enrichInBackground(total = 200, batch = 25): void {
  void (async () => {
    let left = total;
    while (left > 0) {
      const st = await enrichBatch(batch).catch(() => null);
      left -= batch;
      if (!st || (st.tried > 0 && st.genresFixed === 0 && st.descriptionsFixed === 0 && st.unresolved === st.tried)) break;
      if (st.tried === 0) break;
      await new Promise((r) => setTimeout(r, 3_000));
    }
  })();
}
