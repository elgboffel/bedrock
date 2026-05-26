import { Either, type ParseResult, Schema } from "effect";
import { describe, expect, test } from "vitest";
import { ValidationError } from "./errors.js";
import { parseErrorToValidation } from "./parse-error-to-validation.js";

function decodeError<A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
): ParseResult.ParseError {
  const result = Schema.decodeUnknownEither(schema)(input);
  if (Either.isRight(result)) {
    throw new Error("expected decode to fail");
  }
  return result.left;
}

describe("parseErrorToValidation", () => {
  test("flat field schema populates fields keyed by property name", () => {
    const schema = Schema.Struct({ name: Schema.NonEmptyString });
    const err = decodeError(schema, {});

    const result = parseErrorToValidation(err, "body");

    expect(result).toBeInstanceOf(ValidationError);
    expect(result.fields).toBeDefined();
    expect(result.fields?.name).toBeDefined();
    expect(result.fields?.name?.length).toBeGreaterThan(0);
    expect(result.message).toMatch(/body/);
  });

  test("nested object schema produces dotted path keys", () => {
    const schema = Schema.Struct({
      user: Schema.Struct({ email: Schema.NonEmptyString }),
    });
    const err = decodeError(schema, { user: { email: "" } });

    const result = parseErrorToValidation(err, "body");

    expect(result.fields?.["user.email"]).toBeDefined();
    expect(result.fields?.["user.email"]?.length).toBeGreaterThan(0);
  });

  test("array elements produce indexed dotted paths", () => {
    const schema = Schema.Struct({
      items: Schema.Array(Schema.Struct({ name: Schema.NonEmptyString })),
    });
    const err = decodeError(schema, { items: [{ name: "" }] });

    const result = parseErrorToValidation(err, "body");

    expect(result.fields?.["items.0.name"]).toBeDefined();
    expect(result.fields?.["items.0.name"]?.length).toBeGreaterThan(0);
  });

  test("root-type mismatch uses source name as the fields key", () => {
    const schema = Schema.Struct({ name: Schema.String });
    const err = decodeError(schema, "not an object");

    const result = parseErrorToValidation(err, "params");

    expect(Object.keys(result.fields ?? {})).toEqual(["params"]);
    expect(result.fields?.params?.length).toBeGreaterThan(0);
  });
});
