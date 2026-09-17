import { Prisma } from "@prisma/client";

/* BUG-010 — the catalog's FKs are ENFORCED (verified on a live DB copy), so a
 * stale/half-deleted titleId used to blow up as an unhandled `P2003` → a
 * plain-text 500 HTML page that broke every client doing res.json(). These
 * helpers turn the known constraint failures into clean JSON 4xx responses
 * the same way the rest of the API answers. */

/** Map a caught error to a JSON 4xx Response, or null when it is not one of
 *  the constraint failures we handle (→ let it throw for real). */
export function prismaErrorResponse(err: unknown): Response | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  // P2003 FK (title deleted mid-request / bogus id) · P2025 record vanished
  // under a concurrent toggle · P2002 unique collision under a race
  if (err.code === "P2003" || err.code === "P2025") {
    return Response.json({ error: "unknown_or_gone_title" }, { status: 404 });
  }
  if (err.code === "P2002") {
    return Response.json({ error: "duplicate" }, { status: 409 });
  }
  return null;
}

/** Run one mutation, converting constraint failures into JSON 4xx. */
export async function prismaSafe(run: () => Promise<unknown>): Promise<Response | null> {
  try {
    await run();
    return null;
  } catch (err) {
    return prismaErrorResponse(err);
  }
}

/** Does this title exist? (cheap local-SQLite point lookup) */
export async function titleExists(titleId: number): Promise<boolean> {
  const { db } = await import("@/lib/db");
  const row = await db.title.findUnique({ where: { id: titleId }, select: { id: true } });
  return !!row;
}

/** BUG-049 — shared normalization for bulk titleId arrays: dedupe + cap, so a
 *  duplicated/oversized payload can neither fire unbounded parallel upserts
 *  (connection-pool exhaustion) nor exceed SQLite's bind-parameter limit. */
export function capTitleIds(input: number[] | undefined | null, cap = 1000): number[] {
  return [...new Set((input ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0))].slice(0, cap);
}
