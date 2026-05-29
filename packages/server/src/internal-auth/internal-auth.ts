/**
 * Internal service-to-service authentication Layer.
 *
 * Registers a Fastify onRequest hook that rejects requests lacking a valid
 * internal auth token with a bare 401. Uses constant-time comparison via
 * crypto.timingSafeEqual on SHA-256 digests (hides token length).
 *
 * Fail-closed: if INTERNAL_AUTH_TOKEN is missing from config, Layer
 * construction fails and the app won't boot.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Effect, Layer, Option } from "effect";
import { InternalAuthConfig } from "../config/config";
import { FastifyServer } from "../fastify/fastify";

/** SHA-256 digest for constant-time comparison that hides token length. */
const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/**
 * Factory: create an InternalAuth Layer with a custom path allowlist.
 * Paths in the allowlist bypass the token check (e.g. health checks).
 */
export const internalAuth = (opts?: { allowlist?: string[] }) => {
  const allowlist = new Set(opts?.allowlist ?? ["/health"]);

  return Layer.effectDiscard(
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const config = yield* InternalAuthConfig;

      const currentDigest = sha256(config.token);
      const previousDigest = Option.map(config.previousToken, sha256);

      app.addHook("onRequest", (request, reply, done) => {
        // Bypass allowlisted paths
        if (allowlist.has(request.url)) {
          done();
          return;
        }

        const incoming = request.headers[config.headerName] as
          | string
          | undefined;

        if (!incoming) {
          reply.code(401).send();
          return;
        }

        const incomingDigest = sha256(incoming);

        const matchesCurrent = timingSafeEqual(incomingDigest, currentDigest);
        const matchesPrevious = Option.match(previousDigest, {
          onNone: () => false,
          onSome: (prev) => timingSafeEqual(incomingDigest, prev),
        });

        if (matchesCurrent || matchesPrevious) {
          done();
        } else {
          console.warn(
            `internal-auth: rejected request from ${request.ip} to ${request.url}`,
          );
          reply.code(401).send();
        }
      });
    }),
  );
};

/** Default InternalAuth Layer with /health bypass. */
export const InternalAuthLive = internalAuth();

/**
 * Test helper: returns the header object to spread into app.inject() calls.
 * Uses the test token value — provide via ConfigProvider in tests.
 */
export const withInternalAuth = (token = "test-secret-token") =>
  ({ "x-internal-auth": token }) as const;
