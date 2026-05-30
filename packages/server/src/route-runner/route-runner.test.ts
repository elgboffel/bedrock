import { it } from "@effect/vitest";
import { ConfigProvider, Effect, Logger } from "effect";
import { describe, expect } from "vitest";
import { created, withStatus } from "../effect-route/effect-route";
import { NotFound, Unauthorized } from "../errors/errors";
import { FastifyLive, FastifyServer } from "../fastify/fastify";
import { RouteRunner, RouteRunnerLive } from "./route-runner";

function makeTestLogger() {
  const entries: Array<{ level: string; message: string }> = [];
  const logger = Logger.make(({ logLevel, message }) => {
    entries.push({ level: logLevel._tag, message: String(message) });
  });
  const layer = Logger.replace(Logger.defaultLogger, logger);
  return { entries, layer };
}

const testConfigProvider = ConfigProvider.fromMap(new Map());

describe("RouteRunner", () => {
  it.effect("provides route helper that returns 200 JSON on success", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const { route } = yield* RouteRunner;

      app.get(
        "/test",
        route(() => Effect.succeed({ hello: "world" })),
      );

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/test" }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ hello: "world" });
    }).pipe(
      Effect.provide(RouteRunnerLive),
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("route body can express a non-200 success status", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const { route } = yield* RouteRunner;

      app.post(
        "/created",
        route(() => Effect.succeed(created({ id: 1 }))),
      );
      app.get(
        "/accepted",
        route(() => Effect.succeed(withStatus(202, { queued: true }))),
      );

      const createdRes = yield* Effect.promise(() =>
        app.inject({ method: "POST", url: "/created" }),
      );
      expect(createdRes.statusCode).toBe(201);
      expect(createdRes.json()).toEqual({ id: 1 });

      const acceptedRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/accepted" }),
      );
      expect(acceptedRes.statusCode).toBe(202);
      expect(acceptedRes.json()).toEqual({ queued: true });
    }).pipe(
      Effect.provide(RouteRunnerLive),
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("route maps typed errors to HTTP responses via error-mapper", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const { route } = yield* RouteRunner;

      app.get(
        "/missing",
        route(() => Effect.fail(new NotFound({ resource: "Widget(42)" }))),
      );
      app.get(
        "/denied",
        route(() => Effect.fail(new Unauthorized({ reason: "bad token" }))),
      );

      const notFoundRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/missing" }),
      );
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json()).toEqual({
        error: "NotFound",
        message: "Widget(42) not found",
      });

      const unauthorizedRes = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/denied" }),
      );
      expect(unauthorizedRes.statusCode).toBe(401);
      expect(unauthorizedRes.json()).toEqual({
        error: "Unauthorized",
        message: "bad token",
      });
    }).pipe(
      Effect.provide(RouteRunnerLive),
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect("route maps unexpected defects to a generic 500 response", () =>
    Effect.gen(function* () {
      const app = yield* FastifyServer;
      const { route } = yield* RouteRunner;

      app.get(
        "/boom",
        route(() => Effect.die(new Error("something exploded"))),
      );

      const response = yield* Effect.promise(() =>
        app.inject({ method: "GET", url: "/boom" }),
      );

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: "InternalError",
        message: "An unexpected error occurred",
      });
    }).pipe(
      Effect.provide(RouteRunnerLive),
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );

  it.effect(
    "typed errors are logged at warn level through the captured runtime",
    () => {
      const { entries, layer } = makeTestLogger();
      return Effect.gen(function* () {
        const app = yield* FastifyServer;
        const { route } = yield* RouteRunner;

        app.get(
          "/missing",
          route(() => Effect.fail(new NotFound({ resource: "Widget(42)" }))),
        );

        const response = yield* Effect.promise(() =>
          app.inject({ method: "GET", url: "/missing" }),
        );
        expect(response.statusCode).toBe(404);

        const warnLogs = entries.filter((e) => e.level === "Warning");
        expect(warnLogs.length).toBeGreaterThan(0);
        expect(warnLogs[0].message).toContain("NotFound");
      }).pipe(
        Effect.provide(RouteRunnerLive),
        Effect.provide(FastifyLive),
        Effect.provide(layer),
        Effect.withConfigProvider(testConfigProvider),
        Effect.scoped,
      );
    },
  );

  it.effect(
    "defects are logged at error level through the captured runtime",
    () => {
      const { entries, layer } = makeTestLogger();
      return Effect.gen(function* () {
        const app = yield* FastifyServer;
        const { route } = yield* RouteRunner;

        app.get(
          "/boom",
          route(() => Effect.die(new Error("something exploded"))),
        );

        const response = yield* Effect.promise(() =>
          app.inject({ method: "GET", url: "/boom" }),
        );
        expect(response.statusCode).toBe(500);

        const errorLogs = entries.filter((e) => e.level === "Error");
        expect(errorLogs.length).toBeGreaterThan(0);
        expect(errorLogs[0].message).toContain("something exploded");
      }).pipe(
        Effect.provide(RouteRunnerLive),
        Effect.provide(FastifyLive),
        Effect.provide(layer),
        Effect.withConfigProvider(testConfigProvider),
        Effect.scoped,
      );
    },
  );

  it.effect("exposes routeWithSchema helper alongside route", () =>
    Effect.gen(function* () {
      const helpers = yield* RouteRunner;
      expect(typeof helpers.route).toBe("function");
      expect(typeof helpers.routeWithSchema).toBe("function");
    }).pipe(
      Effect.provide(RouteRunnerLive),
      Effect.provide(FastifyLive),
      Effect.withConfigProvider(testConfigProvider),
      Effect.scoped,
    ),
  );
});
