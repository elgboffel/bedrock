/**
 * Route aggregator — composes every domain's route-registration Effect into
 * one `registerRoutes` value.
 *
 * Named aggregator module (not a barrel): under the folder-per-module
 * convention the file's responsibility is explicit from its name. To add a
 * new domain, create `routes/<domain>/<domain>.ts` exporting a
 * `register<Domain>Routes` Effect, then import and `yield*` it here.
 */

import type { DB } from "@repo/database/client";
import type { FastifyServer } from "@repo/server/fastify";
import type { RouteRunner } from "@repo/server/route-runner";
import { Effect } from "effect";
import { registerHealthRoutes } from "./health/health";
import { registerItemRoutes } from "./items/items";

// Explicit annotation: under folder-per-module layout, `DB` lives at
// `@repo/database/src/client/client.ts`, and TS's `composite` declaration
// emit can't reverse the multi-wildcard `exports` pattern back to the
// `@repo/database/client` subpath. Naming the requirements directly keeps
// the emitted `.d.ts` portable.
export const registerRoutes: Effect.Effect<
  void,
  never,
  DB | FastifyServer | RouteRunner
> = Effect.gen(function* () {
  yield* registerHealthRoutes;
  yield* registerItemRoutes;
});
