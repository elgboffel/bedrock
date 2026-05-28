import { pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("items_name_unique").on(table.name)],
);
