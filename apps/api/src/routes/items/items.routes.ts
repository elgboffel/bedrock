import { DB } from "@repo/database/client";
import { items } from "@repo/database/schema/index";
import { NotFound } from "@repo/server/errors";
import { FastifyServer } from "@repo/server/fastify";
import { RouteRunner } from "@repo/server/route-runner";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

export const registerItemRoutes = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const db = yield* DB;
  const { route } = yield* RouteRunner;

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
    route((request) =>
      Effect.gen(function* () {
        const { id } = request.params as { id: string };
        const [item] = yield* db
          .select()
          .from(items)
          .where(eq(items.id, Number(id)));
        if (!item) return yield* new NotFound({ resource: `Item(${id})` });
        return item;
      }).pipe(Effect.withSpan("GET /items/:id")),
    ),
  );

  app.post(
    "/items",
    route((request) =>
      Effect.gen(function* () {
        const body = request.body as { name: string };
        const [created] = yield* db
          .insert(items)
          .values({ name: body.name })
          .returning();
        return created;
      }).pipe(Effect.withSpan("POST /items")),
    ),
  );
});
