import { CreateItem, ItemIdParams } from "@repo/contracts/items";
import { DB } from "@repo/database/client";
import { items } from "@repo/database/schema";
import { writeOrConflict } from "@repo/database/write";
import { created, RouteRunner } from "@repo/server/effect-route";
import { NotFound } from "@repo/server/errors";
import { FastifyServer } from "@repo/server/fastify";
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
        const [item] = yield* writeOrConflict(
          db.insert(items).values({ name: body.name }).returning(),
          { resource: "Item" },
        );
        return created(item);
      }).pipe(Effect.withSpan("POST /items")),
    ),
  );
});
