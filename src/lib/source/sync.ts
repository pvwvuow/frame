import { db } from "@/lib/db";
import { fetchListing, type ListingEntry } from "./autoindex";
import {
  categoryGenre, parseMedia, qualityRank,
  type ParsedMedia,
} from "./parser";
import { coverBackdropUrl, coverPosterUrl, ensureCovers } from "./covers";

/**
 * موتور همگام‌سازی کاتالوگ از یک دایرکتوری اشتراک (open directory).
 * - BFS روی درخت پوشه‌ها با چند worker موازی
 * - تشخیص فیلم/سریال/فصل/قسمت از نام فایل‌ها و پوشه‌ها
 * - انتخاب بهترین کیفیت برای هر قسمت/فیلم
 * - کاور: از تصویر داخل پوشه اثر، وگرنه تولید SVG
 * - ذخیره وضعیت در DB برای ازسرگیری بعد از بستن برنامه
 */

export type SyncStatus = "idle" | "running" | "paused" | "done" | "error";

export interface SyncLogLine { t: number; msg: string }

interface SyncState {
  status: SyncStatus;
  rootUrl: string;
  pages: number;
  errors: number;
  videos: number;
  images: number;
  titles: number;
  episodes: number;
  current: string;
  startedAt: number | null;
  finishedAt: number | null;
  log: SyncLogLine[];
}

const CONCURRENCY = 6;
const MAX_PAGES = 30000;
const SAVE_EVERY = 20;
const LOG_MAX = 60;

class SourceSync {
  private st: SyncState = SourceSync.defaults();
  private queue: Array<{ url: string; segs: string[] }> = [];
  private visited = new Set<string>();
  private running = false;
  private abort = false;
  private locks = new Map<string, Promise<void>>();
  private loaded = false;
  /** کاورهای پیدا شده در طول کرال؛ در پایان به عناوین بدون پوستر واقعی وصل می‌شوند */
  private imagesSeen = new Map<string, string>();

  private static defaults(): SyncState {
    return {
      status: "idle", rootUrl: "", pages: 0, errors: 0, videos: 0, images: 0,
      titles: 0, episodes: 0, current: "", startedAt: null, finishedAt: null, log: [],
    };
  }

  /** بازیابی وضعیت از DB (اجرای یک‌باره در اولین استفاده) */
  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const rows = await db.syncState.findMany();
      const meta = rows.find((r) => r.key === "meta");
      if (!meta) return;
      const saved = JSON.parse(meta.value) as SyncState & { queue?: string[]; visited?: string[] };
      this.st = { ...SourceSync.defaults(), ...saved, log: saved.log ?? [] };
      if (saved.queue) {
        this.queue = saved.queue.map((s) => JSON.parse(s) as { url: string; segs: string[] });
      }
      if (saved.visited) this.visited = new Set(saved.visited);
      if (this.st.status === "running") {
        this.st.status = "paused";
        this.pushLog("برنامه در میانه همگام‌سازی بسته شده بود؛ برای ادامه دکمه شروع را بزنید.");
        await this.save("meta");
      }
    } catch {
      /* اولین اجرا */
    }
  }

  private pushLog(msg: string) {
    const line: SyncLogLine = { t: Date.now(), msg };
    this.st.log = [line, ...this.st.log].slice(0, LOG_MAX);
  }

  /** قفل روی slug برای جلوگیری از race در upsert موازی */
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next.catch(() => {}));
    return next;
  }

  async status() {
    await this.ensureLoaded();
    const { log, ...rest } = this.st;
    return { ...rest, running: this.running, queueSize: this.queue.length, log };
  }

  async start(rootUrl: string): Promise<{ ok: boolean; message?: string }> {
    await this.ensureLoaded();
    if (this.running) return { ok: false, message: "همگام‌سازی همین حالا در جریان است." };
    let u: URL;
    try {
      u = new URL(rootUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
    } catch {
      return { ok: false, message: "آدرس منبع معتبر نیست." };
    }
    if (!u.pathname.endsWith("/")) u.pathname += "/";

    this.abort = false;
    if (this.st.status !== "paused" || this.st.rootUrl !== u.toString()) {
      // شروع تازه
      this.st = SourceSync.defaults();
      this.st.rootUrl = u.toString();
      this.queue = [{ url: u.toString(), segs: [] }];
      this.visited = new Set();
      await db.syncState.deleteMany().catch(() => {});
    }
    this.st.status = "running";
    this.st.startedAt = this.st.startedAt ?? Date.now();
    this.st.finishedAt = null;
    this.pushLog(`شروع همگام‌سازی از ${u.host}${u.pathname}`);
    await this.save("meta");
    this.running = true;
    void this.run();
    return { ok: true };
  }

  stop() {
    if (!this.running) return;
    this.abort = true;
    this.pushLog("درخواست توقف داده شد…");
  }

  /** حلقه اصلی BFS */
  private async run() {
    try {
      const workers = Array.from({ length: CONCURRENCY }, () => this.worker());
      await Promise.all(workers);
      if (this.abort) {
        this.st.status = "paused";
        this.pushLog("متوقف شد. با دکمه شروع ادامه می‌یابد.");
      } else {
        // وصل کردن کاورهایی که قبل از ساخته‌شدن عنوانشان پیدا شده بودند
        for (const slug of this.imagesSeen.keys()) {
          await this.applyPoster(slug);
        }
        this.st.status = this.st.errors > 0 && this.st.pages === 0 ? "error" : "done";
        this.st.finishedAt = Date.now();
        const mm = Math.max(1, Math.round((Date.now() - (this.st.startedAt ?? Date.now())) / 60000));
        this.pushLog(`پایان همگام‌سازی — ${this.st.titles} عنوان، ${this.st.episodes} قسمت در ${mm} دقیقه.`);
      }
      await this.save("meta");
    } catch (e) {
      this.st.status = "error";
      this.pushLog(`خطا: ${e instanceof Error ? e.message : String(e)}`);
      await this.save("meta").catch(() => {});
    } finally {
      this.running = false;
    }
  }

  private async worker() {
    while (!this.abort) {
      const item = this.queue.shift();
      if (!item) return;
      if (this.visited.has(item.url)) continue;
      this.visited.add(item.url);
      if (this.visited.size > MAX_PAGES) { this.abort = true; return; }

      this.st.current = item.url;
      let listing;
      try {
        listing = await fetchListing(item.url);
      } catch (e) {
        this.st.errors++;
        this.pushLog(`خطا در ${short(item.url)}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      this.st.pages++;
      for (const d of listing.dirs) {
        if (!this.visited.has(d.url)) {
          this.queue.push({ url: d.url, segs: [...item.segs, d.name] });
        }
      }
      if (listing.videos.length) await this.processVideos(item.segs, listing.videos);
      if (listing.images.length) await this.attachImages(item.segs, listing.images);

      if (this.st.pages % SAVE_EVERY === 0) {
        await this.save("meta");
      }
    }
  }

  /** slug اثر از زنجیره پوشه‌ها (برای اتصال کاور) */
  private slugFromSegs(segs: string[]): string | null {
    const probe = parseMedia(segs, "probe.mp4");
    return probe.slug && probe.title ? probe.slug : null;
  }

  private async processVideos(segs: string[], videos: ListingEntry[]) {
    const batch = new Map<string, { parsed: ParsedMedia; entry: ListingEntry }[]>();
    for (const v of videos) {
      const parsed = parseMedia(segs, v.name);
      if (parsed.junk || !parsed.title) continue;
      this.st.videos++;
      const arr = batch.get(parsed.slug) ?? [];
      arr.push({ parsed, entry: v });
      batch.set(parsed.slug, arr);
    }
    for (const [slug, items] of batch) {
      await this.withLock(slug, () => this.upsertTitle(slug, segs, items));
    }
  }

  private async upsertTitle(
    slug: string,
    segs: string[],
    items: Array<{ parsed: ParsedMedia; entry: ListingEntry }>
  ) {
    const first = items[0].parsed;
    const genre = categoryGenre(segs);

    let title = await db.title.findUnique({ where: { slug } });
    const isNew = !title;
    if (isNew) {
      const realPoster = this.imagesSeen.get(slug);
      try {
        title = await db.title.create({
          data: {
            slug,
            title: first.title,
            titleEn: first.title,
            type: first.type,
            year: first.year ?? 0,
            rating: 0,
            duration: first.type === "movie" ? 0 : 45,
            description:
              first.type === "movie"
                ? `فیلم «${first.title}» از منبع دایرکتوری — آماده پخش آنلاین.`
                : `سریال «${first.title}» از منبع دایرکتوری — قسمت‌ها به‌مرور اضافه می‌شوند.`,
            genres: JSON.stringify(genre ? [genre] : []),
            poster: realPoster ?? coverPosterUrl(slug),
            backdrop: realPoster ?? coverBackdropUrl(slug),
            videoUrl: "",
            country: "نامشخص",
            ageRating: "+13",
            quality: first.quality,
            featured: false,
            trendingScore: 0,
            source: "od",
          },
        });
        ensureCovers(slug, first.title);
        this.st.titles++;
        this.pushLog(`+ ${first.type === "movie" ? "فیلم" : "سریال"}: ${first.title}`);
      } catch {
        // race روی slug یکتا
        title = await db.title.findUnique({ where: { slug } });
        if (!title) return;
      }
    }

    const best = items.reduce((a, b) => (b.parsed.qRank > a.parsed.qRank ? b : a));

    if (first.type === "series") {
      for (const { parsed, entry } of items) {
        if (parsed.season == null || parsed.episode == null) continue;
        const existing = await db.episode.findFirst({
          where: { titleId: title.id, season: parsed.season, number: parsed.episode },
        });
        if (!existing) {
          await db.episode.create({
            data: {
              titleId: title.id,
              season: parsed.season,
              number: parsed.episode,
              name: `قسمت ${parsed.episode}`,
              videoUrl: entry.url,
              thumbnail: title.poster,
            },
          });
          this.st.episodes++;
        } else if (qualityRank(existing.videoUrl) < parsed.qRank) {
          await db.episode.update({ where: { id: existing.id }, data: { videoUrl: entry.url } });
        }
      }
    } else {
      // فیلم: بهترین فایل روی خود عنوان
      if (qualityRank(title.videoUrl) < best.parsed.qRank || !title.videoUrl) {
        await db.title.update({
          where: { id: title.id },
          data: { videoUrl: best.entry.url, quality: best.parsed.quality },
        });
      }
    }
  }

  /** اتصال کاور واقعی از تصاویر موجود در پوشه اثر */
  private async attachImages(segs: string[], images: ListingEntry[]) {
    if (!images.length) return;
    this.st.images += images.length;
    const slug = this.slugFromSegs(segs);
    if (!slug) return;
    const pick =
      images.find((i) => /poster|cover|folder|پوستر|کاور/i.test(i.name)) ??
      images.find((i) => /\.jpe?g$/i.test(i.name)) ??
      images[0];
    this.imagesSeen.set(slug, pick.url);
    await this.applyPoster(slug);
  }

  /** اگر عنوان موجود است و پوسترش تولیدی است، پوستر واقعی را وصل کن */
  private async applyPoster(slug: string) {
    const url = this.imagesSeen.get(slug);
    if (!url) return;
    await this.withLock(slug, async () => {
      const t = await db.title.findUnique({ where: { slug } });
      if (!t || !t.poster.startsWith("/api/cover/")) return;
      await db.title.update({ where: { id: t.id }, data: { poster: url, backdrop: url } });
      await db.episode.updateMany({ where: { titleId: t.id }, data: { thumbnail: url } });
    });
  }

  /** ذخیره وضعیت در DB برای ازسرگیری */
  private async save(which: "meta") {
    const payload: SyncState & { queue: string[]; visited: string[] } = {
      ...this.st,
      queue: this.queue.slice(0, 50000).map((q) => JSON.stringify(q)),
      visited: Array.from(this.visited).slice(0, 100000),
    };
    const value = JSON.stringify(payload);
    await db.syncState.upsert({
      where: { key: which },
      create: { key: which, value },
      update: { value },
    }).catch(() => {});
  }
}

function short(u: string): string {
  try {
    const x = new URL(u);
    return decodeURIComponent(x.pathname.split("/").filter(Boolean).pop() || x.host);
  } catch {
    return u;
  }
}

const g = globalThis as unknown as { __sourceSync?: SourceSync };
export const sourceSync = g.__sourceSync ?? new SourceSync();
g.__sourceSync = sourceSync;
