/**
 * Astro dev process management as an Effect Layer.
 *
 * In development mode, the Astro dev server (`pnpm astro dev`) runs as a
 * child process managed by Effect's Command module. This gives us:
 *
 * - Automatic cleanup: when the server shuts down (scope finalizes),
 *   the child process is killed automatically — no manual signal handlers.
 * - Composability: the dev process is just another Layer in the stack,
 *   wired in only when running in dev mode.
 *
 * The Layer uses `Command.start` which is scoped — it acquires the child
 * process and releases it (kills it) when the scope ends. This is the
 * Effect equivalent of try/finally for process lifecycle management.
 */

import { Command, type CommandExecutor } from "@effect/platform";
import type { Process } from "@effect/platform/CommandExecutor";
import { NodeContext } from "@effect/platform-node";
import { Config, Context, Effect, Layer, Schedule } from "effect";

/**
 * AstroDevConfig provides the Astro dev server port.
 *
 * - ASTRO_DEV_PORT: port the Astro/Vite dev server listens on (default: 4321)
 *
 * Used by the AstroDevLive Layer (to spawn `astro dev --port` and poll for
 * readiness) and by the dev proxy in index.ts (upstream URL).
 */
export const AstroDevConfig = Effect.all({
  port: Config.integer("ASTRO_DEV_PORT").pipe(Config.withDefault(4321)),
});

/**
 * Tag for the Astro dev child process.
 *
 * This lets other parts of the app access the running process if needed
 * (e.g., to check its status or read its PID).
 */
export class AstroDevProcess extends Context.Tag("AstroDevProcess")<
  AstroDevProcess,
  Process
>() {}

/**
 * Poll a URL until it responds (any status). Used to wait for the Astro
 * dev server to be ready before Fastify starts accepting requests.
 */
const waitForReady = (
  url: string,
  opts?: { maxRetries?: number; intervalMs?: number },
) => {
  const maxRetries = opts?.maxRetries ?? 60;
  const intervalMs = opts?.intervalMs ?? 500;

  return Effect.tryPromise({
    // Abort each poll so a half-open socket can't stall an attempt forever.
    try: () =>
      fetch(url, { signal: AbortSignal.timeout(intervalMs) }).then(
        () => undefined,
      ),
    catch: () => "not ready" as const,
  }).pipe(
    Effect.retry(
      Schedule.recurs(maxRetries).pipe(
        Schedule.addDelay(() => `${intervalMs} millis`),
      ),
    ),
    Effect.catchAll(() =>
      Effect.die(
        new Error(`Dev server at ${url} did not become ready in time`),
      ),
    ),
  );
};

/**
 * Create a Layer that spawns a child process and kills it on release.
 *
 * Generic version without readiness polling — useful for tests where a
 * simple command like `sleep 60` stands in for the real dev server.
 *
 * @param command - The executable to run
 * @param args - Arguments to pass to the executable
 */
export const makeAstroDevLayer = (
  command: string,
  ...args: Array<string>
): Layer.Layer<AstroDevProcess, never, CommandExecutor.CommandExecutor> =>
  Layer.scoped(
    AstroDevProcess,
    Effect.gen(function* () {
      yield* Effect.logInfo(
        `Starting dev process: ${command} ${args.join(" ")}`,
      );

      // Command.start is scoped — it spawns the process on acquire and
      // kills it on scope release. No manual cleanup needed.
      const process = yield* Command.make(command, ...args).pipe(Command.start);

      yield* Effect.logInfo(`Dev process started with PID ${process.pid}`);

      return process;
    }).pipe(
      Effect.catchAll((error) =>
        Effect.die(new Error(`Failed to start dev process: ${String(error)}`)),
      ),
    ),
  );

/**
 * The production Astro dev Layer.
 *
 * Reads ASTRO_DEV_PORT from env (default 4321), spawns `pnpm astro dev
 * --port <port>`, and waits for the dev server to accept connections
 * before the Layer is considered ready — prevents the Fastify proxy from
 * returning 500s on early requests.
 *
 * The process is automatically killed when the Effect scope closes
 * (e.g., on SIGINT/SIGTERM handled by NodeRuntime.runMain).
 */
export const AstroDevLive = Layer.scoped(
  AstroDevProcess,
  Effect.gen(function* () {
    const { port } = yield* AstroDevConfig;

    yield* Effect.logInfo(
      `Starting dev process: pnpm astro dev --port ${port}`,
    );

    const process = yield* Command.make(
      "pnpm",
      "astro",
      "dev",
      "--port",
      String(port),
    ).pipe(Command.start);

    yield* Effect.logInfo(`Dev process started with PID ${process.pid}`);

    yield* Effect.logInfo(`Waiting for Astro dev server on port ${port}...`);
    yield* waitForReady(`http://localhost:${port}`);
    yield* Effect.logInfo("Astro dev server is ready");

    return process;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.die(new Error(`Failed to start dev process: ${String(error)}`)),
    ),
  ),
).pipe(Layer.provide(NodeContext.layer));
