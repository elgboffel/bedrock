/**
 * Translate an Effect `ParseError` into a `ValidationError` whose
 * `fields` map is keyed by dotted property path.
 *
 * Empty-paths failures (e.g. wrong root type) use `source` as the single key.
 */
import { ParseResult } from "effect";
import { ValidationError } from "./errors.js";

/** Source slot the schema decoded against — used as a fallback `fields` key. */
export type ValidationSource = "body" | "params" | "query";

/** Builds a `ValidationError` with a flat `fields` map from a `ParseError`. */
export function parseErrorToValidation(
  error: ParseResult.ParseError,
  source: ValidationSource,
): ValidationError {
  const issues = ParseResult.ArrayFormatter.formatErrorSync(error);
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const key =
      issue.path.length === 0 ? source : issue.path.map(String).join(".");
    const bucket = fields[key] ?? [];
    bucket.push(issue.message);
    fields[key] = bucket;
  }
  return new ValidationError({
    message: `Validation failed on ${source}`,
    fields,
  });
}
