import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { DirectoryTree } from "../check-layout/check-layout.ts";

/**
 * Thin filesystem shell: read a {@link DirectoryTree} rooted at `dirPath`.
 *
 * Skips `node_modules` and `dist`. The returned tree's `name` is the
 * basename of `dirPath`.
 */
export const readTree = (dirPath: string, name?: string): DirectoryTree => {
  const tree: DirectoryTree = {
    name: name ?? basename(dirPath),
    dirs: [],
    files: [],
  };
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    if (entry.isDirectory()) {
      tree.dirs.push(readTree(join(dirPath, entry.name), entry.name));
    } else if (entry.isFile()) {
      tree.files.push(entry.name);
    }
  }
  return tree;
};

const basename = (p: string): string => {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
};
