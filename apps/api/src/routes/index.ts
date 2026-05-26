/**
 * Route barrel — composes all domain route modules into a single Effect.
 *
 * To add a new domain:
 * 1. Create a folder under routes/ (e.g. routes/users/)
 * 2. Add a <domain>.routes.ts file exporting a registration Effect
 * 3. Import and yield* it here
 */

import { Effect } from "effect";
import { registerHealthRoutes } from "./health/health.routes.js";
import { registerItemRoutes } from "./items/items.routes.js";

export const registerRoutes = Effect.gen(function* () {
  yield* registerHealthRoutes;
  yield* registerItemRoutes;
});
