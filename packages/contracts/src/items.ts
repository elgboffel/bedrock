/** HTTP DTOs for the `items` domain. Shared between `apps/api` and `apps/web`. */
import { Schema } from "effect";

/** An `items` row as returned by the API. */
export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.NonEmptyString,
});
export type Item = typeof Item.Type;

/** Body of `POST /items`. */
export const CreateItem = Schema.Struct({
  name: Schema.NonEmptyString,
});
export type CreateItem = typeof CreateItem.Type;

/** Route params for `GET /items/:id`. `id` arrives as a string and is coerced to a number. */
export const ItemIdParams = Schema.Struct({
  id: Schema.NumberFromString,
});
export type ItemIdParams = typeof ItemIdParams.Type;
