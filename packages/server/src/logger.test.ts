import { Writable } from "node:stream";
import { it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { expect } from "vitest";
import { makePinoLoggerLayer } from "./logger.js";

it.effect("Effect.log calls are forwarded to pino", () =>
  Effect.gen(function* () {
    // Capture pino output using a writable stream
    const logs: string[] = [];
    const dest = new Writable({
      write(chunk, _encoding, callback) {
        logs.push(chunk.toString());
        callback();
      },
    });

    yield* Effect.log("hello from effect").pipe(
      Effect.provide(makePinoLoggerLayer(dest)),
    );

    // pino writes JSON lines -- parse the captured output
    expect(logs.length).toBeGreaterThan(0);
    const lastLog = JSON.parse(logs[logs.length - 1]);
    expect(lastLog.msg).toBe("hello from effect");
  }).pipe(Effect.withConfigProvider(ConfigProvider.fromMap(new Map()))),
);
