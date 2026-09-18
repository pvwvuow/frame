#!/usr/bin/env node
/* E2E: serve the split catalog over HTTP, run the REAL syncCatalog against a
 * scratch DB, verify the union merge + sources-survival fix. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { PrismaClient } = require(path.join(ROOT, "node_modules", "@prisma/client"));

const CAT = path.join(ROOT, "public", "catalog");
const PORT = 4123;
const results = [];
const check = (name, cond, extra = "") => {
  results.push({ name, ok: !!cond });
  console.log(`  ${cond ? "✔" : "✘"} ${name}${cond ? "" : " — " + extra}`);
};

const srv = http.createServer((req, res) => {
  const p = path.join(CAT, decodeURIComponent(req.url).replace(/^\/+/, ""));
  try {
    const body = fs.readFileSync(p);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("nope");
  }
});
await new Promise((r) => srv.listen(PORT, r));

const TMP = path.join(ROOT, ".tmp-e2e");
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const scratch = path.join(TMP, `f2m-e2e-${Date.now()}.db`);
console.log("prisma db push (scratch schema)…");
execSync("npx prisma db push --skip-generate", {
  cwd: ROOT,
  env: { ...process.env, DATABASE_URL: "file:" + scratch },
  stdio: "pipe",
});
const stubDb = scratch + ".stub.mjs";
fs.writeFileSync(stubDb, `import { PrismaClient } from "@prisma/client";\nexport const db = new PrismaClient({ datasources: { db: { url: "file:" + ${JSON.stringify(scratch)} } } });\n`);
const stubSeed = scratch + ".seed.mjs";
fs.writeFileSync(stubSeed, `export const ensureSeeded = async () => {};\n`);
const src = fs.readFileSync(path.join(ROOT, "src", "lib", "catalog-refresh.ts"), "utf8");
let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
js = js.replace(`from "@/lib/db"`, `from "./db.stub.mjs"`).replace(`from "@/db/seed"`, `from "./seed.stub.mjs"`);
const modFile = scratch + ".cr.mjs";
fs.writeFileSync(modFile, js);

// stubs must sit next to modFile for relative imports
fs.copyFileSync(stubDb, modFile.replace(".cr.mjs", ".db.stub.mjs").replace(/f2m-e2e-\d+/, (m) => m));
const dir = path.dirname(modFile);
fs.copyFileSync(stubDb, path.join(dir, path.basename(modFile).replace(".cr.mjs", ".db.stub.mjs")));
fs.copyFileSync(stubSeed, path.join(dir, path.basename(modFile).replace(".cr.mjs", ".seed.stub.mjs")));

fs.copyFileSync(stubDb, path.join(TMP, "db.stub.mjs"));
fs.copyFileSync(stubSeed, path.join(TMP, "seed.stub.mjs"));

const { pathToFileURL } = await import("node:url");
const m = await import(pathToFileURL(modFile).href + `?v=${Date.now()}`);

const version = JSON.parse(fs.readFileSync(path.join(CAT, "version.json"), "utf8"));
const EXP = { titles: version.counts.titles, episodes: version.counts.episodes };
// f2m part carries its own advertised title count — fall back to counting
const f2mFile = version.parts[0]?.file ?? "catalog-f2m.json";
const f2mExpected =
  version.parts[0]?.titles ??
  (() => {
    try {
      const part = JSON.parse(fs.readFileSync(path.join(CAT, f2mFile), "utf8"));
      return Array.isArray(part.titles) ? part.titles.length : Object.keys(part.titles ?? {}).length;
    } catch {
      return 0;
    }
  })();

console.log("== E2E split-catalog sync ==");
const r = await m.syncCatalogOnce(`http://127.0.0.1:${PORT}/catalog-core.json`);
check("sync ok", r.ok === true && !r.skipped, JSON.stringify(r));
check(`union merged (${EXP.titles} titles)`, r.titles === EXP.titles, `titles=${r.titles}`);
check(`episodes total ${EXP.episodes}`, r.episodes === EXP.episodes, `episodes=${r.episodes}`);

const db = new PrismaClient({ datasources: { db: { url: "file:" + scratch } } });
const total = await db.title.count();
const f2m = await db.title.count({ where: { source: "f2m" } });
const od = await db.title.count({ where: { source: "od" } });
check(`db title count ${EXP.titles}`, total === EXP.titles, `count=${total}`);
check(`f2m titles created (part file)`, f2m === f2mExpected, `f2m=${f2m}`);
check(`od titles intact (${EXP.titles - f2mExpected})`, od === EXP.titles - f2mExpected, `od=${od}`);

// sources survival: an od movie with merged f2m links must keep BOTH
const t = await db.title.findFirst({
  where: { titleEn: "10 Cloverfield Lane" },
  select: { sources: true, videoUrl: true, episodes: { take: 1, select: { sources: true, videoUrl: true } } },
});
const srcList = JSON.parse(t?.sources || "[]");
check("movie sources survived (array→string fix)", srcList.length >= 10, `n=${srcList.length}`);
check("movie has od+f2m links", srcList.some((s) => s.url.includes("aparatchi") || s.url.includes("varzeshha3-uploader")) && srcList.some((s) => s.url.includes("abrtech")));
check("movie sources carry variant labels", srcList.every((s) => typeof s.v === "string" && s.q));

// stored hash must be partsSha256
const stored = await db.syncState.findUnique({ where: { key: "catalog.hash" } });
check("stored hash == partsSha256", stored?.value === version.partsSha256, `${stored?.value?.slice(0, 12)} vs ${version.partsSha256?.slice(0, 12)}`);

// second sync must SKIP via the probe — fresh module instance (the app's
// syncCatalogOnce caches per process, which is expected)
fs.writeFileSync(modFile, js);
const m2 = await import(pathToFileURL(modFile).href + `?v=${Date.now() + 1}`);
const r2 = await m2.syncCatalogOnce(`http://127.0.0.1:${PORT}/catalog-core.json`);
check("second sync skips via hash", r2.ok === true && r2.skipped === true, JSON.stringify(r2));

await db.$disconnect();
srv.close();
fs.rmSync(TMP, { recursive: true, force: true });
const bad = results.filter((x) => !x.ok);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
