/**
 * Client-safe constants & types shared between the server library helpers
 * (src/lib/library.ts) and client components. Keep this module FREE of any
 * server-only imports (db / prisma / node built-ins): it is part of the
 * client bundle graph, and Turbopack fails the build on `node:` externals.
 */
export type ListStatus = "planned" | "watching" | "watched";
export const LIST_STATUSES: { value: ListStatus; label: string; color: string }[] = [
  { value: "planned", label: "در انتظار تماشا", color: "text-sky-400" },
  { value: "watching", label: "در حال تماشا", color: "text-amber-400" },
  { value: "watched", label: "تماشا شده", color: "text-emerald-400" },
];
