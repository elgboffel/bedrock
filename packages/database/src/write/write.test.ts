import { SqlError } from "@effect/sql";
import { ConflictError } from "@repo/server/errors";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, test } from "vitest";
import { writeOrConflict } from "./write";

/** Builds an `EffectDrizzleQueryError` wrapping a pg error, as Drizzle would. */
function queryError(pgCode: string, constraint: string) {
  const pgError = Object.assign(new Error("duplicate key"), {
    code: pgCode,
    constraint,
  });
  const sqlError = new SqlError.SqlError({
    cause: pgError,
    message: "Failed to execute statement",
  });
  return new EffectDrizzleQueryError({
    query: "insert into items ...",
    params: [],
    cause: Cause.fail(sqlError),
  });
}

describe("writeOrConflict", () => {
  test("passes successful rows through untouched", async () => {
    const rows = [{ id: "1", name: "widget" }];
    const result = await Effect.runPromise(
      writeOrConflict(Effect.succeed(rows), { resource: "Item" }),
    );

    expect(result).toEqual(rows);
  });

  test("maps a unique-constraint violation to ConflictError", async () => {
    const write = Effect.fail(queryError("23505", "items_name_unique"));

    const exit = await Effect.runPromiseExit(
      writeOrConflict(write, { resource: "Item" }),
    );

    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause);
      expect(error._tag).toBe("Some");
      const conflict = (error as { value: ConflictError }).value;
      expect(conflict).toBeInstanceOf(ConflictError);
      expect(conflict.resource).toBe("Item");
      expect(conflict.detail).toBe("constraint:items_name_unique");
    }
  });

  test("dies (defect) on any other driver error", async () => {
    const write = Effect.fail(queryError("23503", "items_fk"));

    const exit = await Effect.runPromiseExit(
      writeOrConflict(write, { resource: "Item" }),
    );

    expect(exit._tag).toBe("Failure");
    if (Exit.isFailure(exit)) {
      expect(Cause.isDie(exit.cause)).toBe(true);
      expect(Cause.failureOption(exit.cause)._tag).toBe("None");
    }
  });
});
