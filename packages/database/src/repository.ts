/**
 * Repository pattern for Effect + @effect/sql.
 *
 * A "repository" is just a plain object whose methods return Effects that
 * depend on SqlClient. There's no heavy abstraction — this module shows
 * the recommended convention so every data-access module looks the same.
 *
 * How it works:
 *
 * 1. Define your repository as an Effect that yields SqlClient from context.
 * 2. Return an object with methods that use the `sql` tagged template to
 *    build queries. Each method returns an Effect (lazy — nothing runs
 *    until the Effect is executed).
 * 3. Consumers `yield*` the repository inside Effect.gen, then call its
 *    methods. The SqlClient dependency is satisfied by PostgresLive in
 *    the Layer stack.
 *
 * Example usage:
 *
 *   const program = Effect.gen(function* () {
 *     const repo = yield* ItemRepository;
 *     const item = yield* repo.create("Hover Board");
 *     const found = yield* repo.findById(item.id);
 *   });
 *
 *   program.pipe(Effect.provide(PostgresLive), Effect.scoped, ...);
 */

import { SqlClient } from "@effect/sql";
import type { SqlError } from "@effect/sql/SqlError";
import { Effect } from "effect";

/**
 * Row shape returned by the items table.
 */
export interface Item {
  readonly id: number;
  readonly name: string;
}

/**
 * ItemRepository — example repository demonstrating the pattern.
 *
 * This is an Effect that, when run, yields the SqlClient from context
 * and returns an object with data-access methods. Each method builds
 * a query using `sql` tagged templates (from @effect/sql) and returns
 * an Effect that executes the query when run.
 *
 * Tagged template queries are parameterized automatically — values
 * interpolated with ${} become bind parameters, preventing SQL injection.
 */
export const ItemRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  return {
    /**
     * Insert a new item and return the created row.
     *
     * The RETURNING clause gives us the auto-generated id back.
     */
    create: (name: string): Effect.Effect<Item, SqlError> =>
      Effect.gen(function* () {
        const rows = yield* sql`
          INSERT INTO items (name) VALUES (${name}) RETURNING id, name
        `;
        return rows[0] as unknown as Item;
      }),

    /**
     * Find an item by its primary key.
     *
     * Returns null if no row matches — the caller decides how to
     * handle the missing case (e.g. fail with NotFound).
     */
    findById: (id: number): Effect.Effect<Item | null, SqlError> =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, name FROM items WHERE id = ${id}
        `;
        return (rows[0] as unknown as Item) ?? null;
      }),
  };
});
