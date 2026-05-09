import { describe, expect, test } from "vitest";
import { createErrorMapper, mapErrorToHttp } from "./error-mapper.js";
import {
  InternalError,
  NotFound,
  Unauthorized,
  ValidationError,
} from "./errors.js";

describe("mapErrorToHttp", () => {
  test("NotFound maps to 404 with resource info", () => {
    const error = new NotFound({ resource: "User(123)" });
    const result = mapErrorToHttp(error);

    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: "NotFound",
      message: "User(123) not found",
    });
  });

  test("Unauthorized maps to 401", () => {
    const error = new Unauthorized({ reason: "token expired" });
    const result = mapErrorToHttp(error);

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: "Unauthorized",
      message: "token expired",
    });
  });

  test("Unauthorized without reason uses default message", () => {
    const error = new Unauthorized({});
    const result = mapErrorToHttp(error);

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      error: "Unauthorized",
      message: "Unauthorized",
    });
  });

  test("ValidationError maps to 400", () => {
    const error = new ValidationError({ message: "email is required" });
    const result = mapErrorToHttp(error);

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: "ValidationError",
      message: "email is required",
    });
  });

  test("InternalError maps to 500 with generic message", () => {
    const error = new InternalError({ message: "DB connection failed" });
    const result = mapErrorToHttp(error);

    // Internal details NOT leaked to client
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: "InternalError",
      message: "An unexpected error occurred",
    });
  });

  test("unknown error tag maps to 500 with generic message", () => {
    const error = { _tag: "SomeFutureError" } as const;
    const result = mapErrorToHttp(error);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: "InternalError",
      message: "An unexpected error occurred",
    });
  });
});

describe("createErrorMapper", () => {
  test("custom mappings extend default mappings", () => {
    const customMapper = createErrorMapper({
      RateLimited: (error) => ({
        status: 429,
        body: {
          error: "RateLimited",
          message:
            (error as unknown as { retryAfter: number }).retryAfter + "s",
        },
      }),
    });

    // Custom tag works
    const custom = customMapper({
      _tag: "RateLimited",
      retryAfter: 60,
    } as { _tag: string });
    expect(custom.status).toBe(429);
    expect(custom.body.message).toBe("60s");

    // Default tags still work
    const notFound = customMapper(new NotFound({ resource: "Order(1)" }));
    expect(notFound.status).toBe(404);
  });

  test("custom mappings can override default mappings", () => {
    const customMapper = createErrorMapper({
      NotFound: () => ({
        status: 404,
        body: { error: "NotFound", message: "custom not found" },
      }),
    });

    const result = customMapper(new NotFound({ resource: "X" }));
    expect(result.body.message).toBe("custom not found");
  });
});
