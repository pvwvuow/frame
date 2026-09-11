"use client";

/* v0.27.0 (UI-4) — recent searches, saved locally, shown in the empty
 * navbar panel and on the search page. Tiny, dependency-free, capped. */

const KEY = "nama.search.recent";
const CAP = 8;

export function getRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, CAP);
  } catch {
    return [];
  }
}

export function rememberSearch(q: string): void {
  const term = q.trim();
  if (!term) return;
  const next = [term, ...getRecentSearches().filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function forgetSearch(q: string): void {
  const term = q.trim().toLowerCase();
  const next = getRecentSearches().filter((s) => s.toLowerCase() !== term);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
