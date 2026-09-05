/**
 * سرور موک Open Directory برای تست خط لوله همگام‌سازی در سندباکس.
 * ساختار و HTML کاملاً شبیه autoindex آپاچی است (لینک‌های URL-encoded).
 * اجرا: bun scripts/mock-od/server.mjs  (پورت 8899)
 */
import { createServer } from "http";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(new URL(import.meta.url)), "..", "tree");
const PORT = 8899;

const MIME = {
  ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

function enc(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

function listing(dirPath, reqPath) {
  const items = readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  const rows = items
    .map((e) => {
      const href = enc(e.name) + (e.isDirectory() ? "/" : "");
      const st = statSync(join(dirPath, e.name));
      const size = e.isDirectory() ? "-" : human(st.size);
      return `<tr><td><a href="${href}">${e.name}${e.isDirectory() ? "/" : ""}</a></td><td>${new Date(st.mtime).toISOString().slice(0, 16).replace("T", " ")}</td><td align="right">${size}</td></tr>`;
    })
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Index of ${reqPath}</title></head><body>
<h1>Index of ${reqPath}</h1>
<table><tr><th>Name</th><th>Last modified</th><th>Size</th></tr>
${reqPath !== "/" ? `<tr><td><a href="../">../</a></td><td>&nbsp;</td><td>&nbsp;</td></tr>` : ""}
${rows}
</table></body></html>`;
}

function human(n) {
  if (n > 1e9) return (n / 1e9).toFixed(1) + "G";
  if (n > 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n > 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const fsPath = join(ROOT, urlPath);
    if (!fsPath.startsWith(ROOT)) { res.writeHead(403); return res.end(); }

    if (statSync(fsPath).isDirectory()) {
      const idx = join(fsPath, "index.html");
      const html = existsSync(idx) ? readFileSync(idx, "utf8") : listing(fsPath, urlPath);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    }
    const body = readFileSync(fsPath);
    res.writeHead(200, {
      "content-type": MIME[extname(fsPath).toLowerCase()] || "application/octet-stream",
      "content-length": body.length,
      "accept-ranges": "bytes",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found: " + e.message);
  }
}).listen(PORT, () => console.log(`mock OD on http://localhost:${PORT}/`));
