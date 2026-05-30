/**
 * Owner of the internal service-to-service credential.
 *
 * One module concentrates the invariant "header `x-internal-auth` carries the
 * shared token": the default header name, token injection (outgoing/proxied
 * calls), and timing-safe verification (incoming requests, with previous-token
 * rotation support).
 *
 * The three adapters at this seam — `internal-client` (inject on fetch),
 * `internal-proxy-headers` (inject on proxy), and `internal-auth` (verify on
 * request) — are thin over this module. Rename the header or change the
 * comparison rule here, in one place, not three.
 *
 * Server-only by construction: depends on node:crypto.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { Option } from "effect";

/** Default header name carrying the internal token. */
export const DEFAULT_INTERNAL_AUTH_HEADER = "x-internal-auth";

/** SHA-256 digest for constant-time comparison that hides token length. */
const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/**
 * Produce the credential header to inject on an outgoing or proxied request.
 * Returns a single-entry record so callers can spread it into a header map.
 */
export const injectCredential = (opts: {
  token: string;
  headerName?: string;
}): Record<string, string> => ({
  [opts.headerName ?? DEFAULT_INTERNAL_AUTH_HEADER]: opts.token,
});

/** A verifier closed over the current (+ optional previous) token digests. */
export interface CredentialVerifier {
  /** Lowercased header key to read the incoming token from. */
  readonly headerKey: string;
  /**
   * Constant-time check of a raw incoming header value. A non-string value
   * (`undefined` for absent, `string[]` for a duplicate header) never matches —
   * hashing an array would throw and leak that the boundary exists.
   */
  readonly verify: (incoming: string | string[] | undefined) => boolean;
}

/**
 * Build a verifier from the configured token, optional previous token (for
 * zero-downtime rotation), and header name. Digests are computed once at
 * construction; `verify` is constant-time over the SHA-256 digests.
 */
export const makeVerifier = (opts: {
  token: string;
  previousToken: Option.Option<string>;
  headerName?: string;
}): CredentialVerifier => {
  // Fastify lowercases all header names; normalize so a mixed-case configured
  // header still resolves.
  const headerKey = (
    opts.headerName ?? DEFAULT_INTERNAL_AUTH_HEADER
  ).toLowerCase();
  const currentDigest = sha256(opts.token);
  const previousDigest = Option.map(opts.previousToken, sha256);

  return {
    headerKey,
    verify: (incoming) => {
      if (typeof incoming !== "string") return false;

      const incomingDigest = sha256(incoming);
      const matchesCurrent = timingSafeEqual(incomingDigest, currentDigest);
      const matchesPrevious = Option.match(previousDigest, {
        onNone: () => false,
        onSome: (prev) => timingSafeEqual(incomingDigest, prev),
      });

      return matchesCurrent || matchesPrevious;
    },
  };
};
