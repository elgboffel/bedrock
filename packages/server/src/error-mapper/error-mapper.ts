/** Centralized translation from tagged domain errors to HTTP responses. */

/** Wire-format error body. `details` carries structured context (e.g. validation `fields`). */
export interface ErrorResponse {
  readonly error: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/** HTTP status + body produced by a mapper. */
export interface HttpErrorResponse {
  readonly status: number;
  readonly body: ErrorResponse;
}

/** Function from a tagged error to an HTTP response. */
export type ErrorMapping = (error: {
  readonly _tag: string;
}) => HttpErrorResponse;

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
  ConflictError: (error) => {
    const e = error as {
      _tag: "ConflictError";
      resource: string;
      detail?: string;
    };
    return {
      status: 409,
      body: {
        error: "ConflictError",
        message: `${e.resource} already exists`,
        ...(e.detail ? { details: { detail: e.detail } } : {}),
      },
    };
  },
  ValidationError: (error) => {
    const e = error as {
      _tag: "ValidationError";
      message: string;
      fields?: Record<string, ReadonlyArray<string>>;
    };
    return {
      status: 400,
      body: {
        error: "ValidationError",
        message: e.message,
        ...(e.fields ? { details: { fields: e.fields } } : {}),
      },
    };
  },
};

const fallbackResponse: HttpErrorResponse = {
  status: 500,
  body: { error: "InternalError", message: "An unexpected error occurred" },
};

/** Maps a tagged error to an HTTP response using the default mappings. Unknown tags → generic 500. */
export function mapErrorToHttp(error: {
  readonly _tag: string;
}): HttpErrorResponse {
  const mapping = defaultMappings[error._tag];
  return mapping ? mapping(error) : fallbackResponse;
}

/** Builds a mapper that extends the defaults with `customMappings` (custom takes priority). */
export function createErrorMapper(
  customMappings: Record<string, ErrorMapping>,
): (error: { readonly _tag: string }) => HttpErrorResponse {
  const merged = { ...defaultMappings, ...customMappings };
  return (error) => {
    const mapping = merged[error._tag];
    return mapping ? mapping(error) : fallbackResponse;
  };
}
