import { SqlError } from "@effect/sql";
import { Cause } from "effect";
import { describe, expect, test } from "vitest";
import { isUniqueViolation } from "./errors.js";

describe("isUniqueViolation", () => {
  test("returns constraint name for pg unique violation (code 23505) wrapped in SqlError", () => {
    const pgError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "items_name_unique",
    });
    const err = new SqlError.SqlError({ cause: pgError, message: "boom" });

    expect(isUniqueViolation(err)).toEqual({ constraint: "items_name_unique" });
  });

  test("returns null for SqlError with non-23505 code", () => {
    const pgError = Object.assign(new Error("fk violation"), {
      code: "23503",
      constraint: "items_fk",
    });
    const err = new SqlError.SqlError({ cause: pgError, message: "boom" });

    expect(isUniqueViolation(err)).toBeNull();
  });

  test("walks Cause.Fail wrappers (e.g. Drizzle EffectDrizzleQueryError shape)", () => {
    // Mirrors what `drizzle-orm/effect-postgres` produces: outer error whose
    // `cause` is an Effect `Cause<SqlError>` whose `.error` is the SqlError
    // whose `.cause` is the raw pg DatabaseError.
    const pgError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "items_name_unique",
    });
    const sqlError = new SqlError.SqlError({
      cause: pgError,
      message: "Failed to execute statement",
    });
    const wrapped = {
      _tag: "EffectDrizzleQueryError",
      cause: Cause.fail(sqlError),
    };

    expect(isUniqueViolation(wrapped)).toEqual({
      constraint: "items_name_unique",
    });
  });

  test("returns null for non-pg / unknown inputs", () => {
    expect(isUniqueViolation(null)).toBeNull();
    expect(isUniqueViolation(undefined)).toBeNull();
    expect(isUniqueViolation("nope")).toBeNull();
    expect(isUniqueViolation(new Error("plain"))).toBeNull();
    expect(
      isUniqueViolation({ _tag: "Other", cause: { code: "42P01" } }),
    ).toBeNull();
  });
});
