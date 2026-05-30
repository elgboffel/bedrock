/**
 * Pure header-rewrite function for the web→api proxy boundary.
 *
 * Implements a denylist model: strip dangerous namespaces, drop credentials
 * and hop-by-hop headers, re-author forwarding headers, forward the rest,
 * and inject the internal auth token last.
 */
import { injectCredential } from "../internal-credential/internal-credential";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

export interface RewriteOpts {
  /** Shared secret token to inject. */
  token: string;
  /** Header name for the token (default: "x-internal-auth"). */
  headerName?: string;
  /** Client remote address for x-forwarded-for (default: "unknown"). */
  remoteAddress?: string;
  /** Request protocol for x-forwarded-proto (default: "http"). */
  protocol?: string;
}

/**
 * Rewrite client headers for proxying to an internal backend.
 */
export function rewriteProxyHeaders(
  clientHeaders: Record<string, string | string[] | undefined>,
  opts: RewriteOpts,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(clientHeaders)) {
    const lower = key.toLowerCase();

    // Strip entire x-internal-* and x-user-* namespaces
    if (lower.startsWith("x-internal-")) continue;
    if (lower.startsWith("x-user-")) continue;

    // Drop credentials (web-as-boundary)
    if (lower === "cookie" || lower === "authorization") continue;

    // Drop hop-by-hop headers
    if (HOP_BY_HOP.has(lower)) continue;

    // Strip client-supplied x-forwarded-* (re-authored below)
    if (lower === "x-forwarded-for" || lower === "x-forwarded-proto") continue;

    // Strip spoofable secondary forwarding headers. We only re-author
    // x-forwarded-*, so a client could otherwise sneak x-real-ip / RFC 7239
    // `Forwarded` straight through to a backend that trusts them.
    if (lower === "x-real-ip" || lower === "forwarded") continue;

    if (value !== undefined) {
      result[lower] = Array.isArray(value) ? value.join(", ") : value;
    }
  }

  // Re-author forwarding headers from actual client info
  result["x-forwarded-for"] = opts.remoteAddress ?? "unknown";
  result["x-forwarded-proto"] = opts.protocol ?? "http";

  // Inject internal auth token last (cannot be overridden). The credential
  // module owns the header name and its default.
  Object.assign(
    result,
    injectCredential({ token: opts.token, headerName: opts.headerName }),
  );

  return result;
}
