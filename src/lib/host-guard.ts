/* S01 (audit v0.49) — HOST-LEVEL SSRF CLASSIFICATION (pure, no imports).
 *
 * Extracted from api-guard.ts so it can be unit-tested without the Next.js
 * runtime: the crawler guard's hostname regex missed real host forms:
 *   • `[::ffff:7f00:1]`  — IPv4-MAPPED IPv6 loopback (hex, never normalized
 *     by WHATWG URL → sailed past the `[::1]`-only check)
 *   • `[::]`             — unspecified address (stacks may route it local)
 *   • `localhost.`       — trailing dot canonicalizes to localhost
 *   • `100.64.0.1`       — CGNAT shared-address range (policy: private)
 * Shorthand IPv4 (`127.1`, `2130706433`, `0x7f000001`) needs no handling
 * here — WHATWG `new URL()` already canonicalizes those to dotted quads.
 * DNS-level pinning is NOT this module's job (autoindex re-checks the final
 * URL after redirects); this layer classifies the HOST STRING. */

/** IPv4 byte check — every range a private resolver could answer on. */
export function ipv4IsPrivate(bytes: [number, number, number, number]): boolean {
  const [a, b] = bytes;
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT shared (S01)
  if (a === 255 && b === 255) return true; // 255.255.255.255 broadcast tail
  return false;
}

/** dotted-quad host (already canonical per WHATWG) */
export function hostnameIsPrivateIpv4(h: string): boolean {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const bytes = m.slice(1, 5).map((s) => Number(s)) as unknown as [number, number, number, number];
  if (bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → fail closed
  return ipv4IsPrivate(bytes);
}

/** IPv6 host (bracketed or bare): ::1, ::, mapped/compatible v4, ULA, link-local */
export function hostnameIsPrivateIpv6(h: string): boolean {
  const addr = h.replace(/^\[|\]$/g, "").toLowerCase();
  if (addr === "::" || addr === "::1") return true; // unspecified, loopback
  if (/^f(?:e[89ab]|c|d)/.test(addr)) return true; // fe80::/10 link-local, fc00::/7 ULA
  // IPv4-mapped / compatible shorthand: ::ffff:a.b.c.d · ::ffff:7f00:1 · ::7f00:1
  const mapped = addr.match(/^(?:::)(?:ffff:)?((?:\d{1,3}(?:\.\d{1,3}){3})|(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}))$/);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes(".")) return hostnameIsPrivateIpv4(tail);
    const [hi, lo] = tail.split(":").map((g) => parseInt(g, 16));
    return ipv4IsPrivate([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
  }
  // full-form mapped: 0:0:0:0:0:ffff:a.b.c.d / 0:0:0:0:0:ffff:7f00:1
  const full = addr.split(":");
  if (full.length === 8 && full.slice(0, 5).every((g) => parseInt(g, 16) === 0) && full[5].toLowerCase() === "ffff") {
    const [hi, lo] = [full[6], full[7]].map((g) => parseInt(g, 16));
    return ipv4IsPrivate([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
  }
  return false;
}

/** Canonical name + IP layer. True = DO NOT fetch. */
export function hostnameIsInternal(rawHost: string): boolean {
  let h = rawHost.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "localhost.localdomain") return true;
  if (h.includes(":")) return hostnameIsPrivateIpv6(rawHost);
  if (hostnameIsPrivateIpv4(h)) return true;
  // dotless single label (`intranet`, `router`) — a resolver can bind it
  // anywhere; public hosts always carry at least one dot. Fail closed.
  if (!h.includes(".")) return true;
  return false;
}

/** True when the URL is a fetchable PUBLIC http(s) address (pure — no Next
 *  runtime): scheme gate + the host classification above. */
export function isPublicHttpUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return !hostnameIsInternal(u.hostname);
}
