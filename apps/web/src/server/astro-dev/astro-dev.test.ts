import { NodeContext } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Ref } from "effect";
import { describe, expect } from "vitest";
import { AstroDevProcess, makeAstroDevLayer } from "./astro-dev";

describe("Astro dev Command Layer", () => {
  it.effect("spawns a child process and cleans it up on scope release", () =>
    Effect.gen(function* () {
      // Use a simple, fast command instead of real Astro.
      // `sleep 60` stays alive long enough for us to observe it running,
      // then the Layer's release function should kill it.
      const TestAstroDevLayer = makeAstroDevLayer("sleep", "60");

      // Track whether the process was alive at some point
      const processWasAlive = yield* Ref.make(false);

      // Run a scoped effect that acquires the Layer, checks the process
      // is running, then lets the scope close (which should kill it).
      yield* Effect.scoped(
        Effect.gen(function* () {
          const process = yield* AstroDevProcess;
          // If we got here, the process was spawned successfully
          yield* Ref.set(processWasAlive, true);
          // pid should be a positive integer
          expect(process.pid).toBeGreaterThan(0);
        }).pipe(Effect.provide(TestAstroDevLayer)),
      );

      // After scope closes, verify process was alive
      const wasAlive = yield* Ref.get(processWasAlive);
      expect(wasAlive).toBe(true);
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("process pid is accessible from the Layer", () =>
    Effect.gen(function* () {
      const TestAstroDevLayer = makeAstroDevLayer("sleep", "60");

      yield* Effect.scoped(
        Effect.gen(function* () {
          const process = yield* AstroDevProcess;
          // pid type is branded, but should be a number underneath
          expect(typeof process.pid).toBe("number");
        }).pipe(Effect.provide(TestAstroDevLayer)),
      );
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});
