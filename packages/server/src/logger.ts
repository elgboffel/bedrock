/**
 * Pino-backed Logger Layer for Effect.
 *
 * This module bridges Effect's logging system with pino. When you call
 * Effect.log("something"), the message is forwarded to a pino instance
 * instead of going to the default console logger.
 *
 * How it works:
 * - Effect has a Logger service that all Effect.log/logDebug/etc. calls go through.
 * - We create a custom Logger implementation that writes to pino.
 * - We provide it as a Layer, which replaces Effect's default logger.
 *
 * The Layer reads LogConfig to configure pino's level and pretty-printing.
 */
import { Effect, Layer, Logger, type LogLevel } from "effect";
import pino from "pino";
import { LogConfig } from "./config.js";

/**
 * pino uses `export =` in its type definitions (CJS-style). When this file
 * is type-checked under NodeNext module resolution (which happens when
 * apps/api imports @repo/server source directly), TypeScript doesn't see
 * call signatures on the default import. The runtime value is always the
 * factory function regardless of resolution mode, so we safely cast here
 * to keep both Bundler and NodeNext happy.
 */
const createPino: {
  (opts?: pino.LoggerOptions): pino.Logger;
  (opts: pino.LoggerOptions, stream: pino.DestinationStream): pino.Logger;
  // biome-ignore lint/suspicious/noExplicitAny: pino's dual CJS/ESM export requires a cast
} = pino as any;

/**
 * Maps Effect log levels to pino log levels.
 * Effect and pino have slightly different level names.
 */
const toPinoLevel = (level: LogLevel.LogLevel): string => {
  switch (level._tag) {
    case "Debug":
    case "Trace":
      return "debug";
    case "Info":
      return "info";
    case "Warning":
      return "warn";
    case "Error":
      return "error";
    case "Fatal":
      return "fatal";
    default:
      return "info";
  }
};

/**
 * Creates a pino-backed Logger Layer.
 *
 * Optionally accepts a pino destination for testing purposes.
 * In production, pino writes to stdout by default.
 */
export const makePinoLoggerLayer = (dest?: pino.DestinationStream) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const config = yield* LogConfig;

      const pinoOptions: pino.LoggerOptions = {
        level: config.logLevel,
        ...(config.prettyPrint ? { transport: { target: "pino-pretty" } } : {}),
      };

      const pinoLogger = dest
        ? createPino(pinoOptions, dest)
        : createPino(pinoOptions);

      /**
       * A custom Effect Logger that forwards log messages to pino.
       * Logger.make receives a FiberLog with the log level, message,
       * timestamp, and other metadata from the Effect runtime.
       */
      const pinoEffectLogger = Logger.make(({ logLevel, message }) => {
        const level = toPinoLevel(logLevel);
        const msg = typeof message === "string" ? message : String(message);
        // Use pino's child logger method pattern for type-safe level dispatch
        switch (level) {
          case "debug":
            pinoLogger.debug(msg);
            break;
          case "info":
            pinoLogger.info(msg);
            break;
          case "warn":
            pinoLogger.warn(msg);
            break;
          case "error":
            pinoLogger.error(msg);
            break;
          case "fatal":
            pinoLogger.fatal(msg);
            break;
          default:
            pinoLogger.info(msg);
        }
      });

      return Logger.replace(Logger.defaultLogger, pinoEffectLogger);
    }),
  );

/**
 * The default PinoLoggerLive layer for production use.
 * Reads LogConfig from the environment and writes to stdout.
 */
export const PinoLoggerLive = makePinoLoggerLayer();
