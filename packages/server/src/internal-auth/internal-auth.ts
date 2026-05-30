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
import { Effect, Layer, Runtime } from "effect";
import { InternalAuthConfig } from "../config/config";
import { FastifyServer } from "../fastify/fastify";
import {
  DEFAULT_INTERNAL_AUTH_HEADER,
  injectCredential,
  makeVerifier,
} from "../internal-credential/internal-credential";

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

      // The credential module owns header normalization (S3) and the
      // timing-safe comparison (incl. previous-token rotation).
      const verifier = makeVerifier({
        token: config.token,
        previousToken: config.previousToken,
        headerName: config.headerName,
      });
      const headerKey = verifier.headerKey;

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

        // Presence is a request concern, not a credential one: an absent header
        // is a bare 401 with no log. A duplicate header (string[]) is rejected
        // by the verifier (S1) and logged below.
        if (incoming === undefined) {
          reply.code(401).send();
          return;
        }

        if (verifier.verify(incoming)) {
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
  injectCredential({ token, headerName: DEFAULT_INTERNAL_AUTH_HEADER });
