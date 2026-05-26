import { Schema } from "effect";

export const Item = Schema.Struct({
  id: Schema.Number,
  name: Schema.NonEmptyString,
});

export const CreateItem = Schema.Struct({
  name: Schema.NonEmptyString,
});

export type Item = typeof Item.Type;
export type CreateItem = typeof CreateItem.Type;
