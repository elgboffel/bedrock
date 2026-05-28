/**
 * Drizzle schema aggregator.
 *
 * Each table lives in its own folder under `src/schema/<table>/<table>.ts`.
 * This module pulls them together into a single typed `schema` record that
 * `client.ts` hands to Drizzle's `makeWithDefaults`. Add new tables by
 * importing them here and listing them in the object below — there is no
 * barrel `index.ts` doing it implicitly.
 */

import { items } from "./items/items";

export const schema = { items } as const;

export { items };
