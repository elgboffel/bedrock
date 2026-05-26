import { CreateItem, ItemIdParams } from "@repo/contracts/items";
import { DB } from "@repo/database/client";
import { isUniqueViolation } from "@repo/database/errors";
import { items } from "@repo/database/schema/index";
import { ConflictError, NotFound } from "@repo/server/errors";
import { FastifyServer } from "@repo/server/fastify";
import { RouteRunner } from "@repo/server/route-runner";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

export const registerItemRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const db = yield* DB;
  const { route, routeWithSchema } = yield* RouteRunner;

  app.get(
    "/items",
    route(() =>
      Effect.gen(function* () {
        return yield* db.select().from(items);
      }).pipe(Effect.withSpan("GET /items")),
    ),
  );

  app.get(
    "/items/:id",
    routeWithSchema({ params: ItemIdParams }, (_request, { params }) =>
      Effect.gen(function* () {
        const [item] = yield* db
          .select()
          .from(items)
          .where(eq(items.id, params.id));
        if (!item)
          return yield* new NotFound({ resource: `Item(${params.id})` });
        return item;
      }).pipe(Effect.withSpan("GET /items/:id")),
    ),
  );

  app.post(
    "/items",
    routeWithSchema({ body: CreateItem }, (_request, { body }) =>
      Effect.gen(function* () {
        const [created] = yield* db
          .insert(items)
          .values({ name: body.name })
          .returning();
        return created;
      }).pipe(
        Effect.catchTag("EffectDrizzleQueryError", (e) => {
          const hit = isUniqueViolation(e);
          return hit
            ? Effect.fail(
                new ConflictError({
                  resource: "Item",
                  detail: `constraint:${hit.constraint}`,
                }),
              )
            : Effect.die(e);
        }),
        Effect.withSpan("POST /items"),
      ),
    ),
  );
});
