/** Centralized translation from tagged domain errors to HTTP responses. */
import type {
  ConflictError,
  InternalError,
  NotFound,
  Unauthorized,
  ValidationError,
} from "../errors/errors";

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

/** Union of every tagged domain error the central mapper knows about. */
type DomainError =
  | NotFound
  | Unauthorized
  | ValidationError
  | ConflictError
  | InternalError;

/**
 * Registry keyed by the tagged-error union. The mapped type forces a mapping
 * for *every* tag (forget one → compile error) and types each mapper's `error`
 * argument as the exact variant for that tag (no `as` casts in the bodies).
 */
type ErrorRegistry = {
  readonly [Tag in DomainError["_tag"]]: (
    error: Extract<DomainError, { readonly _tag: Tag }>,
  ) => HttpErrorResponse;
};

const defaultMappings: ErrorRegistry = {
  NotFound: (error) => ({
    status: 404,
    body: { error: "NotFound", message: `${error.resource} not found` },
  }),
  Unauthorized: (error) => ({
    status: 401,
    body: { error: "Unauthorized", message: error.reason ?? "Unauthorized" },
  }),
  ConflictError: (error) => ({
    status: 409,
    body: {
      error: "ConflictError",
      message: `${error.resource} already exists`,
      ...(error.detail ? { details: { detail: error.detail } } : {}),
    },
  }),
  ValidationError: (error) => ({
    status: 400,
    body: {
      error: "ValidationError",
      message: error.message,
      ...(error.fields ? { details: { fields: error.fields } } : {}),
    },
  }),
  // Internal details are never leaked: collapse to the generic fallback.
  InternalError: () => fallbackResponse,
};

/** The single source of truth for the generic 500 wire shape (unmapped errors + defects). */
export const fallbackResponse: HttpErrorResponse = {
  status: 500,
  body: { error: "InternalError", message: "An unexpected error occurred" },
};

/**
 * Per-tag mappers are contravariant in their `error` argument, so the typed
 * registry is not assignable to the erased `_tag: string` lookup shape. Erase
 * once, here, behind the typed `defaultMappings` declaration above — runtime
 * lookup is by string tag, but every entry stays type-checked at definition.
 */
const erasedDefaults = defaultMappings as unknown as Record<
  string,
  ErrorMapping
>;

function lookup(
  mappings: Record<string, ErrorMapping | undefined>,
  error: { readonly _tag: string },
): HttpErrorResponse {
  const mapping = mappings[error._tag];
  return mapping ? mapping(error) : fallbackResponse;
}

/** Maps a tagged error to an HTTP response using the default mappings. Unknown tags → generic 500. */
export function mapErrorToHttp(error: {
  readonly _tag: string;
}): HttpErrorResponse {
  return lookup(erasedDefaults, error);
}

/** Builds a mapper that extends the defaults with `customMappings` (custom takes priority). */
export function createErrorMapper(
  customMappings: Record<string, ErrorMapping>,
): (error: { readonly _tag: string }) => HttpErrorResponse {
  const merged = { ...erasedDefaults, ...customMappings };
  return (error) => lookup(merged, error);
}
