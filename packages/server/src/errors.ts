/**
 * Tagged domain error types.
 *
 * These errors represent domain-level failure cases using Effect's
 * `Data.TaggedError` pattern. Each error has a unique `_tag` string
 * that acts as a discriminant -- you can pattern-match on it to
 * handle different error types.
 *
 * Important: these errors carry domain-relevant fields only. They
 * know nothing about HTTP status codes -- that mapping lives in
 * the error mapper module. This keeps domain logic decoupled from
 * transport concerns.
 *
 * Example:
 *   const findUser = (id: string) =>
 *     Effect.fail(new NotFound({ resource: `User(${id})` }));
 */
import { Data } from "effect";

/**
 * The requested resource was not found.
 *
 * `resource` describes what was being looked for, e.g. "User(123)".
 */
export class NotFound extends Data.TaggedError("NotFound")<{
  readonly resource: string;
}> {}

/**
 * The request is not authorized.
 *
 * `reason` optionally explains why, e.g. "token expired".
 */
export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly reason?: string;
}> {}

/**
 * The request input failed validation.
 *
 * `message` describes what was invalid, e.g. "email must be a valid address".
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
}> {}

/**
 * An internal/unexpected error occurred.
 *
 * `message` is an internal description (not exposed to clients in HTTP responses).
 */
export class InternalError extends Data.TaggedError("InternalError")<{
  readonly message: string;
}> {}
