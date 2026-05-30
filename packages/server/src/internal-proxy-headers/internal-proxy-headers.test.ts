import { describe, expect, it } from "vitest";
import { rewriteProxyHeaders } from "./internal-proxy-headers";

const defaults = { token: "test-token" };

describe("internal-proxy-headers", () => {
  it("strips all x-internal-* headers", () => {
    const result = rewriteProxyHeaders(
      {
        "x-internal-auth": "forged-token",
        "x-internal-foo": "bar",
        accept: "application/json",
      },
      defaults,
    );

    // Forged value replaced with real token
    expect(result["x-internal-auth"]).toBe("test-token");
    expect(result).not.toHaveProperty("x-internal-foo");
    expect(result).toHaveProperty("accept", "application/json");
  });

  it("strips all x-user-* headers", () => {
    const result = rewriteProxyHeaders(
      {
        "x-user-id": "123",
        "x-user-role": "admin",
        accept: "text/html",
      },
      defaults,
    );

    expect(result).not.toHaveProperty("x-user-id");
    expect(result).not.toHaveProperty("x-user-role");
    expect(result).toHaveProperty("accept", "text/html");
  });

  it("drops cookie and authorization headers", () => {
    const result = rewriteProxyHeaders(
      {
        cookie: "session=abc",
        authorization: "Bearer xyz",
        accept: "*/*",
      },
      defaults,
    );

    expect(result).not.toHaveProperty("cookie");
    expect(result).not.toHaveProperty("authorization");
    expect(result).toHaveProperty("accept", "*/*");
  });

  it("drops hop-by-hop headers", () => {
    const result = rewriteProxyHeaders(
      {
        connection: "keep-alive",
        "keep-alive": "timeout=5",
        "transfer-encoding": "chunked",
        te: "trailers",
        trailer: "Expires",
        upgrade: "websocket",
        "proxy-authorization": "Basic abc",
        "proxy-authenticate": "Basic",
        accept: "*/*",
      },
      defaults,
    );

    expect(result).not.toHaveProperty("connection");
    expect(result).not.toHaveProperty("keep-alive");
    expect(result).not.toHaveProperty("transfer-encoding");
    expect(result).not.toHaveProperty("te");
    expect(result).not.toHaveProperty("trailer");
    expect(result).not.toHaveProperty("upgrade");
    expect(result).not.toHaveProperty("proxy-authorization");
    expect(result).not.toHaveProperty("proxy-authenticate");
    expect(result).toHaveProperty("accept", "*/*");
  });

  it("re-authors x-forwarded-for and x-forwarded-proto from actual client info", () => {
    const result = rewriteProxyHeaders(
      {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "x-forwarded-proto": "http",
        accept: "*/*",
      },
      { ...defaults, remoteAddress: "10.0.0.1", protocol: "https" },
    );

    // Re-authored, not trusted from client
    expect(result["x-forwarded-for"]).toBe("10.0.0.1");
    expect(result["x-forwarded-proto"]).toBe("https");
  });

  it("defaults x-forwarded-for to 'unknown' and x-forwarded-proto to 'http'", () => {
    const result = rewriteProxyHeaders({ accept: "*/*" }, defaults);

    expect(result["x-forwarded-for"]).toBe("unknown");
    expect(result["x-forwarded-proto"]).toBe("http");
  });

  it("strips spoofable x-real-ip and forwarded headers", () => {
    const result = rewriteProxyHeaders(
      {
        "x-real-ip": "1.2.3.4",
        forwarded: "for=1.2.3.4;proto=https",
        accept: "*/*",
      },
      { ...defaults, remoteAddress: "10.0.0.1" },
    );

    expect(result).not.toHaveProperty("x-real-ip");
    expect(result).not.toHaveProperty("forwarded");
    expect(result).toHaveProperty("accept", "*/*");
  });

  it("forwards other headers through (denylist model)", () => {
    const result = rewriteProxyHeaders(
      {
        accept: "application/json",
        "content-type": "application/json",
        range: "bytes=0-499",
        "if-none-match": '"abc"',
        "accept-encoding": "gzip, deflate",
        "x-request-id": "req-123",
      },
      defaults,
    );

    expect(result["accept"]).toBe("application/json");
    expect(result["content-type"]).toBe("application/json");
    expect(result["range"]).toBe("bytes=0-499");
    expect(result["if-none-match"]).toBe('"abc"');
    expect(result["accept-encoding"]).toBe("gzip, deflate");
    expect(result["x-request-id"]).toBe("req-123");
  });

  it("injects x-internal-auth token", () => {
    const result = rewriteProxyHeaders(
      { accept: "*/*" },
      { token: "my-secret" },
    );

    expect(result["x-internal-auth"]).toBe("my-secret");
  });

  it("uses custom header name for token injection", () => {
    const result = rewriteProxyHeaders(
      { accept: "*/*" },
      { token: "my-secret", headerName: "x-custom-auth" },
    );

    expect(result["x-custom-auth"]).toBe("my-secret");
    expect(result).not.toHaveProperty("x-internal-auth");
  });

  it("injected token overwrites any forged value that survived stripping", () => {
    // x-internal-auth is stripped first, then re-injected with real token
    const result = rewriteProxyHeaders(
      { "x-internal-auth": "forged" },
      { token: "real-token" },
    );

    expect(result["x-internal-auth"]).toBe("real-token");
  });
});
