import { IMAGE_EXT, IGNORE_EXT, VIDEO_EXT } from "./parser";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export interface ListingEntry {
  name: string; // نام نمایشی decode شده
  url: string; // URL کامل مطلق
  dir: boolean;
}

export interface Listing {
  url: string;
  dirs: ListingEntry[];
  videos: ListingEntry[];
  images: ListingEntry[];
}

function joinUrl(base: string, href: string): string {
  try {
    return new URL(href, base.endsWith("/") ? base : base + "/").toString();
  } catch {
    return "";
  }
}

/** یک URL معتبر برای کرال است؟ */
export function sameHost(base: string, target: string): boolean {
  try {
    return new URL(base).host === new URL(target).host;
  } catch {
    return false;
  }
}

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/**
 * گرفتن و تفسیر یک صفحه autoindex (آپاچی/انجین‌ایکس/سامبا).
 * خروجی فقط شامل پوشه‌ها و فایل‌های مدیا/تصویر مرتبط است.
 */
export async function fetchListing(url: string, timeoutMs = 20000): Promise<Listing> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/html") && !ctype.includes("text/plain")) {
      // خود URL یک فایل است نه فهرست
      return { url, dirs: [], videos: [], images: [] };
    }
    const html = await res.text();
    return parseAutoindex(html, url);
  } finally {
    clearTimeout(t);
  }
}

/** تفسیر HTML فهرست فایل؛ در دسترس عمومی برای تست */
export function parseAutoindex(html: string, baseUrl: string): Listing {
  const out: Listing = { url: baseUrl, dirs: [], videos: [], images: [] };
  const seen = new Set<string>();

  const linkRe = /<a\s[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const label = decodeHtml(m[2].replace(/<[^>]*>/g, "")).trim();
    if (/^(\.\.\/|\/|\?|#|javascript:|mailto:)/i.test(href)) continue;
    const abs = joinUrl(baseUrl, href);
    if (!abs || !sameHost(baseUrl, abs) || seen.has(abs)) continue;
    seen.add(abs);

    const isDir = href.endsWith("/") || abs.endsWith("/");
    let name = label || decodeURIComponent(href.replace(/\/$/, "").split("/").pop() || "");
    if (isDir) {
      name = name.replace(/\/+$/, "").trim(); // برچسب آپاچی اغلب «name/» است
      if (!name || name.startsWith(".")) continue;
      out.dirs.push({ name, url: abs, dir: true });
      continue;
    }

    const ext = extOf(name);
    if (IGNORE_EXT.has(ext) || name.startsWith(".")) continue;
    if (VIDEO_EXT.has(ext)) out.videos.push({ name, url: abs, dir: false });
    else if (IMAGE_EXT.has(ext)) out.images.push({ name, url: abs, dir: false });
  }
  return out;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2f;/gi, "/");
}
