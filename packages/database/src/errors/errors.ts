/** Database error helpers. Sniff driver-level errors without leaking pg types. */

/**
 * Returns the violated constraint name when `err` is (or wraps) a Postgres
 * unique-constraint violation (SQLSTATE `23505`), otherwise `null`.
 *
 * Walks the `cause` / `failure` chain so it works whether the input is a raw
 * pg `DatabaseError`, an `@effect/sql` `SqlError`, or a Drizzle/effect-postgres
 * wrapper around either.
 */
export function isUniqueViolation(err: unknown): { constraint: string } | null {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const node = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
      error?: unknown;
      failure?: unknown;
    };
    if (node.code === "23505") {
      const constraint =
        typeof node.constraint === "string" ? node.constraint : "";
      return { constraint };
    }
    current = node.cause ?? node.error ?? node.failure;
  }
  return null;
}
