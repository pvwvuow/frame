import { ensureSeeded } from "../src/db/seed";
import { db } from "../src/lib/db";

await ensureSeeded();
console.log("titles:", await db.title.count(), "| episodes:", await db.episode.count(), "| reviews:", await db.review.count());
