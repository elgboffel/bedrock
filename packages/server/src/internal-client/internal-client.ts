/**
 * Typed internal client for server-to-server calls.
 *
 * Injects x-internal-auth, decodes responses against @repo/contracts Schemas.
 * Server-only by construction — lives in @repo/server (Node/crypto deps).
 *
 * Used by web SSR and backend→backend calls. The browser never uses this;
 * React islands fetch('/api/*') through the proxy instead.
 */
import { Context, Data, Effect, Layer, Schema } from "effect";
import { ApiConfig, InternalAuthConfig } from "../config/config";

/** Tagged error for internal-client failures (non-2xx, decode, network). */
export class InternalClientError extends Data.TaggedError(
  "InternalClientError",
)<{
  readonly status?: number;
  readonly message: string;
}> {}

export interface InternalClientService {
  request: <A, I>(opts: {
    method: string;
    path: string;
    body?: unknown;
    responseSchema: Schema.Schema<A, I>;
  }) => Effect.Effect<A, InternalClientError>;
}

/** Tag for dependency injection. */
export class InternalClient extends Context.Tag("InternalClient")<
  InternalClient,
  InternalClientService
>() {}

/** Layer: reads ApiConfig (URL) + InternalAuthConfig (token, header name). */
export const InternalClientLive = Layer.effect(
  InternalClient,
  Effect.gen(function* () {
    const { apiUrl } = yield* ApiConfig;
    const { token, headerName } = yield* InternalAuthConfig;

    // Strip trailing slash from base URL
    const base = apiUrl.replace(/\/+$/, "");

    return InternalClient.of({
      request: <A, I>(opts: {
        method: string;
        path: string;
        body?: unknown;
        responseSchema: Schema.Schema<A, I>;
      }): Effect.Effect<A, InternalClientError> =>
        Effect.gen(function* () {
          const url = `${base}${opts.path}`;

          const headers: Record<string, string> = {
            [headerName]: token,
            accept: "application/json",
          };
          if (opts.body !== undefined) {
            headers["content-type"] = "application/json";
          }

          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(url, {
                method: opts.method,
                headers,
                body:
                  opts.body !== undefined
                    ? JSON.stringify(opts.body)
                    : undefined,
              }),
            catch: (err) =>
              new InternalClientError({
                message: `Network error: ${err}`,
              }),
          });

          if (!response.ok) {
            return yield* new InternalClientError({
              status: response.status,
              message: `Upstream responded ${response.status}`,
            });
          }

          const json = yield* Effect.tryPromise({
            try: () => response.json(),
            catch: (err) =>
              new InternalClientError({
                message: `Failed to parse JSON: ${err}`,
              }),
          });

          const decoded = yield* Schema.decodeUnknown(opts.responseSchema)(
            json,
          ).pipe(
            Effect.mapError(
              (parseError) =>
                new InternalClientError({
                  message: `Schema decode error: ${parseError.message}`,
                }),
            ),
          );

          return decoded;
        }),
    });
  }),
);
