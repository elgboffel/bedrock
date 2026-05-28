import { describe, expect, it } from "vitest";
import { checkLayout, type DirectoryTree } from "./check-layout.ts";

const dir = (
  name: string,
  files: string[] = [],
  dirs: DirectoryTree[] = [],
): DirectoryTree => ({ name, files, dirs });

const pkg = (
  srcDirs: DirectoryTree[],
  srcFiles: string[] = [],
): DirectoryTree => dir("pkg", [], [dir("src", srcFiles, srcDirs)]);

describe("checkLayout", () => {
  it("returns no violations for a valid layout", () => {
    const tree = pkg([
      dir("tracing", ["tracing.ts", "tracing.test.ts"]),
      dir("config", ["config.ts", "config.test.ts"]),
    ]);
    expect(checkLayout(tree)).toEqual([]);
  });

  it("allows <folder>.<role>.ts siblings", () => {
    const tree = pkg([
      dir("tracing", [
        "tracing.ts",
        "tracing.test.ts",
        "tracing.exporters.ts",
        "tracing.fixtures.ts",
      ]),
    ]);
    expect(checkLayout(tree)).toEqual([]);
  });

  it("allows <folder>.test.ts and <folder>.integration.test.ts siblings", () => {
    const tree = pkg([
      dir("client", [
        "client.ts",
        "client.test.ts",
        "client.integration.test.ts",
      ]),
    ]);
    expect(checkLayout(tree)).toEqual([]);
  });

  it("allows nested module folders (schema/items/items.ts)", () => {
    const tree = pkg([
      dir("schema", ["schema.ts"], [dir("items", ["items.ts"])]),
    ]);
    expect(checkLayout(tree)).toEqual([]);
  });

  it("allows src/index.ts as an entrypoint folder (apps/api shape)", () => {
    const tree = pkg([dir("routes", ["routes.ts"])], ["index.ts"]);
    expect(checkLayout(tree)).toEqual([]);
  });

  it("allows src/server/{index.ts,index.test.ts} as a nested entrypoint folder (apps/web shape)", () => {
    const tree = pkg([
      dir(
        "server",
        ["index.ts", "index.test.ts"],
        [
          dir("astro-dev", ["astro-dev.ts", "astro-dev.test.ts"]),
          dir("plugins", ["plugins.ts"]),
          dir("routes", ["routes.ts"]),
        ],
      ),
    ]);
    expect(checkLayout(tree)).toEqual([]);
  });

  it("flags index.ts when its folder also contains unrelated source files", () => {
    // Folder contains index.ts plus an arbitrary other source file —
    // not an entrypoint folder, so index.ts is forbidden AND the other
    // file is flagged for basename-mismatch.
    const tree = pkg([dir("server", ["index.ts", "plugins.ts"])]);
    const v = checkLayout(tree);
    const rules = v.map((x) => x.rule).sort();
    expect(rules).toEqual(["basename-mismatch", "no-index"]);
  });

  it("flags index.ts nested under src/", () => {
    const tree = pkg([
      dir("schema", ["index.ts"], [dir("items", ["index.ts"])]),
    ]);
    const v = checkLayout(tree);
    expect(v.map((x) => x.rule)).toEqual(["no-index", "no-index"]);
    expect(v.map((x) => x.path).sort()).toEqual([
      "pkg/src/schema/index.ts",
      "pkg/src/schema/items/index.ts",
    ]);
  });

  it("flags basename/folder-name mismatch", () => {
    const tree = pkg([dir("tracing", ["tracing.ts", "helpers.ts"])]);
    const v = checkLayout(tree);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      rule: "basename-mismatch",
      path: "pkg/src/tracing/helpers.ts",
    });
  });

  it("flags multiple public source files in one folder", () => {
    // A folder can't actually have two files with the same basename, but
    // siblings whose stems both equal the folder name (e.g. an accidental
    // `.tsx` alongside `.ts`) must be flagged. Use a contrived case where
    // the rule fires: two distinct files whose stripped stems both equal
    // the folder name via different role-shaped names is impossible —
    // instead we simulate by giving the folder a public `.ts` plus a
    // test stripped to the same stem? No, tests are excluded. To exercise
    // the rule, provide two genuinely public files with the same stem.
    // We achieve this with a tree where the folder contains `routes.ts`
    // and `routes.ts` again (different cases would not survive a real FS,
    // but the pure function must still defend against the input).
    const tree = pkg([dir("routes", ["routes.ts", "routes.ts"])]);
    const v = checkLayout(tree).filter((x) => x.rule === "multiple-public");
    expect(v).toHaveLength(2);
  });

  it("does not flag a single public file plus role siblings as multiple-public", () => {
    const tree = pkg([
      dir("tracing", ["tracing.ts", "tracing.exporters.ts", "tracing.test.ts"]),
    ]);
    const v = checkLayout(tree).filter((x) => x.rule === "multiple-public");
    expect(v).toEqual([]);
  });

  it("returns no violations when src/ is absent", () => {
    expect(checkLayout(dir("pkg"))).toEqual([]);
  });

  it("ignores non-.ts files", () => {
    const tree = pkg([
      dir("tracing", ["tracing.ts", "README.md", "data.json"]),
    ]);
    expect(checkLayout(tree)).toEqual([]);
  });
});
