import { db } from "@/lib/db";
import { ensureSeeded } from "@/db/seed";
import { getProfile, getMyListRows } from "@/lib/library";
import { getContinueWatching, getNewest, getByGenre } from "@/lib/queries";

export type Notification = {
  id: string;
  kind: "episode" | "continue" | "recommend" | "new" | "system";
  title: string;
  body: string;
  href: string;
  image?: string;
  at: string; // ISO
};

/**
 * Notifications are derived on the fly from the user's library so they are
 * always accurate without a background job:
 *  - new episodes for series in "my list"
 *  - continue-watching reminders (unfinished > 24h)
 *  - recommendations based on favourite genres
 *  - newest titles added to the catalogue
 */
export async function getNotifications(userKey: string): Promise<Notification[]> {
  await ensureSeeded();
  const [profile, list, cont, newest] = await Promise.all([getProfile(userKey), getMyListRows(userKey), getContinueWatching(userKey, 6), getNewest(4)]);
  const out: Notification[] = [];
  const now = Date.now();

  if (profile.notifyNewEpisodes) {
    const seriesIds = list.filter((r) => r.title.type === "series" && r.status !== "watched").map((r) => r.title.id);
    if (seriesIds.length) {
      const eps = await db.episode.findMany({ where: { titleId: { in: seriesIds } }, include: { title: true }, orderBy: [{ season: "desc" }, { number: "desc" }] });
      const seen = new Set<number>();
      for (const e of eps) {
        if (seen.has(e.titleId)) continue;
        seen.add(e.titleId);
        out.push({
          id: `ep-${e.id}`,
          kind: "episode",
          title: `قسمت ${e.number} فصل ${e.season} «${e.title.title}»`,
          body: e.name,
          href: `/watch/${e.title.slug}?ep=${e.id}`,
          image: e.thumbnail,
          at: new Date(now - 1000 * 60 * 60 * (2 + (e.id % 20))).toISOString(),
        });
      }
    }
  }

  if (profile.notifyContinue) {
    for (const c of cont) {
      const pct = Math.round((c.position / c.duration) * 100);
      out.push({
        id: `cont-${c.title.id}`,
        kind: "continue",
        title: `ادامه‌ی «${c.title.title}»`,
        body: c.episodeName ? `قسمت ${c.episodeNumber} · ${pct}٪ دیده‌اید` : `${pct}٪ دیده‌اید؛ از همان‌جا ادامه دهید`,
        href: `/watch/${c.title.slug}${c.episodeId ? `?ep=${c.episodeId}` : ""}`,
        image: c.title.backdrop,
        at: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
      });
    }
  }

  if (profile.notifyRecommendations) {
    const counts = new Map<string, number>();
    list.forEach((r) => r.title.genres.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) {
      const listIds = new Set(list.map((r) => r.title.id));
      const recs = (await getByGenre(top, 6)).filter((t) => !listIds.has(t.id)).slice(0, 2);
      for (const t of recs) {
        out.push({
          id: `rec-${t.id}`,
          kind: "recommend",
          title: `چون ${top} دوست دارید: «${t.title}»`,
          body: t.description.slice(0, 90) + "…",
          href: `/title/${t.slug}`,
          image: t.poster,
          at: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
        });
      }
    }
  }

  for (const t of newest) {
    out.push({
      id: `new-${t.id}`,
      kind: "new",
      title: `تازه اضافه شد: «${t.title}»`,
      body: `${t.type === "series" ? "سریال" : "فیلم"} · ${t.year} · ${t.genres.slice(0, 2).join("، ")}`,
      href: `/title/${t.slug}`,
      image: t.poster,
      at: new Date(new Date(t.createdAt).getTime()).toISOString(),
    });
  }

  out.push({
    id: "sys-welcome",
    kind: "system",
    title: "به فریم خوش آمدید",
    body: "از تنظیمات می‌توانید نوع اعلان‌هایی که دریافت می‌کنید را شخصی‌سازی کنید.",
    href: "/settings#notifications",
    at: new Date(profile.createdAt).toISOString(),
  });

  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
