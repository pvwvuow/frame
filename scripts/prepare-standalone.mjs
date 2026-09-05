/**
 * آماده‌سازی بسته مستقل Next برای پکیج Electron:
 * 1) کاپی کلاینت Prisma + موتورهای پلتفرمی (به‌ویژه ویندوز) داخل standalone
 * 2) ساخت db/template.db (کاتالوگ دمو) برای بوت اولیه در دستگاه کاربر
 */
import { cpSync, mkdirSync, copyFileSync, existsSync, rmSync, readdirSync, lstatSync, readlinkSync } from "fs";
import path from "path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("standalone build not found — run `next build` first");
  process.exit(1);
}

/** تبدیل همه symlinkها به کپی واقعی (پکیجر الکترون با symlink مشکل دارد) */
function derefSymlinks(dir) {
  let n = 0;
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      try {
        const target = path.resolve(path.dirname(p), readlinkSync(p));
        rmSync(p);
        cpSync(target, p, { recursive: true, dereference: true });
        n++;
      } catch (err) {
        console.warn("  symlink deref failed:", p, err.message);
      }
    } else if (st.isDirectory()) {
      n += derefSymlinks(p);
    }
  }
  return n;
}

const nm = path.join(standalone, "node_modules");
mkdirSync(path.join(nm, ".prisma"), { recursive: true });
mkdirSync(path.join(nm, "@prisma"), { recursive: true });

// کلاینت تولیدشده + موتورها (native + windows)
rmSync(path.join(nm, ".prisma", "client"), { recursive: true, force: true });
cpSync(path.join(root, "node_modules", ".prisma", "client"), path.join(nm, ".prisma", "client"), { recursive: true });
cpSync(path.join(root, "node_modules", "@prisma", "client"), path.join(nm, "@prisma", "client"), { recursive: true });
// فایل‌های runtime کمکی @prisma/client/runtime نیز لازم است (در cp بالایی آمد)
console.log("prisma client + engines copied");

// دیتابیس الگو (دمو) برای بوت اولیه — بدون دیتای تست/همگام‌سازی سندباکس
mkdirSync(path.join(standalone, "db"), { recursive: true });
copyFileSync(path.join(root, "db", "custom.db"), path.join(standalone, "db", "template.db"));
{
  const { execSync } = await import("child_process");
  const env = { ...process.env, DATABASE_URL: "file:" + path.join(standalone, "db", "template.db") };
  execSync(
    'bunx prisma db execute --stdin --schema prisma/schema.prisma',
    { input: "DELETE FROM Episode WHERE titleId IN (SELECT id FROM Title WHERE source='od'); DELETE FROM Favorite WHERE titleId IN (SELECT id FROM Title WHERE source='od'); DELETE FROM UserRating WHERE titleId IN (SELECT id FROM Title WHERE source='od'); DELETE FROM WatchProgress WHERE titleId IN (SELECT id FROM Title WHERE source='od'); DELETE FROM Watchlist WHERE titleId IN (SELECT id FROM Title WHERE source='od'); DELETE FROM Title WHERE source='od'; DELETE FROM SyncState;", env, stdio: ["pipe", "ignore", "inherit"] }
  );
  console.log("template.db cleaned (demo catalog only)");
}

/** حذف فایل‌های پروژه که Next 16 در standalone کپی می‌کند ولی در پکیج لازم نیستند */
const PRUNE = [
  "skills", "scripts", "download", "upload", "examples", "tests", "tool-results",
  ".zscripts", "electron", "build", "src", "Caddyfile", "README.md", "bun.lock",
  "components.json", "dev.log", "dev-setup.log", "log_b.txt", "log_a.txt",
  "electron-builder.yml", "eslint.config.mjs", "mock-od.log", "worklog.md",
  "server.log", "dev.out.log", "build-electron.log", "tsconfig.json",
  "postcss.config.mjs", "tailwind.config.ts", "next.config.ts",
];
for (const name of PRUNE) {
  rmSync(path.join(standalone, name), { recursive: true, force: true });
}
// کاتالوگ‌های کاور تولیدی دمو هم در دستگاه کاربر ساخته می‌شوند
rmSync(path.join(standalone, "public", "covers"), { recursive: true, force: true });
console.log("standalone pruned to runtime essentials");

const derefCount = derefSymlinks(standalone);
console.log(`dereferenced ${derefCount} symlink(s)`);

console.log("standalone ready at", standalone);
