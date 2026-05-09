/**
 * Effect-to-Fastify route adapter.
 *
 * `effectRoute` bridges Effect handlers and Fastify's route system.
 * You write your route logic as an Effect that returns data and may
 * fail with typed errors. The adapter runs the Effect, and:
 *
 * - On success: sends the return value as a JSON response (200).
 * - On typed error: maps it to an HTTP status code via the error mapper.
 * - On defect (unexpected throw): returns a generic 500.
 *
 * This keeps route handlers pure and testable — they don't need to
 * know about HTTP status codes or Fastify's reply API.
 *
 * Example:
 *   app.get("/users/:id", effectRoute((req) =>
 *     Effect.gen(function* () {
 *       const user = yield* findUser(req.params.id);
 *       return user;
 *     })
 *   ));
 */

import { Cause, Effect, Exit, Option } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";
import { mapErrorToHttp } from "./error-mapper.js";

/**
 * Converts an Effect-returning handler into a Fastify route handler.
 *
 * The handler receives the Fastify request and reply objects and returns
 * an Effect. The Effect's success value becomes the JSON response body.
 * Typed errors (with a `_tag` field) are mapped to HTTP error responses.
 * Unexpected defects produce a 500.
 */
export function effectRoute<T>(
  handler: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Effect.Effect<T, { readonly _tag: string }>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const effect = handler(request, reply);

    // Run the Effect and inspect the Exit value to distinguish
    // between success, expected errors, and unexpected defects.
    const exit = await Effect.runPromiseExit(effect);

    if (Exit.isSuccess(exit)) {
      return reply.status(200).send(exit.value);
    }

    // Exit.isFailure — inspect the Cause to determine error type
    const cause = exit.cause;

    // Cause.failureOption extracts the typed error (if any) as an Option
    const failureOption = Cause.failureOption(cause);

    if (Option.isSome(failureOption)) {
      const httpError = mapErrorToHttp(failureOption.value);
      return reply.status(httpError.status).send(httpError.body);
    }

    // Defect (unexpected throw/die) — generic 500, no details leaked
    return reply.status(500).send({
      error: "InternalError",
      message: "An unexpected error occurred",
    });
  };
}
