/** Tagged domain errors. Mapped to HTTP responses by `error-mapper`. */
import { Data } from "effect";

/** Requested resource was not found. `resource` describes what (e.g. "User(123)"). */
export class NotFound extends Data.TaggedError("NotFound")<{
  readonly resource: string;
}> {}

/** Request not authorized. `reason` optionally explains why. */
export class Unauthorized extends Data.TaggedError("Unauthorized")<{
  readonly reason?: string;
}> {}

/** Request input failed validation. `fields` carries flat path → messages when produced by a schema decode. */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly fields?: Record<string, ReadonlyArray<string>>;
}> {}

/** Resource conflict (e.g. unique constraint violation). `resource` names what conflicted; `detail` is optional context. */
export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly resource: string;
  readonly detail?: string;
}> {}

/** Internal/unexpected error. `message` is for logs, not exposed to clients. */
export class InternalError extends Data.TaggedError("InternalError")<{
  readonly message: string;
}> {}
