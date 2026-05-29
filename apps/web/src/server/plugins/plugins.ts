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
import { ApiConfig, InternalAuthConfig } from "@repo/server/config";
import { FastifyServer } from "@repo/server/fastify";
import { rewriteProxyHeaders } from "@repo/server/internal-proxy-headers";
import { Effect } from "effect";

/** Max request body size through the proxy (10 MB). */
const PROXY_BODY_LIMIT = 10 * 1024 * 1024;

/** Upstream timeout in milliseconds (30 seconds). */
const PROXY_TIMEOUT_MS = 30_000;

export const registerPlugins = Effect.gen(function* () {
  const app = yield* FastifyServer;
  const apiConfig = yield* ApiConfig;
  const authConfig = yield* InternalAuthConfig;

  // Proxy /api/* requests to the API server.
  // The upstream URL comes from ApiConfig (env: API_URL, default: http://localhost:3001).
  // Requests like GET /api/items become GET /items on the upstream.
  //
  // Security: rewriteRequestHeaders strips forged internal/identity/credential
  // headers and injects the internal auth token. See internal-proxy-headers.
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
      websocket: false,
      httpMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      replyOptions: {
        rewriteRequestHeaders: (_req, headers) =>
          rewriteProxyHeaders(headers, {
            token: authConfig.token,
            headerName: authConfig.headerName,
            remoteAddress: _req.ip,
            protocol: _req.protocol,
          }),
        timeout: PROXY_TIMEOUT_MS,
      },
    });
  });

  // Body size limit for proxied requests
  app.addHook("onRoute", (routeOptions) => {
    if (routeOptions.url.startsWith("/api")) {
      routeOptions.bodyLimit = PROXY_BODY_LIMIT;
    }
  });
});
