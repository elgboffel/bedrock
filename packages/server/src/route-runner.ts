/** RouteRunner: Context.Tag providing Effect-aware Fastify route helpers built from the ambient runtime. */
import { Context, Effect, Layer } from "effect";
import { createEffectRoute } from "./effect-route.js";

type RouteHelpers = ReturnType<typeof createEffectRoute>;

/** Tag carrying { route, routeWithSchema } helpers bound to the captured runtime. */
export class RouteRunner extends Context.Tag("RouteRunner")<
  RouteRunner,
  RouteHelpers
>() {}

/**
 * Layer that builds RouteRunner by capturing the ambient runtime via Effect.runtime().
 * Must be provided after PinoLoggerLive + TracingLive so the captured runtime
 * carries those fiber refs (logger, tracer).
 */
export const RouteRunnerLive = Layer.effect(
  RouteRunner,
  Effect.gen(function* () {
    const runtime = yield* Effect.runtime<never>();
    return createEffectRoute(runtime);
  }),
);
