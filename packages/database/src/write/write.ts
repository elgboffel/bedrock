/**
 * Write seam: run a Drizzle write Effect and translate driver-level
 * unique-constraint violations into the domain's `ConflictError`.
 *
 * Every other driver error is a defect (`Effect.die`) — a bug, not a
 * client-facing failure — so it never reaches the HTTP error mapper as a
 * tagged error. Callers wrap an insert / update / `.returning()` Effect and
 * receive either the rows or a `ConflictError`; they never see
 * `EffectDrizzleQueryError` or `isUniqueViolation` directly.
 *
 * Usage:
 *
 *   import { writeOrConflict } from "@repo/database/write";
 *
 *   const [created] = yield* writeOrConflict(
 *     db.insert(items).values({ name }).returning(),
 *     { resource: "Item" },
 *   );
 */

import { ConflictError } from "@repo/server/errors";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors";
import { Effect } from "effect";
import { isUniqueViolation } from "../errors/errors";

/** Describes the resource a conflicting write was targeting. */
export interface WriteConflict {
  /** Names the resource that conflicted, e.g. `"Item"`. */
  readonly resource: string;
}

/**
 * Run a Drizzle write Effect, mapping a unique-constraint violation to
 * `ConflictError` and dying on any other driver error.
 */
export const writeOrConflict = <A, R>(
  write: Effect.Effect<A, EffectDrizzleQueryError, R>,
  conflict: WriteConflict,
): Effect.Effect<A, ConflictError, R> =>
  write.pipe(
    Effect.catchTag("EffectDrizzleQueryError", (error) => {
      const hit = isUniqueViolation(error);
      return hit
        ? Effect.fail(
            new ConflictError({
              resource: conflict.resource,
              detail: `constraint:${hit.constraint}`,
            }),
          )
        : Effect.die(error);
    }),
  );
