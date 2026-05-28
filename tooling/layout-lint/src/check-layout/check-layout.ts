/**
 * Pure layout-rule checker.
 *
 * Takes a serialisable {@link DirectoryTree} rooted at a package directory
 * (the tree must contain a `src/` child to produce any output) and returns
 * the list of {@link Violation}s found under that `src/`.
 *
 * Rules enforced (see PRD `.scratch/folder-per-module-layout/PRD.md`):
 *
 *  1. No file named `index.ts` may exist under `src/` except inside an
 *     **entrypoint folder**. A folder qualifies as an entrypoint folder
 *     when it is `src/` itself (e.g. `apps/api/src/index.ts`) or when it
 *     contains both `index.ts` and `index.test.ts` (e.g.
 *     `apps/web/src/server/{index,index.test}.ts`). The paired-test
 *     requirement distinguishes a real runtime entrypoint module from a
 *     barrel like `schema/index.ts`, without an allowlist.
 *  2. For every `.ts` file under `src/`, strip a trailing `.test.ts` or
 *     `.integration.test.ts`; the remaining basename must equal the
 *     immediate parent folder name, or `<parent>.<role>` for some
 *     non-empty `<role>`. `index.ts` / `index.test.ts` inside an
 *     entrypoint folder are exempt.
 *  3. A folder under `src/` must contain at most one file whose basename
 *     (after stripping `.ts`) equals the folder name. Multiple
 *     `<folder>.<role>.ts` siblings are allowed; multiple public
 *     source files are not.
 *
 * No filesystem I/O \u2014 feed synthetic trees in tests.
 */

export type DirectoryTree = {
  name: string;
  dirs: DirectoryTree[];
  files: string[];
};

export type Violation = {
  path: string;
  rule: "no-index" | "basename-mismatch" | "multiple-public";
  message: string;
};

export const checkLayout = (tree: DirectoryTree): Violation[] => {
  const violations: Violation[] = [];
  const srcDir = tree.dirs.find((d) => d.name === "src");
  if (!srcDir) return violations;
  walk(srcDir, `${tree.name}/src`, violations, true);
  return violations;
};

const ENTRYPOINT_ALLOWED = new Set(["index.ts", "index.test.ts"]);

const isEntrypointFolder = (
  dir: DirectoryTree,
  isSrcRoot: boolean,
): boolean => {
  if (!dir.files.includes("index.ts")) return false;
  if (isSrcRoot) return true;
  return dir.files.includes("index.test.ts");
};

const walk = (
  dir: DirectoryTree,
  path: string,
  out: Violation[],
  isSrcRoot: boolean,
): void => {
  const entrypoint = isEntrypointFolder(dir, isSrcRoot);

  for (const file of dir.files) {
    if (entrypoint && ENTRYPOINT_ALLOWED.has(file)) continue;

    if (file === "index.ts") {
      out.push({
        path: `${path}/${file}`,
        rule: "no-index",
        message:
          "index.ts is forbidden under src/ except inside an entrypoint folder",
      });
      continue;
    }
    if (!file.endsWith(".ts")) continue;

    const stem = stripTestSuffix(file).replace(/\.ts$/, "");
    if (stem === dir.name) continue;
    if (stem.startsWith(`${dir.name}.`) && stem.length > dir.name.length + 1) {
      continue;
    }
    out.push({
      path: `${path}/${file}`,
      rule: "basename-mismatch",
      message: `expected basename "${dir.name}" or "${dir.name}.<role>", got "${stem}"`,
    });
  }

  // multiple-public: more than one file whose stripped stem equals the
  // folder name AND which is not a test file.
  const publicFiles = dir.files.filter((f) => {
    if (!f.endsWith(".ts")) return false;
    if (isTestFile(f)) return false;
    const stem = f.replace(/\.ts$/, "");
    return stem === dir.name;
  });
  if (publicFiles.length > 1) {
    for (const f of publicFiles) {
      out.push({
        path: `${path}/${f}`,
        rule: "multiple-public",
        message: `folder "${dir.name}" has more than one public source file`,
      });
    }
  }

  for (const child of dir.dirs) {
    walk(child, `${path}/${child.name}`, out, false);
  }
};

const stripTestSuffix = (file: string): string => {
  if (file.endsWith(".integration.test.ts")) {
    return `${file.slice(0, -".integration.test.ts".length)}.ts`;
  }
  if (file.endsWith(".test.ts")) {
    return `${file.slice(0, -".test.ts".length)}.ts`;
  }
  return file;
};

const isTestFile = (file: string): boolean =>
  file.endsWith(".test.ts") || file.endsWith(".integration.test.ts");
