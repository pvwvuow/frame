import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const titles = await db.title.findMany({ where: { source: "od" }, include: { episodes: true } });
for (const t of titles) {
  console.log(`\n[${t.type}] ${t.title} (${t.year}) q=${t.quality} genre=${t.genres}`);
  console.log(`  poster: ${t.poster.slice(0, 90)}`);
  if (t.type === "movie") console.log(`  video: ${t.videoUrl.split("/").slice(3).join("/")}`);
  for (const e of t.episodes.sort((a, b) => a.season - b.season || a.number - b.number))
    console.log(`  S${e.season}E${e.number}: ${e.videoUrl.split("/").pop()} [${e.videoUrl.includes("1080p") ? "1080" : e.videoUrl.includes("720p") ? "720" : "?"}]`);
}
const cnt = await db.syncState.count();
console.log("\nsync rows:", cnt);
await db.$disconnect();
