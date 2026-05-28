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
import { Context, Effect, Layer } from "effect";

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
 * Create a Layer that spawns a child process and kills it on release.
 *
 * In production, use `makeAstroDevLayer("pnpm", "astro", "dev")`.
 * In tests, use a simple command like `makeAstroDevLayer("sleep", "60")`.
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
      // Catch process errors and convert them to defects so the Layer
      // construction doesn't require PlatformError in its error channel.
      Effect.catchAll((error) =>
        Effect.die(new Error(`Failed to start dev process: ${String(error)}`)),
      ),
    ),
  );

/**
 * The production Astro dev Layer.
 *
 * Spawns `pnpm astro dev` which starts the Astro dev server on port 4321.
 * The process is automatically killed when the Effect scope closes
 * (e.g., on SIGINT/SIGTERM handled by NodeRuntime.runMain).
 */
export const AstroDevLive = makeAstroDevLayer("pnpm", "astro", "dev");
