import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const ts = await db.title.findMany({ where: { source: "od" }, select: { slug: true, title: true, type: true } });
console.log(ts.map(t => `${t.slug}\t${t.title}`).join("\n"));
await db.$disconnect();
