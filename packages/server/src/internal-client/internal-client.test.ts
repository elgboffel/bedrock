import { it } from "@effect/vitest";
import { ConfigProvider, Effect, Schema } from "effect";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect } from "vitest";
import {
  InternalClient,
  InternalClientError,
  InternalClientLive,
} from "./internal-client";

// Test-local schema (no dep on @repo/contracts)
const TestItem = Schema.Struct({
  id: Schema.Number,
  name: Schema.NonEmptyString,
});

/** Tiny upstream Fastify that captures headers and returns typed JSON. */
const upstream = Fastify({ logger: false });
let baseUrl: string;

beforeAll(async () => {
  // Echo received headers + return a typed item
  upstream.get("/items", async (req) => {
    return {
      receivedHeaders: req.headers,
      items: [{ id: 1, name: "Widget" }],
    };
  });

  // Echo POST body back with an id
  upstream.post("/items", async (req) => {
    const body = req.body as { name: string };
    return {
      receivedHeaders: req.headers,
      item: { id: 42, name: body.name },
    };
  });

  // Returns 500
  upstream.get("/error", async (_req, reply) => {
    reply.code(500).send({ error: "boom" });
  });

  // Returns valid JSON that doesn't match schema
  upstream.get("/bad-shape", async () => {
    return { wrong: "shape" };
  });

  const address = await upstream.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address; // e.g. http://127.0.0.1:12345
});

afterAll(async () => {
  await upstream.close();
});

const TEST_TOKEN = "test-internal-secret";

const testConfig = () =>
  ConfigProvider.fromMap(
    new Map([
      ["INTERNAL_AUTH_TOKEN", TEST_TOKEN],
      ["API_URL", baseUrl],
    ]),
  );

const TestItemsList = Schema.Struct({
  receivedHeaders: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  items: Schema.Array(TestItem),
});

const TestItemCreated = Schema.Struct({
  receivedHeaders: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  item: TestItem,
});

describe("internal-client", () => {
  it.effect("GET attaches x-internal-auth and decodes typed response", () =>
    Effect.gen(function* () {
      const client = yield* InternalClient;

      const result = yield* client.request({
        method: "GET",
        path: "/items",
        responseSchema: TestItemsList,
      });

      // Token was injected
      expect(result.receivedHeaders["x-internal-auth"]).toBe(TEST_TOKEN);
      // Response decoded against schema
      expect(result.items).toEqual([{ id: 1, name: "Widget" }]);
    }).pipe(
      Effect.provide(InternalClientLive),
      Effect.withConfigProvider(testConfig()),
    ),
  );

  it.effect("POST sends JSON body, attaches token, decodes response", () =>
    Effect.gen(function* () {
      const client = yield* InternalClient;

      const result = yield* client.request({
        method: "POST",
        path: "/items",
        body: { name: "Gadget" },
        responseSchema: TestItemCreated,
      });

      expect(result.receivedHeaders["x-internal-auth"]).toBe(TEST_TOKEN);
      expect(result.receivedHeaders["content-type"]).toBe("application/json");
      expect(result.item).toEqual({ id: 42, name: "Gadget" });
    }).pipe(
      Effect.provide(InternalClientLive),
      Effect.withConfigProvider(testConfig()),
    ),
  );

  it.effect("non-2xx response → InternalClientError with status", () =>
    Effect.gen(function* () {
      const client = yield* InternalClient;

      const exit = yield* client
        .request({
          method: "GET",
          path: "/error",
          responseSchema: TestItemsList,
        })
        .pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
      // Extract the error
      const error =
        exit._tag === "Failure" ? (exit.cause as any).error : undefined;
      expect(error).toBeInstanceOf(InternalClientError);
      expect(error.status).toBe(500);
    }).pipe(
      Effect.provide(InternalClientLive),
      Effect.withConfigProvider(testConfig()),
    ),
  );

  it.effect("schema decode failure → InternalClientError", () =>
    Effect.gen(function* () {
      const client = yield* InternalClient;

      const exit = yield* client
        .request({
          method: "GET",
          path: "/bad-shape",
          responseSchema: TestItemsList,
        })
        .pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
      const error =
        exit._tag === "Failure" ? (exit.cause as any).error : undefined;
      expect(error).toBeInstanceOf(InternalClientError);
      expect(error.message).toContain("Schema decode error");
    }).pipe(
      Effect.provide(InternalClientLive),
      Effect.withConfigProvider(testConfig()),
    ),
  );

  it.effect("uses custom header name from config", () =>
    Effect.gen(function* () {
      const client = yield* InternalClient;

      const result = yield* client.request({
        method: "GET",
        path: "/items",
        responseSchema: TestItemsList,
      });

      // Custom header name was used instead of default
      expect(result.receivedHeaders["x-custom-auth"]).toBe(TEST_TOKEN);
      expect(result.receivedHeaders["x-internal-auth"]).toBeUndefined();
    }).pipe(
      Effect.provide(InternalClientLive),
      Effect.withConfigProvider(
        ConfigProvider.fromMap(
          new Map([
            ["INTERNAL_AUTH_TOKEN", TEST_TOKEN],
            ["API_URL", baseUrl],
            ["INTERNAL_AUTH_HEADER", "x-custom-auth"],
          ]),
        ),
      ),
    ),
  );
});
