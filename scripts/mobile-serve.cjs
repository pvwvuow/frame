/* Static file server with SPA fallback for testing the Android export
 * locally (Capacitor's WebView server behaves the same way: unknown
 * extension-less paths fall back to the root index.html). */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || path.join(process.cwd(), "out");
const PORT = Number(process.argv[3] || 8899);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".mp4": "video/mp4",
};

http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      const idx = path.join(file, "index.html");
      if (fs.existsSync(idx)) file = idx;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // SPA fallback: extension-less route → root index.html
      if (!path.extname(p)) {
        file = path.join(ROOT, "index.html");
        p = "/index.html";
      } else {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found: " + p);
      }
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`serving ${ROOT} on :${PORT} (SPA fallback on)`));
