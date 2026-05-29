/**
 * Pure header-rewrite function for the web→api proxy boundary.
 *
 * Implements a denylist model: strip dangerous namespaces, drop credentials
 * and hop-by-hop headers, re-author forwarding headers, forward the rest,
 * and inject the internal auth token last.
 */

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

    if (value !== undefined) {
      result[lower] = Array.isArray(value) ? value.join(", ") : value;
    }
  }

  // Re-author forwarding headers from actual client info
  result["x-forwarded-for"] = opts.remoteAddress ?? "unknown";
  result["x-forwarded-proto"] = opts.protocol ?? "http";

  // Inject internal auth token last (cannot be overridden)
  const headerName = opts.headerName ?? "x-internal-auth";
  result[headerName] = opts.token;

  return result;
}
