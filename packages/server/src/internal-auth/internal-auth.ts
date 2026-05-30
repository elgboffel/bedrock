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
import { Effect, Layer, Option, Runtime } from "effect";
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
      const runtime = yield* Effect.runtime<never>();

      // Fastify lowercases all header names; normalize the configured key so a
      // mixed-case INTERNAL_AUTH_HEADER still resolves (S3).
      const headerKey = config.headerName.toLowerCase();
      const currentDigest = sha256(config.token);
      const previousDigest = Option.map(config.previousToken, sha256);

      const logReject = (ip: string) =>
        Runtime.runFork(runtime)(
          Effect.logWarning(`internal-auth: rejected request from ${ip}`),
        );

      app.addHook("onRequest", (request, reply, done) => {
        // Bypass allowlisted paths (strip query string so /health?x=1 matches).
        const path = request.url.split("?")[0];
        if (allowlist.has(path)) {
          done();
          return;
        }

        const incoming = request.headers[headerKey];

        if (incoming === undefined) {
          reply.code(401).send();
          return;
        }

        // A duplicate header arrives as string[]; hashing it would throw a 500
        // and leak that the boundary exists. Reject as a bare 401 instead (S1).
        if (typeof incoming !== "string") {
          logReject(request.ip);
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
          logReject(request.ip);
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
