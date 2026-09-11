import { NextResponse } from "next/server";

/**
 * A-6/C — گارد مبدأ برای اندپوینت‌های جهش‌دهنده‌ی API (P1-backend).
 *
 * واقعیت‌ی اپ: سرور روی 127.0.0.1 داخل Electron بالا می‌آید (و گاهی روی
 * شبکه‌ی محلی self-host می‌شود). درخواست‌های جهش‌دهنده نباید از یک صفحه‌ی
 * وبِ دیگر (cross-site CSRF) قابل اجرا باشند؛ ولی این‌ها باید رد شوند:
 *
 *   - بدون هدر Origin: درخواست سرور-به-سرور / CLI / fetch بومی اندروید
 *     (Capacitor native) که Origin نمی‌فرستد → مجاز
 *   - Origin == Host خود درخواست (همان اپ روی همان پورت) → مجاز
 *   - https://localhost یا capacitor://localhost (وب‌ویو Capacitor) → مجاز
 *   - http(s) روی 127.0.0.1 / localhost / [::1] / 0.0.0.0 با «هر پورتی»
 *     (رندرر Electron) → مجاز
 *   - هر Origin دیگری → رد (403 forbidden)
 */

/** مبدأهای وب‌ویو که همیشه مجازند (کلاینت Capacitor خودِ اپ). */
const TRUSTED_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);

/** http(s) روی لوپ‌بک با هر پورت — رندرر Electron پورت تصادفی می‌گیرد. */
const LOOPBACK_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(?::\d+)?$/i;

/**
 * true یعنی درخواست از مبدأی مجاز آمده (یا اصلاً Origin ندارد). هرگز پرتاب
 * نمی‌کند؛ هندلرها ترجیحاً از sameOriginOrThrow استفاده کنند.
 */
export function assertSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // server-to-server / CLI / native fetch

  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false; // Origin خراب → رد
  }

  // همان مبدأ واقعی درخواست (شامل پورت) — حالت عادی اپ خودمان
  const host = req.headers.get("host");
  if (host && o.host.toLowerCase() === host.toLowerCase()) return true;

  if (TRUSTED_ORIGINS.has(origin.toLowerCase())) return true;
  if (LOOPBACK_ORIGIN_RE.test(origin)) return true;

  return false;
}

/** راحتی هندلرها: null یعنی مجاز؛ در غیر این صورت پاسخ ۴۰۳ آماده. */
export function sameOriginOrThrow(req: Request): NextResponse | null {
  if (assertSameOrigin(req)) return null;
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/* ------------------------------------------------------------------ */
/* C-1 — گارد SSRF خزنده: فقط میزبان‌های عمومی http(s)                 */
/* ------------------------------------------------------------------ */

/** نام‌های میزبانِ خصوصی/داخلی که هرگز نباید fetch شوند. */
const PRIVATE_HOSTNAME_RE =
  /^(?:localhost$|127\.\d+\.\d+\.\d+$|10\.\d+\.\d+\.\d+$|192\.168\.\d+\.\d+$|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$|169\.254\.\d+\.\d+$|0\.0\.0\.0$|\[::1\]$|\[::$|\[fc|\[fd|\[fe80)/i;

/**
 * درست اگر URL یک http(s) عمومی باشد (نه loopback/خصوصی/link-local/حافظه).
 * برای مسیر شروع خزنده؛ fetchListing برای هر صفحه (و بعد از هر redirect)
 * دوباره چک می‌کند.
 */
export function isPublicHttpUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (PRIVATE_HOSTNAME_RE.test(u.hostname)) return false;
  return true;
}
