import { Context, Effect, Layer, Runtime, Schema } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";
import { fallbackResponse, mapErrorToHttp } from "../error-mapper/error-mapper";
import { parseErrorToValidation } from "../parse-error-to-validation/parse-error-to-validation";

// --- Success status control ---

const StatusTag = Symbol.for("@repo/server/effect-route/withStatus");

/** A route body value paired with an explicit success status (default is 200). */
interface WithStatus<T> {
  readonly [StatusTag]: number;
  readonly value: T;
}

function isWithStatus<T>(value: unknown): value is WithStatus<T> {
  return typeof value === "object" && value !== null && StatusTag in value;
}

/** Wrap a route-body result with an explicit 2xx success status. */
export function withStatus<T>(status: number, value: T): WithStatus<T> {
  return { [StatusTag]: status, value };
}

/** Convenience for `withStatus(201, value)` — the canonical create response. */
export function created<T>(value: T): WithStatus<T> {
  return withStatus(201, value);
}

function resolveSuccess(result: unknown): { status: number; body: unknown } {
  return isWithStatus(result)
    ? { status: result[StatusTag], body: result.value }
    : { status: 200, body: result };
}

// --- Effect-aware runner ---

function handleEffect<T>(
  effect: Effect.Effect<T, { readonly _tag: string }>,
  reply: FastifyReply,
): Effect.Effect<void> {
  return effect.pipe(
    Effect.withSpan("effect.handleRequest"),
    Effect.andThen((result) =>
      Effect.sync(() => {
        const { status, body } = resolveSuccess(result);
        reply.status(status).send(body);
      }),
    ),
    Effect.catchAll((error) => {
      const httpError = mapErrorToHttp(error);
      return Effect.logWarning(`Typed route error: ${error._tag}`).pipe(
        Effect.andThen(
          Effect.sync(() =>
            reply.status(httpError.status).send(httpError.body),
          ),
        ),
      );
    }),
    Effect.catchAllDefect((defect) =>
      Effect.logError(`Route defect: ${defect}`).pipe(
        Effect.andThen(
          Effect.sync(() =>
            reply.status(fallbackResponse.status).send(fallbackResponse.body),
          ),
        ),
      ),
    ),
  );
}

// --- Schema config types ---

// biome-ignore lint/suspicious/noExplicitAny: Schema.Schema requires two type parameters for encoded/decoded types
type AnySchema = Schema.Schema<any, any>;

export interface RouteSchemas {
  body?: AnySchema;
  params?: AnySchema;
  query?: AnySchema;
}

type Decoded<S extends RouteSchemas> = {
  body: S["body"] extends Schema.Schema<infer A, infer _E> ? A : undefined;
  params: S["params"] extends Schema.Schema<infer A, infer _E> ? A : undefined;
  query: S["query"] extends Schema.Schema<infer A, infer _E> ? A : undefined;
};

type HandlerFn<T, S extends RouteSchemas> = (
  request: FastifyRequest,
  data: Decoded<S>,
) => Effect.Effect<T, { readonly _tag: string }>;

type SimpleHandlerFn<T> = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Effect.Effect<T, { readonly _tag: string }>;

// --- Schema validation pipeline ---

function buildSchemaEffect<T, S extends RouteSchemas>(
  schemas: S,
  handler: HandlerFn<T, S>,
  request: FastifyRequest,
): Effect.Effect<T, { readonly _tag: string }> {
  return Effect.gen(function* () {
    const body = schemas.body
      ? yield* Schema.decodeUnknown(schemas.body)(request.body).pipe(
          Effect.mapError((e) => parseErrorToValidation(e, "body")),
        )
      : undefined;

    const params = schemas.params
      ? yield* Schema.decodeUnknown(schemas.params)(request.params).pipe(
          Effect.mapError((e) => parseErrorToValidation(e, "params")),
        )
      : undefined;

    const query = schemas.query
      ? yield* Schema.decodeUnknown(schemas.query)(request.query).pipe(
          Effect.mapError((e) => parseErrorToValidation(e, "query")),
        )
      : undefined;

    return yield* handler(request, { body, params, query } as Decoded<S>);
  });
}

// --- Runtime-aware factory ---

/**
 * Creates route helpers that use the provided Runtime for execution.
 * This enables logging via LoggerLive and tracing via TracingLive,
 * since the runtime carries the fiber refs (including the logger) from the
 * scope where it was captured.
 *
 * Usage:
 *   const registerRoutes = Effect.gen(function* () {
 *     const app = yield* FastifyServer;
 *     const runtime = yield* Effect.runtime();
 *     const { route, routeWithSchema } = createEffectRoute(runtime);
 *     app.get("/hello", route(() => Effect.succeed({ hello: "world" })));
 *     app.post("/items", routeWithSchema({ body: CreateItem }, (req, { body }) => ...));
 *   });
 */
export function createEffectRoute<R>(runtime: Runtime.Runtime<R>) {
  const run = Runtime.runPromise(runtime);

  function route<T>(
    handler: SimpleHandlerFn<T>,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await run(handleEffect(handler(request, reply), reply));
    };
  }

  function routeWithSchema<T, S extends RouteSchemas>(
    schemas: S,
    handler: HandlerFn<T, S>,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const effect = buildSchemaEffect(schemas, handler, request);
      await run(handleEffect(effect, reply));
    };
  }

  return { route, routeWithSchema };
}

// --- RouteRunner: Effect DI wiring for the runtime-aware factory ---

type RouteHelpers = ReturnType<typeof createEffectRoute>;

/** Tag carrying { route, routeWithSchema } helpers bound to the captured runtime. */
export class RouteRunner extends Context.Tag("RouteRunner")<
  RouteRunner,
  RouteHelpers
>() {}

/**
 * Layer that builds RouteRunner by capturing the ambient runtime via
 * Effect.runtime(). MUST be provided after LoggerLive + the tracing Layer so
 * the captured runtime carries those fiber refs (logger, tracer); otherwise
 * route bodies log/trace into the wrong (default) runtime. This invariant is
 * the reason the Tag lives here, co-located with the factory it wraps.
 */
export const RouteRunnerLive = Layer.effect(
  RouteRunner,
  Effect.gen(function* () {
    const runtime = yield* Effect.runtime<never>();
    return createEffectRoute(runtime);
  }),
);
