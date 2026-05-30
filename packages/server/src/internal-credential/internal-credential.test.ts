import { Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERNAL_AUTH_HEADER,
  injectCredential,
  makeVerifier,
} from "./internal-credential";

const TOKEN = "test-secret-token";
const PREV = "old-secret-token";

describe("internal-credential", () => {
  describe("injectCredential", () => {
    it("uses the default header name", () => {
      expect(injectCredential({ token: TOKEN })).toEqual({
        [DEFAULT_INTERNAL_AUTH_HEADER]: TOKEN,
      });
    });

    it("uses a custom header name", () => {
      expect(
        injectCredential({ token: TOKEN, headerName: "x-custom" }),
      ).toEqual({ "x-custom": TOKEN });
    });
  });

  describe("round-trip (inject → verify)", () => {
    it("the injected header verifies under the same token", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
      });
      const header = injectCredential({ token: TOKEN });

      expect(verifier.verify(header[verifier.headerKey])).toBe(true);
    });

    it("round-trips through a custom header name", () => {
      const headerName = "x-custom-auth";
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
        headerName,
      });
      const header = injectCredential({ token: TOKEN, headerName });

      expect(verifier.headerKey).toBe(headerName);
      expect(verifier.verify(header[verifier.headerKey])).toBe(true);
    });
  });

  describe("verify", () => {
    it("accepts the current token", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
      });
      expect(verifier.verify(TOKEN)).toBe(true);
    });

    it("accepts the previous (rotated) token", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.some(PREV),
      });
      expect(verifier.verify(PREV)).toBe(true);
    });

    it("rejects a wrong token", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
      });
      expect(verifier.verify("wrong-token")).toBe(false);
    });

    it("rejects an absent header (undefined)", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
      });
      expect(verifier.verify(undefined)).toBe(false);
    });

    it("rejects a duplicate header (string[]) without throwing", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
      });
      expect(verifier.verify([TOKEN, TOKEN])).toBe(false);
    });

    it("normalizes a mixed-case header name to a lowercase key", () => {
      const verifier = makeVerifier({
        token: TOKEN,
        previousToken: Option.none(),
        headerName: "X-Internal-Auth",
      });
      expect(verifier.headerKey).toBe("x-internal-auth");
    });
  });
});
