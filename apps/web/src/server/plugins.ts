/**
 * Fastify plugin registration for the web server.
 *
 * This module registers all Fastify plugins (proxy, static, middleware)
 * as an Effect. Plugin registration is separated from route registration
 * so plugins and routes can be tested independently.
 *
 * The API proxy uses ApiConfig to get the upstream URL, so the URL
 * is configurable via the API_URL environment variable instead of
 * being hardcoded.
 */

import fastifyProxy from "@fastify/http-proxy";
import { ApiConfig } from "@repo/server/config";
import { FastifyServer } from "@repo/server/fastify";
import { Effect } from "effect";

/**
 * Register all Fastify plugins (proxy, static, SSR middleware).
 *
 * This is an Effect so it can:
 * 1. Access FastifyServer from context
 * 2. Read ApiConfig for the upstream API URL
 * 3. Be composed with other setup Effects
 */
export const registerPlugins = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const apiConfig = yield* ApiConfig;

  // Proxy /api/* requests to the API server.
  // The upstream URL comes from ApiConfig (env: API_URL, default: http://localhost:3001).
  // Requests like GET /api/items become GET /items on the upstream.
  //
  // Note: Fastify's .register() returns a PromiseLike with a one-shot .then().
  // We wrap with async/await to produce a real Promise that Effect.promise
  // can safely call .then() on.
  yield* Effect.promise(async () => {
    await app.register(fastifyProxy, {
      upstream: apiConfig.apiUrl,
      prefix: "/api",
      rewritePrefix: "/",
      http2: false,
    });
  });
});
