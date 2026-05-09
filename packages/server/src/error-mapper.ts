/**
 * Centralized error-to-HTTP response mapper.
 *
 * Maps tagged domain errors to HTTP status codes and response bodies.
 * This is the single place where domain errors get translated to HTTP
 * semantics — keeping the rest of the codebase free from HTTP concerns.
 *
 * The mapper uses the `_tag` field from Data.TaggedError to identify
 * error types. Unknown tags produce a generic 500 response that doesn't
 * leak internal details.
 */

/** Shape of an HTTP error response. */
export interface HttpErrorResponse {
  readonly status: number;
  readonly body: { error: string; message: string };
}

/**
 * A custom error mapping function. Takes a tagged error and returns
 * an HTTP status code + response body.
 */
export type ErrorMapping = (error: {
  readonly _tag: string;
}) => HttpErrorResponse;

/**
 * Default mappings from error tags to HTTP responses.
 *
 * These are used by `mapErrorToHttp` and serve as the base for
 * any custom mapper created with `createErrorMapper`.
 */
const defaultMappings: Record<string, ErrorMapping> = {
  NotFound: (error) => {
    const e = error as { _tag: "NotFound"; resource: string };
    return {
      status: 404,
      body: { error: "NotFound", message: `${e.resource} not found` },
    };
  },
  Unauthorized: (error) => {
    const e = error as { _tag: "Unauthorized"; reason?: string };
    return {
      status: 401,
      body: { error: "Unauthorized", message: e.reason ?? "Unauthorized" },
    };
  },
  ValidationError: (error) => {
    const e = error as { _tag: "ValidationError"; message: string };
    return {
      status: 400,
      body: { error: "ValidationError", message: e.message },
    };
  },
};

/** Generic 500 response for unknown/unhandled errors. */
const fallbackResponse: HttpErrorResponse = {
  status: 500,
  body: { error: "InternalError", message: "An unexpected error occurred" },
};

/**
 * Maps a tagged error to an HTTP status code and response body
 * using the default error mappings.
 *
 * Known error tags get specific status codes and messages.
 * Unknown errors get a generic 500 response.
 */
export function mapErrorToHttp(error: {
  readonly _tag: string;
}): HttpErrorResponse {
  const mapping = defaultMappings[error._tag];
  return mapping ? mapping(error) : fallbackResponse;
}

/**
 * Creates a custom error mapper that extends the default mappings.
 *
 * Custom mappings take priority over defaults, so you can both add
 * new error types and override built-in ones.
 *
 * Example:
 *   const mapper = createErrorMapper({
 *     RateLimited: (e) => ({
 *       status: 429,
 *       body: { error: "RateLimited", message: "slow down" },
 *     }),
 *   });
 */
export function createErrorMapper(
  customMappings: Record<string, ErrorMapping>,
): (error: { readonly _tag: string }) => HttpErrorResponse {
  // Custom mappings override defaults (spread order matters)
  const merged = { ...defaultMappings, ...customMappings };
  return (error) => {
    const mapping = merged[error._tag];
    return mapping ? mapping(error) : fallbackResponse;
  };
}
